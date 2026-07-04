// OpenAI is temporarily disabled (billing quota exhausted).
// Groq free tier caps at 12K tokens/request — our prompt+tools are ~15K, so it
// can't run chat at all. Gemini handles the full context; multi-key rotation in
// lib/ai/gemini.ts spreads free-tier rate limits across keys.
// import { openai } from "@ai-sdk/openai";
// import { groqModel, GROQ_CHAT_MODEL } from "@/lib/ai/groq";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { buildSystemPrompt } from "@/lib/agent/persona";
import { buildCommerceContextBlock } from "@/lib/agent/commerce-context";
import { createRukaTools } from "@/lib/agent/tools";
import { getLatestUserText, inferModeFromHistory, isModeAmbiguous, resolveAgentMode } from "@/lib/agent/modes";
import { classifyIntent } from "@/lib/agent/classify";
import { computeTurnFlags } from "@/lib/agent/turn-flags";
import {
  GEMINI_CHAT_MODEL,
  geminiModelWithKey,
  getGeminiApiKeys,
  isGeminiConfigured,
  isGeminiQuotaError,
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

// const MODEL = process.env.OPENAI_MODEL || "gpt-4o"; // OpenAI — re-enable when quota is back
const MODEL = GEMINI_CHAT_MODEL;

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

      if (!isGeminiConfigured()) {
        return new Response(
          JSON.stringify({
            error:
              "ChatRuka isn't connected to a brain yet — set GEMINI_API_KEY_1 (or GEMINI_API_KEY) in your environment to start chatting.",
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        );
      }

      const commerceBlock = commerceContext ? `\n\n${buildCommerceContextBlock(commerceContext)}` : "";

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

      const {
        lastUserText,
        uncertaintyTurn,
        rejectionTurn,
        giftFinderSubmitTurn,
        uncertaintyBlock,
        rejectionBlock,
        giftFinderSubmitBlock,
      } = computeTurnFlags(messages, commerceContext);

      const geminiKey = selectGeminiKey();

      agentLog("chat.turn.start", {
        traceId,
        clientId: commerceContext?.clientId,
        model: MODEL,
        geminiKeyPool: getGeminiApiKeys().length,
        geminiKeyHint: `…${geminiKey.slice(-6)}`,
        agentMode,
        previousMode,
        switching,
        userTurns: messages.filter((m) => m.role === "user").length,
        lastUserText: lastUserText?.slice(0, 200),
        flags: {
          uncertaintyTurn,
          rejectionTurn,
          giftFinderSubmitTurn,
          classifiedIntent,
        },
        cartItems: commerceContext?.cart.length ?? 0,
        shownProducts: commerceContext?.shownProducts?.length ?? 0,
        recipientDislikes: commerceContext?.recipientDislikes ?? null,
        giftFinderComplete: Boolean(
          commerceContext?.giftFinderState &&
            commerceContext.giftFinderState.personalityTraits.length > 0,
        ),
      });

      const valseaEnrichment = lastUserText
        ? await enrichUserMessage(lastUserText, uiLang)
        : null;
      const valseaBlock = valseaEnrichment ? buildValseaContextBlock(valseaEnrichment) : "";

      const result = streamText({
        model: geminiModelWithKey(MODEL, geminiKey),
        system:
          buildSystemPrompt(userProfile, agentMode, { switching, previousMode }) +
          commerceBlock +
          uncertaintyBlock +
          rejectionBlock +
          giftFinderSubmitBlock +
          valseaBlock,
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
          if (isGeminiQuotaError(error)) {
            markGeminiKeyFailed(geminiKey);
            return "Gemini rate limit hit on this key — please try again (the next request will use a different key).";
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

