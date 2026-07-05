import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import type { Product } from "@/lib/commerce/types";
import type { GiftFinderState } from "@/lib/catalog/gift-finder-types";
import { withUtilityFallback } from "@/lib/ai/provider";

/**
 * Optional LLM curation — only used when CURATE_USE_LLM=true.
 * Kept in a separate file so the default path never imports generateObject.
 */
export async function curateGiftPicksWithLLM(
  products: Product[],
  state: GiftFinderState,
  describeState: (state: GiftFinderState) => string,
): Promise<{ products: Product[]; pickReasons: Record<string, string> }> {
  const maxPicks = Math.min(6, products.length);
  const minPicks = Math.min(4, products.length);

  const catalog = products.slice(0, 12).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price.amount,
  }));

  const dynamicSchema = z.object({
    picks: z
      .array(
        z.object({
          productId: z.string(),
          reason: z.string().max(140),
        }),
      )
      .min(minPicks)
      .max(maxPicks),
  });

  try {
    const { object } = await withUtilityFallback((model) =>
      generateObject({
        model,
        schema: dynamicSchema,
        temperature: 0.4,
        maxRetries: 1,
        timeout: 6000,
        system:
          "You curate gifts for a Sri Lankan shopper on Kapruka. Pick exactly 4–6 products " +
          "from the list that best match the recipient profile. Each reason is one short, " +
          "warm sentence starting with 'Because…' or similar — specific to their personality, " +
          "never generic marketing fluff. Use only product ids from the list.",
        prompt: `${describeState(state)}\n\nProducts:\n${JSON.stringify(catalog)}`,
      }),
    );

    const byId = new Map(products.map((p) => [p.id, p]));
    const curated: Product[] = [];
    const pickReasons: Record<string, string> = {};

    for (const pick of object.picks) {
      const product = byId.get(pick.productId);
      if (product) {
        curated.push(product);
        pickReasons[product.id] = pick.reason;
      }
    }

    if (curated.length < minPicks) {
      const fallback = products.slice(0, 6);
      const reasons: Record<string, string> = {};
      for (const p of fallback) {
        reasons[p.id] = pickReasons[p.id] ?? "Fits what you told me about them.";
      }
      return { products: fallback, pickReasons: reasons };
    }

    return { products: curated, pickReasons };
  } catch (err) {
    console.warn("[curate-picks-llm] failed:", err);
    const slice = products.slice(0, 6);
    const pickReasons: Record<string, string> = {};
    for (const p of slice) pickReasons[p.id] = "Picked for their personality.";
    return { products: slice, pickReasons };
  }
}
