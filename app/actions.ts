"use server";

import {
  checkDelivery,
  createOrder,
  getGift,
  listDeliveryCities,
  resolveDeliveryCity,
  searchGifts,
  trackOrder,
  KaprukaError,
  type CreateOrderInput,
  type SearchGiftsInput,
} from "@/lib/mcp/kapruka";
import type {
  DeliveryCity,
  DeliveryQuote,
  GiftDetails,
  OrderConfirmation,
  Product,
  TrackedOrder,
} from "@/lib/commerce/types";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; suggestions?: DeliveryCity[] };

function fail(
  err: unknown,
  extra?: { suggestions?: DeliveryCity[] },
): { ok: false; error: string; code?: string; suggestions?: DeliveryCity[] } {
  if (err instanceof KaprukaError) {
    return {
      ok: false,
      error: err.message,
      code: err.code,
      suggestions: extra?.suggestions,
    };
  }
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
}

export async function searchGiftsAction(
  input: SearchGiftsInput,
): Promise<ActionResult<{ products: Product[]; source: "live" | "seed"; note?: string }>> {
  try {
    const res = await searchGifts(input);
    return { ok: true, data: { products: res.products, source: res.source, note: res.note } };
  } catch (err) {
    return fail(err);
  }
}

export async function getGiftAction(productId: string): Promise<ActionResult<GiftDetails>> {
  try {
    return { ok: true, data: await getGift(productId) };
  } catch (err) {
    return fail(err);
  }
}

export async function findCitiesAction(query: string): Promise<ActionResult<DeliveryCity[]>> {
  try {
    return { ok: true, data: await listDeliveryCities(query, 12) };
  } catch (err) {
    return fail(err);
  }
}

/** Confirm free-text resolves to an exact Kapruka delivery city before checkout. */
export async function resolveDeliveryCityAction(
  query: string,
): Promise<ActionResult<{ city: string }>> {
  try {
    const resolved = await resolveDeliveryCity(query);
    if (!resolved.ok) {
      return {
        ok: false,
        error: resolved.message,
        code: resolved.code,
        suggestions: resolved.suggestions,
      };
    }
    return { ok: true, data: { city: resolved.city } };
  } catch (err) {
    return fail(err);
  }
}

export async function checkDeliveryAction(
  city: string,
  date: string,
  productId?: string,
): Promise<ActionResult<DeliveryQuote>> {
  try {
    return { ok: true, data: await checkDelivery(city, date, productId) };
  } catch (err) {
    return fail(err);
  }
}

export interface CartLine {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface StockIssue {
  productId: string;
  name: string;
  type: "out_of_stock" | "price_changed" | "unavailable";
  oldPrice?: number;
  newPrice?: number;
}

/**
 * Re-validate the cart against live data before checkout (the "cart mandate"):
 * catches items that went out of stock or whose price moved since they were added.
 */
export async function revalidateCartAction(
  lines: CartLine[],
): Promise<ActionResult<{ issues: StockIssue[] }>> {
  try {
    const issues: StockIssue[] = [];
    for (const line of lines) {
      try {
        const product = await getGift(line.productId);
        if (!product.inStock) {
          issues.push({ productId: line.productId, name: line.name, type: "out_of_stock" });
          continue;
        }
        const newPrice = product.price.amount ?? line.unitPrice;
        if (Math.round(newPrice) !== Math.round(line.unitPrice)) {
          issues.push({
            productId: line.productId,
            name: line.name,
            type: "price_changed",
            oldPrice: line.unitPrice,
            newPrice,
          });
        }
      } catch {
        issues.push({ productId: line.productId, name: line.name, type: "unavailable" });
      }
    }
    return { ok: true, data: { issues } };
  } catch (err) {
    return fail(err);
  }
}

export async function createOrderAction(
  input: CreateOrderInput,
): Promise<ActionResult<OrderConfirmation>> {
  try {
    return { ok: true, data: await createOrder(input) };
  } catch (err) {
    return fail(err);
  }
}

export async function trackOrderAction(orderNumber: string): Promise<ActionResult<TrackedOrder>> {
  try {
    return { ok: true, data: await trackOrder(orderNumber) };
  } catch (err) {
    return fail(err);
  }
}
