import "server-only";

import type { IceServerEntry } from "@/lib/turn/types";

const DEFAULT_STUN: IceServerEntry[] = [
  { urls: "stun:stun.relay.metered.ca:80" },
  { urls: "stun:stun.l.google.com:19302" },
];

function parseIceServersJson(raw: string): IceServerEntry[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (entry): entry is IceServerEntry =>
        typeof entry === "object" &&
        entry !== null &&
        "urls" in entry &&
        (typeof (entry as IceServerEntry).urls === "string" ||
          Array.isArray((entry as IceServerEntry).urls)),
    );
  } catch {
    return null;
  }
}

function buildFromTurnEnv(): IceServerEntry[] {
  const turnUrl = process.env.TURN_URL?.trim();
  if (!turnUrl) return [];

  const username = process.env.TURN_USERNAME?.trim();
  const credential = process.env.TURN_CREDENTIAL?.trim();
  const servers: IceServerEntry[] = [...DEFAULT_STUN];

  for (const url of turnUrl.split(",")) {
    const trimmed = url.trim();
    if (!trimmed) continue;
    servers.push({ urls: trimmed, username, credential });
  }

  return servers;
}

async function fetchMeteredIceServers(): Promise<IceServerEntry[] | null> {
  const apiKey = process.env.METERED_TURN_API_KEY?.trim();
  const app = process.env.METERED_TURN_APP?.trim();
  if (!apiKey || !app) return null;

  const res = await fetch(
    `https://${app}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`,
    { next: { revalidate: 3600 } },
  );
  if (!res.ok) return null;

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return null;

  return data.filter(
    (entry): entry is IceServerEntry =>
      typeof entry === "object" &&
      entry !== null &&
      "urls" in entry,
  ) as IceServerEntry[];
}

/** Resolve ICE servers for production WebRTC (server-side). */
export async function resolveIceServers(): Promise<{
  iceServers: IceServerEntry[];
  source: string;
}> {
  const json = process.env.ICE_SERVERS_JSON?.trim();
  if (json) {
    const parsed = parseIceServersJson(json);
    if (parsed?.length) return { iceServers: parsed, source: "ICE_SERVERS_JSON" };
  }

  const metered = await fetchMeteredIceServers();
  if (metered?.length) return { iceServers: metered, source: "metered_api" };

  const turnEnv = buildFromTurnEnv();
  if (turnEnv.length > DEFAULT_STUN.length) {
    return { iceServers: turnEnv, source: "TURN_URL" };
  }

  const stunOnly = process.env.NEXT_PUBLIC_ICE_STUN ?? process.env.PIPECAT_ICE_STUN;
  if (stunOnly) {
    const servers = stunOnly
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean)
      .map((urls) => ({ urls }));
    if (servers.length) return { iceServers: servers, source: "stun_only" };
  }

  return { iceServers: DEFAULT_STUN, source: "default_stun" };
}

export function isCloudVoiceDeploy(): boolean {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_PUBLIC_DOMAIN ||
      process.env.VERCEL ||
      (process.env.NODE_ENV === "production" &&
        !process.env.NEXT_PUBLIC_VOICE_OFFER_URL?.includes("localhost")),
  );
}

export function needsTurnWarning(source: string): boolean {
  return isCloudVoiceDeploy() && (source === "default_stun" || source === "stun_only");
}
