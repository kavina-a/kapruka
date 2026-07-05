import "server-only";
import { callToolJson, callToolText, KaprukaError, KaprukaTransportError } from "./client";
import {
  parseDeliveryCities,
  toDeliveryQuote,
  toGiftDetails,
  toOrderConfirmation,
  toProduct,
  toTrackedOrder,
  type RawCheckDelivery,
  type RawCreateOrder,
  type RawProduct,
  type RawSearchResponse,
  type RawTrackOrder,
} from "./normalize";
import {
  findOccasion,
  inferOccasion,
  OCCASIONS,
  type Occasion,
} from "@/lib/catalog/occasions";
import { getSeedProduct, searchSeed, getSeedByOccasion } from "@/lib/catalog/seed";
import {
  expandRelatedQueries,
  mergeProducts,
  relevanceScore,
  sanitizeProductQuery,
} from "@/lib/catalog/search-expand";
import { filterOffSeasonProducts } from "@/lib/catalog/seasonal-filter";
import { matchDeliveryCity, normalizeCityInput, type CityResolveResult } from "@/lib/mcp/city-match";
import { agentLog, summarizeProducts, summarizeSearchInput } from "@/lib/agent/log";
import type {
  DeliveryCity,
  DeliveryQuote,
  GiftDetails,
  OrderConfirmation,
  Product,
  TrackedOrder,
} from "@/lib/commerce/types";

const READ_TTL = 30 * 60 * 1000; // 30 min — matches MCP's own cache window.
const CITY_TTL = 60 * 60 * 1000;
const DELIVERY_TTL = 5 * 60 * 1000;

export interface SearchGiftsInput {
  query?: string;
  occasionId?: string | null;
  category?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  inStockOnly?: boolean;
  sort?: "relevance" | "price_asc" | "price_desc" | "newest" | "bestseller";
  limit?: number;
  /** Extra fallback queries when the exact product isn't found (e.g. "spider man toy"). */
  alternativeQueries?: string[];
}

export interface SearchGiftsResult {
  products: Product[];
  source: "live" | "seed";
  occasion: { id: string; label: string; emoji: string } | null;
  note?: string;
  /** Whether results match the ask or are related alternatives. */
  matchQuality?: "exact" | "related" | "category";
  /** What we actually searched (for agent mirroring). */
  searchedFor?: string;
  /**
   * True when the search was blocked by the MCP rate limit. Products will be
   * empty — the caller should surface a rate_limited error to the model rather
   * than falling back to seed (showing unrelated items is worse than honesty).
   */
  rateLimited?: boolean;
}

function resolveOccasion(input: SearchGiftsInput): Occasion | null {
  if (input.occasionId) {
    const byId = findOccasion(input.occasionId);
    if (byId) return byId;
  }
  if (input.category) {
    const byCat = findOccasion(input.category);
    if (byCat) return byCat;
  }
  if (input.query) {
    return inferOccasion(input.query);
  }
  return null;
}

interface SearchAttempt {
  q: string;
  category?: string;
}

interface LiveAttemptsResult {
  products: Product[];
  transportFailed: boolean;
  rateLimited: boolean;
}

