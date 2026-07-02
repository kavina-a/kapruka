import "server-only";
import { migrate } from "@/lib/db";

export const runtime = "nodejs";

/**
 * One-shot migration endpoint.
 * Hit GET /api/db-migrate once after setting DATABASE_URL to create tables.
 * Protected by MIGRATE_SECRET so it can't be called accidentally in production.
 */
export async function GET(req: Request) {
  const secret = process.env.MIGRATE_SECRET;
  if (!secret) {
    return Response.json(
      { ok: false, error: "Set MIGRATE_SECRET in your env to enable this route." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== secret) {
    return Response.json({ ok: false, error: "Invalid secret." }, { status: 403 });
  }

  try {
    await migrate();
    return Response.json({ ok: true, message: "Tables created (or already exist)." });
  } catch (err) {
    console.error("[db-migrate]", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Migration failed." },
      { status: 500 },
    );
  }
}
