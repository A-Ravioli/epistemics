import { describe, expect, it } from 'vitest';
import { detectKind, ingest } from '../src/index.js';
import { sampleEpub, samplePdf, sampleDocx } from './helpers.js';

describe('ingest', () => {
  it('dispatches by extension and mime', () => {
    expect(detectKind({ name: 'a.PDF' })).toBe('pdf');
    expect(detectKind({ name: 'a.markdown' })).toBe('md');
    expect(detectKind({ name: 'noext', mime: 'application/epub+zip' })).toBe('epub');
    expect(detectKind({ name: 'noext', mime: 'text/plain; charset=utf-8' })).toBe('txt');
    expect(detectKind({ name: 'a.bin' })).toBeUndefined();
  });

  it('produces a SourceDoc, ParsedDoc and chunks for each format', async () => {
    const md = await ingest({ name: 'notes.md', bytes: new TextEncoder().encode('# Title\n\nHello world.') });
    expect(md.source).toMatchObject({ title: 'Title', kind: 'md' });
    expect(md.chunks).toHaveLength(1);
    expect(md.chunks[0]!.sourceId).toBe(md.source.id);
    expect(md.source.id).toMatch(/^[0-9a-f-]{36}$/);

    const pdf = await ingest({ name: 'sample.pdf', bytes: samplePdf() });
    expect(pdf.source).toMatchObject({ kind: 'pdf', pageCount: 2 });
    expect(pdf.chunks.length).toBeGreaterThan(0);

    const epub = await ingest({ name: 'book.epub', bytes: sampleEpub() });
    expect(epub.source.kind).toBe('epub');
    expect(epub.chunks[0]!.headingPath[0]).toBe('Part I: Foundations');

    const docx = await ingest({ name: 'doc.docx', bytes: sampleDocx() });
    expect(docx.source).toMatchObject({ kind: 'docx', title: 'Bayes Rule' });

    await expect(ingest({ name: 'x.bin', bytes: new Uint8Array() })).rejects.toThrow(/unsupported/);
  });

  it('same bytes give the same ids', async () => {
    const a = await ingest({ name: 'a.txt', bytes: new TextEncoder().encode('same content') });
    const b = await ingest({ name: 'b.txt', bytes: new TextEncoder().encode('same content') });
    expect(a.source.id).toBe(b.source.id);
    expect(a.chunks[0]!.id).toBe(b.chunks[0]!.id);
  });
});
