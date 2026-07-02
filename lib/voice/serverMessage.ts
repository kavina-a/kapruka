import type { Product } from "@/lib/commerce/types";
import type { VoiceServerMessage } from "@/lib/voice/messages";

/** Unwrap RTVI server-message payloads (may be nested under `data`). */
export function parseVoiceServerMessage(raw: unknown): VoiceServerMessage | null {
  if (!raw || typeof raw !== "object") return null;

  const top = raw as Record<string, unknown>;
  const inner =
    top.type && typeof top.type === "string"
      ? top
      : top.data && typeof top.data === "object"
        ? (top.data as Record<string, unknown>)
        : null;

  if (!inner || typeof inner.type !== "string") return null;
  return inner as VoiceServerMessage;
}

/** Fill defaults for products pushed from the Python voice server. */
export function normalizeVoiceProduct(
  raw: Partial<Product> & { id: string },
): Product {
  return {
    id: raw.id,
    name: raw.name ?? "",
    blurb: raw.blurb ?? "",
    price: raw.price ?? { amount: null, currency: "LKR" },
    compareAtPrice: raw.compareAtPrice ?? null,
    inStock: raw.inStock ?? true,
    stockLevel: raw.stockLevel ?? "unknown",
    image: raw.image ?? null,
    category: raw.category ?? null,
    occasions: raw.occasions ?? [],
    isCake: raw.isCake ?? false,
    shipsInternationally: raw.shipsInternationally ?? false,
    url: raw.url ?? "",
  };
}
