import type {
  CurrencyCode,
  DeliveryCity,
  DeliveryQuote,
  GiftDetails,
  Money,
  OrderConfirmation,
  Product,
  ProductVariant,
  StockLevel,
  TrackedOrder,
} from "@/lib/commerce/types";

// ---------------------------------------------------------------------------
// Raw MCP payload shapes (only the fields we use).
// ---------------------------------------------------------------------------
interface RawMoney {
  amount: number | null;
  currency: string;
}

export interface RawSearchItem {
  id: string;
  name: string;
  summary?: string;
  price?: RawMoney;
  compare_at_price?: RawMoney | null;
  in_stock?: boolean;
  stock_level?: string;
  image_url?: string | null;
  category?: { id?: string; name?: string; slug?: string } | null;
  ships_internationally?: boolean;
  url?: string;
}

export interface RawSearchResponse {
  results: RawSearchItem[];
  next_cursor: string | null;
  applied_filters?: Record<string, unknown>;
}

export interface RawProduct {
  id: string;
  name: string;
  description?: string;
  summary?: string;
  price?: RawMoney;
  compare_at_price?: RawMoney | null;
  in_stock?: boolean;
  stock_level?: string;
  category?: { id?: string; name?: string; slug?: string; path?: string } | null;
  variants?: Array<{
    id: string;
    name: string;
    sku: string;
    price?: RawMoney;
    in_stock?: boolean;
    stock_level?: string;
    attributes?: Record<string, unknown>;
  }>;
  images?: string[];
  attributes?: { type?: string; subtype?: string; weight?: string; vendor?: string };
  shipping?: {
    ships_from?: string;
    ships_internationally?: boolean;
    restricted_countries?: string[];
  };
  url?: string;
}

