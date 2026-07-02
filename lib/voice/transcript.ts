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

/** Combine streaming parts into one display string for a single turn. */
function messageToText(parts: ConversationMessage["parts"]): string {
  const chunks = parts.map((p) => partToText(p.text).trim()).filter(Boolean);
  if (!chunks.length) return "";

  const last = chunks[chunks.length - 1];
  const joined = chunks.join(" ").replace(/\s+/g, " ").trim();

  // Cumulative unspoken updates: last chunk often holds the full sentence.
  if (chunks.length > 1 && last.length >= joined.length * 0.85) {
    return last;
  }

  return joined;
}

/**
 * One chat bubble per Pipecat conversation message (one user/bot turn).
 * Streaming updates replace the same bubble until the turn is finalized.
 */
export function pipecatMessagesToVoiceEntries(
  messages: ConversationMessage[],
): VoiceEntry[] {
  const entries: VoiceEntry[] = [];

  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;

    const parts = m.parts ?? [];
    const text = messageToText(parts);
    if (!text) continue;

    const messageFinal = m.final !== false;
    const lastPart = parts[parts.length - 1];
    const lastPartFinal = lastPart?.final !== false;
    const final = messageFinal && lastPartFinal;

    entries.push({
      id: `voice-${m.createdAt}`,
      role: m.role,
      text,
      final,
      createdAt: m.createdAt,
    });
  }

  return entries;
}
