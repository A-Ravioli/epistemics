/**
 * @epistemics/ingest: documents → ParsedDoc → Chunk[] (browser and Node).
 */
import { stableId } from '@epistemics/core';
import type { Chunk, SourceDoc } from '@epistemics/core';
import { chunkDocument, type ChunkOptions } from './chunk.js';
import { parseDocx } from './docx.js';
import { parseEpub } from './epub.js';
import { parseMarkdown, parseText } from './markdown.js';
import { parsePdf } from './pdf.js';
import type { DocKind, ParsedDoc } from './types.js';
import { basenameNoExt, extensionOf } from './util.js';

export * from './types.js';
export * from './chunk.js';
export * from './embed.js';
export * from './markdown.js';
export { parsePdf, configurePdfWorker, reconstructLines, outlineToSections } from './pdf.js';
export type { PdfOptions, PdfOutlineEntry, PdfParseResult } from './pdf.js';
export { parseEpub, parseNcx, parseNavDoc } from './epub.js';
export type { EpubOptions, EpubParseResult, EpubTocEntry } from './epub.js';
export { parseDocx } from './docx.js';
export type { DocxOptions, DocxParseResult } from './docx.js';
export { htmlToBlocks, blocksToSections, blocksToMarkdown } from './html.js';
export type { HtmlBlock } from './html.js';
export { sha256Bytes, estimateTokens, normalizeText } from './util.js';

export interface IngestFile {
  name: string;
  bytes: Uint8Array;
  mime?: string;
}

export interface IngestResult {
  source: SourceDoc;
  doc: ParsedDoc;
  chunks: Chunk[];
}

export interface IngestOptions extends ChunkOptions {
  /** Override the format detected from extension/mime. */
  kind?: DocKind;
  signal?: AbortSignal;
}

const MIME_KINDS: Record<string, DocKind> = {
  'application/pdf': 'pdf',
  'application/epub+zip': 'epub',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/markdown': 'md',
  'text/x-markdown': 'md',
  'text/plain': 'txt',
};
const EXT_KINDS: Record<string, DocKind> = {
  pdf: 'pdf', epub: 'epub', docx: 'docx', md: 'md', markdown: 'md', mdx: 'md', txt: 'txt', text: 'txt',
};

export function detectKind(file: { name: string; mime?: string }): DocKind | undefined {
  const byExt = EXT_KINDS[extensionOf(file.name)];
  if (byExt) return byExt;
  if (file.mime) {
    const mime = file.mime.split(';')[0]!.trim().toLowerCase();
    if (MIME_KINDS[mime]) return MIME_KINDS[mime];
  }
  return undefined;
}

export async function parseFile(file: IngestFile, opts: { kind?: DocKind; signal?: AbortSignal } = {}): Promise<ParsedDoc> {
  const kind = opts.kind ?? detectKind(file);
  const title = basenameNoExt(file.name);
  switch (kind) {
    case 'pdf':
      return parsePdf(file.bytes, opts.signal ? { title: file.name, signal: opts.signal } : { title: file.name });
    case 'epub':
      return parseEpub(file.bytes, { title: file.name });
    case 'docx':
      return parseDocx(file.bytes, { title: file.name });
    case 'md':
      return parseMarkdown(new TextDecoder().decode(file.bytes), { title });
    case 'txt':
    case 'syllabus':
      return parseText(new TextDecoder().decode(file.bytes), { title });
    default:
      throw new Error(`ingest: unsupported file type for "${file.name}"${file.mime ? ` (${file.mime})` : ''}`);
  }
}

/** Parse a file and chunk it. `source.id` is stableId('source', doc.hash), so the same bytes always yield the same ids. */
export async function ingest(file: IngestFile, opts: IngestOptions = {}): Promise<IngestResult> {
  const { kind, signal, ...chunkOpts } = opts;
  const doc = await parseFile(file, { ...(kind ? { kind } : {}), ...(signal ? { signal } : {}) });
  const sourceId = chunkOpts.sourceId ?? (await stableId('source', doc.hash));
  const chunks = await chunkDocument(doc, { ...chunkOpts, sourceId });
  const source: SourceDoc = { id: sourceId, title: doc.title, kind: doc.kind, hash: doc.hash };
  if (doc.pages) source.pageCount = doc.pages.length;
  return { source, doc, chunks };
}
