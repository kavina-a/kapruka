import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import type { GiftFinderState } from "@/lib/catalog/gift-finder-types";
import { classifyIntentFast } from "@/lib/agent/classify-fast";
import { isAnyLLMConfigured, withUtilityFallback } from "@/lib/ai/provider";

export { isAnyLLMConfigured as isLLMConfigured };

export type ChatIntent =
  | "gift_discovery"
  | "self_purchase"
  | "unclear"
  | "refinement"
  | "product_question"
  | "order_tracking"
  | "other";

const intentSchema = z.object({
  intent: z
    .enum([
      "gift_discovery",
      "self_purchase",
      "unclear",
      "refinement",
      "product_question",
      "order_tracking",
      "other",
    ])
    .describe("Best single label for what the user is trying to do right now."),
});

function useLLMClassify(): boolean {
  return process.env.CLASSIFY_USE_LLM === "true";
}

/**
 * Intent classification for ambiguous messages.
 *
 * Default: regex only (zero cost). Set CLASSIFY_USE_LLM=true to fall back to
 * a tiny LLM call when regex returns null.
 */
export async function classifyIntent(text: string): Promise<ChatIntent | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fast = classifyIntentFast(trimmed);
  if (fast) return fast;

  if (!useLLMClassify() || !isAnyLLMConfigured()) return null;

  try {
    const { object } = await withUtilityFallback((model) =>
      generateObject({
        model,
        schema: intentSchema,
        temperature: 0,
        maxRetries: 1,
        timeout: 4000,
        system:
          "Classify one customer message for a gift-shopping chat assistant. " +
          "Reply with exactly one intent label — no explanation. Be strict: only pick " +
          "gift_discovery when the message actually names a recipient, an occasion, or " +
          "explicit gift language ('gift', 'present', 'send', 'for my [person]', 'birthday', " +
          "'anniversary'). Do NOT default to gift_discovery just because the assistant is a " +
          "gifting concierge — most self-purchase and browsing messages have zero gift signal.\n" +
          "gift_discovery: explicitly names a recipient, occasion, or gift language.\n" +
          "self_purchase: first-person want with NO recipient/occasion/gift language.\n" +
          "unclear: no recipient, no occasion, no gift language, AND no concrete product signal.\n" +
          "refinement: tweaking an existing search.\n" +
          "product_question: asking about a specific product's details, stock, or price.\n" +
          "order_tracking: asking about an existing order's delivery status.\n" +
          "other: greetings, small talk, anything else.",
        prompt: trimmed,
      }),
    );
    return object.intent;
  } catch (err) {
    console.warn("[classify] LLM intent classification failed:", err);
    return null;
  }
}

const refinementPatchSchema = z.object({
  budgetTier: z
    .enum(["under_3000", "3000_7500", "7500_15000", "15000_plus"])
    .nullable()
    .optional()
    .describe("Only set if the user asked for a different budget, or null to clear budget."),
  addTraits: z
    .array(z.string())
    .optional()
    .describe("Personality trait ids to add (from personality catalog)."),
  removeTraits: z
    .array(z.string())
    .optional()
    .describe("Personality trait ids to remove."),
  exclusions: z
    .array(z.string())
    .optional()
    .describe("Things to avoid, e.g. 'chocolates', 'anything electronic'."),
});

export type RefinementPatch = z.infer<typeof refinementPatchSchema>;

/** Regex-only refinement for common tweak phrases — zero cost. */
function interpretRefinementFast(text: string): RefinementPatch | null {
  const lower = text.toLowerCase();
  const patch: RefinementPatch = {};

  if (/\b(cheaper|less\s+expensive|lower\s+budget|tight\s+budget)\b/i.test(text)) {
    patch.budgetTier = "under_3000";
  } else if (/\b(more\s+expensive|premium|luxury|higher\s+budget|splurge)\b/i.test(text)) {
    patch.budgetTier = "15000_plus";
  }

  const exclusions: string[] = [];
  if (/\bno\s+chocolate|not\s+chocolate|avoid\s+chocolate/i.test(lower)) exclusions.push("chocolates");
  if (/\bno\s+flower|not\s+flower|avoid\s+flower/i.test(lower)) exclusions.push("flowers");
  if (/\bno\s+cake|not\s+cake|avoid\s+cake/i.test(lower)) exclusions.push("cakes");
  if (/\bno\s+perfume|not\s+perfume/i.test(lower)) exclusions.push("perfumes");
  if (exclusions.length) patch.exclusions = exclusions;

  return Object.keys(patch).length ? patch : null;
}

function useLLMRefinement(): boolean {
  return process.env.REFINEMENT_USE_LLM === "true";
}

/**
 * Structured patch for gift-finder refinement text.
 * Default: regex for common phrases. Set REFINEMENT_USE_LLM=true for LLM fallback.
 */
export async function interpretRefinement(
  text: string,
  currentState: GiftFinderState,
): Promise<RefinementPatch | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fast = interpretRefinementFast(trimmed);
  if (fast) return fast;

  if (!useLLMRefinement() || !isAnyLLMConfigured()) return null;

  try {
    const { object } = await withUtilityFallback((model) =>
      generateObject({
        model,
        schema: refinementPatchSchema,
        temperature: 0,
        maxRetries: 1,
        timeout: 4000,
        system:
          "The user is refining an already-run gift search. Given their current " +
          "search state and a short follow-up message, return ONLY the fields that " +
          "should change. Leave fields out entirely if the message doesn't mention them. " +
          "Never invent traits or exclusions that aren't clearly implied by the message.",
        prompt:
          `Current state: ${JSON.stringify(currentState)}\n` +
          `Follow-up message: "${trimmed}"`,
      }),
    );
    return object;
  } catch (err) {
    console.warn("[classify] refinement interpretation failed:", err);
    return null;
  }
}
