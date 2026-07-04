import type { UIMessage } from "ai";

const MAX_TITLE_LEN = 48;

/** Derive a short sidebar label from the first user turn (or metadata). */
export function sessionTitleFromMessages(
  messages: UIMessage[],
  fallback = "New conversation",
): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return fallback;

  const text = firstUser.parts
    ?.filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join(" ")
    .trim();

  if (!text) return fallback;
  if (text.length <= MAX_TITLE_LEN) return text;
  return `${text.slice(0, MAX_TITLE_LEN - 1)}…`;
}
