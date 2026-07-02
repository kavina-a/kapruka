import type { ValseaEnrichment } from "@/lib/valsea/types";

/** Inject VALSEA intelligence into the system prompt for Tamil turns. */
export function buildValseaContextBlock(enrichment: ValseaEnrichment): string {
  const lines = [
    "# VALSEA speech intelligence (Tamil / SEA input)",
    `The buyer wrote in **${enrichment.language}**. Mirror their language in your reply — Tamil script if they used Tamil script.`,
    `Original: "${enrichment.originalText}"`,
    `Clarified intent: "${enrichment.clarifiedText}"`,
    "Use the clarified intent for search keywords and tool calls. Product and city names stay in English.",
  ];

  if (enrichment.annotatedText && enrichment.annotatedText !== enrichment.originalText) {
    lines.push(`Annotated: ${enrichment.annotatedText}`);
  }

  if (enrichment.semanticTags.length) {
    const tags = enrichment.semanticTags
      .slice(0, 6)
      .map((t) => {
        const phrase = t.phrase ?? t.tag ?? "";
        const meaning = t.meaning ? ` (${t.meaning})` : "";
        return phrase ? `${phrase}${meaning}` : null;
      })
      .filter(Boolean)
      .join("; ");
    if (tags) lines.push(`Semantic cues: ${tags}`);
  }

  if (enrichment.sentiment) {
    const { sentiment, confidence, reasoning } = enrichment.sentiment;
    lines.push(
      `Buyer sentiment: **${sentiment}** (confidence ${Math.round(confidence * 100)}%).`,
    );
    if (reasoning) lines.push(`Tone note: ${reasoning}`);
    if (sentiment === "negative") {
      lines.push(
        "They may be frustrated — acknowledge warmly in one short line before solving. Do not be defensive.",
      );
    }
  }

  return `\n\n${lines.join("\n")}`;
}