function buildAttempts(input: SearchGiftsInput, occasion: Occasion | null, productQuery: string): SearchAttempt[] {
  const attempts: SearchAttempt[] = [];
  const query = productQuery.trim();

  if (occasion) {
    if (query) attempts.push({ q: query, category: occasion.mcpCategory });
    attempts.push({ q: occasion.query, category: occasion.mcpCategory });
  }
  if (query) {
    if (input.category) attempts.push({ q: query, category: input.category });
    attempts.push({ q: query });
    const firstToken = query.split(/\s+/).find((t) => t.length >= 3);
    if (firstToken && firstToken !== query && occasion) {
      attempts.push({ q: firstToken, category: occasion.mcpCategory });
    }
  }

  const seen = new Set<string>();
  return attempts
    .filter((a) => {
      const k = `${a.q}|${a.category ?? ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return a.q.length >= 2;
    })
    .slice(0, 4);
}

async function runLiveAttempts(
  attempts: SearchAttempt[],
  input: SearchGiftsInput,
  label = "primary",
): Promise<LiveAttemptsResult> {
  let transportFailed = false;
  let rateLimited = false;
  agentLog("search.attempts", { label, attempts }, "debug");
  for (const attempt of attempts) {
    try {
      const res = await liveSearch(attempt, input);
      const count = res?.results?.length ?? 0;
      agentLog(
        "search.attempt",
        { label, q: attempt.q, category: attempt.category ?? null, resultCount: count },
        count ? "info" : "debug",
      );
      if (count) {
        return { products: res!.results.map((r) => toProduct(r, [])), transportFailed: false, rateLimited: false };
      }
    } catch (err) {
      transportFailed = true;
      if (err instanceof KaprukaTransportError && err.status === 429) {
        rateLimited = true;
      }
      agentLog(
        "search.attempt_error",
        {
          label,
          q: attempt.q,
          category: attempt.category ?? null,
          rateLimited,
          error: err instanceof Error ? err.message : String(err),
        },
        "warn",
      );
      break;
    }
  }
  return { products: [], transportFailed, rateLimited };
}

async function liveSearch(
  attempt: SearchAttempt,
  input: SearchGiftsInput,
): Promise<RawSearchResponse | null> {
  const params: Record<string, unknown> = {
    q: attempt.q,
    limit: Math.min(input.limit ?? 8, 24),
    sort: input.sort ?? "relevance",
    currency: "LKR",
  };
  if (attempt.category) params.category = attempt.category;
  if (input.inStockOnly) params.in_stock_only = true;
  if (typeof input.minPrice === "number") params.min_price = input.minPrice;
  if (typeof input.maxPrice === "number") params.max_price = input.maxPrice;

  try {
    return await callToolJson<RawSearchResponse>("kapruka_search_products", params, {
      ttlMs: READ_TTL,
    });
  } catch (err) {
    if (err instanceof KaprukaError) {
      // "no_results" or a validation error -> let the caller try the next attempt.
      return null;
    }
    // Transport/rate-limit errors should bubble so we fall back to seed quickly.
    throw err;
  }
}

/**
 * Resilient gift search: tries live MCP search (anchored on the inferred
 * occasion/category for reliability), then falls back to the verified seed
 * catalog so the experience never dead-ends.
 */
function logSearchComplete(result: SearchGiftsResult, phase: string): SearchGiftsResult {
  agentLog("search.complete", {
    phase,
    source: result.source,
    matchQuality: result.matchQuality,
    searchedFor: result.searchedFor,
    count: result.products.length,
    note: result.note,
    products: summarizeProducts(result.products),
  });
  return result;
}

export async function searchGifts(input: SearchGiftsInput): Promise<SearchGiftsResult> {
  const { productQuery, recipientHints } = sanitizeProductQuery(input.query);
  const effectiveQuery = productQuery.trim();
  const searchInput = { ...input, query: effectiveQuery || undefined };

  const occasion = resolveOccasion(searchInput);
  const occasionMeta = occasion
    ? { id: occasion.id, label: occasion.label, emoji: occasion.emoji }
    : null;
  const occTags = occasion ? [occasion.id] : [];
  const limit = input.limit ?? 8;

  agentLog("search.start", {
    input: summarizeSearchInput(searchInput as Record<string, unknown>),
    effectiveQuery: effectiveQuery || null,
    recipientHints,
    occasion: occasionMeta,
    limit,
  });

  const primaryAttempts = buildAttempts(searchInput, occasion, effectiveQuery);
  let { products, transportFailed, rateLimited } = await runLiveAttempts(primaryAttempts, searchInput, "primary");

  if (products.length) {
    products = filterOffSeasonProducts(products).map((p) => ({
      ...p,
      occasions: [...new Set([...(p.occasions ?? []), ...occTags])],
    }));
  }

  const primaryRelevance = effectiveQuery ? relevanceScore(products, effectiveQuery) : 1;
  const needsFallback =
    !products.length ||
    (effectiveQuery.length >= 3 && primaryRelevance < 0.2);

  let matchQuality: SearchGiftsResult["matchQuality"] = products.length ? "exact" : undefined;
  let searchedFor = effectiveQuery || occasion?.label || "";

  // For recipient-type occasions (father, mother) that may not exist as a
  // Kapruka MCP category, retry with the fallback product verticals defined
  // on the occasion itself. This surfaces chocolates, perfumes, etc. when a
  // specific product interest is unknown but the recipient type is known.
  //
  // We deliberately DON'T stop at the first category with results — a buyer
  // who only said "something for my dad" should see a spread across a few
  // verticals (chocolates + perfumes + a hamper), not eight chocolate boxes.
  // Only when the buyer named a specific product (effectiveQuery set) do we
  // stay narrow, since then diversity would dilute an otherwise exact match.
  // Rate limit hit — return immediately. Do NOT fall through to seed or expansion
  // since showing unrelated items is misleading and breaks trust more than honesty.
  if (rateLimited) {
    return logSearchComplete(
      {
        products: [],
        source: "live",
        occasion: occasionMeta,
        matchQuality: undefined,
        searchedFor: effectiveQuery,
        rateLimited: true,
      },
      "rate_limited",
    );
  }

  if (!products.length && occasion?.fallbackOccasionIds?.length) {
    const occasionQuery = occasion.query;
    const usedCategories: string[] = [];
    let collected: Product[] = [];
    const wantsVariety = !effectiveQuery;
    const perCategoryCap = wantsVariety ? Math.max(2, Math.ceil(limit / 3)) : limit;

    for (const fallbackId of occasion.fallbackOccasionIds) {
      if (collected.length >= limit) break;
      const fallbackOcc = findOccasion(fallbackId);
      if (!fallbackOcc) continue;
      // Use the product query if we have one, otherwise the occasion's own query term
      const q = effectiveQuery || occasionQuery;
      const res = await runLiveAttempts(
        [{ q, category: fallbackOcc.mcpCategory }, { q: fallbackOcc.query, category: fallbackOcc.mcpCategory }],
        input,
        `fallback:${fallbackId}`,
      );
      if (res.products.length) {
        const seasonSafe = filterOffSeasonProducts(res.products);
        const slice = wantsVariety ? seasonSafe.slice(0, perCategoryCap) : seasonSafe;
        collected = mergeProducts(
          collected,
          slice.map((p) => ({ ...p, occasions: [...new Set([...(p.occasions ?? []), occasion.id])] })),
          limit,
        );
        usedCategories.push(fallbackId);
        if (!wantsVariety) break;
      }
    }

    if (collected.length) {
      products = collected;
      matchQuality = "category";
      searchedFor =
        effectiveQuery ||
        (usedCategories.length > 1
          ? `${occasion.label} favourites`
          : (findOccasion(usedCategories[0])?.label ?? occasion.label));
    }
  }

  // Only expand with alternative queries when live search is reachable — if the
  // primary attempts hit a transport error, extra queries will too.
  if (needsFallback && effectiveQuery && !transportFailed) {
    const relatedQueries = expandRelatedQueries(effectiveQuery, input.alternativeQueries).slice(0, 5);
    for (const altQuery of relatedQueries) {
      if (altQuery.toLowerCase() === effectiveQuery.toLowerCase()) continue;
      const altAttempts = buildAttempts({ ...searchInput, query: altQuery }, occasion, altQuery);
      const alt = await runLiveAttempts(altAttempts, { ...searchInput, query: altQuery }, `expand:${altQuery}`);
      if (alt.transportFailed) { transportFailed = true; if (alt.rateLimited) rateLimited = true; break; }
      if (alt.products.length) {
        const tagged = filterOffSeasonProducts(alt.products).map((p) => ({
          ...p,
          occasions: [...new Set([...(p.occasions ?? []), ...occTags])],
        }));
        products = mergeProducts(products, tagged, limit);
        if (relevanceScore(tagged, altQuery) >= 0.2) {
          matchQuality = altQuery.toLowerCase().includes(effectiveQuery.toLowerCase()) ? "related" : "related";
          searchedFor = altQuery;
          if (relevanceScore(products, effectiveQuery) >= 0.25) break;
        }
      }
      if (products.length >= limit && relevanceScore(products, effectiveQuery) >= 0.25) break;
    }
  }

  if (products.length) {
    const finalRel = effectiveQuery ? relevanceScore(products, effectiveQuery) : 1;

    // If every result is completely unrelated (e.g. "tulip" returns nozzle tips),
    // treat it as empty and fall through to the seed catalogue — don't surface garbage.
    if (effectiveQuery && finalRel < 0.1) {
      products = [];
    } else {
      matchQuality = matchQuality !== "exact"
        ? finalRel >= 0.35 ? "exact" : "related"
        : "exact";
    }
  }

  if (products.length) {
    return logSearchComplete(
      {
        products: products.slice(0, limit),
        source: "live",
        occasion: occasionMeta,
        matchQuality,
        searchedFor,
      },
      "live",
    );
  }

  const seed = searchSeed({
    occasionId: occasion?.id ?? null,
    query: (effectiveQuery || input.query) ?? null,
    minPrice: input.minPrice ?? null,
    maxPrice: input.maxPrice ?? null,
    inStockOnly: input.inStockOnly,
    sort: input.sort,
    limit,
  });

  // Last resort: if a specific variety query matched nothing, still show the vertical.
  let seedProducts =
    seed.length > 0
      ? seed
      : occasion?.id
        ? getSeedByOccasion(occasion.id, limit)
        : [];

  // Some occasions (e.g. "father") have no tagged seed products but DO have products
  // whose names contain the occasion's query term (e.g. "Father's Day Cake").
  // Fall back to a name-match search against the full seed catalogue.
  if (!seedProducts.length && occasion?.query) {
    seedProducts = searchSeed({
      occasionId: null,
      query: occasion.query,
      minPrice: input.minPrice ?? null,
      maxPrice: input.maxPrice ?? null,
      inStockOnly: input.inStockOnly,
      sort: input.sort,
      limit,
    });
  }

  seedProducts = filterOffSeasonProducts(seedProducts);

  if (seedProducts.length) {
    const varietyLabel = effectiveQuery || input.query || "";
    return logSearchComplete(
      {
        products: seedProducts,
        source: "seed",
        occasion: occasionMeta,
        matchQuality: effectiveQuery ? "related" : "category",
        searchedFor: effectiveQuery || occasion?.label || "favourites",
        note: transportFailed
          ? "Live search was unavailable — here are some hand-picked options from our catalogue."
          : varietyLabel
            ? `We couldn't find an exact match for "${varietyLabel}" — here are the closest alternatives.`
            : "Here are some hand-picked options from our catalogue.",
      },
      "seed",
    );
  }

  return logSearchComplete(
    {
      products: [],
      source: transportFailed ? "live" : "seed",
      occasion: occasionMeta,
      searchedFor: effectiveQuery,
      note: "I couldn't find a match for that just now.",
    },
    "empty",
  );
}

