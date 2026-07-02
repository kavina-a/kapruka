import "server-only";
import type { PriceAlert } from "@/lib/commerce/types";
import { getDb } from "@/lib/db";

function rowToAlert(row: {
  client_id: string;
  product_id: string;
  product_name: string;
  image_url: string | null;
  target_price: number;
  current_price: number;
  triggered: boolean;
  created_at: string;
  triggered_at: string | null;
}): PriceAlert {
  return {
    clientId: row.client_id,
    productId: row.product_id,
    productName: row.product_name,
    imageUrl: row.image_url ?? undefined,
    targetPrice: Number(row.target_price),
    currentPrice: Number(row.current_price),
    triggered: row.triggered,
    createdAt: new Date(row.created_at).toISOString(),
    triggeredAt: row.triggered_at ? new Date(row.triggered_at).toISOString() : undefined,
  };
}

export async function insertPriceAlert(alert: PriceAlert): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO price_alerts (
      client_id, product_id, product_name, image_url,
      target_price, current_price, triggered, created_at
    )
    VALUES (
      ${alert.clientId},
      ${alert.productId},
      ${alert.productName},
      ${alert.imageUrl ?? null},
      ${alert.targetPrice},
      ${alert.currentPrice},
      false,
      ${alert.createdAt || new Date().toISOString()}
    )
    ON CONFLICT (client_id, product_id) DO UPDATE SET
      target_price  = EXCLUDED.target_price,
      current_price = EXCLUDED.current_price,
      product_name  = EXCLUDED.product_name,
      image_url     = EXCLUDED.image_url,
      triggered     = false,
      triggered_at  = NULL
  `;
}

export async function getAlertsByClient(clientId: string): Promise<PriceAlert[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT client_id, product_id, product_name, image_url,
           target_price, current_price, triggered, created_at, triggered_at
    FROM price_alerts
    WHERE client_id = ${clientId}
    ORDER BY created_at DESC
    LIMIT 20
  `;
  return (rows as Parameters<typeof rowToAlert>[0][]).map(rowToAlert);
}

export async function deletePriceAlert(clientId: string, productId: string): Promise<void> {
  const sql = getDb();
  await sql`
    DELETE FROM price_alerts
    WHERE client_id = ${clientId} AND product_id = ${productId}
  `;
}

export async function getPendingAlerts(): Promise<
  Array<PriceAlert & { rowId: number }>
> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, client_id, product_id, product_name, image_url,
           target_price, current_price, triggered, created_at, triggered_at
    FROM price_alerts
    WHERE triggered = false
  `;
  return (
    rows as Array<Parameters<typeof rowToAlert>[0] & { id: number }>
  ).map((r) => ({ ...rowToAlert(r), rowId: r.id }));
}

export async function updateAlertPrice(
  id: number,
  update: { currentPrice: number; triggered?: boolean; triggeredAt?: string },
): Promise<void> {
  const sql = getDb();
  if (update.triggered) {
    await sql`
      UPDATE price_alerts
      SET current_price = ${update.currentPrice},
          triggered = true,
          triggered_at = ${update.triggeredAt ?? new Date().toISOString()}
      WHERE id = ${id}
    `;
  } else {
    await sql`
      UPDATE price_alerts
      SET current_price = ${update.currentPrice}
      WHERE id = ${id}
    `;
  }
}
