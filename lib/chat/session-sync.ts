"use client";

import type { UIMessage } from "ai";
import {
  getStoredSessionId,
  setStoredSessionId,
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
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    void pushSessionSync(ctx);
  }, 2000);
}

async function pushSessionSync(ctx: SessionSyncContext): Promise<void> {
  const sessionId = getStoredSessionId();
  if (!sessionId) return;

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
