import "server-only";
import type { UIMessage } from "ai";
import { getDb } from "@/lib/db";

export interface SessionRow {
  id: string;
  client_id: string;
  created_at: string;
  updated_at: string;
  messages: UIMessage[];
  order_ref: string | null;
  buyer_name: string | null;
  buyer_city: string | null;
  recipient_name: string | null;
  recipient_city: string | null;
  occasion: string | null;
}

export interface SessionUpsert {
  sessionId: string;
  clientId: string;
  messages: UIMessage[];
  orderRef?: string;
  buyerName?: string;
  buyerCity?: string;
  recipientName?: string;
  recipientCity?: string;
  occasion?: string;
}

export async function createSession(clientId: string): Promise<string> {
  const sql = getDb();
  const id = crypto.randomUUID();
  await sql`
    INSERT INTO sessions (id, client_id)
    VALUES (${id}, ${clientId})
  `;
  return id;
}

export async function upsertSession(data: SessionUpsert): Promise<void> {
  const sql = getDb();
  const messagesJson = JSON.stringify(data.messages);

  await sql`
    INSERT INTO sessions (
      id, client_id, messages, order_ref,
      buyer_name, buyer_city, recipient_name, recipient_city, occasion,
      updated_at
    )
    VALUES (
      ${data.sessionId},
      ${data.clientId},
      ${messagesJson}::jsonb,
      ${data.orderRef ?? null},
      ${data.buyerName ?? null},
      ${data.buyerCity ?? null},
      ${data.recipientName ?? null},
      ${data.recipientCity ?? null},
      ${data.occasion ?? null},
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      messages         = EXCLUDED.messages,
      order_ref        = COALESCE(EXCLUDED.order_ref, sessions.order_ref),
      buyer_name       = COALESCE(EXCLUDED.buyer_name, sessions.buyer_name),
      buyer_city       = COALESCE(EXCLUDED.buyer_city, sessions.buyer_city),
      recipient_name   = COALESCE(EXCLUDED.recipient_name, sessions.recipient_name),
      recipient_city   = COALESCE(EXCLUDED.recipient_city, sessions.recipient_city),
      occasion         = COALESCE(EXCLUDED.occasion, sessions.occasion),
      updated_at       = now()
  `;
}

export async function getSession(sessionId: string): Promise<SessionRow | null> {
  const sql = getDb();
  const rows = (await sql`
    SELECT id, client_id, created_at, updated_at, messages, order_ref,
           buyer_name, buyer_city, recipient_name, recipient_city, occasion
    FROM sessions
    WHERE id = ${sessionId}
    LIMIT 1
  `) as SessionRow[];
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    messages: (typeof row.messages === "string"
      ? JSON.parse(row.messages)
      : row.messages) as UIMessage[],
  };
}

export interface SessionSummaryRow {
  id: string;
  updated_at: string;
  messages: UIMessage[];
  recipient_name: string | null;
}

export async function listSessions(
  clientId: string,
  limit = 20,
): Promise<SessionSummaryRow[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT id, updated_at, messages, recipient_name
    FROM sessions
    WHERE client_id = ${clientId}
      AND jsonb_array_length(messages) > 0
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `) as SessionSummaryRow[];

  return rows.map((row) => ({
    ...row,
    messages: (typeof row.messages === "string"
      ? JSON.parse(row.messages)
      : row.messages) as UIMessage[],
  }));
}

export async function getLatestSession(clientId: string): Promise<SessionRow | null> {
  const sql = getDb();
  const rows = (await sql`
    SELECT id, client_id, created_at, updated_at, messages, order_ref,
           buyer_name, buyer_city, recipient_name, recipient_city, occasion
    FROM sessions
    WHERE client_id = ${clientId}
    ORDER BY updated_at DESC
    LIMIT 1
  `) as SessionRow[];
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    messages: (typeof row.messages === "string"
      ? JSON.parse(row.messages)
      : row.messages) as UIMessage[],
  };
}
