/**
 * Structure-aware chunking.
 *
 * 1. Sections (heading boundaries) are the primary split. Tiny sections are
 *    merged forward into the next section so that a chapter heading with one
 *    introductory sentence does not become its own chunk.
 * 2. Within a section, paragraphs are packed to `targetTokens`; a paragraph
 *    larger than the target is split at sentence boundaries.
 * 3. Consecutive chunks overlap by roughly `overlapTokens` (trailing sentences
 *    of the previous chunk are prepended to the next).
 * 4. A trailing chunk under `minTokens` is folded into its predecessor.
 *
 * Token counts are estimated as ceil(chars / 4).
 */
import { sha256, stableId } from '@epistemics/core';
import type { Chunk } from '@epistemics/core';
import type { ParsedDoc, ParsedSection } from './types.js';
import { estimateTokens } from './util.js';

export interface ChunkOptions {
  targetTokens?: number;
  overlapTokens?: number;
  minTokens?: number;
  /** Chunk.sourceId; defaults to stableId('source', doc.hash). */
  sourceId?: string;
}

interface Para { text: string; page?: number }
interface Draft { headingPath: string[]; paras: Para[]; overlap: string }

export async function chunkDocument(doc: ParsedDoc, opts: ChunkOptions = {}): Promise<Chunk[]> {
  const targetTokens = opts.targetTokens ?? 600;
  const overlapTokens = opts.overlapTokens ?? 80;
  const minTokens = opts.minTokens ?? 200;
  const sourceId = opts.sourceId ?? (await stableId('source', doc.hash));

  const groups = groupSections(doc.sections, minTokens);
  const drafts: Draft[] = [];
  for (const group of groups) {
    const paras = group.paras.flatMap((p) => splitLongParagraph(p, targetTokens));
    const groupDrafts: Draft[] = [];
    let cur: Draft = { headingPath: group.headingPath, paras: [], overlap: '' };
    let curTokens = 0;
    for (const p of paras) {
      const t = estimateTokens(p.text);
      if (cur.paras.length && curTokens + t > targetTokens) {
        groupDrafts.push(cur);
        const overlap = tailText(cur.paras, overlapTokens);
        cur = { headingPath: group.headingPath, paras: [], overlap };
        curTokens = estimateTokens(overlap);
      }
      cur.paras.push(p);
      curTokens += t;
    }
    if (cur.paras.length) groupDrafts.push(cur);
    // Fold a small trailing chunk into its predecessor.
    if (groupDrafts.length >= 2) {
      const last = groupDrafts[groupDrafts.length - 1]!;
      if (estimateTokens(ownText(last)) < minTokens) {
        groupDrafts.pop();
        groupDrafts[groupDrafts.length - 1]!.paras.push(...last.paras);
      }
    }
    drafts.push(...groupDrafts);
  }

  const chunks: Chunk[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i]!;
    const text = d.overlap ? `${d.overlap}\n\n${ownText(d)}` : ownText(d);
    const pages = d.paras.map((p) => p.page).filter((p): p is number => typeof p === 'number');
    const chunk: Chunk = {
      id: await stableId(doc.hash, String(i)),
      sourceId,
      ordinal: i,
      headingPath: d.headingPath.slice(),
      text,
      tokenCount: estimateTokens(text),
      hash: await sha256(text),
    };
    if (pages.length) {
      chunk.pageStart = Math.min(...pages);
      chunk.pageEnd = Math.max(...pages);
    }
    chunks.push(chunk);
  }
  return chunks;
}

/** Expand a section into paragraphs, tracking page numbers via form-feed markers. */
function sectionParas(s: ParsedSection): Para[] {
  const out: Para[] = [];
  let page = s.pageStart;
  for (const raw of s.text.split('\n')) {
    // A line consisting solely of form feeds advances the page counter.
    const feeds = (raw.match(/\f/g) ?? []).length;
    if (feeds && raw.replace(/\f/g, '').trim() === '') {
      if (typeof page === 'number') page += feeds;
      out.push({ text: '\u0000' });
      continue;
    }
    out.push({ text: raw, ...(typeof page === 'number' ? { page } : {}) });
  }
  // Re-join lines into paragraphs while keeping page of the first line of each paragraph.
  const paras: Para[] = [];
  let buf: string[] = [];
  let bufPage: number | undefined;
  const flush = () => {
    const text = buf.join('\n').trim();
    if (text) paras.push(bufPage === undefined ? { text } : { text, page: bufPage });
    buf = [];
    bufPage = undefined;
  };
  for (const l of out) {
    if (l.text === '\u0000' || l.text.trim() === '') {
      flush();
      continue;
    }
    if (!buf.length) bufPage = l.page;
    buf.push(l.text);
  }
  flush();
  return paras;
}

interface Group { headingPath: string[]; paras: Para[] }

/** Merge sections smaller than `minTokens` into the following section (heading kept as a line). */
function groupSections(sections: ParsedSection[], minTokens: number): Group[] {
  const groups: Group[] = [];
  let pending: Group | null = null;
  for (const s of sections) {
    const paras = sectionParas(s);
    if (!paras.length) continue;
    const tokens = paras.reduce((n, p) => n + estimateTokens(p.text), 0);
    if (pending) {
      const heading = s.headingPath[s.headingPath.length - 1];
      if (heading) {
        const first = paras[0]!;
        pending.paras.push(first.page === undefined ? { text: `## ${heading}` } : { text: `## ${heading}`, page: first.page });
      }
      pending.paras.push(...paras);
      const total = pending.paras.reduce((n, p) => n + estimateTokens(p.text), 0);
      if (total >= minTokens) {
        groups.push(pending);
        pending = null;
      }
      continue;
    }
    if (tokens < minTokens) {
      pending = { headingPath: s.headingPath.slice(), paras };
      continue;
    }
    groups.push({ headingPath: s.headingPath.slice(), paras });
  }
  if (pending) {
    // Trailing small group: append to the previous group if it exists, else keep it.
    const prev = groups[groups.length - 1];
    if (prev) prev.paras.push(...pending.paras);
    else groups.push(pending);
  }
  return groups;
}

function splitLongParagraph(p: Para, targetTokens: number): Para[] {
  if (estimateTokens(p.text) <= targetTokens) return [p];
  const sentences = splitSentences(p.text);
  const out: Para[] = [];
  let buf = '';
  const push = (t: string) => {
    if (t.trim()) out.push(p.page === undefined ? { text: t.trim() } : { text: t.trim(), page: p.page });
  };
  for (const s of sentences) {
    if (estimateTokens(s) > targetTokens) {
      push(buf);
      buf = '';
      const step = targetTokens * 4;
      for (let i = 0; i < s.length; i += step) push(s.slice(i, i + step));
      continue;
    }
    if (buf && estimateTokens(buf + ' ' + s) > targetTokens) {
      push(buf);
      buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  push(buf);
  return out;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+(?=[^a-z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function ownText(d: Draft): string {
  return d.paras.map((p) => p.text).join('\n\n');
}

/** Trailing sentences of the given paragraphs totalling at most `tokens` (may be empty). */
function tailText(paras: Para[], tokens: number): string {
  if (tokens <= 0) return '';
  const sentences = paras.flatMap((p) => splitSentences(p.text));
  const picked: string[] = [];
  let n = 0;
  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i]!;
    const t = estimateTokens(s);
    if (n + t > tokens) break;
    picked.unshift(s);
    n += t;
  }
  return picked.join(' ');
}
