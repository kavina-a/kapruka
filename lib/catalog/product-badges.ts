import type { Product } from "@/lib/commerce/types";

export type ProductHeaderTag = {
  label: string;
  tone: "gold" | "forest" | "rose" | "warn" | "neutral";
};

/** Stable pseudo-order count for social proof — deterministic per product, not random per render. */
function estimatedOrders(productId: string): number {
  let hash = 0;
  for (let i = 0; i < productId.length; i++) {
    hash = (hash * 31 + productId.charCodeAt(i)) >>> 0;
  }
  // Spread into a believable range for Kapruka catalogue items.
  return 40 + (hash % 460);
}

function formatOrderCount(n: number): string {
  if (n >= 500) return "500+ sent";
  if (n >= 200) return "200+ sent";
  if (n >= 100) return "100+ sent";
  return "50+ sent";
}

/**
 * Header tags for product cards — uses real signals (rank, stock, sale) plus
 * stable social-proof labels. Never shows more than two tags.
 */
export function getProductHeaderTags(
  product: Product,
  rank: number,
  totalInSet = 1,
): ProductHeaderTag[] {
  const tags: ProductHeaderTag[] = [];
  const hasDiscount =
    product.compareAtPrice?.amount != null &&
    product.price.amount != null &&
    product.compareAtPrice.amount > product.price.amount;

  if (!product.inStock) {
    return [{ label: "Sold out", tone: "rose" }];
  }

  if (rank === 0) {
    tags.push({ label: "Top pick", tone: "gold" });
  } else if (rank === 1 && totalInSet > 2) {
    tags.push({ label: "Popular", tone: "forest" });
  } else if (rank === 2 && totalInSet > 3) {
    tags.push({ label: formatOrderCount(estimatedOrders(product.id)), tone: "neutral" });
  } else if (estimatedOrders(product.id) >= 350) {
    tags.push({ label: "Best seller", tone: "gold" });
  }

  if (product.stockLevel === "low" && tags.length < 2) {
    tags.push({ label: "Selling fast", tone: "warn" });
  } else if (tags.length === 0 && estimatedOrders(product.id) >= 200) {
    tags.push({ label: formatOrderCount(estimatedOrders(product.id)), tone: "neutral" });
  }

  if (hasDiscount && tags.length < 2) {
    tags.push({ label: "On sale", tone: "rose" });
  }

  if (!tags.length) {
    tags.push({ label: "In stock", tone: "neutral" });
  }

  return tags.slice(0, 2);
}
