/** Small text utilities shared by the leak detector, the turn-shape checker and the mock provider. */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'so', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'as', 'from',
  'into', 'over', 'under', 'than', 'that', 'this', 'these', 'those', 'it', 'its', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'am', 'do', 'does', 'did', 'has', 'have', 'had', 'not', 'no', 'yes', 'can', 'could', 'would', 'should', 'will',
  'shall', 'may', 'might', 'must', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
  'his', 'our', 'their', 'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'any', 'each', 'some',
  'more', 'most', 'such', 'only', 'own', 'very', 'just', 'also', 'there', 'here', 'because', 'about',
  'up', 'down', 'out', 'off', 'again', 'between', 'through', 'while', 'after', 'before', 'per',
]);

/** Lowercase, strip diacritics and punctuation, collapse whitespace. */
export function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')    // keep decimal points, drop sentence periods
    .replace(/(?<!\w)-|-(?!\w)/g, ' ')      // keep hyphenated words, drop dashes
    .replace(/\s+/g, ' ')
    .trim();
}

export function words(text: string): string[] {
  const n = normalise(text);
  return n ? n.split(' ') : [];
}

/** Very light stemming so "events"/"event", "changes"/"change" compare equal. */
export function stem(w: string): string {
  if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

export function contentWords(text: string): string[] {
  return words(text).filter((w) => !STOPWORDS.has(w) && w.length > 1).map(stem);
}

export function isStopword(w: string): boolean {
  return STOPWORDS.has(w);
}

/** Remove fenced and inline code (so question marks inside code are not counted as questions). */
export function stripCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
}

/** Count of whitespace-separated tokens; code blocks are excluded. */
export function wordCount(text: string): number {
  const t = stripCode(text).trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Split text into deltas that preserve the original whitespace when re-joined. */
export function splitDeltas(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

/** Number of shared distinct content words between two texts. */
export function sharedContentWords(a: string, b: string): number {
  const bs = new Set(contentWords(b));
  let n = 0;
  for (const w of new Set(contentWords(a))) if (bs.has(w)) n++;
  return n;
}
