import type { GiftFinderState } from "@/lib/catalog/gift-finder-types";

/** Best-effort sync so Pipecat voice-tool searches can read the same structured picks as text chat. */
export async function syncVoiceGiftFinderState(
  clientId: string,
  giftFinderState: GiftFinderState | null,
): Promise<void> {
  if (!clientId) return;
  try {
    await fetch("/api/voice-context", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId, giftFinderState }),
    });
  } catch {
    // Voice still works — chat path uses Zustand directly.
  }
}
