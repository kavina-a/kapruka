"use client";

import { resolveDeliveryCityAction } from "@/app/actions";
import type { DeliveryCity } from "@/lib/commerce/types";

export const DELIVERY_CITY_HINT =
  "Pick from the list — Kapruka needs an exact zone (e.g. Colombo 03, not just Colombo).";

export async function ensureDeliveryCity(
  city: string,
): Promise<
  | { ok: true; city: string }
  | { ok: false; error: string; code?: string; suggestions: DeliveryCity[] }
> {
  const trimmed = city.trim();
  if (!trimmed) {
    return { ok: false, error: "Pick a delivery city.", code: "city_empty", suggestions: [] };
  }

  const res = await resolveDeliveryCityAction(trimmed);
  if (res.ok) return { ok: true, city: res.data.city };
  return {
    ok: false,
    error: res.error,
    code: res.code,
    suggestions: res.suggestions ?? [],
  };
}
