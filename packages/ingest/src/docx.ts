/// <reference path="./ambient.d.ts" />
/**
 * DOCX parsing via mammoth: convertToHtml → blocks → markdown-ish text with
 * `#` headings → sections. The browser bundle (`mammoth/mammoth.browser`) is
 * picked with a dynamic import when running in a browser/webview.
 */
import { blocksToMarkdown, htmlToBlocks } from './html.js';
import { markdownToSections } from './markdown.js';
import type { ParsedDoc } from './types.js';
import { basenameNoExt, isBrowser, sha256Bytes } from './util.js';

export interface DocxOptions {
  title?: string;
  forceFallbackHtml?: boolean;
}

interface MammothLike {
  convertToHtml(input: { arrayBuffer?: ArrayBuffer; buffer?: Uint8Array }, options?: Record<string, unknown>): Promise<{ value: string }>;
}

let mammothPromise: Promise<MammothLike> | undefined;

async function loadMammoth(): Promise<MammothLike> {
  mammothPromise ??= (async () => {
    const mod: unknown = isBrowser() ? await import('mammoth/mammoth.browser') : await import('mammoth');
    const m = mod as { default?: MammothLike } & Partial<MammothLike>;
    const impl = typeof m.convertToHtml === 'function' ? (m as MammothLike) : m.default;
    if (!impl || typeof impl.convertToHtml !== 'function') throw new Error('parseDocx: could not load mammoth');
    return impl;
  })();
  return mammothPromise;
}

export interface DocxParseResult extends ParsedDoc {
  kind: 'docx';
  /** Markdown-ish rendering with headings as `#` lines. */
  markdown: string;
}

export async function parseDocx(bytes: Uint8Array, opts: DocxOptions = {}): Promise<DocxParseResult> {
  const hash = await sha256Bytes(bytes);
  const mammoth = await loadMammoth();
  const copy = bytes.slice();
  const input = isBrowser() ? { arrayBuffer: copy.buffer as ArrayBuffer } : { buffer: copy };
  const { value: html } = await mammoth.convertToHtml(input, { ignoreEmptyParagraphs: true });
  const blocks = htmlToBlocks(html, opts.forceFallbackHtml ? { forceFallback: true } : {});
  const markdown = blocksToMarkdown(blocks);
  const { sections, firstH1 } = markdownToSections(markdown);
  return {
    title: firstH1 ?? ((opts.title && basenameNoExt(opts.title)) || 'Untitled document'),
    kind: 'docx',
    sections: sections.length ? sections : [{ headingPath: [], text: '' }],
    hash,
    markdown,
  };
}
