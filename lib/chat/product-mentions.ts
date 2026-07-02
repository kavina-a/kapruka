import type { Product } from "@/lib/commerce/types";

/** Embed a product id in user text so the agent can call getGiftDetails. */
export function formatProductMention(product: Product): string {
  return `[${product.name}](product:${product.id})`;
}

export function formatProductMentions(products: Product[]): string {
  return products.map(formatProductMention).join(", ");
}

const MENTION_RE = /\[([^\]]+)\]\(product:([^)]+)\)/g;

export function parseProductMentions(text: string): Array<{ name: string; productId: string }> {
  const out: Array<{ name: string; productId: string }> = [];
  for (const match of text.matchAll(MENTION_RE)) {
    out.push({ name: match[1], productId: match[2] });
  }
  return out;
}
