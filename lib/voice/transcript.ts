import type { ConversationMessage } from "@pipecat-ai/client-react";
import type { VoiceEntry } from "@/lib/commerce/store";

export function partToText(text: unknown): string {
  if (typeof text === "string") return text;
  if (text && typeof text === "object") {
    const o = text as { spoken?: string; unspoken?: string };
    // A bot part is a karaoke split of one span: `spoken` is what's been
    // voiced so far, `unspoken` the remainder. Concatenate to reconstruct the
    // full part text (during streaming `spoken` grows and `unspoken` shrinks;
    // once final `spoken` holds everything and `unspoken` is empty).
    if ("spoken" in o || "unspoken" in o) {
      return `${o.spoken ?? ""}${o.unspoken ?? ""}`;
    }
  }
  return "";
}

/**
 * Concatenate the parts of a single conversation turn into one string.
 * Word-level parts are joined with spaces; sentence-level parts already carry
 * their own trailing spaces so we collapse any doubled whitespace afterwards.
 */
function allPartsText(parts: ConversationMessage["parts"]): string {
  return parts
    .map((p) => partToText(p.text))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * One chat bubble per conversational turn.
 *
 * `usePipecatConversation()` already hands us fully normalized messages: the
 * SDK sorts by timestamp, drops empties, and merges the streaming chunks of a
 * single turn into one `ConversationMessage` (one per speaker turn). We must
 * NOT merge again here — a second pass would collapse two genuinely separate
 * same-speaker turns into a single bubble, which is exactly the "everything
 * lands in one bubble" symptom. Instead we map 1:1 message → bubble.
 *
 * The entry id is derived from the turn's stable `createdAt` + role (never the
 * array index, which shifts as empty placeholders come and go and caused turns
 * to either duplicate or overwrite each other in the store). This guarantees a
 * turn always maps to exactly one bubble that updates in place while it streams
 * and never collides with a different turn.
 */
export function pipecatMessagesToVoiceEntries(
  messages: ConversationMessage[],
): VoiceEntry[] {
  const entries: VoiceEntry[] = [];
  const seen = new Set<string>();

  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;

    const parts = m.parts ?? [];
    const text = allPartsText(parts);
    if (!text) continue;

    // Stable per-turn id. createdAt is fixed for the life of a turn; role
    // guards the (astronomically unlikely) same-millisecond collision. A
    // numeric suffix disambiguates any exact-timestamp duplicates so two turns
    // can never share one bubble.
    let id = `voice-${m.role}-${m.createdAt}`;
    let dedupe = 1;
    while (seen.has(id)) id = `voice-${m.role}-${m.createdAt}-${dedupe++}`;
    seen.add(id);

    // final: true only when the message itself AND its last part are done.
    const messageFinal = m.final !== false;
    const lastPart = parts[parts.length - 1];
    const lastPartFinal = lastPart?.final !== false;
    const final = messageFinal && lastPartFinal;

    entries.push({
      id,
      role: m.role,
      text,
      final,
      createdAt: m.createdAt,
    });
  }

  return entries;
}
