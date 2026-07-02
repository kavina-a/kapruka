/** VALSEA API response shapes — https://valsea.ai/docs */

export interface ValseaSemanticTag {
  tag?: string;
  phrase?: string;
  meaning?: string;
}

export interface ValseaAnnotateVerbose {
  text?: string;
  raw_text?: string;
  accent_corrections?: unknown[];
  semantic_tags?: ValseaSemanticTag[];
  annotated_text?: string;
  annotations?: unknown;
  clarified_text?: string;
}

export interface ValseaSentimentVerbose {
  sentiment: "positive" | "neutral" | "negative";
  confidence: number;
  reasoning?: string;
}

export interface ValseaEnrichment {
  originalText: string;
  clarifiedText: string;
  annotatedText?: string;
  semanticTags: ValseaSemanticTag[];
  sentiment?: ValseaSentimentVerbose;
  language: "tamil" | "sinhala" | "singlish" | "english";
}
