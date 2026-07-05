/**
 * Zero-cost intent classification — replaces the per-turn Gemini/OpenAI
 * classifyIntent call for ambiguous messages.
 *
 * Only runs when lib/agent/modes.ts regex fast-paths don't match. Covers the
 * cases that previously required an LLM: self_purchase, unclear, order_tracking,
 * gift_discovery.
 */

import type { ChatIntent } from "@/lib/agent/classify";
import { isTrackIntent } from "@/lib/agent/modes";
import { detectHighConfidenceFlags } from "@/lib/agent/detect-flags";

const GIFT_LANGUAGE_RE =
  /\b(gift|present|surprise\s+(?:me|them|her|him)|send\s+(?:a\s+)?gift|birthday|anniversary|wedding|valentine|mother'?s?\s+day|father'?s?\s+day|congratulations|congrats)\b/i;

const RECIPIENT_RE =
  /\b(for\s+(?:my|his|her|their)|for\s+(?:mum|mom|dad|father|mother|sister|brother|son|daughter|wife|husband|boyfriend|girlfriend|boss|friend|grandma|grandpa|aunt|uncle|colleague|teacher|nurse)|send\s+to|deliver\s+to|gift\s+for|present\s+for)\b/i;

const FIRST_PERSON_WANT_RE =
  /\b(i\s+(?:want|wanna|need)|get\s+me|looking\s+for|i(?:'m|m)\s+looking|can\s+you\s+(?:find|get)|help\s+me\s+(?:find|get))\b/i;

const PRODUCT_HINT_RE =
  /\b(spicy|sweet|sour|sauce|snack|food|eat|drink|chocolate|flower|cake|perfume|hamper|hot\s+sauce|chilli|sambol|roses?|gift\s+box)\b/i;

const PURE_GREETING_RE =
  /^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|yo|sup)[\s!.,?]*$/i;

const VAGUE_ONLY_RE =
  /^(?:help(?:\s+me)?|i\s+need\s+help|can\s+you\s+help)[\s!.,?]*$/i;

const ULTRA_VAGUE_RE =
  /\b(i\s+(?:want|wanna|need)\s+(?:to\s+)?get\s+something|help\s+me\s+find\s+something|find\s+me\s+something|something\s+nice)\b/i;

const REFINEMENT_RE =
  /\b(cheaper|less\s+expensive|more\s+expensive|under\s+\d|budget|no\s+chocolate|no\s+flower|not\s+cake|something\s+else|show\s+more|different\s+one|other\s+options?)\b/i;

const PRODUCT_QUESTION_RE =
  /\b(how\s+much|what\s+(?:is|are)\s+the|in\s+stock|available|price\s+of|tell\s+me\s+about|details\s+(?:on|for|about))\b/i;

/**
 * Classify intent from a single user message using regex only.
 * Returns null when nothing confident — main model handles it without extra cost.
 */
export function classifyIntentFast(text: string): ChatIntent | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 1. Order tracking — reuse mode regex + a few extras
  if (isTrackIntent(trimmed)) return "order_tracking";
  if (/\b(where\s+is\s+it|when\s+will\s+it\s+arrive|still\s+not\s+delivered|my\s+package)\b/i.test(trimmed)) {
    return "order_tracking";
  }

  // 2. Product question about a specific item
  if (PRODUCT_QUESTION_RE.test(trimmed)) return "product_question";

  // 3. Refinement of an existing search
  if (REFINEMENT_RE.test(trimmed)) return "refinement";

  const hasRecipient = RECIPIENT_RE.test(trimmed);
  const hasGiftLanguage = GIFT_LANGUAGE_RE.test(trimmed);
  const hasFirstPersonWant = FIRST_PERSON_WANT_RE.test(trimmed);
  const hasProductHint = PRODUCT_HINT_RE.test(trimmed);
  const clientFlags = detectHighConfidenceFlags(trimmed);

  // 4. Self-purchase — no recipient/gift context, buyer wants something for themselves
  if (
    clientFlags.selfPurchase ||
    (!hasRecipient &&
      !hasGiftLanguage &&
      (hasFirstPersonWant || hasProductHint) &&
      !PURE_GREETING_RE.test(trimmed))
  ) {
    return "self_purchase";
  }

  // 5. Gift discovery — recipient or explicit gift language
  if (hasRecipient || hasGiftLanguage) return "gift_discovery";

  // 6. Genuinely unclear — greeting or ultra-vague with zero product signal
  if (PURE_GREETING_RE.test(trimmed) || VAGUE_ONLY_RE.test(trimmed) || ULTRA_VAGUE_RE.test(trimmed)) {
    return "unclear";
  }

  // Short product-only reply (e.g. "hot sauce" after a clarifying question) — treat as self_purchase
  if (!hasRecipient && !hasGiftLanguage && trimmed.split(/\s+/).length <= 6 && hasProductHint) {
    return "self_purchase";
  }

  return null;
}
