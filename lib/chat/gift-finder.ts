import { findOccasion, OCCASIONS } from "@/lib/catalog/occasions";
import {
  GIFT_RELATIONSHIPS,
  GIFT_RELATIONSHIPS_BY_ID,
} from "@/lib/catalog/gift-relationships";
import {
  PERSONALITY_TRAITS,
  PERSONALITY_TRAITS_BY_ID,
} from "@/lib/catalog/personality-traits";
import {
  BUDGET_TIERS,
  type BudgetTier,
  type GiftFinderState,
} from "@/lib/catalog/gift-finder-types";
import type { UIMessage } from "ai";

/** Occasions shown in step 1 — events, not product verticals. */
export const GIFT_FINDER_OCCASIONS = OCCASIONS.filter((o) =>
  [
    "birthday",
    "anniversary",
    "romance",
    "wedding",
    "mother",
    "father",
    "newborn",
    "sympathy",
    "corporate",
  ].includes(o.id),
);

function relationshipLabel(id: string | null): string {
  if (!id) return "someone special";
  return GIFT_RELATIONSHIPS_BY_ID[id]?.label ?? id;
}

function occasionLabel(id: string | null): string {
  if (!id) return "";
  return findOccasion(id)?.label ?? id;
}

function traitLabels(ids: string[]): string[] {
  return ids.map((id) => PERSONALITY_TRAITS_BY_ID[id]?.label ?? id);
}

function budgetLabel(tier: BudgetTier): string {
  return BUDGET_TIERS.find((b) => b.id === tier)?.label ?? tier;
}

/** Turns chip selections into a chat message that triggers curated search. */
export function buildGiftFinderMessage(state: GiftFinderState): string {
  const who = relationshipLabel(state.relationship);
  const occ = occasionLabel(state.occasionId);
  const traits = traitLabels(state.personalityTraits).join(", ");
  const occasionPart = occ ? ` for ${occ.toLowerCase()}` : "";
  const budgetPart = state.budgetTier
    ? ` Budget: ${budgetLabel(state.budgetTier).toLowerCase()}.`
    : "";
  const exclusionsPart = state.exclusions.length
    ? ` Please avoid: ${state.exclusions.join(", ")}.`
    : "";

  return (
    `Curate 4–6 gift picks for my ${who}${occasionPart}. ` +
    `Personality: ${traits}.${budgetPart}${exclusionsPart} ` +
    `Give each pick a one-line reason on the card.`
  ).trim();
}

export function budgetTierToPriceRange(
  tier?: BudgetTier | null,
): { minPrice?: number; maxPrice?: number } {
  if (!tier) return {};
  const found = BUDGET_TIERS.find((b) => b.id === tier);
  if (!found) return {};
  return { minPrice: found.minPrice, maxPrice: found.maxPrice };
}

export interface GiftFinderRefinementPatch {
  budgetTier?: BudgetTier | null;
  addTraits?: string[];
  removeTraits?: string[];
  exclusions?: string[];
}

export function applyGiftFinderRefinement(
  state: GiftFinderState,
  patch: GiftFinderRefinementPatch,
): GiftFinderState {
  let personalityTraits = state.personalityTraits;
  if (patch.removeTraits?.length) {
    personalityTraits = personalityTraits.filter((t) => !patch.removeTraits!.includes(t));
  }
  if (patch.addTraits?.length) {
    personalityTraits = [...new Set([...personalityTraits, ...patch.addTraits])];
  }

  return {
    ...state,
    budgetTier: patch.budgetTier !== undefined ? patch.budgetTier : state.budgetTier,
    personalityTraits,
    exclusions: patch.exclusions?.length
      ? [...new Set([...state.exclusions, ...patch.exclusions])]
      : state.exclusions,
  };
}

/** Maps personality traits → Kapruka verticals and search keywords. */
export function giftFinderSearchHints(state: GiftFinderState): {
  keywords: string[];
  relatedOccasionIds: string[];
} {
  const keywords: string[] = [];
  const relatedOccasionIds: string[] = [];

  for (const traitId of state.personalityTraits) {
    const trait = PERSONALITY_TRAITS_BY_ID[traitId];
    if (!trait) continue;
    keywords.push(...trait.keywords);
    relatedOccasionIds.push(...trait.relatedOccasionIds);
  }

  if (state.occasionId) {
    const occ = findOccasion(state.occasionId);
    if (occ) {
      keywords.push(occ.query, ...occ.keywords.slice(0, 2));
      relatedOccasionIds.push(state.occasionId);
    }
  }

  return {
    keywords: [...new Set(keywords)],
    relatedOccasionIds: [...new Set(relatedOccasionIds)],
  };
}

/** User is stuck — surface the structured picker instead of guessing a search. */
export const GIFT_FINDER_UNCERTAINTY_RE =
  /\b(idk|i\s*dk|don'?t know|dont know|no idea|not sure|you pick|you choose|anything really|help me choose|no clue|dunno|whatever works|surprise me|anything is fine|anything works|not sure what)\b/i;

export function isGiftFinderUncertainty(text: string): boolean {
  return GIFT_FINDER_UNCERTAINTY_RE.test(text.trim());
}

function extractUserTexts(messages: UIMessage[]): string[] {
  const texts: string[] = [];
  for (const m of messages) {
    if (m.role !== "user") continue;
    const t = (m.parts ?? [])
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ")
      .trim();
    if (t) texts.push(t.toLowerCase());
  }
  return texts;
}

/** Pre-fill relationship / occasion from the conversation (+ optional current text). */
export function extractGiftFinderHintsFromMessages(
  messages: UIMessage[],
  currentText?: string,
): Partial<GiftFinderState> {
  const allTexts = extractUserTexts(messages);
  if (currentText) allTexts.push(currentText.toLowerCase());
  const combined = allTexts.join(" ");
  const hint: Partial<GiftFinderState> = {};

  for (const rel of GIFT_RELATIONSHIPS) {
    if (rel.keywords.some((kw) => new RegExp(`\\b${kw}\\b`, "i").test(combined))) {
      hint.relationship = rel.id;
      break;
    }
  }

  for (const occ of GIFT_FINDER_OCCASIONS) {
    const words = [occ.id, occ.label.toLowerCase(), ...occ.keywords.map((k) => k.toLowerCase())];
    if (words.some((w) => combined.includes(w))) {
      hint.occasionId = occ.id;
      break;
    }
  }

  return hint;
}

export { GIFT_RELATIONSHIPS, PERSONALITY_TRAITS };
