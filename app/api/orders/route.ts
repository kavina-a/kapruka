import { NextRequest, NextResponse } from "next/server";
import { isDbEnabled } from "@/lib/db";
import { insertOrder, getOrdersByClient } from "@/lib/db/orders";
import type { OrderRecord } from "@/lib/commerce/types";

export const runtime = "nodejs";

/** POST /api/orders — persist a new order record. */
export async function POST(req: NextRequest) {
  if (!isDbEnabled()) return NextResponse.json({ ok: true });

  try {
    const body = (await req.json()) as OrderRecord;
    if (!body.clientId || !body.recipient || !body.orderRef) {
      return NextResponse.json({ ok: false, error: "Missing required fields." }, { status: 400 });
    }

    await insertOrder({ ...body, date: body.date || new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[orders POST]", err);
    return NextResponse.json({ ok: false, error: "Failed to save order." }, { status: 500 });
  }
}

/** GET /api/orders?clientId=… — fetch this device's order history. */
export async function GET(req: NextRequest) {
  if (!isDbEnabled()) return NextResponse.json({ ok: true, records: [] });

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "clientId is required." }, { status: 400 });
  }

  try {
    const records = await getOrdersByClient(clientId);
    return NextResponse.json({ ok: true, records });
  } catch (err) {
    console.error("[orders GET]", err);
    return NextResponse.json({ ok: false, error: "Failed to load history." }, { status: 500 });
  }
}
