
export interface DetectedFlags {
  /** User is buying for themselves — never ask "who is this for?" */
  selfPurchase?: boolean;
  /** Clearly stated product type (chocolates, flowers, cakes, etc.) */
  productSignal?: string;
  /** Enough context exists to search right now — no clarifying question */
  searchNow?: boolean;
  /**
   * No recipient, no occasion, no gift language, AND no concrete product
   * signal — genuinely ambiguous. Set server-side from the cheap classifier
   * (lib/agent/classify.ts intent "unclear"), NOT from client-side keyword
   * matching — keywords alone are unreliable for "this has zero signal".
   */
  unclearContext?: boolean;
}

const SELF_PURCHASE_RE =
  /\b(for\s+me(?:\s+to\s+(?:use|eat|drink|wear|try|keep|enjoy))?|for\s+myself|i\s+want\s+to\s+(?:eat|drink|try|use|order|get)|i\s+wanna\s+get|i\s+need\s+(?:to\s+get|a\s+)|i(?:'m|m)\s+(?:hungry|craving|getting\s+myself)|ordering\s+for\s+(?:me|myself)|i\s+(?:need|wanna|want)\s+to\s+(?:eat|drink|have|get\s+for\s+myself))\b/i;

const PRODUCT_SIGNALS: Array<{ re: RegExp }> = [
  { re: /\b(hot\s+sauce|chilli\s+sauce|chili\s+sauce|sambol|pickle)\b/i },
  { re: /\b(chocolate|kitkat|kit\s*kat|choco\s+box|cadbury|ferrero|milka|bounty|mars\s+bar)\b/i },
  { re: /\b(rose|roses|bouquet|tulip|lily|lilies|orchid|carnation|sunflower|flowers?)\b/i },
  { re: /\b(cake|cupcake|cheesecake|birthday\s+cake|ribbon\s+cake|layer\s+cake)\b/i },
  { re: /\b(perfume|cologne|fragrance|scent|eau\s+de|body\s+spray)\b/i },
  { re: /\b(hamper|fruit\s+basket|gift\s+basket|gift\s+hamper)\b/i },
  { re: /\b(jewel(?:lery|ry)|necklace|bracelet|ring|earring|pendant)\b/i },
  { re: /\b(toy|teddy|stuffed\s+animal|soft\s+toy|action\s+figure|doll)\b/i },
];

/**
 * Recipient language — when ANY of these are present, we DON'T auto-detect a
 * product signal because the buyer might want it for a specific person and we
 * should route through Gemini's gift flow.
 * EXCEPTION: if selfPurchase is also detected, selfPurchase wins.
 */
const RECIPIENT_LANGUAGE_RE =
  /\b(for\s+(?:my|his|her|their)|for\s+(?:mum|mom|dad|father|mother|sister|brother|son|daughter|wife|husband|boyfriend|girlfriend|boss|friend|grandma|grandpa|aunt|uncle|colleague|teacher|doctor|nurse)|send\s+to|deliver\s+to|gift\s+for|present\s+for)\b/i;

  
export function detectHighConfidenceFlags(text: string): DetectedFlags {
  const flags: DetectedFlags = {};

  // 1. Self-purchase — highest priority
  if (SELF_PURCHASE_RE.test(text)) {
    flags.selfPurchase = true;
    // Also detect product signal in the same message for a complete directive.
    // Return the RAW matched text — the model decides which occasionId to use.
    for (const { re } of PRODUCT_SIGNALS) {
      const match = re.exec(text);
      if (match) {
        flags.productSignal = match[1] ?? match[0];
        flags.searchNow = true;
        break;
      }
    }
    return flags;
  }

  // 2. Product signal — only when there is NO recipient language in the message
  if (!RECIPIENT_LANGUAGE_RE.test(text)) {
    for (const { re } of PRODUCT_SIGNALS) {
      const match = re.exec(text);
      if (match) {
        flags.productSignal = match[1] ?? match[0];
        flags.searchNow = true;
        break;
      }
    }
  }

  return flags;
}

/** True if any flag that affects routing is set. */
export function hasActionableFlag(flags: DetectedFlags): boolean {
  return Boolean(flags.selfPurchase || flags.searchNow);
}
