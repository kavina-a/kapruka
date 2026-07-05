import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/** Main conversational model — gpt-4o-mini is the cost/reliability sweet spot. */
export const OPENAI_CHAT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/** Tiny structured-extraction model (only used when CLASSIFY_USE_LLM=true). */
export const OPENAI_UTILITY_MODEL = process.env.OPENAI_UTILITY_MODEL || "gpt-4o-mini";

export function getOpenAIApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key.includes("REPLACE_ME")) return null;
  return key;
}

export function isOpenAIConfigured(): boolean {
  return Boolean(getOpenAIApiKey());
}

export function openaiModel(modelId: string): LanguageModel {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error("No OpenAI API key configured — set OPENAI_API_KEY in .env");
  }
  const provider = createOpenAI({ apiKey });
  return provider(modelId);
}

/** True for quota / rate-limit style OpenAI errors. */
export function isOpenAIQuotaError(error: unknown): boolean {
  const msg = String(error).toLowerCase();
  return (
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("insufficient_quota") ||
    msg.includes("429") ||
    msg.includes("too many requests") ||
    msg.includes("billing")
  );
}
