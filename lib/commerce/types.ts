// ---------------------------------------------------------------------------
// Channel-agnostic commerce domain model.
//
// These types are the single source of truth the UI is a "skin" over. They are
// deliberately decoupled from both the raw Kapruka MCP payloads (see
// lib/mcp/normalize.ts) and from React, so the same cart/checkout logic could
// be driven from a different surface (e.g. WhatsApp) without a rewrite.
// ---------------------------------------------------------------------------

import type { GiftFinderState } from "@/lib/catalog/gift-finder-types";

export type CurrencyCode = "LKR" | "USD" | "GBP" | "EUR" | "AUD" | "CAD";

export type StockLevel = "low" | "medium" | "high" | "unknown";

export interface Money {
  amount: number | null;
  currency: CurrencyCode;
}

/** Card-level product — what shows in carousels and the browse grid. */
export interface Product {
  id: string;
  name: string;
  blurb: string;
  price: Money;
  compareAtPrice: Money | null;
  inStock: boolean;
  stockLevel: StockLevel;
  image: string | null;
  category: string | null;
  /** Occasion/category tags this product is associated with (for the grid + filtering). */
  occasions: string[];
  /** True for cakes — unlocks the "message on the cake" (icing) field. */
  isCake: boolean;
  shipsInternationally: boolean;
  url: string;
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  price: Money;
  inStock: boolean;
  stockLevel: StockLevel;
  attributes: Record<string, string>;
}

/** Full detail — for the expanded product overlay. */
export interface GiftDetails extends Product {
  description: string;
  images: string[];
  variants: ProductVariant[];
  attributes: {
    type?: string;
    subtype?: string;
    weight?: string;
    vendor?: string;
  };
  shipping: {
    shipsFrom?: string;
    shipsInternationally: boolean;
    restrictedCountries: string[];
  };
}

export interface CartItem {
  product: Product;
  quantity: number;
  /** Cake icing text — only meaningful when product.isCake. */
  icingText?: string;
}

export type LocationType = "house" | "apartment" | "office" | "other";

/** Who set the active gift card message. */
export type GiftMessageSource = "user" | "ai";

export interface DeliveryDetails {
  recipientName: string;
  recipientPhone: string;
  address: string;
  city: string;
  locationType: LocationType;
  /** YYYY-MM-DD (Asia/Colombo) */
  date: string;
  instructions?: string;
}

export interface SenderDetails {
  name: string;
  anonymous: boolean;
}

export interface DeliveryQuote {
  city: string;
  date: string;
  available: boolean;
  rate: number;
  currency: CurrencyCode;
  perishableWarning: string | null;
}

export interface DeliveryCity {
  name: string;
  aliases: string[];
}

export interface OrderSummary {
  itemsTotal: number;
  deliveryFee: number;
  addonsTotal: number;
  grandTotal: number;
  currency: CurrencyCode;
}

export interface OrderConfirmation {
  checkoutUrl: string;
  orderRef: string;
  summary: OrderSummary;
  expiresAt: string;
}

export interface TrackedOrderItem {
  productId: string;
  name: string;
  quantity: number;
  sellingPrice: number;
}

export interface TrackedOrderStep {
  step: string;
  timestamp: string;
}

export interface TrackedOrder {
  orderNumber: string;
  status: string;
  statusDisplay: string;
  orderDate: string;
  deliveryDate: string;
  shippedDate: string | null;
  amount: string;
  paymentMethod: string;
  recipient: { name: string; phone: string; address: string; city: string };
  greetingMessage: string | null;
  specialInstructions: string | null;
  progress: TrackedOrderStep[];
  liveTrackingAvailable: boolean;
  hasDeliveryVideo: boolean;
  hasDeliveryPhoto: boolean;
  items: TrackedOrderItem[];
}

/** Snapshot sent with each chat request so the agent knows cart + checkout state. */
export interface CommerceContext {
  cart: Array<{ id: string; name: string; quantity: number }>;
  subtotal: number;
  delivery: Partial<DeliveryDetails>;
  sender: Partial<SenderDetails>;
  giftMessage: string;
  giftMessageSource: string | null;
  chatCheckoutStep: string | null;
  /** Saved recipient dislikes — keyed by lowercased recipient name. */
  recipientDislikes?: Record<string, string[]>;
  /** Products currently on screen from the latest search — use these ids for addToCart. */
  shownProducts?: Array<{ id: string; name: string }>;
  /** Anonymous device id — ties orders, alerts, and sessions together. */
  clientId?: string;
  /** Structured signals captured by the gift-finder chip flow, when used this session. */
  giftFinderState?: GiftFinderState | null;
}

/** A lightweight order record persisted to Neon after each confirmed order. */
export interface OrderRecord {
  clientId: string;
  recipient: string;
  recipientCity?: string;
  items: string[];
  total: number;
  date: string;       // ISO date string
  orderRef: string;
}

/** A saved price alert — checked daily against live MCP prices. */
export interface PriceAlert {
  id?: string;
  clientId: string;
  productId: string;
  productName: string;
  imageUrl?: string;
  targetPrice: number;
  currentPrice: number;
  triggered: boolean;
  createdAt: string;
  triggeredAt?: string;
}
