// Default provider: OpenAI gpt-4o-mini when OPENAI_API_KEY is set.
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { buildSystemPrompt, buildSituationalDirective } from "@/lib/agent/persona";
import { buildCommerceContextBlock } from "@/lib/agent/commerce-context";
import { createRukaTools } from "@/lib/agent/tools";
import { getLatestUserText, inferModeFromHistory, isModeAmbiguous, resolveAgentMode } from "@/lib/agent/modes";
import { classifyIntent } from "@/lib/agent/classify";
import { computeTurnFlags } from "@/lib/agent/turn-flags";
import {
  getChatModel,
  getChatModelId,
  getChatProvider,
  isAnyLLMConfigured,
  isProviderQuotaError,
  providerLogMeta,
} from "@/lib/ai/provider";
import {
  markGeminiKeyFailed,
  selectGeminiKey,
} from "@/lib/ai/gemini";
import type { CommerceContext } from "@/lib/commerce/types";
import type { Lang, UserProfile } from "@/lib/commerce/store";
import { enrichUserMessage } from "@/lib/valsea/preprocess";
import { buildValseaContextBlock } from "@/lib/valsea/prompt";
import {
  agentLog,
  newTraceId,
  runWithAgentTraceAsync,
} from "@/lib/agent/log";

export const runtime = "nodejs";
export const maxDuration = 60;

// const MODEL = process.env.OPENAI_MODEL || "gpt-4o"; // legacy override
const MODEL = getChatModelId();

