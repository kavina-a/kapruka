import type { UIMessage } from "ai";

const CHAT_KEY = "chatruka-chat-session";
const PAYMENT_KEY = "chatruka-payment-return";
const SESSION_ID_KEY = "chatruka-session-id";

export interface ChatSessionSnapshot {
  messages: UIMessage[];
  savedAt: string;
  orderRef?: string;
}

export function saveChatSession(messages: UIMessage[], orderRef?: string): void {
  if (typeof window === "undefined" || !messages.length) return;
  try {
    const snapshot: ChatSessionSnapshot = {
      messages,
      savedAt: new Date().toISOString(),
      orderRef,
    };
    const json = JSON.stringify(snapshot);
    // localStorage persists across browser restarts (AI memory between visits).
    // sessionStorage keeps the same fast in-tab copy.
    localStorage.setItem(CHAT_KEY, json);
    sessionStorage.setItem(CHAT_KEY, json);
  } catch {
    // Quota or private mode — best effort.
  }
}

export function loadChatSession(): ChatSessionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    // sessionStorage is faster (same tab/refresh); fall back to localStorage
    // which persists after the browser is closed.
    const raw = sessionStorage.getItem(CHAT_KEY) ?? localStorage.getItem(CHAT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ChatSessionSnapshot;
  } catch {
    return null;
  }
}

export function clearChatSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(CHAT_KEY);
  localStorage.removeItem(CHAT_KEY);
}

export function getStoredSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SESSION_ID_KEY);
}

export function setStoredSessionId(sessionId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_ID_KEY, sessionId);
}

export function clearStoredSessionId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_ID_KEY);
}

export function markPaymentReturn(orderRef: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PAYMENT_KEY, orderRef);
}

export function consumePaymentReturn(): string | null {
  if (typeof window === "undefined") return null;
  const ref = sessionStorage.getItem(PAYMENT_KEY);
  if (ref) sessionStorage.removeItem(PAYMENT_KEY);
  return ref;
}

export function buildPaymentReturnUrl(orderRef: string): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  return `${origin}/payment/return?orderRef=${encodeURIComponent(orderRef)}`;
}

/** Best-effort return URL on Kapruka's pay link (ignored if unsupported). */
export function withPaymentReturnUrl(checkoutUrl: string, orderRef: string): string {
  try {
    const url = new URL(checkoutUrl);
    url.searchParams.set("return_url", buildPaymentReturnUrl(orderRef));
    return url.toString();
  } catch {
    return checkoutUrl;
  }
}
