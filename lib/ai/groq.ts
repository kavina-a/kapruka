import { createOpenAI } from "@ai-sdk/openai";

/**
 * Groq — main chat model. Free tier gives ~1,000 requests/day (vs. Gemini's
 * free tier at ~5 requests/minute), which is the practical limit for an
 * e-commerce agent under real traffic.
 *
 * There's no @ai-sdk/groq version compatible with this project's `ai` (v6 /
 * provider v3) — the published package jumped straight to provider v4. Groq's
 * API is OpenAI-compatible (chat completions), so we reuse @ai-sdk/openai's
 * `createOpenAI` pointed at Groq's base URL instead of pulling in a
 * mismatched extra provider package.
 *
 * Provider is built lazily inside groqModel() so it also works from the
 * offline eval harness (eval/run.ts), which loads env vars via dotenv AFTER
 * this module would otherwise have been evaluated.
 */
export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

/** Main conversational model. Override via GROQ_MODEL to match whatever key/tier you're on. */
export const GROQ_CHAT_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export function groqModel(modelId: string) {
  const provider = createOpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });
  return provider.chat(modelId);
}
