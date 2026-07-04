import type { Turn } from "./types";

const PLACEHOLDER_RE = /\[PLACEHOLDER/i;

/** Realistic stub assistant turns so chain scenarios have usable history. */
export function resolvePlaceholder(
  turns: Turn[],
  index: number,
  content: string,
): string {
  if (!PLACEHOLDER_RE.test(content)) return content;

  const priorUser =
    [...turns.slice(0, index)]
      .reverse()
      .find((t) => t.role === "user")
      ?.content.toLowerCase() ?? "";

  if (/tulip|girlfriend.*asap/.test(priorUser)) {
    return `[MODE: CHAT] Fresh tulips aren't available for same-day right now — these pink rose bouquets are the closest match and deliver fast.

**Blushing 7 Pink Roses Bouquet** — Rs 6,520
**Rose Fusion Modern Mix** — Rs 10,000
**Pink Angelic** — Rs 8,500

Tap Add on any card, or tell me which one you want.`;
  }

  if (/pink roses to my cart|add the pink roses/.test(priorUser)) {
    return `[MODE: CHAT] Done — **Blushing 7 Pink Roses Bouquet** is in your basket. Want a gift message on the card?`;
  }

  if (/milk tray|red roses/.test(priorUser)) {
    return `[MODE: CHAT] Done — 2× Milk Tray chocolates and a bunch of red roses are in your basket. Where should we deliver?`;
  }

  if (/flower road|colombo 7|security guard/.test(priorUser)) {
    return `[MODE: CHAT] Got it — delivery to **45/2 Flower Road, Colombo 7**, leave with the security guard. Ready when you are to confirm.`;
  }

  if (/valentine|girlfriend/.test(priorUser)) {
    return `[MODE: CHAT] For Valentine's, these rose bouquets hit the right note:

**Blushing 7 Pink Roses Bouquet** — Rs 6,520
**Rose Fusion Modern Mix** — Rs 10,000

Tell me which one to add.`;
  }

  if (/chocolates/.test(priorUser) && !/complaint|order kp/.test(priorUser)) {
    return `[MODE: CHAT] Here are some chocolate picks worth a look:

**Milk Chocolate Bliss Box** — Rs 1,450
**Milk Tray Assortment** — Rs 2,800
**KitKat Silk Roses Bouquet** — Rs 5,900

Tap Add on a card or tell me which one.`;
  }

  if (/nugegoda/.test(priorUser)) {
    return `[MODE: CHAT] Nugegoda — got it. That helps with delivery timing. What are we shopping for?`;
  }

  if (/roshan/.test(priorUser)) {
    return `[MODE: CHAT] Nice to meet you, Roshan! What kind of gift are we putting together?`;
  }

  if (/birthday cake/.test(priorUser)) {
    return `[MODE: CHAT] Birthday cake — love it. Who's the lucky person and any flavour they love?`;
  }

  if (/daughter.*strawberry|strawberry/.test(priorUser)) {
    return `[MODE: CHAT] Strawberry birthday cake for your daughter — pulling a few options that deliver to Nugegoda.`;
  }

  if (/dad|father/.test(priorUser)) {
    return `[MODE: CHAT] Something for Dad — here are a few chocolate boxes that land well:

**Java Super Dad 10 Piece Box** — Rs 3,000
**Java I Love Dad 10 Piece Chocolate Box** — Rs 3,070

What does he like more — something sweet or something practical?`;
  }

  return `[MODE: CHAT] Got it — let me help with that.`;
}

export function resolveTurns(turns: Turn[]): Turn[] {
  return turns.map((turn, index) => {
    if (turn.role !== "assistant") return turn;
    return {
      ...turn,
      content: resolvePlaceholder(turns, index, turn.content),
    };
  });
}
