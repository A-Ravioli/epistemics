/**
 * HTML/XHTML → block list (headings + paragraphs).
 *
 * Uses `DOMParser` when the environment has one (browser, webview); otherwise a
 * small tag-tokenising fallback that is good enough for the XHTML found in EPUBs
 * and the HTML mammoth emits. Both paths produce the same block model.
 */
import { decodeEntities } from './util.js';
import type { ParsedSection } from './types.js';

export type HtmlBlock = { kind: 'heading'; level: number; text: string } | { kind: 'para'; text: string };

const BLOCK_TAGS = new Set([
  'p', 'div', 'li', 'ul', 'ol', 'blockquote', 'pre', 'section', 'article', 'aside', 'header', 'footer', 'nav',
  'table', 'tr', 'td', 'th', 'thead', 'tbody', 'hr', 'br', 'dd', 'dt', 'dl', 'figure', 'figcaption', 'main', 'body',
  'address', 'details', 'summary', 'caption',
]);
const SKIP_TAGS = new Set(['script', 'style', 'head', 'title', 'template', 'noscript', 'svg', 'math']);

export interface HtmlToBlocksOptions {
  /** Force the fallback tokenizer even when DOMParser exists (used by tests). */
  forceFallback?: boolean;
}

export function htmlToBlocks(html: string, opts: HtmlToBlocksOptions = {}): HtmlBlock[] {
  if (!opts.forceFallback && typeof DOMParser !== 'undefined') {
    try {
      return domToBlocks(html);
    } catch {
      /* fall through to the tokenizer */
    }
  }
  return fallbackToBlocks(html);
}

// ---------------------------------------------------------------------------
// DOMParser path
// ---------------------------------------------------------------------------

function domToBlocks(html: string): HtmlBlock[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: HtmlBlock[] = [];
  let buf = '';
  const flush = () => {
    const t = squeeze(buf);
    if (t) blocks.push({ kind: 'para', text: t });
    buf = '';
  };
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      buf += node.nodeValue ?? '';
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    const h = /^h([1-6])$/.exec(tag);
    if (h) {
      flush();
      const text = squeeze(el.textContent ?? '');
      if (text) blocks.push({ kind: 'heading', level: Number(h[1]), text });
      return;
    }
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) flush();
    for (const child of Array.from(el.childNodes)) walk(child);
    if (isBlock) flush();
  };
  walk(doc.body ?? doc.documentElement);
  flush();
  return blocks;
}

// ---------------------------------------------------------------------------
// Fallback tokenizer
// ---------------------------------------------------------------------------

const H_OPEN = '\u0001';
const H_CLOSE = '\u0002';

function fallbackToBlocks(html: string): HtmlBlock[] {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '');
  for (const tag of SKIP_TAGS) {
    s = s.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
  }
  s = s.replace(/<h([1-6])\b[^>]*>/gi, (_m, lvl: string) => `\n${H_OPEN}${lvl}`);
  s = s.replace(/<\/h[1-6]\s*>/gi, `${H_CLOSE}\n`);
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9:-]*)\b[^>]*>/g, (_m, name: string) =>
    BLOCK_TAGS.has(name.toLowerCase()) ? '\n' : '',
  );
  s = decodeEntities(s);
  const blocks: HtmlBlock[] = [];
  for (const raw of s.split('\n')) {
    const line = squeeze(raw);
    if (!line) continue;
    if (line.startsWith(H_OPEN)) {
      const level = Number(line[1]);
      const text = squeeze(line.slice(2).replace(H_CLOSE, ''));
      if (text) blocks.push({ kind: 'heading', level: Number.isFinite(level) && level >= 1 ? level : 1, text });
      continue;
    }
    blocks.push({ kind: 'para', text: line.replace(H_CLOSE, '') });
  }
  return blocks;
}

function squeeze(s: string): string {
  return s.replace(/[\s ]+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Blocks → sections
// ---------------------------------------------------------------------------

/**
 * Fold a block list into sections keyed by heading path. `basePath` is prepended
 * to every heading path (e.g. the EPUB TOC entry for the file). If the first
 * heading repeats the last element of `basePath`, it replaces it rather than
 * duplicating it.
 */
export function blocksToSections(blocks: HtmlBlock[], basePath: string[] = []): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const stack: { level: number; text: string }[] = [];
  let base = basePath.slice();
  let paras: string[] = [];
  let currentPath = base.slice();
  let sawHeading = false;
  const flush = () => {
    if (paras.length) sections.push({ headingPath: currentPath.slice(), text: paras.join('\n\n') });
    paras = [];
  };
  for (const b of blocks) {
    if (b.kind === 'para') {
      paras.push(b.text);
      continue;
    }
    flush();
    if (!sawHeading && base.length && base[base.length - 1]!.toLowerCase() === b.text.toLowerCase()) {
      base = base.slice(0, -1);
    }
    sawHeading = true;
    while (stack.length && stack[stack.length - 1]!.level >= b.level) stack.pop();
    stack.push({ level: b.level, text: b.text });
    currentPath = [...base, ...stack.map((h) => h.text)];
  }
  flush();
  return sections;
}

/** Render blocks as markdown-ish text: headings as `#` lines, paragraphs separated by blank lines. */
export function blocksToMarkdown(blocks: HtmlBlock[]): string {
  return blocks
    .map((b) => (b.kind === 'heading' ? `${'#'.repeat(Math.min(6, b.level))} ${b.text}` : b.text))
    .join('\n\n');
}
