import type { UIMessage } from "ai";
import {
  isGiftFinderSubmitMessage,
  isGiftFinderUncertainty,
} from "@/lib/chat/gift-finder";
import { isGiftFinderComplete } from "@/lib/catalog/gift-finder-types";
import type { CommerceContext } from "@/lib/commerce/types";

/**
 * Shared "force the model's hand" logic for uncertainty and rejection turns.
 * Used by both the live chat route and the offline eval harness so the two
 * never silently drift apart (that drift is how the picker-never-appears
 * bug went untested for so long).
 */

const REJECTION_RE =
  /\b(not?\s+(into|a\s+fan\s+of)|no\s+(cake|cakes|flower|flowers|chocolate|chocolates|sweets|perfume|jewel|jewellery|jewelry)|don'?t\s+(want|like|need)\s+(cake|flower|chocolate|sweet|perfume)|avoid|allerg|sugar|diabet|can'?t\s+have|not\s+good\s+for|doesn'?t\s+(like|eat)|she\s+hates|he\s+hates|they\s+(hate|don'?t\s+like)|not\s+(cake|cakes|flower|flowers|chocolate|chocolates))\b/i;

export function extractLastUserText(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const parts = message.parts ?? [];
    const text = parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return null;
}

function isGiftFinderSubmitTurn(messages: UIMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user") continue;
    return isGiftFinderSubmitMessage(message);
  }
  return false;
}

/**
 * When the buyer explicitly rejects a product category, inject a hard reminder
 * that the agent must pivot to a different occasionId — not retry the same search.
 */
export function buildRejectionBlock(lastUserText: string | null, messages: UIMessage[]): string {
  if (!lastUserText) return "";
  if (!REJECTION_RE.test(lastUserText)) return "";
  if (messages.filter((m) => m.role === "user").length < 2) return "";

  return (
    "\n\n# IMPORTANT — buyer rejected a product category\n" +
    "The buyer just said they don't want a specific type of product (e.g. no cakes, health issues, allergies).\n" +
    "1. Call rememberRecipientDislike to store it.\n" +
    "2. Then call searchGifts with a COMPLETELY DIFFERENT occasionId — NEVER the same one you just searched.\n" +
    "3. Do NOT retry the same search — MCP results are cached and will return identical products.\n" +
    "4. One warm acknowledgment sentence, then show the new results."
  );
}

export interface TurnFlags {
  lastUserText: string | null;
  uncertaintyTurn: boolean;
  rejectionTurn: boolean;
  giftFinderAlreadyComplete: boolean;
  giftFinderSubmitTurn: boolean;
  uncertaintyBlock: string;
  rejectionBlock: string;
  giftFinderSubmitBlock: string;
}

/**
 * Computes the uncertainty/rejection flags and the corresponding prompt
 * blocks that force the model's tool choice this turn. Client-side callers
 * (ChatContext) may intercept uncertainty on the FIRST user turn too, but the
 * server only forces `showGiftFinder` from the second user turn onward — the
 * first message alone ("hi, something for my dad, idk what though") should
 * still get one warm clarifying beat instead of an instant picker.
 */
export function computeTurnFlags(
  messages: UIMessage[],
  commerceContext: CommerceContext | null,
): TurnFlags {
  const lastUserText = extractLastUserText(messages);
  const userTurns = messages.filter((m) => m.role === "user").length;

  const uncertaintyTurn = Boolean(
    lastUserText && isGiftFinderUncertainty(lastUserText) && userTurns > 1,
  );

  const giftFinderAlreadyComplete = isGiftFinderComplete(commerceContext?.giftFinderState);
  const giftFinderSubmitTurn =
    giftFinderAlreadyComplete && isGiftFinderSubmitTurn(messages);

  const uncertaintyBlock =
    uncertaintyTurn && !giftFinderSubmitTurn
      ? giftFinderAlreadyComplete
        ? "\n\n# URGENT — buyer is still unsure after using the gift finder\n" +
          "They already completed the gift picker this session (see 'Gift finder picks' above) — the words 'idk'/'no idea'/'whatever' this turn do NOT mean call showGiftFinder again. " +
          "showGiftFinder is FORBIDDEN this turn, full stop — calling it again would loop them back through chips they already filled in. " +
          "Instead: IMMEDIATELY call searchGifts with a DIFFERENT occasionId than anything you have shown so far — use the chip flow's relationship/traits to pick a fresh vertical. " +
          "Be decisive — pick a fresh product category and show new cards. One warm sentence, then let the cards do the work. Do NOT ask another clarifying question."
        : "\n\n# URGENT — buyer is stuck and has no idea what to pick\n" +
          "You MUST call showGiftFinder this turn and MUST NOT call searchGifts. " +
          "One warm sentence only (e.g. 'No worries — pick a few things about them and I'll find something perfect.'). " +
          "The chip picker handles the rest. Do NOT search, do NOT offer a list of categories."
      : "";

  const giftFinderSubmitBlock = giftFinderSubmitTurn
    ? "\n\n# URGENT — gift finder chips just submitted\n" +
      "The buyer finished the chip picker — relationship, personality traits, and budget are in 'Gift finder picks' above.\n" +
      "You MUST call searchGifts THIS turn. showGiftFinder is FORBIDDEN.\n" +
      "Do NOT describe products in plain text — only real Kapruka product cards from searchGifts count.\n" +
      "One warm sentence (e.g. 'Great — pulling outdoor picks for Dad'), then searchGifts immediately.\n" +
      "Use personality trait keywords for the query; budget from chip state is applied automatically."
    : "";

  const rejectionBlock = buildRejectionBlock(lastUserText, messages);

  return {
    lastUserText,
    uncertaintyTurn,
    rejectionTurn: Boolean(rejectionBlock),
    giftFinderAlreadyComplete,
    giftFinderSubmitTurn,
    uncertaintyBlock,
    rejectionBlock,
    giftFinderSubmitBlock,
  };
}
