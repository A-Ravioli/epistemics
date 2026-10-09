/**
 * PDF parsing with pdf.js: per-page text with simple line reconstruction and
 * the document outline mapped to page numbers.
 *
 * Browser: call `configurePdfWorker(url)` once with the URL of
 * `pdfjs-dist/build/pdf.worker.mjs` (Vite: `new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url)`).
 * Node (tests): the legacy build is used and pdf.js runs its "fake worker" on the main thread.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api.js';
import { PAGE_BREAK, type ParsedDoc, type ParsedPage, type ParsedSection } from './types.js';
import { basenameNoExt, isBrowser, normalizeText, sha256Bytes } from './util.js';

type PdfJsModule = typeof import('pdfjs-dist');

let workerSrc: string | undefined;
let pdfjsPromise: Promise<PdfJsModule> | undefined;

/** Browser only: set the URL of the pdf.js worker script before the first `parsePdf` call. */
export function configurePdfWorker(src: string): void {
  workerSrc = src;
  pdfjsPromise = undefined;
}

async function loadPdfJs(): Promise<PdfJsModule> {
  pdfjsPromise ??= (async () => {
    const mod: PdfJsModule = isBrowser()
      ? await import('pdfjs-dist')
      : ((await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsModule);
    if (isBrowser()) {
      if (!workerSrc) {
        throw new Error('parsePdf: call configurePdfWorker(workerUrl) before parsing PDFs in the browser.');
      }
      mod.GlobalWorkerOptions.workerSrc = workerSrc;
    }
    return mod;
  })();
  return pdfjsPromise;
}

export interface PdfOptions {
  /** Title fallback (usually the file name). */
  title?: string;
  signal?: AbortSignal;
}

export interface PdfOutlineEntry {
  title: string;
  depth: number;
  /** 1-based page, when the destination resolved. */
  page?: number;
}

export interface PdfParseResult extends ParsedDoc {
  kind: 'pdf';
  pages: ParsedPage[];
  outline: PdfOutlineEntry[];
  pageCount: number;
}

export async function parsePdf(bytes: Uint8Array, opts: PdfOptions = {}): Promise<PdfParseResult> {
  const pdfjs = await loadPdfJs();
  const hash = await sha256Bytes(bytes);
  // pdf.js transfers the buffer to the worker; pass a copy so the caller keeps its bytes.
  const task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true });
  const abort = () => void task.destroy();
  opts.signal?.addEventListener('abort', abort, { once: true });
  try {
    const doc = await task.promise;
    const pages: ParsedPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      if (opts.signal?.aborted) throw new Error('parsePdf: aborted');
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push({ n, text: reconstructLines(content.items as (TextItem | { type?: string })[]) });
      page.cleanup();
    }
    const outline = await readOutline(doc);
    const meta = await doc.getMetadata().catch(() => null);
    const infoTitle = (meta?.info as { Title?: unknown } | undefined)?.Title;
    const title =
      (typeof infoTitle === 'string' && infoTitle.trim()) || (opts.title ? basenameNoExt(opts.title) : '') || 'Untitled PDF';
    return {
      title,
      kind: 'pdf',
      pages,
      sections: outlineToSections(outline, pages),
      outline,
      pageCount: doc.numPages,
      hash,
    };
  } finally {
    opts.signal?.removeEventListener('abort', abort);
    await task.destroy().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Text reconstruction
// ---------------------------------------------------------------------------

/**
 * Join pdf.js text items into lines and paragraphs using their positions:
 * a new baseline starts a new line; a vertical gap larger than ~1.5 line
 * heights starts a new paragraph; a horizontal gap inserts a space.
 */
export function reconstructLines(items: (TextItem | { type?: string })[]): string {
  const out: string[] = [];
  let line = '';
  let lastY: number | null = null;
  let lastEndX = 0;
  let lastH = 0;
  const pushLine = () => {
    if (line.trim()) out.push(line.replace(/\s+/g, ' ').trim());
    line = '';
  };
  for (const raw of items) {
    if (!('str' in raw)) continue;
    const it = raw;
    const x = Number(it.transform[4] ?? 0);
    const y = Number(it.transform[5] ?? 0);
    const h = it.height || lastH || 10;
    if (lastY !== null && Math.abs(y - lastY) > h * 0.5) {
      pushLine();
      if (y < lastY - Math.max(h, lastH) * 1.6) out.push('');
    } else if (line && it.str && lastEndX > 0 && x - lastEndX > h * 0.2 && !/\s$/.test(line)) {
      line += ' ';
    }
    line += it.str;
    if (it.str) {
      lastY = y;
      lastEndX = x + (it.width || 0);
      lastH = h || lastH;
    }
    if (it.hasEOL) {
      pushLine();
      lastEndX = 0;
    }
  }
  pushLine();
  return normalizeText(out.join('\n'));
}

// ---------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------

type OutlineNode = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number];

