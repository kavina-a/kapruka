import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

/**
 * Multi-key Gemini support. Free-tier keys hit per-minute and daily caps fast;
 * spreading requests across GEMINI_API_KEY_1 / _2 / _3 (plus legacy
 * GEMINI_API_KEY) gives ~3× headroom without changing models.
 *
 * Groq was tried as an alternative but the chat system prompt + tool schemas
 * are ~15K tokens — above Groq free-tier's 12K TPM per-request cap. Gemini
 * handles the full prompt fine; the bottleneck is rate limits, not context size.
 *
 * No "server-only" guard — eval/run.ts imports this outside Next.js.
 */

const KEY_COOLDOWN_MS = 60_000; // per-minute rate limits — skip key for 1 min after failure

/** key fingerprint (last 6 chars) → cooldown expiry timestamp */
const keyCooldownUntil = new Map<string, number>();
let roundRobinIndex = 0;

/** Collect all configured keys in priority order (deduped). */
export function getGeminiApiKeys(): string[] {
  const candidates = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    // Legacy single-key env — treated as key 1 if _1 isn't set
    process.env.GEMINI_API_KEY,
  ];

  const seen = new Set<string>();
  const keys: string[] = [];
  for (const raw of candidates) {
    const key = raw?.trim();
    if (!key || key.includes("REPLACE_ME") || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

export function isGeminiConfigured(): boolean {
  return getGeminiApiKeys().length > 0;
}

function keyFingerprint(apiKey: string): string {
  return apiKey.slice(-6);
}

function isKeyAvailable(apiKey: string): boolean {
  const until = keyCooldownUntil.get(keyFingerprint(apiKey));
  return !until || Date.now() >= until;
}

/** Mark a key as temporarily exhausted (rate limit / quota). */
export function markGeminiKeyFailed(apiKey: string, cooldownMs = KEY_COOLDOWN_MS): void {
  keyCooldownUntil.set(keyFingerprint(apiKey), Date.now() + cooldownMs);
}

/** True when Gemini returned 429 / quota / rate-limit style errors. */
export function isGeminiQuotaError(error: unknown): boolean {
  const msg = String(error).toLowerCase();
  return (
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("resource_exhausted") ||
    msg.includes("429") ||
    msg.includes("too many requests")
  );
}

/**
 * Pick the next available key — round-robin, skipping keys in cooldown.
 * Falls back to any key if all are cooling down (better to retry than fail).
 */
export function selectGeminiKey(): string {
  const keys = getGeminiApiKeys();
  if (!keys.length) {
    throw new Error("No Gemini API keys configured — set GEMINI_API_KEY_1 (or GEMINI_API_KEY) in .env");
  }

  const available = keys.filter(isKeyAvailable);
  const pool = available.length ? available : keys;

  const key = pool[roundRobinIndex % pool.length];
  roundRobinIndex = (roundRobinIndex + 1) % pool.length;
  return key;
}

/** Cheap model for classification / structured extraction. */
export const GEMINI_UTILITY_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

/** Main conversational model. */
export const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash";

export function geminiModelWithKey(modelId: string, apiKey: string): LanguageModel {
  const provider = createGoogleGenerativeAI({ apiKey });
  return provider(modelId);
}

/** Build a model using round-robin key selection (for streaming chat). */
export function geminiModel(modelId: string): LanguageModel {
  return geminiModelWithKey(modelId, selectGeminiKey());
}

/**
 * Run a non-streaming AI call, automatically trying the next key on quota /
 * rate-limit errors. Used by classify, curate-picks, and the eval harness.
 */
export async function withGeminiKeyFallback<T>(
  modelId: string,
  fn: (model: LanguageModel) => Promise<T>,
): Promise<T> {
  const keys = getGeminiApiKeys();
  if (!keys.length) {
    throw new Error("No Gemini API keys configured");
  }

  let lastError: unknown;
  for (const apiKey of keys) {
    if (!isKeyAvailable(apiKey)) continue;
    try {
      return await fn(geminiModelWithKey(modelId, apiKey));
    } catch (err) {
      if (!isGeminiQuotaError(err)) throw err;
      markGeminiKeyFailed(apiKey);
      lastError = err;
      console.warn(`[gemini] key …${keyFingerprint(apiKey)} rate-limited, trying next key`);
    }
  }

  // All keys cooling down — try once more with the first key anyway
  for (const apiKey of keys) {
    try {
      return await fn(geminiModelWithKey(modelId, apiKey));
    } catch (err) {
      if (!isGeminiQuotaError(err)) throw err;
      lastError = err;
    }
  }

  throw lastError ?? new Error("All Gemini API keys exhausted");
}
