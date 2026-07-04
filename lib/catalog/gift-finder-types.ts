// Types for the structured gift finder: relationship → occasion → personality → budget.

export type BudgetTier = "under_3000" | "3000_7500" | "7500_15000" | "15000_plus";

export interface BudgetTierOption {
  id: BudgetTier;
  label: string;
  minPrice?: number;
  maxPrice?: number;
}

export const BUDGET_TIERS: BudgetTierOption[] = [
  { id: "under_3000", label: "Under Rs. 3,000", maxPrice: 3000 },
  { id: "3000_7500", label: "Rs. 3,000 – 7,500", minPrice: 3000, maxPrice: 7500 },
  { id: "7500_15000", label: "Rs. 7,500 – 15,000", minPrice: 7500, maxPrice: 15000 },
  { id: "15000_plus", label: "Rs. 15,000+", minPrice: 15000 },
];

/** Structured chip selections from the in-chat gift finder. */
export interface GiftFinderState {
  /** lib/catalog/gift-relationships.ts id */
  relationship: string | null;
  /** lib/catalog/occasions.ts id — event/occasion, not product vertical */
  occasionId: string | null;
  /** lib/catalog/personality-traits.ts ids — multi-select */
  personalityTraits: string[];
  budgetTier?: BudgetTier | null;
  exclusions: string[];
}

export function isGiftFinderComplete(state: GiftFinderState | null | undefined): boolean {
  return Boolean(
    state?.relationship &&
      state.personalityTraits.length > 0,
  );
}
