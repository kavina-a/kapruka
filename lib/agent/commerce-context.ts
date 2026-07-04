import type { CommerceContext } from "@/lib/commerce/types";
import type { SavedRecipient } from "@/lib/commerce/store";
import { formatHumanDate } from "@/lib/commerce/dates";
import { findOccasion } from "@/lib/catalog/occasions";
import { GIFT_RELATIONSHIPS_BY_ID } from "@/lib/catalog/gift-relationships";
import { PERSONALITY_TRAITS_BY_ID } from "@/lib/catalog/personality-traits";
import { budgetTierToPriceRange, giftFinderSearchHints } from "@/lib/chat/gift-finder";
import { isGiftFinderComplete } from "@/lib/catalog/gift-finder-types";

/** Builds a live snapshot block injected into the system prompt each turn. */
export function buildCommerceContextBlock(ctx: CommerceContext): string {
  const lines: string[] = ["# Live checkout state (from the user's screen)"];

  if (!ctx.cart.length) {
    lines.push("- Cart: empty");
  } else {
    lines.push(`- Cart: ${ctx.cart.length} item(s) — ${ctx.cart.map((c) => `${c.quantity}× ${c.name} (id: ${c.id})`).join(", ")} (subtotal ~LKR ${ctx.subtotal})`);
  }

  const d = ctx.delivery;
  const filled: string[] = [];
  if (d.recipientName) filled.push(`recipient=${d.recipientName}`);
  if (d.recipientPhone) filled.push(`phone=${d.recipientPhone}`);
  if (d.address) filled.push(`address=${d.address}`);
  if (d.city) filled.push(`city=${d.city}`);
  if (d.date) filled.push(`date=${d.date} (${formatHumanDate(d.date)})`);
  if (d.instructions) filled.push(`notes=${d.instructions}`);
  if (ctx.sender.name) filled.push(`sender=${ctx.sender.anonymous ? "Anonymous" : ctx.sender.name}`);
  if (ctx.giftMessage) {
    const tag = ctx.giftMessageSource === "ai" ? " (Ruka suggested)" : "";
    filled.push(`message="${ctx.giftMessage.slice(0, 80)}${ctx.giftMessage.length > 80 ? "…" : ""}"${tag}`);
  }

  if (filled.length) {
    lines.push(`- Delivery draft: ${filled.join("; ")}`);
  } else {
    lines.push("- Delivery draft: not started");
  }

  if (ctx.chatCheckoutStep) {
    lines.push(`- In-chat checkout step: ${ctx.chatCheckoutStep}`);
  }

  // Recipient dislikes — remind agent not to suggest these
  if (ctx.recipientDislikes && Object.keys(ctx.recipientDislikes).length > 0) {
    const dislikeLines = Object.entries(ctx.recipientDislikes).map(
      ([name, dislikes]) => `${name}: avoid ${dislikes.join(", ")}`,
    );
    lines.push(`- Recipient dislikes (do NOT suggest these): ${dislikeLines.join(" | ")}`);
  }

  if (ctx.shownProducts?.length) {
    const ids = ctx.shownProducts
      .slice(0, 8)
      .map((p) => `${p.name} (id: ${p.id})`)
      .join("; ");
    lines.push(`- Products on screen (use these exact ids for addToCart): ${ids}`);
  }

  if (ctx.giftFinderState && isGiftFinderComplete(ctx.giftFinderState)) {
    const gf = ctx.giftFinderState;
    const { minPrice, maxPrice } = budgetTierToPriceRange(gf.budgetTier);
    const { keywords } = giftFinderSearchHints(gf);
    const rel = gf.relationship ? GIFT_RELATIONSHIPS_BY_ID[gf.relationship]?.label : "unknown";
    const occ = gf.occasionId ? findOccasion(gf.occasionId)?.label : "not specified";
    const traits = gf.personalityTraits
      .map((id) => PERSONALITY_TRAITS_BY_ID[id]?.label ?? id)
      .join(", ");
    const budgetText =
      gf.budgetTier && (minPrice != null || maxPrice != null)
        ? minPrice && maxPrice
          ? `LKR ${minPrice.toLocaleString()}–${maxPrice.toLocaleString()}`
          : maxPrice
            ? `under LKR ${maxPrice.toLocaleString()}`
            : minPrice
              ? `LKR ${minPrice.toLocaleString()}+`
              : "not set"
        : "not set (buyer skipped budget)";
    lines.push(
      `- Gift finder picks (chip flow complete — curate 4–6 with per-card reasons): ` +
        `for=${rel}, occasion=${occ}, personality=[${traits}]` +
        `${gf.exclusions.length ? `, avoid=[${gf.exclusions.join(", ")}]` : ""}, ` +
        `budget=${budgetText}. Search keywords: [${keywords.join(", ") || "none"}].`,
    );
  }

  return lines.join("\n");
}
