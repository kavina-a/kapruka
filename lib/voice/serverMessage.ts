import type { Product } from "@/lib/commerce/types";
import type { VoiceServerMessage } from "@/lib/voice/messages";

const CHECKOUT_STEPS = new Set(["review", "collect", "confirm", "payment"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isVoiceServerMessage(value: unknown): value is VoiceServerMessage {
  if (!isRecord(value)) return false;
  const type = value.type;
  if (typeof type !== "string") return false;

  switch (type) {
    case "products":
      return Array.isArray(value.products);
    case "open_product":
      return typeof value.productId === "string";
    case "add_to_cart":
      return isRecord(value.product);
    case "open_checkout":
      return true;
    case "show_checkout_form":
      return typeof value.step === "string" && CHECKOUT_STEPS.has(value.step);
    case "suggest_gift_message":
      return typeof value.message === "string";
    case "delivery_quote":
      return isRecord(value.quote);
    case "track_order":
      return isRecord(value.order);
    default:
      return false;
  }
}

/** Unwrap RTVI server-message payloads (may be nested under `data`). */
export function parseVoiceServerMessage(raw: unknown): VoiceServerMessage | null {
  if (!isRecord(raw)) return null;

  const inner = typeof raw.type === "string" ? raw : isRecord(raw.data) ? raw.data : null;
  if (!inner || !isVoiceServerMessage(inner)) return null;
  return inner;
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
