import "server-only";
import type { OrderRecord } from "@/lib/commerce/types";
import { getDb } from "@/lib/db";

export async function insertOrder(record: OrderRecord): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO orders (client_id, recipient, recipient_city, items, total, date, order_ref)
    VALUES (
      ${record.clientId},
      ${record.recipient},
      ${record.recipientCity ?? null},
      ${JSON.stringify(record.items)}::jsonb,
      ${record.total},
      ${record.date || new Date().toISOString()},
      ${record.orderRef}
    )
    ON CONFLICT (order_ref) DO NOTHING
  `;
}

export async function getOrdersByClient(clientId: string): Promise<OrderRecord[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT client_id, recipient, recipient_city, items, total, date, order_ref
    FROM orders
    WHERE client_id = ${clientId}
    ORDER BY date DESC
    LIMIT 50
  `;

  return (rows as Array<{
    client_id: string;
    recipient: string;
    recipient_city: string | null;
    items: string[] | string;
    total: number;
    date: string;
    order_ref: string;
  }>).map((r) => ({
    clientId: r.client_id,
    recipient: r.recipient,
    recipientCity: r.recipient_city ?? undefined,
    items: typeof r.items === "string" ? (JSON.parse(r.items) as string[]) : r.items,
    total: Number(r.total),
    date: new Date(r.date).toISOString(),
    orderRef: r.order_ref,
  }));
}
