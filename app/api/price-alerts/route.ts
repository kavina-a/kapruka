import { NextRequest, NextResponse } from "next/server";
import { isDbEnabled } from "@/lib/db";
import {
  deletePriceAlert,
  getAlertsByClient,
  insertPriceAlert,
} from "@/lib/db/price-alerts";
import type { PriceAlert } from "@/lib/commerce/types";

export const runtime = "nodejs";

/** POST /api/price-alerts — create a new price alert. */
export async function POST(req: NextRequest) {
  if (!isDbEnabled()) {
    return NextResponse.json({ ok: true, note: "DATABASE_URL not configured; alert not persisted." });
  }

  try {
    const body = (await req.json()) as Partial<PriceAlert>;
    const clientId = req.headers.get("x-client-id") ?? body.clientId ?? "anonymous";
    if (!body.productId || !body.productName || body.targetPrice == null) {
      return NextResponse.json({ ok: false, error: "Missing required fields." }, { status: 400 });
    }

    const alert: PriceAlert = {
      clientId,
      productId: body.productId,
      productName: body.productName,
      imageUrl: body.imageUrl,
      targetPrice: body.targetPrice,
      currentPrice: body.currentPrice ?? 0,
      triggered: false,
      createdAt: new Date().toISOString(),
    };

    await insertPriceAlert(alert);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[price-alerts POST]", err);
    return NextResponse.json({ ok: false, error: "Failed to save alert." }, { status: 500 });
  }
}

/** GET /api/price-alerts?clientId=… — list this device's alerts. */
export async function GET(req: NextRequest) {
  if (!isDbEnabled()) return NextResponse.json({ ok: true, alerts: [] });

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "clientId required." }, { status: 400 });
  }

  try {
    const alerts = await getAlertsByClient(clientId);
    return NextResponse.json({ ok: true, alerts });
  } catch (err) {
    console.error("[price-alerts GET]", err);
    return NextResponse.json({ ok: false, error: "Failed to load alerts." }, { status: 500 });
  }
}

/** DELETE /api/price-alerts?clientId=…&productId=… — remove an alert. */
export async function DELETE(req: NextRequest) {
  if (!isDbEnabled()) return NextResponse.json({ ok: true });

  const clientId = req.nextUrl.searchParams.get("clientId");
  const productId = req.nextUrl.searchParams.get("productId");
  if (!clientId || !productId) {
    return NextResponse.json({ ok: false, error: "clientId and productId required." }, { status: 400 });
  }

  try {
    await deletePriceAlert(clientId, productId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[price-alerts DELETE]", err);
    return NextResponse.json({ ok: false, error: "Failed to delete alert." }, { status: 500 });
  }
}
