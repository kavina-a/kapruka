import type { DeliveryDetails, LocationType, SenderDetails } from "./types";

export const LOCATION_TYPES: LocationType[] = ["house", "apartment", "office", "other"];

export const INPUT_CLASS =
  "w-full rounded-xl border border-line bg-canvas-2 px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-gold-400 focus:outline-none";

export function normalizePhone(p: string) {
  return p.replace(/[\s-]/g, "");
}

export function isValidPhone(p: string) {
  const n = normalizePhone(p);
  return /^\+94\d{9}$/.test(n) || /^0\d{9}$/.test(n);
}

export interface CheckoutFieldErrors {
  recipientName?: string;
  recipientPhone?: string;
  address?: string;
  city?: string;
  date?: string;
  senderName?: string;
}

export function validateCheckoutFields(
  delivery: Partial<DeliveryDetails>,
  sender: Partial<SenderDetails>,
  today: string,
): CheckoutFieldErrors {
  const e: CheckoutFieldErrors = {};
  if (!delivery.recipientName?.trim()) e.recipientName = "Who's receiving this?";
  if (!delivery.recipientPhone?.trim()) e.recipientPhone = "We need a contact number for delivery.";
  else if (!isValidPhone(delivery.recipientPhone)) e.recipientPhone = "Use 0771234567 or +94771234567.";
  if (!delivery.address?.trim() || delivery.address.trim().length < 3) e.address = "Add a street address.";
  if (!delivery.city?.trim()) e.city = "Pick a delivery city from the list.";
  if (!delivery.date) e.date = "Choose a delivery date.";
  else if (delivery.date < today) e.date = "That date is in the past.";
  if (!sender.name?.trim()) e.senderName = "Add your name for the gift card.";
  return e;
}

export type CheckoutFormStep = "review" | "collect" | "confirm" | "payment";

export const CHECKOUT_STEP_LABELS: Record<CheckoutFormStep, string> = {
  review: "Your basket",
  collect: "Delivery details",
  confirm: "Review & confirm",
  payment: "Payment",
};

export const PAYMENT_METHODS = [
  {
    id: "card",
    label: "Credit / Debit Card",
    description: "Visa, Mastercard, Amex",
  },
  {
    id: "bank",
    label: "Bank Transfer",
    description: "Direct bank payment",
  },
  {
    id: "ezcash",
    label: "eZ Cash",
    description: "Dialog mobile wallet",
  },
  {
    id: "mcash",
    label: "mCash",
    description: "Mobitel mobile wallet",
  },
  {
    id: "frimi",
    label: "Frimi",
    description: "Nation's Trust Bank wallet",
  },
] as const;

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];
