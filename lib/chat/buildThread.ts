import type { UIMessage } from "ai";
import type { VoiceEntry, VoiceProductSet } from "@/lib/commerce/store";
import { isHiddenUserMessage } from "@/lib/chat/gift-finder";

export type ThreadItem =
  | { type: "text"; key: string; sortKey: number; message: UIMessage }
  | { type: "voice"; key: string; sortKey: number; entry: VoiceEntry }
  | { type: "voice-products"; key: string; sortKey: number; productSet: VoiceProductSet };

/**
 * Merge text-chat messages and voice transcript turns into one chronological
 * thread. Text messages use array order; voice turns use Pipecat timestamps.
 */
export function buildThread(
  messages: UIMessage[],
  voice: VoiceEntry[],
  voiceProducts: VoiceProductSet[] = [],
): ThreadItem[] {
  const items: ThreadItem[] = [];

  messages.forEach((message, index) => {
    if (isHiddenUserMessage(message)) return;
    items.push({
      type: "text",
      key: message.id,
      sortKey: index * 1_000_000,
      message,
    });
  });

  const textBase = messages.length * 1_000_000;
  voice.forEach((entry, index) => {
    const parsed = entry.createdAt ? Date.parse(entry.createdAt) : NaN;
    const sortKey = Number.isFinite(parsed) ? parsed : textBase + index;
    items.push({
      type: "voice",
      key: entry.id,
      sortKey,
      entry,
    });
  });

  voiceProducts.forEach((productSet, index) => {
    const parsed = productSet.createdAt ? Date.parse(productSet.createdAt) : NaN;
    const sortKey = Number.isFinite(parsed) ? parsed + 1 : textBase + index + 0.5;
    items.push({
      type: "voice-products",
      key: productSet.id,
      sortKey,
      productSet,
    });
  });

  return items.sort((a, b) => a.sortKey - b.sortKey);
}
