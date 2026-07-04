import "server-only";
import seedJson from "./seed.json";
import { toGiftDetails, type RawProduct } from "@/lib/mcp/normalize";
import type { GiftDetails, Product } from "@/lib/commerce/types";
import { OCCASIONS } from "./occasions";

interface SeedFile {
  generatedAt: string;
  count: number;
  occasionMap: Record<string, string[]>;
  products: Array<RawProduct & { __occasions?: string[] }>;
}

const seed = seedJson as unknown as SeedFile;

// Reverse index: product id -> occasions it appears under.
const idToOccasions = new Map<string, string[]>();
for (const [occ, ids] of Object.entries(seed.occasionMap)) {
  for (const id of ids) {
    const arr = idToOccasions.get(id) ?? [];
    arr.push(occ);
    idToOccasions.set(id, arr);
  }
}

export const SEED_PRODUCTS: GiftDetails[] = seed.products.map((raw) =>
  toGiftDetails(raw, raw.__occasions ?? idToOccasions.get(raw.id) ?? []),
);

const SEED_BY_ID = new Map<string, GiftDetails>(SEED_PRODUCTS.map((p) => [p.id, p]));

export function getSeedProduct(id: string): GiftDetails | undefined {
  return SEED_BY_ID.get(id);
}

export function getSeedByOccasion(occasionId: string, limit = 12): GiftDetails[] {
  return SEED_PRODUCTS.filter((p) => p.occasions.includes(occasionId)).slice(0, limit);
}

export function occasionsWithSeed(): string[] {
  return OCCASIONS.filter((o) => getSeedByOccasion(o.id, 1).length > 0).map((o) => o.id);
}

interface SeedSearchOpts {
  occasionId?: string | null;
  query?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  inStockOnly?: boolean;
  sort?: string;
  limit?: number;
}

/** Filter the seed catalog as a graceful fallback when live search is empty. */
export function searchSeed(opts: SeedSearchOpts): GiftDetails[] {
  const { occasionId, query, minPrice, maxPrice, inStockOnly, sort = "relevance", limit = 12 } =
    opts;

  let items = SEED_PRODUCTS.slice();

  if (occasionId) {
    items = items.filter((p) => p.occasions.includes(occasionId));
  }

  if (query && query.trim()) {
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    if (terms.length) {
      const scored = items
        .map((p) => {
          const hay = `${p.name} ${p.blurb} ${p.category ?? ""} ${p.occasions.join(" ")}`.toLowerCase();
          const score = terms.reduce((s, t) => (hay.includes(t) ? s + 1 : s), 0);
          return { p, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.p);
      if (scored.length) {
        items = scored;
      } else if (!occasionId) {
        // Query provided but nothing matched and no occasion to fall back on
        // — return empty rather than the whole catalog, which would surface
        // completely unrelated products (e.g. birthday cakes for "jewellery").
        return [];
      }
    }
  }

  if (inStockOnly) items = items.filter((p) => p.inStock);
  if (typeof minPrice === "number") {
    items = items.filter((p) => (p.price.amount ?? 0) >= minPrice);
  }
  if (typeof maxPrice === "number") {
    items = items.filter((p) => (p.price.amount ?? Infinity) <= maxPrice);
  }

  switch (sort) {
    case "price_asc":
      items.sort((a, b) => (a.price.amount ?? 0) - (b.price.amount ?? 0));
      break;
    case "price_desc":
      items.sort((a, b) => (b.price.amount ?? 0) - (a.price.amount ?? 0));
      break;
    default:
      break;
  }

  return items.slice(0, limit);
}

/** Lightweight curated "bestsellers" mix for the landing page. */
export function getFeaturedMix(limit = 12): GiftDetails[] {
  const picks: GiftDetails[] = [];
  const seen = new Set<string>();
  // Round-robin across occasions for variety.
  const buckets = OCCASIONS.map((o) => getSeedByOccasion(o.id, 4));
  let i = 0;
  while (picks.length < limit && buckets.some((b) => b.length)) {
    const bucket = buckets[i % buckets.length];
    const next = bucket.shift();
    if (next && !seen.has(next.id) && next.image) {
      seen.add(next.id);
      picks.push(next);
    }
    i++;
    if (i > 500) break;
  }
  return picks;
}

export function toCard(p: GiftDetails): Product {
  // GiftDetails already extends Product; strip detail-only fields for the wire.
  const { description: _d, images: _i, variants: _v, attributes: _a, shipping: _s, ...card } = p;
  void _d;
  void _i;
  void _v;
  void _a;
  void _s;
  return card;
}
