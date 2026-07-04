import { OCCASIONS } from "@/lib/catalog/occasions";
import type { GiftFinderState } from "@/lib/catalog/gift-finder-types";
import { isGiftFinderComplete } from "@/lib/catalog/gift-finder-types";
import { budgetTierToPriceRange, giftFinderSearchHints } from "@/lib/chat/gift-finder";
import type { SearchGiftsInput } from "@/lib/mcp/kapruka";

const OCCASION_IDS = OCCASIONS.map((o) => o.id);

/** Apply chip-selected gift-finder state to a Kapruka search input (chat + voice). */
export function applyGiftFinderToSearchInput(
  input: SearchGiftsInput,
  giftFinderState?: GiftFinderState | null,
): SearchGiftsInput {
  if (!isGiftFinderComplete(giftFinderState)) return input;

  const state = giftFinderState!;
  const next = { ...input };
  const { minPrice, maxPrice } = budgetTierToPriceRange(state.budgetTier);
  if (minPrice != null) next.minPrice = next.minPrice ?? minPrice;
  if (maxPrice != null) next.maxPrice = next.maxPrice ?? maxPrice;

  const { relatedOccasionIds, keywords } = giftFinderSearchHints(state);
  const primary = relatedOccasionIds[0] ?? state.occasionId;
  if (!next.occasionId && primary && (OCCASION_IDS as readonly string[]).includes(primary)) {
    next.occasionId = primary;
  }
  if (!next.query?.trim() && keywords.length) {
    next.query = keywords.slice(0, 3).join(" ");
  }
  return next;
}
