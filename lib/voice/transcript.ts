import type { ConversationMessage } from "@pipecat-ai/client-react";
import type { VoiceEntry } from "@/lib/commerce/store";

export function partToText(text: unknown): string {
  if (typeof text === "string") return text;
  if (text && typeof text === "object") {
    const o = text as { spoken?: string; unspoken?: string };
    return o.spoken || o.unspoken || "";
  }
  return "";
}

/**
 * For a single turn, Pipecat pushes cumulative streaming parts — each newer
 * part typically contains the full transcript so far for that utterance.
 * We take the last non-empty part as the definitive text for the bubble.
 */
function lastPartText(parts: ConversationMessage["parts"]): string {
  for (let i = parts.length - 1; i >= 0; i--) {
    const t = partToText(parts[i].text).trim();
    if (t) return t;
  }
  return "";
}

/**
 * One chat bubble per Pipecat ConversationMessage (one user/bot utterance).
 * Streaming updates replace the same bubble until the turn is finalized.
 *
 * ID uses both timestamp AND array index so that two messages sharing the
 * same `createdAt` (common in Gemini Live) get distinct, stable IDs.
 */
export function pipecatMessagesToVoiceEntries(
  messages: ConversationMessage[],
): VoiceEntry[] {
  const entries: VoiceEntry[] = [];

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "user" && m.role !== "assistant") continue;

    const parts = m.parts ?? [];
    const text = lastPartText(parts);
    if (!text) continue;

    const messageFinal = m.final !== false;
    const lastPart = parts[parts.length - 1];
    const lastPartFinal = lastPart?.final !== false;
    const final = messageFinal && lastPartFinal;

    entries.push({
      id: `voice-${m.createdAt}-${i}`,
      role: m.role,
      text,
      final,
      createdAt: m.createdAt,
    });
  }

  return entries;
}
