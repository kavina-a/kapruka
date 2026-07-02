import type {
  ValseaAnnotateVerbose,
  ValseaSemanticTag,
  ValseaSentimentVerbose,
} from "@/lib/valsea/types";

const BASE_URL = "https://api.valsea.ai/v1";

function apiKey(): string | null {
  const key = process.env.VALSEA_API_KEY?.trim();
  return key || null;
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const key = apiKey();
  if (!key) {
    throw new Error("VALSEA_API_KEY is not configured");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`VALSEA ${path} failed (${res.status}): ${detail}`);
  }

  return res.json() as Promise<T>;
}

export function isValseaConfigured(): boolean {
  return Boolean(apiKey());
}

/** Annotate + clarify colloquial Tamil (or other SEA language) text. */
export async function annotateText(
  text: string,
  language: string,
): Promise<ValseaAnnotateVerbose> {
  return postJson<ValseaAnnotateVerbose>("/annotations", {
    model: "valsea-annotate",
    text,
    language,
    response_format: "verbose_json",
    enable_correction: true,
    enable_tags: true,
  });
}

/** Standalone clarify pass when annotate omits clarified_text. */
export async function clarifyText(
  text: string,
  language: string,
): Promise<{ clarified_text: string }> {
  return postJson("/clarifications", {
    model: "valsea-clarify",
    text,
    language,
    response_format: "json",
  });
}

/** Sentiment + emotional tone — feeds Ruka's tone adaptation. */
export async function analyzeSentiment(
  transcript: string,
  semanticTags?: ValseaSemanticTag[],
): Promise<ValseaSentimentVerbose> {
  return postJson<ValseaSentimentVerbose>("/sentiment", {
    model: "valsea-sentiment",
    transcript,
    response_format: "verbose_json",
    ...(semanticTags?.length ? { semantic_tags: semanticTags } : {}),
  });
}
