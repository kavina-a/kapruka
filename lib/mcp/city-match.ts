import type { DeliveryCity } from "@/lib/commerce/types";

export type CityResolveCode = "city_empty" | "city_not_found" | "city_ambiguous";

export type CityResolveResult =
  | { ok: true; city: string; matchedVia: "exact" | "alias" }
  | { ok: false; code: CityResolveCode; message: string; suggestions: DeliveryCity[] };

/** Normalize spacing and common Colombo zone typos ("Colombo 3" → "Colombo 03"). */
export function normalizeCityInput(input: string): string {
  let s = input.trim().replace(/\s+/g, " ");
  const colomboSingle = s.match(/^colombo\s+(\d)$/i);
  if (colomboSingle) return `Colombo 0${colomboSingle[1]}`;
  const colomboBare = s.match(/^colombo\s+(\d{2})$/i);
  if (colomboBare) return `Colombo ${colomboBare[1]}`;
  return s;
}

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function isBareColombo(input: string): boolean {
  return /^colombo$/i.test(input.trim());
}

/**
 * Match user input against Kapruka delivery city results.
 * Requires exact official name or a known alias — never passes through vague names like "Colombo".
 */
export function matchDeliveryCity(cities: DeliveryCity[], rawInput: string): CityResolveResult {
  const input = normalizeCityInput(rawInput);
  if (!input) {
    return {
      ok: false,
      code: "city_empty",
      message: "Pick a delivery city or town.",
      suggestions: [],
    };
  }

  const key = normKey(input);

  for (const c of cities) {
    if (normKey(c.name) === key) {
      return { ok: true, city: c.name, matchedVia: "exact" };
    }
  }

  for (const c of cities) {
    if (c.aliases.some((a) => normKey(a) === key)) {
      return { ok: true, city: c.name, matchedVia: "alias" };
    }
  }

  if (isBareColombo(input) && cities.length > 0) {
    return {
      ok: false,
      code: "city_ambiguous",
      message:
        '"Colombo" isn\'t specific enough — pick a zone like Colombo 03 (Kolpity) or Colombo 07 from the list.',
      suggestions: cities.slice(0, 8),
    };
  }

  if (cities.length > 1) {
    const allColomboZones = cities.every((c) => /^colombo\s+\d/i.test(c.name));
    if (allColomboZones && !/\d/.test(input)) {
      return {
        ok: false,
        code: "city_ambiguous",
        message: `"${input}" matches several Colombo zones — pick the exact area from the list.`,
        suggestions: cities.slice(0, 8),
      };
    }
    return {
      ok: false,
      code: "city_ambiguous",
      message: `"${input}" matches several delivery areas — pick one from the list to confirm.`,
      suggestions: cities.slice(0, 8),
    };
  }

  if (cities.length === 1) {
    return {
      ok: false,
      code: "city_not_found",
      message: `Did you mean ${cities[0].name}? Select it from the list to confirm.`,
      suggestions: cities,
    };
  }

  return {
    ok: false,
    code: "city_not_found",
    message: `We couldn't find "${input}" as a Kapruka delivery city. Try a nearby town or pick from suggestions.`,
    suggestions: [],
  };
}
