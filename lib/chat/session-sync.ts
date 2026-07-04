"use client";

import type { UIMessage } from "ai";
import {
  getStoredSessionId,
  setStoredSessionId,
  upsertLocalSessionArchive,
} from "@/lib/chat/session-persist";

export interface SessionSyncContext {
  clientId: string;
  messages: UIMessage[];
  orderRef?: string;
  buyerName?: string;
  buyerCity?: string;
  recipientName?: string;
  recipientCity?: string;
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSync: SessionSyncContext | null = null;

export interface SessionSummary {
  sessionId: string;
  title: string;
  updatedAt: string;
  recipientName?: string | null;
}

/** Ensure a server session row exists; returns session id (local fallback if DB off). */
export async function ensureServerSession(clientId: string): Promise<string> {
  const existing = getStoredSessionId();
  if (existing) return existing;

  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    const data = (await res.json()) as { ok?: boolean; sessionId?: string };
    const sessionId = data.sessionId ?? crypto.randomUUID();
    setStoredSessionId(sessionId);
    return sessionId;
  } catch {
    const fallback = crypto.randomUUID();
    setStoredSessionId(fallback);
    return fallback;
  }
}

/** Load the latest server session for this device (when local tab cache is empty). */
export async function loadServerSession(
  clientId: string,
): Promise<{ sessionId: string; messages: UIMessage[] } | null> {
  try {
    const res = await fetch(`/api/sessions?clientId=${encodeURIComponent(clientId)}`);
    const data = (await res.json()) as {
      ok?: boolean;
      session?: { sessionId: string; messages: UIMessage[] } | null;
    };
    if (!data.ok || !data.session?.messages?.length) return null;
    setStoredSessionId(data.session.sessionId);
    return { sessionId: data.session.sessionId, messages: data.session.messages };
  } catch {
    return null;
  }
}

/** Debounced upsert of chat messages to Neon (2s). */
export function scheduleSessionSync(ctx: SessionSyncContext): void {
  if (!ctx.messages.length) return;
  pendingSync = ctx;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    void pushSessionSync(ctx);
  }, 2000);
}

/** Push any pending session sync immediately (e.g. before starting a new chat). */
export async function flushSessionSync(ctx?: SessionSyncContext): Promise<void> {
  const payload = ctx ?? pendingSync;
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (!payload?.messages.length) return;
  pendingSync = null;
  await pushSessionSync(payload);
}

/** Load a specific session by id from the server or local archive. */
export async function loadSessionById(
  sessionId: string,
): Promise<{ sessionId: string; messages: UIMessage[] } | null> {
  try {
    const res = await fetch(`/api/sessions?id=${encodeURIComponent(sessionId)}`);
    const data = (await res.json()) as {
      ok?: boolean;
      session?: { sessionId: string; messages: UIMessage[] } | null;
    };
    if (data.ok && data.session?.messages?.length) {
      setStoredSessionId(data.session.sessionId);
      return { sessionId: data.session.sessionId, messages: data.session.messages };
    }
  } catch {
    // fall through
  }
  const { loadLocalSessionArchive } = await import("@/lib/chat/session-persist");
  const local = loadLocalSessionArchive(sessionId);
  if (!local?.messages?.length) return null;
  setStoredSessionId(local.sessionId);
  return { sessionId: local.sessionId, messages: local.messages };
}

/** List recent sessions for this device (server or local archive). */
export async function listSessionsForClient(clientId: string): Promise<SessionSummary[]> {
  try {
    const res = await fetch(
      `/api/sessions?clientId=${encodeURIComponent(clientId)}&list=1`,
    );
    const data = (await res.json()) as {
      ok?: boolean;
      sessions?: SessionSummary[];
      note?: string;
    };
    if (data.ok && Array.isArray(data.sessions) && data.sessions.length > 0) {
      return data.sessions;
    }
  } catch {
    // fall through to local archive
  }
  const { listLocalSessionArchive } = await import("@/lib/chat/session-persist");
  return listLocalSessionArchive().map((s) => ({
    sessionId: s.sessionId,
    title: s.title,
    updatedAt: s.updatedAt,
    recipientName: s.recipientName,
  }));
}

async function pushSessionSync(ctx: SessionSyncContext): Promise<void> {
  const sessionId = getStoredSessionId();
  if (!sessionId) return;

  upsertLocalSessionArchive({
    sessionId,
    messages: ctx.messages,
    recipientName: ctx.recipientName,
  });

  try {
    await fetch("/api/sessions", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        clientId: ctx.clientId,
        messages: ctx.messages,
        orderRef: ctx.orderRef,
        buyerName: ctx.buyerName,
        buyerCity: ctx.buyerCity,
        recipientName: ctx.recipientName,
        recipientCity: ctx.recipientCity,
      }),
    });
  } catch {
    // Best effort — sessionStorage remains the fast local cache.
  }
}
