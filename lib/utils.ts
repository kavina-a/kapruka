import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CURRENCY_PREFIX: Record<string, string> = {
  LKR: "Rs",
  USD: "$",
  GBP: "£",
  EUR: "€",
  AUD: "A$",
  CAD: "C$",
};

export function formatMoney(amount: number | null | undefined, currency = "LKR") {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return "—";
  }
  const prefix = CURRENCY_PREFIX[currency] ?? currency + " ";
  const rounded =
    currency === "LKR"
      ? Math.round(amount).toLocaleString("en-LK")
      : amount.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  return `${prefix} ${rounded}`.replace("  ", " ");
}

export function classFromStockLevel(level?: string | null) {
  switch (level) {
    case "low":
      return "text-warn";
    case "medium":
      return "text-gold-300";
    default:
      return "text-forest-300";
  }
}
