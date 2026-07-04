import type { Product } from "@/lib/commerce/types";
import type { SearchGiftsInput } from "@/lib/mcp/kapruka";

export type RecipientAudience = "male" | "female" | "neutral";

const MALE_RE =
  /\b(dad|father|thaththa|appa|appachchi|husband|boyfriend|fiance|brother|bro|grandpa|grandfather|uncle|nephew|son|him|his|he)\b/i;
const FEMALE_RE =
  /\b(mum|mom|mother|amma|mummy|wife|girlfriend|fiancee|sister|sis|grandma|grandmother|aunt|niece|daughter|her|she)\b/i;

const MENS_PRODUCT_RE =
  /\b(men'?s|for men|homme|masculine|cologne spray|body spray.*men)\b/i;
const WOMENS_PRODUCT_RE =
  /\b(women'?s|for women|ladies|femme|cinderella|her perfume|women perfume)\b/i;

/** Map gift-finder relationship chip → likely product audience. */
export function audienceFromRelationship(
  relationshipId: string | null | undefined,
): RecipientAudience | null {
  switch (relationshipId) {
    case "father":
      return "male";
    case "mother":
      return "female";
    case "child":
      return "neutral";
    default:
      return null;
  }
}

/** Infer male / female / neutral from any free text (shopperNote, query, chat). */
export function inferRecipientAudience(
  ...texts: Array<string | null | undefined>
): RecipientAudience {
  let male = 0;
  let female = 0;
  for (const raw of texts) {
    if (!raw?.trim()) continue;
    const t = raw.toLowerCase();
    if (MALE_RE.test(t)) male += 1;
    if (FEMALE_RE.test(t)) female += 1;
  }
  if (male > female) return "male";
  if (female > male) return "female";
  return "neutral";
}

export function productAudienceSignal(name: string): RecipientAudience {
  const n = name.toLowerCase();
  if (WOMENS_PRODUCT_RE.test(n)) return "female";
  if (MENS_PRODUCT_RE.test(n)) return "male";
  return "neutral";
}

/** Drop obvious gender mismatches; keep neutral/unisex items. */
export function filterProductsForAudience(
  products: Product[],
  audience: RecipientAudience,
): Product[] {
  if (audience === "neutral" || !products.length) return products;

  const kept = products.filter((p) => {
    const sig = productAudienceSignal(p.name);
    return sig === "neutral" || sig === audience;
  });

  return kept.length > 0 ? kept : products;
}

function isGenericPerfumeQuery(query?: string | null): boolean {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return true;
  return /^(perfume|perfumes|fragrance|fragrances|cologne|scent|scents)$/.test(q);
}

/**
 * Deterministic search grounding — do NOT rely on the LLM to add "men cologne".
 * Uses shopperNote + relationship + query before MCP is called.
 */
export function applyAudienceToSearchInput(
  input: SearchGiftsInput,
  audience: RecipientAudience,
): SearchGiftsInput {
  if (audience === "neutral") return input;

  const occasion = (input.occasionId ?? input.category ?? "").toLowerCase();
  if (occasion !== "perfumes" && occasion !== "perfume") return input;

  const next = { ...input };
  const q = input.query?.trim() ?? "";
  const needsMaleQuery =
    audience === "male" &&
    (isGenericPerfumeQuery(q) || !/\b(men|man|cologne|homme)\b/i.test(q));
  const needsFemaleQuery =
    audience === "female" &&
    (isGenericPerfumeQuery(q) || !/\b(women|woman|ladies|femme)\b/i.test(q));

  if (needsMaleQuery) {
    next.query = "men cologne";
    next.alternativeQueries = [
      "men perfume",
      "cologne for men",
      ...(input.alternativeQueries ?? []),
    ].slice(0, 4);
  } else if (needsFemaleQuery) {
    next.query = "women perfume";
    next.alternativeQueries = [
      "ladies perfume",
      "perfume for women",
      ...(input.alternativeQueries ?? []),
    ].slice(0, 4);
  }

  return next;
}

export interface RecipientSearchContext {
  shopperNote?: string | null;
  relationshipId?: string | null;
}

export function resolveRecipientAudience(ctx: RecipientSearchContext): RecipientAudience {
  return (
    audienceFromRelationship(ctx.relationshipId) ??
    inferRecipientAudience(ctx.shopperNote, ctx.relationshipId)
  );
}
