/** STUN/TURN for browser ↔ pipecat WebRTC (required when not on localhost). */
export function getVoiceIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [];

  const stun =
    process.env.NEXT_PUBLIC_ICE_STUN ?? "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302";
  for (const url of stun.split(",")) {
    const trimmed = url.trim();
    if (trimmed) servers.push({ urls: trimmed });
  }

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL?.trim();
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }

  return servers;
}
