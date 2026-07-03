import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { buildSystemPrompt } from "@/lib/agent/persona";
import { buildCommerceContextBlock } from "@/lib/agent/commerce-context";
import { createRukaTools } from "@/lib/agent/tools";
import { inferModeFromHistory, resolveAgentMode } from "@/lib/agent/modes";
import type { CommerceContext } from "@/lib/commerce/types";
import type { Lang, UserProfile } from "@/lib/commerce/store";
import { enrichUserMessage } from "@/lib/valsea/preprocess";
import { buildValseaContextBlock } from "@/lib/valsea/prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

export async function POST(req: Request) {
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

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes("REPLACE_ME")) {
    return new Response(
      JSON.stringify({
        error:
          "ChatRuka isn't connected to a brain yet — set OPENAI_API_KEY in your environment to start chatting.",
      }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  const commerceBlock = commerceContext ? `\n\n${buildCommerceContextBlock(commerceContext)}` : "";

  const previousMode = inferModeFromHistory(messages);
  const agentMode = resolveAgentMode(messages);
  const switching = previousMode !== agentMode;

  const lastUserText = extractLastUserText(messages);
  const valseaEnrichment = lastUserText
    ? await enrichUserMessage(lastUserText, uiLang)
    : null;
  const valseaBlock = valseaEnrichment ? buildValseaContextBlock(valseaEnrichment) : "";

  const result = streamText({
    model: openai(MODEL),
    system:
      buildSystemPrompt(userProfile, agentMode, { switching, previousMode }) +
      commerceBlock +
      valseaBlock,
    messages: await convertToModelMessages(messages),
    tools: createRukaTools(commerceContext, agentMode),
    // Allow several tool round-trips (search -> details -> delivery) per turn.
    stopWhen: stepCountIs(6),
    maxRetries: 3,
    temperature: 0.7,
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      const err = error as { error?: { message?: string; code?: string } };
      console.error("[/api/chat] stream error:", error);
      // OpenAI occasionally returns a generic server_error on multi-step tool
      // turns — usually succeeds on retry.
      if (err?.error?.code === "server_error") {
        return "OpenAI had a brief hiccup — please try sending that again.";
      }
      return "ChatRuka hit a snag reaching the catalogue. Mind trying that again?";
    },
  });
}

function extractLastUserText(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const parts = message.parts ?? [];
    const text = parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return null;
}