export async function POST(req: Request) {
  const traceId = req.headers.get("x-trace-id") ?? newTraceId("chat");

  let messages: UIMessage[] = [];
  let userProfile: UserProfile = {};
  let commerceContext: CommerceContext | null = null;
  let uiLang: Lang = "en";
  try {
    const body = await req.json();
    messages = body.messages ?? [];
    userProfile = body.userProfile ?? {};
    commerceContext = body.commerceContext ?? null;
    uiLang = body.lang ?? "en";
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  return runWithAgentTraceAsync(
    { traceId, channel: "chat", clientId: commerceContext?.clientId },
    async () => {

      if (!isAnyLLMConfigured()) {
        return new Response(
          JSON.stringify({
            error:
              "ChatRuka isn't connected to a brain yet — set OPENAI_API_KEY (recommended) or GEMINI_API_KEY_1 in your environment.",
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        );
      }

      const previousMode = inferModeFromHistory(messages);
      let agentMode = resolveAgentMode(messages);

      // The regex fast-path (lib/agent/modes.ts) is free and catches obvious cases
      // instantly. Only when it's genuinely ambiguous do we spend one tiny Gemini
      // call to disambiguate — cheaper and more accurate than guessing, and far
      // cheaper than letting the main GPT-4o call sort it out mid-conversation.
      let classifiedIntent: string | null = null;
      if (agentMode === "CHAT" && isModeAmbiguous(messages)) {
        const latest = getLatestUserText(messages);
        const intent = await classifyIntent(latest);
        classifiedIntent = intent;
        if (intent === "order_tracking") agentMode = "TRACK";
      }

      const switching = previousMode !== agentMode;
      const isChatMode = agentMode === "CHAT";
      const userTurns = messages.filter((m) => m.role === "user").length;

      // All of the blocks below (cart/checkout snapshot, uncertainty/rejection/gift-finder
      // nudges, VALSEA search-intent enrichment, situational directive) exist purely to
      // steer gift search & checkout — none of it is relevant once we're in TRACK mode.
      // Skipping them here isn't just a token saving on the prompt itself: it also skips
      // the VALSEA enrichment's external API calls entirely for tracking turns.
      const {
        lastUserText,
        uncertaintyTurn,
        rejectionTurn,
        giftFinderSubmitTurn,
        uncertaintyBlock,
        rejectionBlock,
        giftFinderSubmitBlock,
      } = isChatMode
        ? computeTurnFlags(messages, commerceContext)
        : {
            lastUserText: getLatestUserText(messages) || null,
            uncertaintyTurn: false,
            rejectionTurn: false,
            giftFinderSubmitTurn: false,
            uncertaintyBlock: "",
            rejectionBlock: "",
            giftFinderSubmitBlock: "",
          };

      const commerceBlock =
        isChatMode && commerceContext ? `\n\n${buildCommerceContextBlock(commerceContext)}` : "";

      const providerMeta = providerLogMeta();
      const geminiKey =
        providerMeta.provider === "gemini" ? selectGeminiKey() : null;

      // Merge client-side keyword flags (selfPurchase/productSignal, high-confidence
      // only) with the cheap classifier's verdict (self_purchase/unclear, which catches
      // the ambiguous cases keyword-matching deliberately skips, e.g. "something spicy").
      // Without this merge, classifiedIntent was computed but never actually reached the
      // model — it only flipped agentMode for order_tracking — so the priority stack had
      // no signal to act on and the model fell through to guessing a category.
      const effectiveFlags = isChatMode ? { ...(commerceContext?.detectedFlags ?? {}) } : {};
      if (isChatMode) {
        if (classifiedIntent === "self_purchase" && !effectiveFlags.selfPurchase) {
          effectiveFlags.selfPurchase = true;
        } else if (
          classifiedIntent === "unclear" &&
          !effectiveFlags.selfPurchase &&
          !effectiveFlags.searchNow
        ) {
          effectiveFlags.unclearContext = true;
        }
      }

      agentLog("chat.turn.start", {
        traceId,
        clientId: commerceContext?.clientId,
        provider: providerMeta.provider,
        model: MODEL,
        geminiKeyPool: providerMeta.geminiKeyPool,
        geminiKeyHint: geminiKey ? `…${geminiKey.slice(-6)}` : undefined,
        agentMode,
        previousMode,
        switching,
        userTurns,
        lastUserText: lastUserText?.slice(0, 200),
        flags: {
          uncertaintyTurn,
          rejectionTurn,
          giftFinderSubmitTurn,
          classifiedIntent,
          detectedFlags: commerceContext?.detectedFlags ?? null,
          effectiveFlags,
        },
        cartItems: commerceContext?.cart.length ?? 0,
        shownProducts: commerceContext?.shownProducts?.length ?? 0,
        recipientDislikes: commerceContext?.recipientDislikes ?? null,
        giftFinderComplete: Boolean(
          commerceContext?.giftFinderState &&
            commerceContext.giftFinderState.personalityTraits.length > 0,
        ),
      });

      const valseaEnrichment =
        isChatMode && lastUserText ? await enrichUserMessage(lastUserText, uiLang) : null;
      const valseaBlock = valseaEnrichment ? buildValseaContextBlock(valseaEnrichment) : "";

      // Combined client + classifier flags → per-turn directive injected last so
      // it's freshest in the model's attention window. CHAT only — see isChatMode above.
      // userTurns lets the directive tell "first ambiguous message" apart from
      // "answer to a clarifying question we already asked" (see buildSituationalDirective).
      const directiveBlock = isChatMode
        ? buildSituationalDirective(effectiveFlags, userTurns)
        : "";

      const result = streamText({
        model: getChatModel(),
        system:
          buildSystemPrompt(userProfile, agentMode, { switching, previousMode }) +
          commerceBlock +
          uncertaintyBlock +
          rejectionBlock +
          giftFinderSubmitBlock +
          valseaBlock +
          directiveBlock,
        messages: await convertToModelMessages(messages),
        tools: createRukaTools(commerceContext, agentMode),
        // Allow several tool round-trips (search -> details -> delivery) per turn.
        stopWhen: stepCountIs(6),
        maxRetries: 3,
        temperature: 0.7,
        onStepFinish: ({ toolCalls, toolResults }) => {
          for (let i = 0; i < toolCalls.length; i++) {
            const call = toolCalls[i];
            const toolResult = toolResults[i];
            agentLog("chat.tool.step", {
              tool: call.toolName,
              args: call.input,
              resultPreview:
                toolResult && "output" in toolResult
                  ? JSON.stringify(toolResult.output).slice(0, 240)
                  : undefined,
            });
          }
        },
        onFinish: ({ steps, finishReason }) => {
          agentLog("chat.turn.finish", {
            finishReason,
            steps: steps.length,
            tools: steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)),
          });
        },
      });

      return result.toUIMessageStreamResponse({
        onError: (error) => {
          const err = error as { error?: { message?: string; code?: string } };
          agentLog("chat.stream.error", { error: String(error) }, "error");
          if (isProviderQuotaError(error)) {
            if (getChatProvider() === "gemini" && geminiKey) {
              markGeminiKeyFailed(geminiKey);
              return "Gemini rate limit hit on this key — please try again (the next request will use a different key).";
            }
            return "OpenAI rate limit or quota hit — please try again in a moment.";
          }
          if (err?.error?.code === "server_error") {
            return "The model had a brief hiccup — please try sending that again.";
          }
          return "ChatRuka hit a snag reaching the catalogue. Mind trying that again?";
        },
      });
    },
  );
}

