import { NextRequest, NextResponse } from "next/server";
import type { GiftFinderState } from "@/lib/catalog/gift-finder-types";
import { setVoiceGiftFinderState } from "@/lib/voice/gift-finder-context";

export const runtime = "nodejs";

/** PUT /api/voice-context — sync gift-finder picks from the browser for voice search parity. */
export async function PUT(req: NextRequest) {
  let body: { clientId?: string; giftFinderState?: GiftFinderState | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.clientId) {
    return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
  }

  setVoiceGiftFinderState(body.clientId, body.giftFinderState ?? null);
  return NextResponse.json({ ok: true });
}
