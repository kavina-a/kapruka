import { NextRequest, NextResponse } from "next/server";
import type { OrderRecord } from "@/lib/commerce/types";

const MONGO_ENABLED = !!process.env.MONGODB_URI;
const DB_NAME = "chatruka";
const COLLECTION = "orders";

/** POST /api/orders — persist a new order record. */
export async function POST(req: NextRequest) {
  if (!MONGO_ENABLED) return NextResponse.json({ ok: true });

  try {
    const { default: clientPromise } = await import("@/lib/mongodb");
    const body = (await req.json()) as OrderRecord;
    if (!body.clientId || !body.recipient || !body.orderRef) {
      return NextResponse.json({ ok: false, error: "Missing required fields." }, { status: 400 });
    }

    const client = await clientPromise;
    const col = client.db(DB_NAME).collection<OrderRecord>(COLLECTION);
    await col.insertOne({ ...body, date: body.date || new Date().toISOString() });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[orders POST]", err);
    return NextResponse.json({ ok: false, error: "Failed to save order." }, { status: 500 });
  }
}

/** GET /api/orders?clientId=… — fetch this device's order history. */
export async function GET(req: NextRequest) {
  if (!MONGO_ENABLED) return NextResponse.json({ ok: true, records: [] });

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "clientId is required." }, { status: 400 });
  }

  try {
    const { default: clientPromise } = await import("@/lib/mongodb");
    const client = await clientPromise;
    const col = client.db(DB_NAME).collection<OrderRecord>(COLLECTION);
    const records = await col
      .find({ clientId })
      .sort({ date: -1 })
      .limit(50)
      .project<OrderRecord>({ _id: 0 })
      .toArray();

    return NextResponse.json({ ok: true, records });
  } catch (err) {
    console.error("[orders GET]", err);
    return NextResponse.json({ ok: false, error: "Failed to load history." }, { status: 500 });
  }
}
