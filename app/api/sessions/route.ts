import { NextRequest, NextResponse } from "next/server";
import type { UIMessage } from "ai";
import { isDbEnabled } from "@/lib/db";
import {
  createSession,
  getLatestSession,
  getSession,
  listSessions,
  upsertSession,
} from "@/lib/db/sessions";
import { sessionTitleFromMessages } from "@/lib/chat/session-title";

export const runtime = "nodejs";

/** GET /api/sessions?id=… | ?clientId=… (latest for device) */
export async function GET(req: NextRequest) {
  if (!isDbEnabled()) {
    return NextResponse.json({ ok: true, session: null });
  }

  const sessionId = req.nextUrl.searchParams.get("id");
  const clientId = req.nextUrl.searchParams.get("clientId");

  try {
    if (sessionId) {
      const session = await getSession(sessionId);
      if (!session) {
        return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        session: {
          sessionId: session.id,
          clientId: session.client_id,
          messages: session.messages,
          orderRef: session.order_ref,
          updatedAt: session.updated_at,
        },
      });
    }

    if (clientId) {
      const list = req.nextUrl.searchParams.get("list");
      if (list === "1" || list === "true") {
        const rows = await listSessions(clientId, 25);
        const sessions = rows.map((row) => ({
          sessionId: row.id,
          title:
            sessionTitleFromMessages(row.messages) ||
            row.recipient_name ||
            "New conversation",
          updatedAt: row.updated_at,
          recipientName: row.recipient_name,
        }));
        return NextResponse.json({ ok: true, sessions });
      }

      const session = await getLatestSession(clientId);
      if (!session) {
        return NextResponse.json({ ok: true, session: null });
      }
      return NextResponse.json({
        ok: true,
        session: {
          sessionId: session.id,
          clientId: session.client_id,
          messages: session.messages,
          orderRef: session.order_ref,
          updatedAt: session.updated_at,
        },
      });
    }

    return NextResponse.json({ ok: false, error: "id or clientId required." }, { status: 400 });
  } catch (err) {
    console.error("[sessions GET]", err);
    return NextResponse.json({ ok: false, error: "Failed to load session." }, { status: 500 });
  }
}

/** POST /api/sessions — create a new empty session. */
export async function POST(req: NextRequest) {
  if (!isDbEnabled()) {
    return NextResponse.json({ ok: true, sessionId: crypto.randomUUID(), note: "local-only" });
  }

  try {
    const body = (await req.json()) as { clientId?: string };
    if (!body.clientId) {
      return NextResponse.json({ ok: false, error: "clientId required." }, { status: 400 });
    }
    const sessionId = await createSession(body.clientId);
    return NextResponse.json({ ok: true, sessionId });
  } catch (err) {
    console.error("[sessions POST]", err);
    return NextResponse.json({ ok: false, error: "Failed to create session." }, { status: 500 });
  }
}

interface SessionPutBody {
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

/** PUT /api/sessions — upsert messages + gifting context. */
export async function PUT(req: NextRequest) {
  if (!isDbEnabled()) return NextResponse.json({ ok: true });

  try {
    const body = (await req.json()) as SessionPutBody;
    if (!body.sessionId || !body.clientId || !Array.isArray(body.messages)) {
      return NextResponse.json({ ok: false, error: "sessionId, clientId, messages required." }, { status: 400 });
    }

    await upsertSession({
      sessionId: body.sessionId,
      clientId: body.clientId,
      messages: body.messages,
      orderRef: body.orderRef,
      buyerName: body.buyerName,
      buyerCity: body.buyerCity,
      recipientName: body.recipientName,
      recipientCity: body.recipientCity,
      occasion: body.occasion,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[sessions PUT]", err);
    return NextResponse.json({ ok: false, error: "Failed to save session." }, { status: 500 });
  }
}
