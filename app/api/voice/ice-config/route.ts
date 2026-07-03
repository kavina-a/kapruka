import { NextResponse } from "next/server";
import { needsTurnWarning, resolveIceServers } from "@/lib/turn/resolve";

export const dynamic = "force-dynamic";

/** ICE servers for browser WebRTC — includes TURN when configured. */
export async function GET() {
  try {
    const { iceServers, source } = await resolveIceServers();

    if (needsTurnWarning(source)) {
      console.warn(
        "[voice/ice-config] No TURN configured — WebRTC will fail on Railway/Vercel. " +
          "Set METERED_TURN_API_KEY + METERED_TURN_APP (free at metered.ca/tools/openrelay) " +
          "or ICE_SERVERS_JSON / TURN_URL on Vercel and Railway.",
      );
    }

    return NextResponse.json({ ok: true, iceServers, source });
  } catch (err) {
    console.error("[voice/ice-config]", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load ICE config.", iceServers: [] },
      { status: 500 },
    );
  }
}
