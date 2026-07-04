import {
  checkDelivery,
  getGift,
  listDeliveryCities,
  searchGifts,
  trackOrder,
  KaprukaError,
} from "@/lib/mcp/kapruka";
import { toCard } from "@/lib/catalog/seed";
import { applyGiftFinderToSearchInput } from "@/lib/agent/apply-gift-finder-search";
import { getVoiceGiftFinderState } from "@/lib/voice/gift-finder-context";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Internal tool API for the Pipecat voice bot.
//
// The voice agent (Python) calls back into this endpoint so it shares ONE
// source of truth with the text agent: the same resilient search, 90-product
// seed fallback, normalization, and delivery logic. Guarded by a shared token.
// ---------------------------------------------------------------------------

function authorized(req: Request): boolean {
  const expected = process.env.VOICE_API_TOKEN;
  // If no token is configured, allow (local dev). Otherwise require a match.
  if (!expected) return true;
  const got = req.headers.get("x-voice-token");
  return got === expected;
}

function errorBody(err: unknown) {
  if (err instanceof KaprukaError) {
    return { ok: false, error: err.message, code: err.code };
  }
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { tool?: string; args?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const tool = body.tool;
  const args = body.args ?? {};

  try {
    switch (tool) {
      case "search_gifts": {
        const clientId = req.headers.get("x-client-id") ?? "";
        const giftFinderState = getVoiceGiftFinderState(clientId);
        const input = applyGiftFinderToSearchInput(
          {
            query: typeof args.query === "string" ? args.query : undefined,
            occasionId: typeof args.occasionId === "string" ? args.occasionId : undefined,
            minPrice: typeof args.minPrice === "number" ? args.minPrice : undefined,
            maxPrice: typeof args.maxPrice === "number" ? args.maxPrice : undefined,
            inStockOnly: typeof args.inStockOnly === "boolean" ? args.inStockOnly : undefined,
          },
          giftFinderState,
        );
        const res = await searchGifts({ ...input, limit: 8 });
        return Response.json({
          ok: true,
          source: res.source,
          occasion: res.occasion,
          note: res.note,
          products: res.products,
        });
      }

      case "get_gift_details": {
        const productId = String(args.productId ?? "");
        if (!productId) return Response.json({ ok: false, error: "productId required" }, { status: 400 });
        const product = await getGift(productId);
        return Response.json({ ok: true, product, card: toCard(product) });
      }

      case "find_delivery_cities": {
        const query = String(args.query ?? "");
        const cities = await listDeliveryCities(query, 12);
        return Response.json({ ok: true, cities });
      }

      case "check_delivery": {
        const city = String(args.city ?? "");
        const date = String(args.date ?? "");
        const productId = typeof args.productId === "string" ? args.productId : undefined;
        const quote = await checkDelivery(city, date, productId);
        return Response.json({ ok: true, quote });
      }

      case "track_order": {
        const orderNumber = String(args.orderNumber ?? "");
        const order = await trackOrder(orderNumber);
        return Response.json({ ok: true, order });
      }

      default:
        return Response.json({ ok: false, error: `Unknown tool: ${tool}` }, { status: 400 });
    }
  } catch (err) {
    return Response.json(errorBody(err), { status: 200 });
  }
}
