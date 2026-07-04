import type { PipecatClient } from "@pipecat-ai/client-js";
import type { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
import type { IceServerEntry } from "@/lib/turn/types";
import type { Lang } from "@/lib/commerce/store";
import { VOICE_OFFER_URL } from "@/lib/voice/client";

function toRtcIceServers(servers: IceServerEntry[]): RTCIceServer[] {
  return servers.map((s) => ({
    urls: s.urls,
    username: s.username,
    credential: s.credential,
  }));
}

/** Fetch TURN/STUN from our API (Metered or env). */
export async function fetchVoiceIceServers(): Promise<RTCIceServer[]> {
  const res = await fetch("/api/voice/ice-config", { cache: "no-store" });
  const data = (await res.json()) as { ok?: boolean; iceServers?: IceServerEntry[] };
  if (data.ok && data.iceServers?.length) {
    return toRtcIceServers(data.iceServers);
  }
  return toRtcIceServers([{ urls: "stun:stun.l.google.com:19302" }]);
}

export async function buildVoiceConnectParams(lang?: Lang) {
  const iceServers = await fetchVoiceIceServers();
  return {
    webrtcRequestParams: {
      endpoint: VOICE_OFFER_URL,
      // Soft language preference for greeting + bootstrap; spoken language
      // still auto-detects and can switch mid-call.
      requestData: { lang: lang ?? "en" },
    },
    iceConfig: { iceServers },
  };
}

export async function applyIceToTransport(client: PipecatClient, iceServers: RTCIceServer[]) {
  const transport = client.transport as SmallWebRTCTransport | undefined;
  if (transport?.iceServers !== undefined) {
    transport.iceServers = iceServers;
  }
}

/** Fetch TURN/STUN and connect the Pipecat client. */
export async function connectVoice(client: PipecatClient, lang?: Lang) {
  const params = await buildVoiceConnectParams(lang);
  const iceServers = params.iceConfig?.iceServers ?? [];
  await applyIceToTransport(client, iceServers);
  await client.connect(params);
}
