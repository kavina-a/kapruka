import { NextRequest, NextResponse } from "next/server";
import type { PriceAlert } from "@/lib/commerce/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MONGO_ENABLED = !!process.env.MONGODB_URI;
const DB_NAME = "chatruka";
const COLLECTION = "price_alerts";
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET /api/cron/check-price-alerts
 * Called once daily via Vercel Cron (see vercel.json).
 * Fetches live product prices from Kapruka MCP and marks alerts as triggered
 * when the current price is at or below the target.
 */
export async function GET(req: NextRequest) {
  // Verify the request comes from Vercel Cron (or our own secret in dev)
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  if (!MONGO_ENABLED) {
    return NextResponse.json({ ok: true, checked: 0, triggered: 0, note: "MongoDB not configured." });
  }

  try {
    const { default: clientPromise } = await import("@/lib/mongodb");
    const client = await clientPromise;
    const col = client.db(DB_NAME).collection<PriceAlert>(COLLECTION);

    // Fetch all non-triggered alerts
    const pending = await col.find({ triggered: false }).toArray();
    if (!pending.length) {
      return NextResponse.json({ ok: true, checked: 0, triggered: 0 });
    }

    // Deduplicate by productId so we fetch each product at most once
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

        // Update current price regardless
        const update: Partial<PriceAlert> & { triggeredAt?: string } = { currentPrice };

        if (currentPrice <= alert.targetPrice) {
          update.triggered = true;
          update.triggeredAt = now;
          triggered++;
        }

        await col.updateOne(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { _id: (alert as any)._id },
          { $set: update },
        );
      }),
    );

    return NextResponse.json({ ok: true, checked: pending.length, triggered });
  } catch (err) {
    console.error("[cron/check-price-alerts]", err);
    return NextResponse.json({ ok: false, error: "Cron job failed." }, { status: 500 });
  }
}
