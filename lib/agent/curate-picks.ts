import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import type { Product } from "@/lib/commerce/types";
import type { GiftFinderState } from "@/lib/catalog/gift-finder-types";
import { GIFT_RELATIONSHIPS_BY_ID } from "@/lib/catalog/gift-relationships";
import { PERSONALITY_TRAITS_BY_ID } from "@/lib/catalog/personality-traits";
import { findOccasion } from "@/lib/catalog/occasions";
import { GEMINI_UTILITY_MODEL, isGeminiConfigured, withGeminiKeyFallback } from "@/lib/ai/gemini";

function describeGiftFinderState(state: GiftFinderState): string {
  const rel = state.relationship ? GIFT_RELATIONSHIPS_BY_ID[state.relationship]?.label : "someone";
  const occ = state.occasionId ? findOccasion(state.occasionId)?.label : "no specific occasion";
  const traits = state.personalityTraits
    .map((id) => PERSONALITY_TRAITS_BY_ID[id]?.label)
    .filter(Boolean)
    .join(", ");
  return `Recipient: ${rel}. Occasion: ${occ}. Personality: ${traits}.`;
}

/**
 * Cheap Gemini pass — pick 4–6 products and attach a one-line reason each.
 * This is the "trust builder" moment after the chip flow.
 */
export async function curateGiftPicks(
  products: Product[],
  state: GiftFinderState,
): Promise<{ products: Product[]; pickReasons: Record<string, string> }> {
  if (!products.length) return { products: [], pickReasons: {} };

  const maxPicks = Math.min(6, products.length);
  const minPicks = Math.min(4, products.length);

  if (!isGeminiConfigured()) {
    const slice = products.slice(0, maxPicks);
    const pickReasons: Record<string, string> = {};
    for (const p of slice) pickReasons[p.id] = "A strong match for what you described.";
    return { products: slice, pickReasons };
  }

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
    const { object } = await withGeminiKeyFallback(GEMINI_UTILITY_MODEL, (model) =>
      generateObject({
        model,
        schema: dynamicSchema,
        temperature: 0.4,
        system:
          "You curate gifts for a Sri Lankan shopper on Kapruka. Pick exactly 4–6 products " +
          "from the list that best match the recipient profile. Each reason is one short, " +
          "warm sentence starting with 'Because…' or similar — specific to their personality, " +
          "never generic marketing fluff. Use only product ids from the list.",
        prompt: `${describeGiftFinderState(state)}\n\nProducts:\n${JSON.stringify(catalog)}`,
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
    console.warn("[curate-picks] failed:", err);
    const slice = products.slice(0, 6);
    const pickReasons: Record<string, string> = {};
    for (const p of slice) pickReasons[p.id] = "Picked for their personality.";
    return { products: slice, pickReasons };
  }
}
