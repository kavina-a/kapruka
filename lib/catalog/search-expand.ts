import type { Product } from "@/lib/commerce/types";

/** Relationship / recipient words — never use as the product search query. */
export const RECIPIENT_TERMS = new Set([
  "brother",
  "bro",
  "sister",
  "sis",
  "dad",
  "father",
  "mum",
  "mom",
  "mother",
  "amma",
  "appa",
  "thaththa",
  "nana",
  "nanna",
  "friend",
  "boss",
  "colleague",
  "coworker",
  "wife",
  "husband",
  "partner",
  "nephew",
  "niece",
  "cousin",
  "uncle",
  "aunt",
  "grandma",
  "grandpa",
  "boyfriend",
  "girlfriend",
  "fiance",
  "fiancee",
  "recipient",
  "someone",
  "person",
]);

const STOPWORDS = new Set([
  "gift",
  "gifts",
  "present",
  "presents",
  "something",
  "anything",
  "need",
  "want",
  "looking",
  "for",
  "my",
  "the",
  "a",
  "an",
  "please",
  "find",
  "show",
  "send",
  "buy",
  "get",
  "order",
]);

/** Franchise / theme → broader related queries when the exact item is missing. */
const RELATED_QUERY_CHAINS: Array<{ match: RegExp; queries: string[] }> = [
  // Roses — "roses" (plural) fails on Kapruka; singular "rose" / "rose bouquet" works.
  {
    match: /roses?/i,
    queries: ["rose", "red rose", "rose bouquet", "lily", "orchid"],
  },
  // Generic bouquet / arrangement searches — "bouquet" alone returns nothing; use specific types.
  {
    match: /bouquet|arrangement/i,
    queries: ["rose bouquet", "orchid", "lily", "red rose", "rose"],
  },
  // Generic "flowers" keyword — the flowers category filter is broken; fall back to specific types.
  {
    match: /\bflowers?\b/i,
    queries: ["orchid", "lily", "rose", "rose bouquet", "red rose"],
  },
  // Specific flower types — "flower bouquet" / "mixed flowers" don't work; use specific types.
  {
    match: /tulip/i,
    queries: ["lily", "orchid", "rose bouquet", "red rose", "rose"],
  },
  {
    match: /lily|lilies/i,
    queries: ["lily", "orchid", "rose bouquet", "rose"],
  },
  {
    match: /sunflower/i,
    queries: ["orchid", "lily", "rose bouquet", "red rose"],
  },
  {
    match: /orchid/i,
    queries: ["orchid", "lily", "rose bouquet", "rose"],
  },
  {
    match: /carnation/i,
    queries: ["rose bouquet", "lily", "orchid", "red rose"],
  },
  {
    match: /gerbera|daisy|freesia|hyacinth|chrysanthemum|anthurium|peony|calla|lavender/i,
    queries: ["lily", "orchid", "rose bouquet", "red rose"],
  },
  // Cake variety searches — "birthday cake" / "cake" alone fails on Kapruka; use specific types.
  {
    match: /birthday\s+cake|cake\s+for/i,
    queries: ["ribbon cake", "chocolate cake"],
  },
  {
    match: /\bcakes?\b/i,
    queries: ["chocolate cake", "ribbon cake"],
  },
  // Sympathy — "sympathy flowers" works; individual keywords work too.
  {
    match: /sympathy|condolence|funeral|grief|bereavement/i,
    queries: ["sympathy flowers", "sympathy", "condolence", "funeral wreath"],
  },
  // Batman / superhero
  {
    match: /bat\s*man|batman/i,
    queries: ["batman toy", "batman bag", "batman mug", "batman", "superhero toy", "spider man toy"],
  },
  {
    match: /spider[\s-]?man|spiderman/i,
    queries: ["spider man toy", "spiderman toy", "spider-man", "superhero toy", "batman toy"],
  },
  {
    match: /super\s*hero|superhero/i,
    queries: ["superhero toy", "batman toy", "spider man toy", "action figure"],
  },
  {
    match: /harry\s*potter/i,
    queries: ["harry potter", "harry potter mug", "harry potter gift"],
  },
  {
    match: /mug|mugs/i,
    queries: ["mug", "personalized mug", "printed mug", "coffee mug"],
  },
  {
    match: /toy|toys|action figure/i,
    queries: ["toy", "soft toy", "action figure", "kids gift"],
  },
];

export interface SanitizedQuery {
  /** Product-focused terms only — empty if the input was purely recipient/context. */
  productQuery: string;
  /** Recipient words stripped out (for shopperNote / mirroring). */
  recipientHints: string[];
}

/** Strip recipient and filler words so search targets the product, not who it's for. */
export function sanitizeProductQuery(raw?: string | null): SanitizedQuery {
  if (!raw?.trim()) return { productQuery: "", recipientHints: [] };

  const recipientHints: string[] = [];
  const kept: string[] = [];

  for (const word of raw.trim().split(/\s+/)) {
    const lower = word.toLowerCase().replace(/[^a-z0-9'-]/g, "");
    if (!lower) continue;
    if (RECIPIENT_TERMS.has(lower)) {
      recipientHints.push(word);
      continue;
    }
    if (STOPWORDS.has(lower)) continue;
    kept.push(word);
  }

  return { productQuery: kept.join(" ").trim(), recipientHints };
}

/** Build fallback queries when the exact product isn't in stock / search returns weak matches. */
export function expandRelatedQueries(query: string, extra?: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (q: string) => {
    const k = q.toLowerCase().trim();
    if (k.length >= 2 && !seen.has(k)) {
      seen.add(k);
      out.push(q.trim());
    }
  };

  add(query);
  for (const alt of extra ?? []) add(alt);

  for (const chain of RELATED_QUERY_CHAINS) {
    if (chain.match.test(query) || (extra ?? []).some((a) => chain.match.test(a))) {
      for (const q of chain.queries) add(q);
    }
  }

  // Token-level: "batman toy" → also try "batman", "toy"
  const tokens = query.split(/\s+/).filter((t) => t.length >= 3 && !STOPWORDS.has(t.toLowerCase()));
  for (const t of tokens) add(t);

  return out;
}

export function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s-]+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** How well results match what the buyer asked for (0–1). */
export function relevanceScore(products: Product[], query: string): number {
  if (!products.length || !query.trim()) return 0;
  const terms = queryTerms(query);
  if (!terms.length) return 0.5;

  let hits = 0;
  for (const p of products) {
    const hay = `${p.name} ${p.blurb ?? ""} ${p.category ?? ""}`.toLowerCase();
    if (terms.some((t) => hay.includes(t))) hits++;
  }
  return hits / products.length;
}

export function mergeProducts(existing: Product[], incoming: Product[], limit: number): Product[] {
  const seen = new Set(existing.map((p) => p.id));
  const merged = [...existing];
  for (const p of incoming) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    merged.push(p);
    if (merged.length >= limit) break;
  }
  return merged;
}
