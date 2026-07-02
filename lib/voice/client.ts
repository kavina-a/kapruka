import { PipecatClient } from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";

/** Pipecat WebRTC offer endpoint (pipecat-server/bot.py). */
export const VOICE_OFFER_URL =
  process.env.NEXT_PUBLIC_PIPECAT_OFFER_URL ??
  process.env.NEXT_PUBLIC_VOICE_OFFER_URL ??
  "http://localhost:7860/api/offer";

let voiceClientSingleton: PipecatClient | null = null;

/**
 * Reuse one Pipecat client across hot reloads and voice sessions.
 * Multiple instances leak transport listeners (MaxListenersExceededWarning).
 */
export function createVoiceClient(): PipecatClient {
  if (voiceClientSingleton) return voiceClientSingleton;

  voiceClientSingleton = new PipecatClient({
    transport: new SmallWebRTCTransport({
      webrtcRequestParams: { endpoint: VOICE_OFFER_URL },
    }),
    enableMic: true,
    enableCam: false,
  });

  return voiceClientSingleton;
}
