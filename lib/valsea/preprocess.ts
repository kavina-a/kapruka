import type { Lang } from "@/lib/commerce/store";
import {
  annotateText,
  analyzeSentiment,
  clarifyText,
  isValseaConfigured,
} from "@/lib/valsea/client";
import { inferValseaLanguage, shouldEnrichWithValsea } from "@/lib/valsea/detect";
import type { ValseaEnrichment, ValseaSemanticTag } from "@/lib/valsea/types";

function normalizeTags(raw: unknown): ValseaSemanticTag[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is ValseaSemanticTag => typeof t === "object" && t !== null);
}

/**
 * Run VALSEA annotate + sentiment on Tamil (or Tamil-toggle) user input.
 * Returns null when VALSEA is off, text is not Tamil, or the API fails —
 * chat still works without enrichment.
 */
export async function enrichUserMessage(
  text: string,
  uiLang: Lang = "en",
): Promise<ValseaEnrichment | null> {
  const trimmed = text.trim();
  if (!trimmed || !shouldEnrichWithValsea(trimmed, uiLang) || !isValseaConfigured()) {
    return null;
  }

  const language = inferValseaLanguage(trimmed, uiLang);

  try {
    const annotated = await annotateText(trimmed, language);
    let clarified =
      annotated.clarified_text?.trim() ||
      annotated.text?.trim() ||
      "";

    if (!clarified) {
      const clarifiedRes = await clarifyText(trimmed, language);
      clarified = clarifiedRes.clarified_text?.trim() || trimmed;
    }

    const semanticTags = normalizeTags(annotated.semantic_tags);

    let sentiment;
    try {
      sentiment = await analyzeSentiment(clarified, semanticTags);
    } catch (err) {
      console.warn("[valsea] sentiment failed:", err);
    }

    return {
      originalText: trimmed,
      clarifiedText: clarified,
      annotatedText: annotated.annotated_text,
      semanticTags,
      sentiment,
      language,
    };
  } catch (err) {
    console.warn("[valsea] enrichment failed:", err);
    return null;
  }
}