async function readOutline(doc: PDFDocumentProxy): Promise<PdfOutlineEntry[]> {
  let nodes: OutlineNode[] | null = null;
  try {
    nodes = await doc.getOutline();
  } catch {
    return [];
  }
  if (!nodes?.length) return [];
  const entries: PdfOutlineEntry[] = [];
  const visit = async (list: OutlineNode[], depth: number): Promise<void> => {
    for (const node of list) {
      const title = String(node.title ?? '').replace(/\s+/g, ' ').trim();
      const page = await resolveDestPage(doc, node.dest);
      entries.push(page === undefined ? { title, depth } : { title, depth, page });
      if (Array.isArray(node.items) && node.items.length) await visit(node.items as OutlineNode[], depth + 1);
    }
  };
  await visit(nodes, 0);
  return entries;
}

async function resolveDestPage(doc: PDFDocumentProxy, dest: string | unknown[] | null): Promise<number | undefined> {
  try {
    let arr: unknown[] | null = null;
    if (typeof dest === 'string') arr = await doc.getDestination(dest);
    else if (Array.isArray(dest)) arr = dest;
    const ref = arr?.[0];
    if (ref && typeof ref === 'object' && 'num' in ref) {
      const idx = await doc.getPageIndex(ref as { num: number; gen: number });
      return idx + 1;
    }
    if (typeof ref === 'number') return ref + 1;
  } catch {
    /* unresolvable destination */
  }
  return undefined;
}

/**
 * Turn outline entries into sections that cover page ranges. Each entry with a
 * resolved page owns pages up to (not including) the next resolved entry's page;
 * entries starting on the same page each include it. Pages before the first
 * entry become a front-matter section. Without an outline the whole document is
 * one section.
 */
export function outlineToSections(outline: PdfOutlineEntry[], pages: ParsedPage[]): ParsedSection[] {
  const total = pages.length;
  const joinPages = (from: number, to: number): string =>
    pages
      .slice(from - 1, to)
      .map((p) => p.text)
      .join(`\n${PAGE_BREAK}\n`);
  const resolved: { title: string; depth: number; page: number }[] = [];
  const stack: string[] = [];
  const paths: string[][] = [];
  for (const e of outline) {
    stack.length = Math.min(stack.length, e.depth);
    stack[e.depth] = e.title;
    if (e.page === undefined || e.page < 1 || e.page > total) continue;
    const prev = resolved[resolved.length - 1];
    if (prev && e.page < prev.page) continue; // out-of-order destinations are ignored
    resolved.push({ title: e.title, depth: e.depth, page: e.page });
    paths.push(stack.slice(0, e.depth + 1).map((t) => t ?? ''));
  }
  if (!resolved.length) {
    return total ? [{ headingPath: [], text: joinPages(1, total), pageStart: 1, pageEnd: total }] : [];
  }
  const sections: ParsedSection[] = [];
  const first = resolved[0]!;
  if (first.page > 1) {
    sections.push({ headingPath: [], text: joinPages(1, first.page - 1), pageStart: 1, pageEnd: first.page - 1 });
  }
  for (let i = 0; i < resolved.length; i++) {
    const cur = resolved[i]!;
    const next = resolved[i + 1];
    const end = next ? (next.page > cur.page ? next.page - 1 : cur.page) : total;
    sections.push({ headingPath: paths[i]!, text: joinPages(cur.page, end), pageStart: cur.page, pageEnd: end });
  }
  return sections;
}
