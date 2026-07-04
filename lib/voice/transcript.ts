import { mergeMessages } from "@pipecat-ai/client-react";
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
 * Concatenate all non-empty parts of a (merged) message into one string.
 * Pipecat streams bot responses as additive chunks — after mergeMessages()
 * collapses them into one ConversationMessage, each chunk is one part.
 * We join all parts to reconstruct the full turn text.
 */
function allPartsText(parts: ConversationMessage["parts"]): string {
  return parts
    .map((p) => partToText(p.text).trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * One chat bubble per conversational turn.
 *
 * Pipecat/Gemini Live streams bot responses as many separate ConversationMessage
 * objects (one per word or phrase). We call mergeMessages() first — it collapses
 * consecutive same-role messages within a 30-second window into one by
 * concatenating their parts arrays. Then we join all parts into a single text,
 * giving exactly one updating bubble per turn instead of one bubble per chunk.
 */
export function pipecatMessagesToVoiceEntries(
  messages: ConversationMessage[],
): VoiceEntry[] {
  // Collapse streaming chunks into one ConversationMessage per turn.
  const merged = mergeMessages(messages);

  const entries: VoiceEntry[] = [];

  for (let i = 0; i < merged.length; i++) {
    const m = merged[i];
    if (m.role !== "user" && m.role !== "assistant") continue;

    const parts = m.parts ?? [];
    const text = allPartsText(parts);
    if (!text) continue;

    // final: true only when the message itself AND its last part are both done.
    const messageFinal = m.final !== false;
    const lastPart = parts[parts.length - 1];
    const lastPartFinal = lastPart?.final !== false;
    const final = messageFinal && lastPartFinal;

    entries.push({
      // ID is stable: mergeMessages keeps the first message's createdAt,
      // so the merged-index id doesn't change as new chunks are appended.
      id: `voice-${m.createdAt}-${i}`,
      role: m.role,
      text,
      final,
      createdAt: m.createdAt,
    });
  }

  return entries;
}