/** Full product details — live, with seed fallback. */
export async function getGift(productId: string): Promise<GiftDetails> {
  try {
    const raw = await callToolJson<RawProduct>(
      "kapruka_get_product",
      { product_id: productId, currency: "LKR" },
      { ttlMs: READ_TTL },
    );
    const seedOcc = getSeedProduct(productId)?.occasions ?? [];
    return toGiftDetails(raw, seedOcc);
  } catch (err) {
    const seeded = getSeedProduct(productId);
    if (seeded) return seeded;
    if (err instanceof KaprukaError) throw err;
    throw new KaprukaError("I couldn't pull up that product's details right now.");
  }
}

export async function listDeliveryCities(query: string, limit = 12): Promise<DeliveryCity[]> {
  if (!query || query.trim().length < 2) return [];
  const text = await callToolText(
    "kapruka_list_delivery_cities",
    { query: query.trim(), limit },
    { ttlMs: CITY_TTL },
  );
  return parseDeliveryCities(text);
}

/** Resolve free-text to an exact Kapruka delivery city (name or alias). */
export async function resolveDeliveryCity(rawInput: string): Promise<CityResolveResult> {
  const input = normalizeCityInput(rawInput);
  if (!input) {
    return {
      ok: false,
      code: "city_empty",
      message: "Pick a delivery city or town.",
      suggestions: [],
    };
  }
  if (input.length < 2) {
    return {
      ok: false,
      code: "city_not_found",
      message: "Type at least 2 characters to search for a delivery city.",
      suggestions: [],
    };
  }

  const cities = await listDeliveryCities(input, 15);
  return matchDeliveryCity(cities, input);
}

