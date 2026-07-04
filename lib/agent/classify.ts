import "server-only";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import type { GiftFinderState } from "@/lib/catalog/gift-finder-types";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export type ChatIntent =
  | "gift_discovery"
  | "refinement"
  | "product_question"
  | "order_tracking"
  | "other";

const intentSchema = z.object({
  intent: z
    .enum(["gift_discovery", "refinement", "product_question", "order_tracking", "other"])
    .describe("Best single label for what the user is trying to do right now."),
});

/**
 * Tiny, cheap intent classification — only called when the fast regex checks
 * in lib/agent/modes.ts are inconclusive. Narrow prompt, narrow schema, tiny
 * model: this call has almost no room to hallucinate because it's only ever
 * asked to pick one of five labels.
 */
export async function classifyIntent(text: string): Promise<ChatIntent | null> {
  const trimmed = text.trim();
  if (!trimmed || !isGeminiConfigured()) return null;

  try {
    const { object } = await generateObject({
      model: google(GEMINI_MODEL),
      schema: intentSchema,
      temperature: 0,
      system:
        "Classify one customer message for a gift-shopping chat assistant. " +
        "Reply with exactly one intent label — no explanation.\n" +
        "gift_discovery: wants gift ideas / to browse / hasn't bought yet.\n" +
        "refinement: tweaking an existing search — e.g. 'something cheaper', 'show more like this', 'no chocolates'.\n" +
        "product_question: asking about a specific product's details, stock, or price.\n" +
        "order_tracking: asking about an existing order's delivery status.\n" +
        "other: greetings, small talk, anything else.",
      prompt: trimmed,
    });
    return object.intent;
  } catch (err) {
    console.warn("[classify] intent classification failed:", err);
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

/**
 * Turns a short free-text tweak ("something cheaper", "no chocolates please")
 * into a structured patch against the current gift-finder state — given the
 * current state as ground truth, the model only has to interpret one short
 * sentence, not invent new facts.
 */
export async function interpretRefinement(
  text: string,
  currentState: GiftFinderState,
): Promise<RefinementPatch | null> {
  const trimmed = text.trim();
  if (!trimmed || !isGeminiConfigured()) return null;

  try {
    const { object } = await generateObject({
      model: google(GEMINI_MODEL),
      schema: refinementPatchSchema,
      temperature: 0,
      system:
        "The user is refining an already-run gift search. Given their current " +
        "search state and a short follow-up message, return ONLY the fields that " +
        "should change. Leave fields out entirely if the message doesn't mention them. " +
        "Never invent traits or exclusions that aren't clearly implied by the message.",
      prompt:
        `Current state: ${JSON.stringify(currentState)}\n` +
        `Follow-up message: "${trimmed}"`,
    });
    return object;
  } catch (err) {
    console.warn("[classify] refinement interpretation failed:", err);
    return null;
  }
}
