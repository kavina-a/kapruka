import type { Lang } from "@/lib/commerce/store";

/** Tamil Unicode block (U+0B80–U+0BFF). */
const TAMIL_RE = /[\u0B80-\u0BFF]/;

/** Sinhala Unicode block (U+0D80–U+0DFF). */
const SINHALA_RE = /[\u0D80-\u0DFF]/;

export function containsTamilScript(text: string): boolean {
  return TAMIL_RE.test(text);
}

export function containsSinhalaScript(text: string): boolean {
  return SINHALA_RE.test(text);
}

/** Whether VALSEA enrichment should run for this turn. */
export function shouldEnrichWithValsea(text: string, uiLang: Lang): boolean {
  if (uiLang === "ta") return true;
  if (containsTamilScript(text)) return true;
  return false;
}

export function inferValseaLanguage(
  text: string,
  uiLang: Lang,
): "tamil" | "sinhala" | "singlish" | "english" {
  if (uiLang === "ta" || containsTamilScript(text)) return "tamil";
  if (uiLang === "si" || containsSinhalaScript(text)) return "sinhala";
  return "english";
}