async function requireDeliveryCity(city: string): Promise<string> {
  const resolved = await resolveDeliveryCity(city);
  if (!resolved.ok) {
    throw new KaprukaError(resolved.message, resolved.code);
  }
  return resolved.city;
}

export async function checkDelivery(
  city: string,
  date: string,
  productId?: string,
): Promise<DeliveryQuote> {
  const deliverableCity = await requireDeliveryCity(city);
  const params: Record<string, unknown> = { city: deliverableCity, delivery_date: date };
  if (productId) params.product_id = productId;
  const raw = await callToolJson<RawCheckDelivery>("kapruka_check_delivery", params, {
    ttlMs: DELIVERY_TTL,
  });
  return toDeliveryQuote(raw);
}

export interface CreateOrderInput {
  cart: Array<{ product_id: string; quantity: number; icing_text?: string | null }>;
  recipient: { name: string; phone: string };
  delivery: {
    address: string;
    city: string;
    location_type: string;
    date: string;
    instructions?: string | null;
  };
  sender: { name: string; anonymous: boolean };
  gift_message?: string | null;
}

export async function createOrder(input: CreateOrderInput): Promise<OrderConfirmation> {
  const deliverableCity = await requireDeliveryCity(input.delivery.city);
  const params: Record<string, unknown> = {
    cart: input.cart.map((c) => ({
      product_id: c.product_id,
      quantity: c.quantity,
      ...(c.icing_text ? { icing_text: c.icing_text } : {}),
    })),
    recipient: input.recipient,
    delivery: {
      address: input.delivery.address,
      city: deliverableCity,
      location_type: input.delivery.location_type || "house",
      date: input.delivery.date,
      ...(input.delivery.instructions ? { instructions: input.delivery.instructions } : {}),
    },
    sender: input.sender,
    currency: "LKR",
    ...(input.gift_message ? { gift_message: input.gift_message } : {}),
  };

  const raw = await callToolJson<RawCreateOrder>("kapruka_create_order", params);
  return toOrderConfirmation(raw);
}

export async function trackOrder(orderNumber: string): Promise<TrackedOrder> {
  const raw = await callToolJson<RawTrackOrder>("kapruka_track_order", {
    order_number: orderNumber.trim(),
  });
  return toTrackedOrder(raw);
}

export { KaprukaError, KaprukaTransportError, OCCASIONS };
