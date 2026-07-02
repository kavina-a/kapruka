import "server-only";
import { neon } from "@neondatabase/serverless";

let _sql: ReturnType<typeof neon> | null = null;

export function isDbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * Returns a single shared neon() SQL client (HTTP driver — works on Vercel serverless).
 */
export function getDb(): ReturnType<typeof neon> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Add your Neon pooled connection string to enable persistence.",
      );
    }
    _sql = neon(url);
  }
  return _sql;
}

/**
 * Create all tables. Safe to run multiple times (IF NOT EXISTS).
 * Hit GET /api/db-migrate?secret=<MIGRATE_SECRET> once per environment.
 */
export async function migrate() {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id                 TEXT        PRIMARY KEY,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      buyer_name         TEXT,
      buyer_email        TEXT,
      buyer_city         TEXT,
      buyer_country      TEXT,
      recipient_name     TEXT,
      recipient_city     TEXT,
      recipient_relation TEXT,
      occasion           TEXT,
      delivery_date      TEXT,
      products_viewed    JSONB       NOT NULL DEFAULT '[]',
      product_ordered    JSONB,
      preferences        TEXT,
      summary            TEXT
    )
  `;

  // Upgrade path if sessions table existed from an earlier migration.
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS client_id TEXT`;
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS messages JSONB NOT NULL DEFAULT '[]'`;
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS order_ref TEXT`;

  await sql`
    CREATE INDEX IF NOT EXISTS sessions_client_id_idx
    ON sessions (client_id, updated_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS sessions_buyer_email_idx
    ON sessions (buyer_email)
    WHERE buyer_email IS NOT NULL
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id             SERIAL PRIMARY KEY,
      client_id      TEXT        NOT NULL,
      recipient      TEXT        NOT NULL,
      recipient_city TEXT,
      items          JSONB       NOT NULL,
      total          NUMERIC     NOT NULL,
      date           TIMESTAMPTZ NOT NULL,
      order_ref      TEXT        NOT NULL UNIQUE
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS orders_client_id_idx
    ON orders (client_id, date DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS price_alerts (
      id            SERIAL PRIMARY KEY,
      client_id     TEXT        NOT NULL,
      product_id    TEXT        NOT NULL,
      product_name  TEXT        NOT NULL,
      image_url     TEXT,
      target_price  NUMERIC     NOT NULL,
      current_price NUMERIC     NOT NULL,
      triggered     BOOLEAN     NOT NULL DEFAULT false,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      triggered_at  TIMESTAMPTZ,
      UNIQUE (client_id, product_id)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS price_alerts_pending_idx
    ON price_alerts (triggered)
    WHERE triggered = false
  `;
}
