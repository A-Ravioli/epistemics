/**
 * Parsed-document model shared by every ingest parser.
 *
 * A `ParsedDoc` is the structure-preserving intermediate between a raw file and
 * the flat `Chunk[]` that the Architect and the retriever consume.
 */
import type { SourceDoc } from '@epistemics/core';

export type DocKind = SourceDoc['kind'];

export interface ParsedPage {
  /** 1-based page number. */
  n: number;
  text: string;
}

export interface ParsedSection {
  /** Heading ancestry, outermost first. Empty for front matter / untitled preamble. */
  headingPath: string[];
  /**
   * Section body. Paragraphs are separated by blank lines. For paged sources a
   * form feed (`\f`) on its own line marks a page boundary: the page number
   * starts at `pageStart` and increments after every form feed.
   */
  text: string;
  pageStart?: number;
  pageEnd?: number;
}

export interface ParsedDoc {
  title: string;
  kind: DocKind;
  /** Original per-page text, kept for citation display. Only for paged formats. */
  pages?: ParsedPage[];
  sections: ParsedSection[];
  /** sha256 (hex) of the source bytes (or of the text for md/txt). */
  hash: string;
}

/** Page-boundary marker used inside `ParsedSection.text`. */
export const PAGE_BREAK = '\f';
