import "server-only";
import { getSeedProduct, SEED_PRODUCTS, toCard } from "@/lib/catalog/seed";
import { getGift, searchGifts } from "@/lib/mcp/kapruka";
import type { GiftDetails, Product } from "@/lib/commerce/types";

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function nameScore(hint: string, name: string): number {
  const a = normalizeName(hint);
  const b = normalizeName(name);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (b.includes(a) || a.includes(b)) return 80;
  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = b.split(" ").filter(Boolean);
  const overlap = bTokens.filter((t) => aTokens.has(t)).length;
  return overlap > 0 ? overlap * 10 : 0;
}

function bestNameMatch(
  hint: string,
  products: Array<Pick<Product, "id" | "name">>,
): Pick<Product, "id" | "name"> | null {
  let best: Pick<Product, "id" | "name"> | null = null;
  let bestScore = 0;
  for (const product of products) {
    const score = nameScore(hint, product.name);
    if (score > bestScore) {
      bestScore = score;
      best = product;
    }
  }
  return bestScore >= 20 ? best : null;
}

/** Resolve a product id or spoken name to a full gift record for cart actions. */
export async function resolveProduct(input: {
  productId?: string;
  productName?: string;
  /** Products from the most recent searchGifts turn — checked first for name match. */
  recentProducts?: Array<Pick<Product, "id" | "name">>;
}): Promise<{ product: GiftDetails; card: Product } | null> {
  const productId = input.productId?.trim();
  const productName = input.productName?.trim();

  if (productId) {
    try {
      const product = await getGift(productId);
      return { product, card: toCard(product) };
    } catch {
      const seeded = getSeedProduct(productId);
      if (seeded) return { product: seeded, card: toCard(seeded) };
    }
  }

  if (productName) {
    const onScreen = bestNameMatch(productName, input.recentProducts ?? []);
    if (onScreen) {
      try {
        const product = await getGift(onScreen.id);
        return { product, card: toCard(product) };
      } catch {
        const seeded = getSeedProduct(onScreen.id);
        if (seeded) return { product: seeded, card: toCard(seeded) };
      }
    }

    const seedMatch = SEED_PRODUCTS.map(toCard);
    const seedHit = bestNameMatch(productName, seedMatch);
    if (seedHit) {
      const seeded = getSeedProduct(seedHit.id);
      if (seeded) return { product: seeded, card: toCard(seeded) };
    }

    try {
      const res = await searchGifts({ query: productName, limit: 8, inStockOnly: true });
      const hit = bestNameMatch(productName, res.products);
      if (hit) {
        const product = await getGift(hit.id);
        return { product, card: toCard(product) };
      }
    } catch {
      // fall through
    }
  }

  return null;
}
