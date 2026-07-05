import type { LanguageModel } from "ai";
import {
  GEMINI_CHAT_MODEL,
  GEMINI_UTILITY_MODEL,
  geminiModelWithKey,
  getGeminiApiKeys,
  isGeminiConfigured,
  isGeminiQuotaError,
  markGeminiKeyFailed,
  selectGeminiKey,
  withGeminiKeyFallback,
} from "@/lib/ai/gemini";
import {
  isOpenAIConfigured,
  isOpenAIQuotaError,
  OPENAI_CHAT_MODEL,
  OPENAI_UTILITY_MODEL,
  openaiModel,
} from "@/lib/ai/openai";

export type ChatProvider = "openai" | "gemini";

/**
 * Which LLM backs chat + utility calls.
 *
 * Default: OpenAI when OPENAI_API_KEY is set (paid, reliable tool calling).
 * Override with CHAT_PROVIDER=openai|gemini.
 *
 * Cost strategy ($3 budget):
 * - ONE main LLM call per turn (gpt-4o-mini) — ~$0.002–0.004/turn at ~15K input
 * - ZERO utility LLM calls by default (regex classify, template curate)
 * - TRACK mode uses a ~30-line prompt → even cheaper
 */
export function getChatProvider(): ChatProvider {
  const explicit = process.env.CHAT_PROVIDER?.trim().toLowerCase();
  if (explicit === "openai" || explicit === "gemini") return explicit;
  if (isOpenAIConfigured()) return "openai";
  if (isGeminiConfigured()) return "gemini";
  return "openai";
}

export function isAnyLLMConfigured(): boolean {
  return isOpenAIConfigured() || isGeminiConfigured();
}

export function getChatModelId(): string {
  return getChatProvider() === "openai" ? OPENAI_CHAT_MODEL : GEMINI_CHAT_MODEL;
}

/** Streaming chat model — the only LLM call on a typical turn. */
export function getChatModel(): LanguageModel {
  if (getChatProvider() === "openai") {
    return openaiModel(OPENAI_CHAT_MODEL);
  }
  return geminiModelWithKey(GEMINI_CHAT_MODEL, selectGeminiKey());
}

export function getUtilityModelId(): string {
  return getChatProvider() === "openai" ? OPENAI_UTILITY_MODEL : GEMINI_UTILITY_MODEL;
}

/** Utility model for optional structured extraction (off by default). */
export function getUtilityModel(): LanguageModel {
  if (getChatProvider() === "openai") {
    return openaiModel(OPENAI_UTILITY_MODEL);
  }
  return geminiModelWithKey(GEMINI_UTILITY_MODEL, selectGeminiKey());
}

/**
 * Run a non-streaming utility call with provider-appropriate fallback.
 * OpenAI: single key, throw on failure.
 * Gemini: multi-key rotation.
 */
export async function withUtilityFallback<T>(
  fn: (model: LanguageModel) => Promise<T>,
): Promise<T> {
  if (getChatProvider() === "openai") {
    return fn(getUtilityModel());
  }
  return withGeminiKeyFallback(GEMINI_UTILITY_MODEL, fn);
}

export function isProviderQuotaError(error: unknown): boolean {
  if (getChatProvider() === "openai") return isOpenAIQuotaError(error);
  return isGeminiQuotaError(error);
}

/** Provider metadata for logs. */
export function providerLogMeta(): {
  provider: ChatProvider;
  model: string;
  geminiKeyPool?: number;
} {
  const provider = getChatProvider();
  if (provider === "openai") {
    return { provider, model: OPENAI_CHAT_MODEL };
  }
  return {
    provider,
    model: GEMINI_CHAT_MODEL,
    geminiKeyPool: getGeminiApiKeys().length,
  };
}
