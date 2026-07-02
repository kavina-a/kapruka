import "server-only";
import { neon } from "@neondatabase/serverless";

let _sql: ReturnType<typeof neon> | null = null;

/**
 * Returns a single shared neon() SQL client.
 * Uses the Neon HTTP driver which works in both serverless and long-lived Node.
 * Throws clearly if DATABASE_URL is not configured yet.
 */
export function getDb(): ReturnType<typeof neon> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Add your Neon connection string to .env.local to enable conversation memory.",
      );
    }
    _sql = neon(url);
  }
  return _sql;
}

/**
 * Run the one-time migration to create tables.
 * Call from a script or /api/db-migrate route during setup.
 */
export async function migrate() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id            TEXT        PRIMARY KEY,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

      -- buyer identity (collected mid-conversation or from checkout)
      buyer_name    TEXT,
      buyer_email   TEXT,
      buyer_city    TEXT,
      buyer_country TEXT,

      -- gifting context of this session
      recipient_name     TEXT,
      recipient_city     TEXT,
      recipient_relation TEXT,
      occasion           TEXT,
      delivery_date      TEXT,

      -- what happened
      products_viewed    JSONB NOT NULL DEFAULT '[]',
      product_ordered    JSONB,

      -- free-text preferences noted during conversation
      preferences        TEXT,

      -- LLM-generated 2–3 sentence summary at conversation close
      summary            TEXT
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS sessions_buyer_email_idx ON sessions (buyer_email)
    WHERE buyer_email IS NOT NULL
  `;
}
