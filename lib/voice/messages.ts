import type { DeliveryQuote, Product, TrackedOrder } from "@/lib/commerce/types";

// ---------------------------------------------------------------------------
// Server -> client messages pushed by the Pipecat voice bot (as RTVI
// "server-message" frames). The Python `ruka_tools.py` produces these; the
// React VoiceBridge applies them to the shared commerce store so the voice
// experience renders the same product cards / cart / checkout as text.
// ---------------------------------------------------------------------------

export interface VoiceProductsMessage {
  type: "products";
  title?: string;
  products: Product[];
  note?: string | null;
  source?: "live" | "seed";
  occasion?: { id: string; label: string; emoji: string } | null;
}

export interface VoiceOpenProductMessage {
  type: "open_product";
  productId: string;
  product?: Product;
}

export interface VoiceAddToCartMessage {
  type: "add_to_cart";
  product: Product;
  quantity?: number;
}

export interface VoiceOpenCheckoutMessage {
  type: "open_checkout";
}

export interface VoiceShowCheckoutFormMessage {
  type: "show_checkout_form";
  step: "review" | "collect" | "confirm" | "payment";
}

export interface VoiceSuggestGiftMessage {
  type: "suggest_gift_message";
  message: string;
}

export interface VoiceDeliveryQuoteMessage {
  type: "delivery_quote";
  quote: DeliveryQuote;
}

export interface VoiceTrackOrderMessage {
  type: "track_order";
  order: TrackedOrder;
}

/** Opens the same Kapruka category picker as text chat's showGiftFinder tool. */
export interface VoiceShowGiftFinderMessage {
  type: "show_gift_finder";
}

/** Active spoken language / TTS voice for the live call. */
export interface VoiceLanguageMessage {
  type: "language";
  language: "en" | "si" | "ta" | "tanglish";
  tts_language?: string;
  voice?: string;
  source?: "bootstrap" | "detect";
}

/** Agent ended the call after farewell. */
export interface VoiceEndCallMessage {
  type: "end_call";
}

export type VoiceServerMessage =
  | VoiceProductsMessage
  | VoiceOpenProductMessage
  | VoiceAddToCartMessage
  | VoiceOpenCheckoutMessage
  | VoiceShowCheckoutFormMessage
  | VoiceSuggestGiftMessage
  | VoiceDeliveryQuoteMessage
  | VoiceTrackOrderMessage
  | VoiceShowGiftFinderMessage
  | VoiceLanguageMessage
  | VoiceEndCallMessage;
