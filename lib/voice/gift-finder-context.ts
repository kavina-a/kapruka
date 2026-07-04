import "server-only";
import type { GiftFinderState } from "@/lib/catalog/gift-finder-types";

const TTL_MS = 30 * 60 * 1000;

interface Entry {
  state: GiftFinderState | null;
  updatedAt: number;
}

const byClient = new Map<string, Entry>();

/** Browser syncs gift-finder picks so voice-tool searches can reuse them. */
export function setVoiceGiftFinderState(clientId: string, state: GiftFinderState | null): void {
  if (!clientId) return;
  byClient.set(clientId, { state, updatedAt: Date.now() });
}

export function getVoiceGiftFinderState(clientId: string): GiftFinderState | null {
  if (!clientId) return null;
  const entry = byClient.get(clientId);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > TTL_MS) {
    byClient.delete(clientId);
    return null;
  }
  return entry.state;
}
