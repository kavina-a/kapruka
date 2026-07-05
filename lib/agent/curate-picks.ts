import "server-only";
import type { Product } from "@/lib/commerce/types";
import type { GiftFinderState } from "@/lib/catalog/gift-finder-types";
import { GIFT_RELATIONSHIPS_BY_ID } from "@/lib/catalog/gift-relationships";
import { PERSONALITY_TRAITS_BY_ID } from "@/lib/catalog/personality-traits";
import { findOccasion } from "@/lib/catalog/occasions";

function describeGiftFinderState(state: GiftFinderState): string {
  const rel = state.relationship ? GIFT_RELATIONSHIPS_BY_ID[state.relationship]?.label : "someone";
  const occ = state.occasionId ? findOccasion(state.occasionId)?.label : "no specific occasion";
  const traits = state.personalityTraits
    .map((id) => PERSONALITY_TRAITS_BY_ID[id]?.label)
    .filter(Boolean)
    .join(", ");
  return `Recipient: ${rel}. Occasion: ${occ}. Personality: ${traits}.`;
}

function templateReason(state: GiftFinderState, product: Product): string {
  const traits = state.personalityTraits
    .map((id) => PERSONALITY_TRAITS_BY_ID[id]?.label)
    .filter(Boolean);
  if (traits.length) {
    return `Because they're into ${traits.slice(0, 2).join(" and ")} — ${product.name} should land well.`;
  }
  const rel = state.relationship ? GIFT_RELATIONSHIPS_BY_ID[state.relationship]?.label : null;
  if (rel) return `A strong pick for your ${rel.toLowerCase()}.`;
  return "A strong match for what you described.";
}

/**
 * Pick 4–6 products after the chip flow and attach a one-line reason each.
 *
 * Default: template reasons (zero LLM cost). Set CURATE_USE_LLM=true to enable
 * the optional LLM curation pass (~1 extra utility call per gift-finder search).
 */
export async function curateGiftPicks(
  products: Product[],
  state: GiftFinderState,
): Promise<{ products: Product[]; pickReasons: Record<string, string> }> {
  if (!products.length) return { products: [], pickReasons: {} };

  const maxPicks = Math.min(6, products.length);
  const slice = products.slice(0, maxPicks);
  const pickReasons: Record<string, string> = {};
  for (const p of slice) {
    pickReasons[p.id] = templateReason(state, p);
  }

  // Optional LLM curation — off by default to save cost
  if (process.env.CURATE_USE_LLM !== "true") {
    return { products: slice, pickReasons };
  }

  // Lazy import — only load LLM path when explicitly enabled
  const { curateGiftPicksWithLLM } = await import("@/lib/agent/curate-picks-llm");
  return curateGiftPicksWithLLM(products, state, describeGiftFinderState);
}
