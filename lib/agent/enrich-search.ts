import "server-only";
import {
  applyAudienceToSearchInput,
  filterProductsForAudience,
  resolveRecipientAudience,
  type RecipientSearchContext,
} from "@/lib/catalog/recipient-audience";
import type { GiftFinderState } from "@/lib/catalog/gift-finder-types";
import { agentLog } from "@/lib/agent/log";
import { searchGifts, type SearchGiftsInput, type SearchGiftsResult } from "@/lib/mcp/kapruka";

export interface EnrichedSearchOptions {
  input: SearchGiftsInput;
  limit?: number;
  recipientContext?: RecipientSearchContext & {
    giftFinderState?: GiftFinderState | null;
  };
}

/**
 * Search pipeline with deterministic recipient grounding.
 * The LLM's shopperNote and gift-finder relationship are enforced server-side
 * so we never show women's perfume when the recipient is Dad.
 */
export async function searchGiftsWithRecipientContext(
  opts: EnrichedSearchOptions,
): Promise<SearchGiftsResult & { audience: string }> {
  const { input, limit = 8, recipientContext } = opts;
  const audience = resolveRecipientAudience({
    shopperNote: recipientContext?.shopperNote,
    relationshipId:
      recipientContext?.relationshipId ?? recipientContext?.giftFinderState?.relationship,
  });

  let enriched = applyAudienceToSearchInput(input, audience);

  agentLog("search.audience", {
    audience,
    before: input,
    after: enriched,
    shopperNote: recipientContext?.shopperNote?.slice(0, 120),
    relationship: recipientContext?.giftFinderState?.relationship ?? recipientContext?.relationshipId,
  });

  let res = await searchGifts({ ...enriched, limit });
  let products = filterProductsForAudience(res.products, audience);

  // If filtering leaves fewer than 3 results, try progressively different queries.
  // IMPORTANT: each retry must use a DIFFERENT query string so the MCP cache doesn't
  // return the same results (cache key = tool name + params hash).
  const vertical = (input.occasionId ?? "").toLowerCase();
  const isPerfumeVertical = vertical === "perfumes" || vertical === "perfume";

  if (products.length < Math.min(3, limit) && audience !== "neutral" && isPerfumeVertical) {
    const retrySequence =
      audience === "male"
        ? ["men perfume", "cologne for men", "men fragrance", "men body spray"]
        : ["women fragrance", "ladies perfume", "perfume for women", "women cologne"];

    for (const retryQuery of retrySequence) {
      // Skip if this is the same query we already ran (would be a cache hit).
      if (retryQuery === enriched.query) continue;

      agentLog("search.audience_retry", {
        audience,
        retryQuery,
        priorQuery: enriched.query,
        priorCount: res.products.length,
        filteredCount: products.length,
      });

      const retryInput = { ...enriched, query: retryQuery, alternativeQueries: undefined };
      const retryRes = await searchGifts({ ...retryInput, limit });
      const retryFiltered = filterProductsForAudience(retryRes.products, audience);

      if (retryFiltered.length > products.length) {
        // Merge new results with what we already have (dedup by id).
        const seen = new Set(products.map((p) => p.id));
        const merged = [
          ...products,
          ...retryFiltered.filter((p) => !seen.has(p.id)),
        ].slice(0, limit);
        products = merged;
        res = { ...retryRes, products: merged };
      }

      if (products.length >= 3) break;
    }
  }

  const filtered = products.slice(0, limit);
  agentLog("search.audience_filtered", {
    audience,
    before: res.products.length,
    after: filtered.length,
    dropped: res.products
      .filter((p) => !filtered.some((f) => f.id === p.id))
      .map((p) => p.name)
      .slice(0, 5),
  });

  return {
    ...res,
    products: filtered.length ? filtered : res.products.slice(0, limit),
    audience,
  };
}