// ---------------------------------------------------------------------------
// Text cleaning. Kapruka summaries arrive with mangled HTML entities
// (`n#160;` -> nbsp, `namp;` -> &), backtick apostrophes, and tag-soup
// prefixes ("specialGifts - Chocolate, Valentine, Kpc, ...").
// ---------------------------------------------------------------------------
function decodeEntities(s: string): string {
  return s
    .replace(/n#(\d{2,5});/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#(\d{2,5});/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/namp;|&amp;/g, "&")
    .replace(/nnbsp;|&nbsp;/g, " ")
    .replace(/nquot;|&quot;/g, '"')
    .replace(/napos;|&apos;|n#39;|&#39;|nrsquo;|&rsquo;/g, "'")
    .replace(/nldquo;|&ldquo;|nrdquo;|&rdquo;/g, '"');
}

export function cleanText(input?: string | null): string {
  if (!input) return "";
  let s = decodeEntities(String(input));
  s = s.replace(/[\u00a0\u2007\u202f]/g, " ");
  s = s.replace(/`/g, "'");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

const JUNK_TOKENS =
  /\b(specialGifts|Kpcondemand|Kpconly|Kpc|Catsymprod|catSymProd|CATSYMPROD|Kaprukacakes|Https?:\/\/[^\s]+)\b/gi;

/** Best-effort de-tagged, human-readable blurb from a noisy summary/description. */
export function deriveBlurb(summary?: string | null): string {
  let s = cleanText(summary);
  if (!s) return "";
  // Drop a leading "<token> - " tag prefix.
  s = s.replace(/^[\w ]{1,24}\s-\s/, "");
  s = s.replace(JUNK_TOKENS, " ");
  s = s
    .replace(/\s*,\s*/g, ", ")
    .replace(/(,\s+){2,}/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,]+/, "")
    .trim();
  return s;
}

export function truncate(s: string, max = 120): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/[\s,.;:]+\S*$/, "").trim() + "…";
}

// ---------------------------------------------------------------------------
// Field normalizers
// ---------------------------------------------------------------------------
const SUPPORTED_CURRENCIES: CurrencyCode[] = ["LKR", "USD", "GBP", "EUR", "AUD", "CAD"];

function toCurrency(c?: string): CurrencyCode {
  const up = (c ?? "LKR").toUpperCase();
  return (SUPPORTED_CURRENCIES as string[]).includes(up) ? (up as CurrencyCode) : "LKR";
}

function toMoney(m?: RawMoney | null): Money {
  return {
    amount: typeof m?.amount === "number" ? m.amount : null,
    currency: toCurrency(m?.currency),
  };
}

function toStockLevel(s?: string): StockLevel {
  switch ((s ?? "").toLowerCase()) {
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    default:
      return "unknown";
  }
}

export function detectCake(input: {
  id?: string;
  name?: string;
  category?: { name?: string; slug?: string; path?: string } | null;
  attributes?: { type?: string };
}): boolean {
  const hay = [
    input.id,
    input.name,
    input.category?.name,
    input.category?.slug,
    input.category?.path,
    input.attributes?.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /cake/.test(hay);
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
export function toProduct(raw: RawSearchItem, occasions: string[] = []): Product {
  return {
    id: raw.id,
    name: cleanText(raw.name),
    blurb: truncate(deriveBlurb(raw.summary), 140),
    price: toMoney(raw.price),
    compareAtPrice: raw.compare_at_price ? toMoney(raw.compare_at_price) : null,
    inStock: raw.in_stock ?? true,
    stockLevel: toStockLevel(raw.stock_level),
    image: raw.image_url ?? null,
    category: raw.category?.name ? cleanText(raw.category.name) : null,
    occasions,
    isCake: detectCake(raw),
    shipsInternationally: raw.ships_internationally ?? false,
    url: raw.url ?? "",
  };
}

export function toGiftDetails(raw: RawProduct, occasions: string[] = []): GiftDetails {
  const images = Array.isArray(raw.images) ? raw.images.filter(Boolean) : [];
  const variants: ProductVariant[] = (raw.variants ?? []).map((v) => ({
    id: v.id,
    name: cleanText(v.name) || "Default",
    sku: v.sku,
    price: toMoney(v.price),
    inStock: v.in_stock ?? true,
    stockLevel: toStockLevel(v.stock_level),
    attributes: Object.fromEntries(
      Object.entries(v.attributes ?? {}).map(([k, val]) => [k, String(val)]),
    ),
  }));

  const description = cleanText(raw.description) || deriveBlurb(raw.summary);

  return {
    id: raw.id,
    name: cleanText(raw.name),
    blurb: truncate(description, 160),
    price: toMoney(raw.price),
    compareAtPrice: raw.compare_at_price ? toMoney(raw.compare_at_price) : null,
    inStock: raw.in_stock ?? true,
    stockLevel: toStockLevel(raw.stock_level),
    image: images[0] ?? null,
    category: raw.category?.name ? cleanText(raw.category.name) : null,
    occasions,
    isCake: detectCake(raw),
    shipsInternationally: raw.shipping?.ships_internationally ?? false,
    url: raw.url ?? "",
    description,
    images,
    variants,
    attributes: {
      type: raw.attributes?.type ? cleanText(raw.attributes.type) : undefined,
      subtype: raw.attributes?.subtype ? cleanText(raw.attributes.subtype) : undefined,
      weight: raw.attributes?.weight,
      vendor: raw.attributes?.vendor ? cleanText(raw.attributes.vendor) : undefined,
    },
    shipping: {
      shipsFrom: raw.shipping?.ships_from,
      shipsInternationally: raw.shipping?.ships_internationally ?? false,
      restrictedCountries: raw.shipping?.restricted_countries ?? [],
    },
  };
}

// ---------------------------------------------------------------------------
// Delivery cities — kapruka_list_delivery_cities returns markdown bullets:
//   - **Colombo 03**  _aliases: Kolpity colpity colombo3_
// ---------------------------------------------------------------------------
export function parseDeliveryCities(markdown: string): DeliveryCity[] {
  const cities: DeliveryCity[] = [];
  const lineRe = /^[-*]\s+\*\*(.+?)\*\*(?:\s+_aliases:\s*(.+?)_)?\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(markdown)) !== null) {
    cities.push({
      name: m[1].trim(),
      aliases: m[2] ? m[2].trim().split(/\s+/).filter(Boolean) : [],
    });
  }
  return cities;
}

export interface RawCheckDelivery {
  city: string;
  checked_date: string;
  available: boolean;
  rate: number;
  currency: string;
  perishable_warning: string | null;
}

export function toDeliveryQuote(raw: RawCheckDelivery): DeliveryQuote {
  return {
    city: raw.city,
    date: raw.checked_date,
    available: !!raw.available,
    rate: typeof raw.rate === "number" ? raw.rate : 0,
    currency: toCurrency(raw.currency),
    perishableWarning: raw.perishable_warning ? cleanText(raw.perishable_warning) : null,
  };
}

export interface RawCreateOrder {
  checkout_url: string;
  order_ref: string;
  summary: {
    items_total: number;
    delivery_fee: number;
    addons_total: number;
    grand_total: number;
    currency: string;
  };
  expires_at: string;
}

export function toOrderConfirmation(raw: RawCreateOrder): OrderConfirmation {
  return {
    checkoutUrl: raw.checkout_url,
    orderRef: raw.order_ref,
    summary: {
      itemsTotal: raw.summary.items_total,
      deliveryFee: raw.summary.delivery_fee,
      addonsTotal: raw.summary.addons_total,
      grandTotal: raw.summary.grand_total,
      currency: toCurrency(raw.summary.currency),
    },
    expiresAt: raw.expires_at,
  };
}

export interface RawTrackOrder {
  order_number: string;
  status: string;
  status_display: string;
  order_date: string;
  delivery_date: string;
  shipped_date: string | null;
  amount: string;
  payment_method: string;
  recipient: { name: string; phone: string; address: string; city: string };
  greeting_message: string | null;
  special_instructions: string | null;
  progress: Array<{ step: string; timestamp: string }>;
  live_tracking_available: boolean;
  has_delivery_video: boolean;
  has_delivery_photo: boolean;
  items: Array<{ product_id: string; name: string; quantity: number; selling_price: number }>;
}

export function toTrackedOrder(raw: RawTrackOrder): TrackedOrder {
  return {
    orderNumber: raw.order_number,
    status: raw.status,
    statusDisplay: raw.status_display,
    orderDate: raw.order_date,
    deliveryDate: raw.delivery_date,
    shippedDate: raw.shipped_date,
    amount: raw.amount,
    paymentMethod: raw.payment_method,
    recipient: raw.recipient,
    greetingMessage: raw.greeting_message ? cleanText(raw.greeting_message) : null,
    specialInstructions: raw.special_instructions ? cleanText(raw.special_instructions) : null,
    progress: raw.progress ?? [],
    liveTrackingAvailable: !!raw.live_tracking_available,
    hasDeliveryVideo: !!raw.has_delivery_video,
    hasDeliveryPhoto: !!raw.has_delivery_photo,
    items: (raw.items ?? []).map((i) => ({
      productId: i.product_id,
      name: cleanText(i.name),
      quantity: i.quantity,
      sellingPrice: i.selling_price,
    })),
  };
}
