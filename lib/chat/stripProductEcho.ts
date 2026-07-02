/** Markdown image or link to a Kapruka/static product asset. */
const PRODUCT_MARKDOWN =
  /!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\(\s*https?:\/\/[^)]*(?:kapruka|partnercentral)[^)]*\)/i;

/** Bare product CDN URLs the model sometimes pastes on their own line. */
const PRODUCT_URL_LINE =
  /^\s*https?:\/\/[^\s]*(?:kapruka|partnercentral)[^\s]*\s*$/i;

function containsProductMarkdown(line: string): boolean {
  return PRODUCT_MARKDOWN.test(line);
}

/**
 * When searchGifts / getGiftDetails renders product cards, the model should not
 * echo them in text — but it often pastes markdown images, links, or lists.
 * Strip those so the carousel is the product surface and text stays a short steer.
 */
export function stripProductEcho(text: string): string {
  let trimmed = text.trim();
  if (!trimmed) return trimmed;

  // Drop inline markdown images/links anywhere in the string.
  trimmed = trimmed.replace(
    /!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\(\s*https?:\/\/[^)]*(?:kapruka|partnercentral)[^)]*\)/gi,
    "",
  ).trim();

  const lines = trimmed.split("\n");
  const kept = lines.filter((line) => {
    const t = line.trim();
    if (!t) return false;
    if (PRODUCT_URL_LINE.test(t)) return false;
    if (containsProductMarkdown(t)) return false;
    if (/^\s*\d+[\.)]\s+\S/.test(t)) return false;
    if (/^\s*[-*•]\s+\S/.test(t)) return false;
    // Line is only a markdown link left after partial strip.
    if (/^\s*\[[^\]]+\]\([^)]+\)\s*$/.test(t)) return false;
    return true;
  });

  let result = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  result = result
    .replace(
      /^(?:here(?:'s| are)|i(?:'ve| have) put|these are|some (?:lovely|great|nice) picks)[^.!?\n]*[.:]\s*/i,
      "",
    )
    .trim();

  if (!result) return "";

  const removedMostLines = kept.length < lines.length * 0.6;
  const hadProductMarkdown =
    /!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\(\s*https?:\/\/[^)]*(?:kapruka|partnercentral)[^)]*\)/i.test(text);

  if (removedMostLines || hadProductMarkdown) {
    const sentences = result.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length > 2) {
      return sentences.slice(0, 2).join(" ").trim();
    }
  }

  return result;
}
