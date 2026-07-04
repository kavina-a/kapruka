import { getCalendarEvents } from "@/lib/commerce/calendar";
import type { Product } from "@/lib/commerce/types";

/**
 * Kapruka's catalogue keeps seasonal SKUs (e.g. "FATHER'S DAY LOVE YOU DAD 8
 * PIECE CHOCOLATE BOX") live year-round — they're just permanent product
 * names, not a signal that the holiday is near. Showing a buyer a
 * "Father's Day" branded box in July reads as a mistake even though the
 * product itself (chocolates for dad) is perfectly fine. We keep the
 * product but only when the corresponding date is actually close; otherwise
 * we drop it so the season-agnostic alternatives (unbranded boxes) surface
 * instead.
 */
const SEASONAL_NAME_PATTERNS: Array<{ eventId: string; pattern: RegExp }> = [
  { eventId: "fathers_day", pattern: /father'?s?\s*day/i },
  { eventId: "mothers_day", pattern: /mother'?s?\s*day/i },
  { eventId: "valentine", pattern: /valentine'?s?(\s*day)?/i },
  { eventId: "christmas", pattern: /\b(christmas|xmas)\b/i },
  { eventId: "avurudu", pattern: /\b(avurudu|aluth\s*avurudu|sinhala\s*(and|&)\s*tamil\s*new\s*year)\b/i },
];

// Retailers start branding ahead of the date but the branding stops making
// sense quickly once it's passed — a "Father's Day" box two weeks after
// Father's Day reads as a mistake, not a callback. Window is intentionally
// asymmetric: generous lead-in, short grace period after.
const SEASON_LEAD_DAYS = 14;
const SEASON_GRACE_DAYS = 3;

function isEventInSeason(eventId: string, referenceToday?: string): boolean {
  const events = getCalendarEvents(referenceToday);
  return events.some(
    (e) => e.id === eventId && e.daysUntil >= -SEASON_GRACE_DAYS && e.daysUntil <= SEASON_LEAD_DAYS,
  );
}

/** True if the product's name is branded for a holiday that isn't currently near. */
export function isProductOffSeason(name: string, referenceToday?: string): boolean {
  for (const { eventId, pattern } of SEASONAL_NAME_PATTERNS) {
    if (pattern.test(name) && !isEventInSeason(eventId, referenceToday)) {
      return true;
    }
  }
  return false;
}

/**
 * Drops off-season holiday-branded products from a result set. If filtering
 * would remove everything (e.g. a same-name seed catalogue has nothing
 * else), we keep the original list rather than returning zero results —
 * an off-season-labelled gift still beats no gift at all.
 */
export function filterOffSeasonProducts<T extends Pick<Product, "name">>(
  products: T[],
  referenceToday?: string,
): T[] {
  const filtered = products.filter((p) => !isProductOffSeason(p.name, referenceToday));
  return filtered.length ? filtered : products;
}
