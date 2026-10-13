import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePdf, outlineToSections, chunkDocument } from '../src/index.js';
import { samplePdf } from './helpers.js';

describe('parsePdf', () => {
  it('extracts per-page text and maps the outline to pages', async () => {
    const doc = await parsePdf(samplePdf(), { title: 'sample.pdf' });
    expect(doc.kind).toBe('pdf');
    expect(doc.pageCount).toBe(2);
    expect(doc.pages[0]!.text).toContain('Chapter One');
    expect(doc.pages[0]!.text).toContain('Probability is the study of uncertainty.');
    expect(doc.pages[1]!.text).toContain('Independence means the joint equals the product.');
    expect(doc.outline).toEqual([
      { title: 'Chapter One', depth: 0, page: 1 },
      { title: 'Chapter Two', depth: 0, page: 2 },
      { title: 'Independence', depth: 1, page: 2 },
    ]);
    expect(doc.sections.map((s) => s.headingPath)).toEqual([['Chapter One'], ['Chapter Two'], ['Chapter Two', 'Independence']]);
    expect(doc.sections[0]).toMatchObject({ pageStart: 1, pageEnd: 1 });
    expect(doc.sections[1]).toMatchObject({ pageStart: 2, pageEnd: 2 });
    expect(doc.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(doc.title).toBe('sample');
  });

  it('chunks carry page numbers from the sections', async () => {
    const doc = await parsePdf(samplePdf());
    const chunks = await chunkDocument(doc, { targetTokens: 50, minTokens: 5, overlapTokens: 0 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toMatchObject({ pageStart: 1, headingPath: ['Chapter One'] });
    expect(chunks.at(-1)!.pageEnd).toBe(2);
  });

  it('parses a real-world PDF without an outline into one section per document', async () => {
    const bytes = new Uint8Array(readFileSync(fileURLToPath(new URL('./fixtures/theme-showcase.pdf', import.meta.url))));
    const doc = await parsePdf(bytes, { title: 'theme-showcase.pdf' });
    expect(doc.pageCount).toBe(10);
    expect(doc.pages[0]!.text).toContain('Ocean Depths');
    expect(doc.outline).toEqual([]);
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0]).toMatchObject({ pageStart: 1, pageEnd: 10 });
    const chunks = await chunkDocument(doc);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.tokenCount).toBeLessThanOrEqual(600 + 80 + 200);
    expect(chunks[0]!.pageStart).toBe(1);
    expect(chunks.at(-1)!.pageEnd).toBe(10);
  });

  it('outlineToSections gives pre-outline pages a front-matter section and ignores unresolved entries', () => {
    const pages = [1, 2, 3, 4].map((n) => ({ n, text: `page ${n}` }));
    const sections = outlineToSections(
      [{ title: 'Intro', depth: 0 }, { title: 'A', depth: 0, page: 2 }, { title: 'B', depth: 0, page: 4 }],
      pages,
    );
    expect(sections).toEqual([
      { headingPath: [], text: 'page 1', pageStart: 1, pageEnd: 1 },
      { headingPath: ['A'], text: 'page 2\n\f\npage 3', pageStart: 2, pageEnd: 3 },
      { headingPath: ['B'], text: 'page 4', pageStart: 4, pageEnd: 4 },
    ]);
  });
});
