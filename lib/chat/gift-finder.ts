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

/**
 * Turns chip selections into a chat message that triggers curated search.
 *
 * This is sent through the normal chat pipeline and rendered as a real user
 * bubble in the transcript, so it must read like something a person would
 * actually type — not an internal instruction to the model (e.g. never
 * "Curate 4-6 gift picks... give each pick a one-line reason", which looked
 * like a leaked prompt to buyers).
 */
export function buildGiftFinderMessage(state: GiftFinderState): string {
  const who = relationshipLabel(state.relationship);
  const occ = occasionLabel(state.occasionId);
  const traits = traitLabels(state.personalityTraits).join(", ");

  let message = `Something for my ${who}`;
  // Skip occasion when it duplicates the relationship (e.g. both resolve to "father"/"For Dad").
  if (occ && state.occasionId !== state.relationship) {
    message += ` for ${occ.toLowerCase()}`;
  }
  message += ".";
  if (traits) message += ` They're into: ${traits}.`;
  if (state.budgetTier) message += ` Budget: ${budgetLabel(state.budgetTier).toLowerCase()}.`;
  if (state.exclusions.length) message += ` Please avoid: ${state.exclusions.join(", ")}.`;
  message += " Show me your best picks!";

  return message;
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
  /\b(idk|i\s*dk|don'?t\s*(?:really\s+|even\s+|actually\s+|quite\s+)?know|dont\s*(?:really\s+|even\s+|actually\s+|quite\s+)?know|no\s+idea|no\s+clue|not\s+(?:really\s+|that\s+|totally\s+|completely\s+)?sure|nothing\s+in\s+mind|nothing\s+specific|nothing\s+particular|nothing\s+really|not\s+really\s+anything|haven'?t\s+(?:really\s+)?decided|haven'?t\s+(?:really\s+)?thought|not\s+sure\s+what|no\s+idea\s+what|you\s+pick|you\s+choose|you\s+decide|u\s+pick|u\s+choose|u\s+decide|help\s+me\s+(?:choose|decide|pick)|anything\s+(?:really|is\s+fine|works|honestly)|dunno|no\s+clue\s+(?:tbh|honestly|really)?|not\s+a\s+clue|surprise\s+me|just\s+(?:pick|choose|surprise\s+me)|open\s+to\s+anything|whatever(?:\s+(?:you\s+think|works|is\s+good))?|any\s+(?:idea|ideas|suggestion|suggestions|recommendation|recommendations)|not\s+(?:really\s+)?decided|no\s+preference|hard\s+to\s+say|beats\s+me|(?:can\s+you\s+|could\s+you\s+|pls\s+|please\s+)?(?:suggest|recommend)\s+(?:me\s+)?(?:something|anything|one)?|suggest\s+me|recommend\s+me)\b/i;

export function isGiftFinderUncertainty(text: string): boolean {
  return GIFT_FINDER_UNCERTAINTY_RE.test(text.trim());
}

/** True when this user message was generated by the gift-finder chip flow (not typed by the buyer). */
export function isGiftFinderSubmitMessage(message: UIMessage): boolean {
  const meta = (message as { metadata?: { hidden?: boolean; giftFinderSubmit?: boolean } }).metadata;
  if (meta?.hidden || meta?.giftFinderSubmit) return true;
  const text = (message.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim();
  return /\bShow me your best picks!\s*$/i.test(text);
}

export function isHiddenUserMessage(message: UIMessage): boolean {
  return message.role === "user" && isGiftFinderSubmitMessage(message);
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

  // Recipient ids (father/mother) also appear as occasion chips — don't treat "for my dad"
  // as both relationship AND occasion or the submit message reads "for for dad".
  const recipientOccasionIds = new Set(["father", "mother"]);

  for (const occ of GIFT_FINDER_OCCASIONS) {
    if (recipientOccasionIds.has(occ.id) && hint.relationship) continue;
    const words = [occ.id, occ.label.toLowerCase(), ...occ.keywords.map((k) => k.toLowerCase())];
    if (words.some((w) => combined.includes(w))) {
      hint.occasionId = occ.id;
      break;
    }
  }

  return hint;
}

export { GIFT_RELATIONSHIPS, PERSONALITY_TRAITS };
