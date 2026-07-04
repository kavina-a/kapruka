import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { agentLog } from "@/lib/agent/log";

const MCP_URL = process.env.KAPRUKA_MCP_URL ?? "https://mcp.kapruka.com/mcp";

/** A structured error coming back from the Kapruka MCP (e.g. city_not_deliverable). */
export class KaprukaError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "KaprukaError";
    this.code = code;
  }
}

/** Raised when the connection/transport itself fails (network, 429, etc.). */
export class KaprukaTransportError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "KaprukaTransportError";
    this.status = status;
  }
}

let clientPromise: Promise<Client> | null = null;

async function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new Client(
        { name: "ruka-gift-concierge", version: "1.0.0" },
        { capabilities: {} },
      );
      const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
      await client.connect(transport);
      return client;
    })();
  }
  return clientPromise;
}

function resetClient() {
  clientPromise = null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Tiny in-memory TTL cache. The Kapruka MCP rate-limits per IP (60 req/min),
// and every proxied request shares this server's IP, so caching read calls is
// essential. Note: serverless cold starts reset this map (documented trade-off).
// ---------------------------------------------------------------------------
type CacheEntry = { value: string; expires: number };
const cache = new Map<string, CacheEntry>();

function cacheKey(name: string, params: unknown) {
  return `${name}:${JSON.stringify(params)}`;
}

function getCached(key: string): string | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function setCached(key: string, value: string, ttlMs: number) {
  // Bound the cache so it can't grow unbounded in a long-lived process.
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { value, expires: Date.now() + ttlMs });
}

interface CallOptions {
  /** Cache TTL in ms. 0 (default) disables caching — used for writes. */
  ttlMs?: number;
  /** Number of retries on transport errors. */
  retries?: number;
}

function extractText(res: unknown): string | undefined {
  if (!res || typeof res !== "object") return undefined;
  const r = res as {
    structuredContent?: { result?: unknown };
    content?: Array<{ type?: string; text?: string }>;
    isError?: boolean;
  };
  if (typeof r.structuredContent?.result === "string") {
    return r.structuredContent.result;
  }
  const textPart = r.content?.find((c) => c?.type === "text" && typeof c.text === "string");
  return textPart?.text;
}

function isRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|rate.?limit|too many requests/i.test(msg);
}

/**
 * Call a Kapruka MCP tool and return the raw `result` string.
 * All Kapruka tools wrap their arguments under a `params` key.
 */
export async function callToolText(
  name: string,
  params: Record<string, unknown>,
  options: CallOptions = {},
): Promise<string> {
  const { ttlMs = 0, retries = 2 } = options;
  const key = cacheKey(name, params);

  if (ttlMs > 0) {
    const cached = getCached(key);
    if (cached !== undefined) {
      agentLog(
        "mcp.cache_hit",
        { tool: name, params: summarizeMcpParams(params) },
        "debug",
      );
      return cached;
    }
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const started = Date.now();
    try {
      const client = await getClient();
      const res = await client.callTool({ name, arguments: { params } });
      const text = extractText(res);
      if (typeof text !== "string") {
        throw new KaprukaTransportError(`Unexpected MCP response from ${name}`);
      }
      if (ttlMs > 0) setCached(key, text, ttlMs);
      agentLog("mcp.call_ok", {
        tool: name,
        params: summarizeMcpParams(params),
        ms: Date.now() - started,
        attempt,
        cached: ttlMs > 0,
        preview: text.slice(0, 120),
      });
      return text;
    } catch (err) {
      lastErr = err;
      agentLog(
        "mcp.call_fail",
        {
          tool: name,
          params: summarizeMcpParams(params),
          ms: Date.now() - started,
          attempt,
          error: err instanceof Error ? err.message : String(err),
        },
        attempt < retries ? "warn" : "error",
      );
      // Connection may be stale; force a fresh handshake next attempt.
      resetClient();
      if (attempt < retries) {
        const base = isRateLimited(err) ? 1500 : 350;
        await sleep(base * Math.pow(2, attempt) + Math.random() * 200);
      }
    }
  }
  if (isRateLimited(lastErr)) {
    throw new KaprukaTransportError("Kapruka is busy right now (rate limit).", 429);
  }
  throw new KaprukaTransportError(
    lastErr instanceof Error ? lastErr.message : "Failed to reach Kapruka.",
  );
}

/**
 * Call a tool that returns JSON (response_format: "json") and parse it.
 * Throws KaprukaError if the server returned an "Error: ..." / "Error (code): ..." string.
 */
export async function callToolJson<T>(
  name: string,
  params: Record<string, unknown>,
  options: CallOptions = {},
): Promise<T> {
  const text = await callToolText(name, { ...params, response_format: "json" }, options);
  const trimmed = text.trim();

  // The MCP encodes failures as a leading "Error" / "No products found" string.
  const errorMatch = trimmed.match(/^Error(?:\s*\(([^)]+)\))?:\s*(.+)$/s);
  if (errorMatch) {
    throw new KaprukaError(errorMatch[2].trim(), errorMatch[1]?.trim());
  }
  if (/^No products found/i.test(trimmed)) {
    throw new KaprukaError(trimmed, "no_results");
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new KaprukaTransportError(`Could not parse JSON from ${name}.`);
  }
}

function summarizeMcpParams(params: Record<string, unknown>): Record<string, unknown> {
  const { response_format: _rf, ...rest } = params;
  return rest;
}

export { MCP_URL };
