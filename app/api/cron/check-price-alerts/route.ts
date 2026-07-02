import { NextRequest, NextResponse } from "next/server";
import { isDbEnabled } from "@/lib/db";
import { getPendingAlerts, updateAlertPrice } from "@/lib/db/price-alerts";

export const runtime = "nodejs";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET /api/cron/check-price-alerts
 * Called once daily via Vercel Cron (see vercel.json).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  if (!isDbEnabled()) {
    return NextResponse.json({ ok: true, checked: 0, triggered: 0, note: "DATABASE_URL not configured." });
  }

  try {
    const pending = await getPendingAlerts();
    if (!pending.length) {
      return NextResponse.json({ ok: true, checked: 0, triggered: 0 });
    }

    const uniqueProductIds = [...new Set(pending.map((a) => a.productId))];
    const priceMap = new Map<string, number>();

    const { getGift } = await import("@/lib/mcp/kapruka");
    await Promise.allSettled(
      uniqueProductIds.map(async (productId) => {
        try {
          const product = await getGift(productId);
          if (product.price.amount != null) {
            priceMap.set(productId, product.price.amount);
          }
        } catch {
          // Product may be unavailable — skip
        }
      }),
    );

    let triggered = 0;
    const now = new Date().toISOString();

    await Promise.allSettled(
      pending.map(async (alert) => {
        const currentPrice = priceMap.get(alert.productId);
        if (currentPrice == null) return;

        if (currentPrice <= alert.targetPrice) {
          await updateAlertPrice(alert.rowId, {
            currentPrice,
            triggered: true,
            triggeredAt: now,
          });
          triggered++;
        } else {
          await updateAlertPrice(alert.rowId, { currentPrice });
        }
      }),
    );

    return NextResponse.json({ ok: true, checked: pending.length, triggered });
  } catch (err) {
    console.error("[cron/check-price-alerts]", err);
    return NextResponse.json({ ok: false, error: "Cron job failed." }, { status: 500 });
  }
}
