import type { UIMessage } from "ai";

export type AgentMode = "CHAT" | "TRACK";

const MODE_PREFIX_RE = /^\[MODE:\s*(CHAT|TRACK)\]\s*/i;

/** Strip mode signal for display; returns detected mode if present. */
export function parseModeSignal(text: string): { mode: AgentMode | null; body: string } {
  const match = text.match(MODE_PREFIX_RE);
  if (!match) return { mode: null, body: text };
  return {
    mode: match[1].toUpperCase() as AgentMode,
    body: text.replace(MODE_PREFIX_RE, "").trimStart(),
  };
}

export function stripModeSignal(text: string): string {
  return parseModeSignal(text).body;
}

function assistantTextParts(message: UIMessage): string[] {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text);
}

/** Last explicit mode from assistant replies; defaults to CHAT. */
export function inferModeFromHistory(messages: UIMessage[]): AgentMode {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    for (const text of assistantTextParts(message)) {
      const { mode } = parseModeSignal(text);
      if (mode) return mode;
    }
  }
  return "CHAT";
}

export function getLatestUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user") continue;
    return message.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n")
      .trim();
  }
  return "";
}

const TRACK_INTENT_RE =
  /\b(track(ing)?(\s+my)?\s+order|where\s+is\s+my\s+order|order\s+status|check\s+(my\s+)?order|find\s+(my\s+)?order|status\s+of\s+(my\s+)?order|delivery\s+status|has\s+it\s+(been\s+)?delivered|order\s+number|my\s+order\s+(ref|number|#)?|VIMP[A-Z0-9]{6,}|KAP[A-Z0-9]{6,})\b/i;

const CHAT_INTENT_RE =
  /\b(send\s+a\s+gift|need\s+a\s+gift|gift\s+for|birthday|anniversary|flowers?|cake|checkout|add\s+to\s+(cart|basket)|recommend|browse|who\s+are\s+we\s+gifting|shopping|buy\s+a|order\s+(flowers|cake|gift)|new\s+gift|help\s+me\s+(find|pick|choose))\b/i;

export function isTrackIntent(text: string): boolean {
  if (!text.trim()) return false;
  if (TRACK_INTENT_RE.test(text)) return true;
  // Sinhala / Tanglish tracking phrases
  if (/\b(order\s+eka|order\s+eke|track\s+karan|deliver\s+une|deliver\s+wela|order\s+number)\b/i.test(text)) {
    return true;
  }
  return false;
}

export function isChatIntent(text: string): boolean {
  if (!text.trim()) return false;
  return CHAT_INTENT_RE.test(text);
}

/**
 * Resolve which agent mode to run for this turn.
 * Server picks tools + system prompt; the model still emits [MODE: …] on every reply.
 */
export function resolveAgentMode(messages: UIMessage[]): AgentMode {
  const fromHistory = inferModeFromHistory(messages);
  const userText = getLatestUserText(messages);
  if (!userText) return fromHistory;

  if (fromHistory === "CHAT" && isTrackIntent(userText)) return "TRACK";
  if (fromHistory === "TRACK" && isChatIntent(userText) && !isTrackIntent(userText)) {
    return "CHAT";
  }
  return fromHistory;
}

export function modeLabel(mode: AgentMode): string {
  return mode === "TRACK" ? "Order tracking" : "Gift chat";
}
