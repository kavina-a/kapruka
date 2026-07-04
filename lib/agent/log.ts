import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

export type AgentChannel = "chat" | "voice" | "mcp";

interface AgentTrace {
  traceId: string;
  channel: AgentChannel;
  clientId?: string;
}

const traceStorage = new AsyncLocalStorage<AgentTrace>();

/** Verbose MCP attempt / cache logs — set AGENT_DEBUG=true in .env.local */
export function isAgentDebugEnabled(): boolean {
  const v = process.env.AGENT_DEBUG?.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Structured JSON logs prefixed with [ruka-agent].
 * `info`/`warn`/`error` always emit; `debug` only when AGENT_DEBUG is set.
 */
export function agentLog(
  event: string,
  data?: Record<string, unknown>,
  level: "debug" | "info" | "warn" | "error" = "info",
): void {
  if (level === "debug" && !isAgentDebugEnabled()) return;

  const trace = traceStorage.getStore();
  const payload = {
    ts: new Date().toISOString(),
    event,
    traceId: trace?.traceId,
    channel: trace?.channel,
    clientId: trace?.clientId,
    ...data,
  };

  const line = JSON.stringify(payload);
  const tag = "[ruka-agent]";
  if (level === "error") console.error(tag, line);
  else if (level === "warn") console.warn(tag, line);
  else console.log(tag, line);
}

export function newTraceId(prefix = "tr"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function runWithAgentTrace<T>(trace: AgentTrace, fn: () => T): T {
  return traceStorage.run(trace, fn);
}

export async function runWithAgentTraceAsync<T>(
  trace: AgentTrace,
  fn: () => Promise<T>,
): Promise<T> {
  return traceStorage.run(trace, fn);
}

export function getAgentTrace(): AgentTrace | undefined {
  return traceStorage.getStore();
}

export function summarizeProducts(
  products: Array<{ id: string; name: string; price?: { amount: number | null } }>,
): Array<{ id: string; name: string; price: number | null | undefined }> {
  return products.slice(0, 8).map((p) => ({
    id: p.id,
    name: p.name.length > 72 ? `${p.name.slice(0, 71)}…` : p.name,
    price: p.price?.amount,
  }));
}

export function summarizeSearchInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of [
    "query",
    "occasionId",
    "category",
    "minPrice",
    "maxPrice",
    "inStockOnly",
    "sort",
    "limit",
    "alternativeQueries",
  ]) {
    if (input[key] !== undefined) out[key] = input[key];
  }
  return out;
}

export function summarizeToolResult(
  tool: string,
  result: unknown,
): Record<string, unknown> {
  if (!result || typeof result !== "object") {
    return { tool, ok: false, raw: String(result) };
  }

  const r = result as Record<string, unknown>;

  if (tool === "searchGifts" && Array.isArray(r.products)) {
    return {
      tool,
      ok: r.ok,
      source: r.source,
      matchQuality: r.matchQuality,
      searchedFor: r.searchedFor,
      count: r.count,
      note: r.note,
      products: summarizeProducts(
        r.products as Array<{ id: string; name: string; price?: { amount: number | null } }>,
      ),
    };
  }

  if (tool === "getGiftDetails" && r.product && typeof r.product === "object") {
    const p = r.product as { id?: string; name?: string; inStock?: boolean };
    return { tool, ok: r.ok, productId: p.id, name: p.name, inStock: p.inStock };
  }

  if (tool === "checkDelivery" && r.quote) {
    const q = r.quote as { city?: string; date?: string; available?: boolean; rate?: number };
    return {
      tool,
      ok: r.ok,
      city: q.city,
      date: q.date,
      available: q.available,
      rate: q.rate,
    };
  }

  if (tool === "rememberRecipientDislike") {
    return {
      tool,
      ok: r.ok,
      recipientName: r.recipientName,
      dislike: r.dislike,
    };
  }

  if (r.error) return { tool, ok: r.ok ?? false, error: r.error, code: r.code };

  return { tool, ok: r.ok ?? true };
}
