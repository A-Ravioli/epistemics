import { describe, expect, it } from 'vitest';
import { chunkDocument, estimateTokens, type ParsedDoc } from '../src/index.js';

const sentence = (i: number) => `Sentence number ${i} talks about a specific idea in some detail so it has length.`;
const paragraph = (p: number, n = 4) => Array.from({ length: n }, (_, i) => sentence(p * 100 + i)).join(' ');
const body = (paras: number) => Array.from({ length: paras }, (_, p) => paragraph(p)).join('\n\n');

const doc: ParsedDoc = {
  title: 'T',
  kind: 'md',
  hash: 'abc123',
  sections: [
    { headingPath: ['Ch 1'], text: 'A one-line chapter intro.' },
    { headingPath: ['Ch 1', 'Sec 1.1'], text: body(12) },
    { headingPath: ['Ch 1', 'Sec 1.2'], text: body(3) },
    { headingPath: ['Ch 2'], text: body(2) },
  ],
};

describe('chunkDocument', () => {
  it('splits at headings, packs paragraphs to the target size and overlaps consecutive chunks', async () => {
    const chunks = await chunkDocument(doc, { targetTokens: 150, overlapTokens: 30, minTokens: 40 });
    expect(chunks.length).toBeGreaterThan(3);
    // Tiny chapter intro merged forward into the first section chunk, heading retained as a line.
    expect(chunks[0]!.headingPath).toEqual(['Ch 1']);
    expect(chunks[0]!.text).toContain('A one-line chapter intro.');
    expect(chunks[0]!.text).toContain('## Sec 1.1');
    // Ordinals and ids are sequential and deterministic.
    chunks.forEach((c, i) => expect(c.ordinal).toBe(i));
    const again = await chunkDocument(doc, { targetTokens: 150, overlapTokens: 30, minTokens: 40 });
    expect(again.map((c) => c.id)).toEqual(chunks.map((c) => c.id));
    expect(new Set(chunks.map((c) => c.id)).size).toBe(chunks.length);
    // Size bound: own text <= target (+ overlap prefix), except a folded trailing chunk.
    for (const c of chunks) expect(c.tokenCount).toBeLessThanOrEqual(150 + 30 + 40);
    expect(chunks.every((c) => c.tokenCount === estimateTokens(c.text))).toBe(true);
    // Overlap: the second chunk of the long section starts with the tail of the first.
    const sec = chunks.filter((c) => c.headingPath.join('/') === 'Ch 1' || c.headingPath.join('/') === 'Ch 1/Sec 1.1');
    expect(sec.length).toBeGreaterThan(2);
    const tail = sec[0]!.text.split(' ').slice(-6).join(' ');
    expect(sec[1]!.text.startsWith(sec[1]!.text.split('\n\n')[0]!)).toBe(true);
    expect(sec[1]!.text).toContain(tail);
    // Last sections keep their own heading paths.
    expect(chunks.at(-1)!.headingPath).toEqual(['Ch 2']);
    expect(chunks.some((c) => c.headingPath.join('/') === 'Ch 1/Sec 1.2')).toBe(true);
  });

  it('tracks page numbers through form-feed markers', async () => {
    const paged: ParsedDoc = {
      title: 'P', kind: 'pdf', hash: 'h',
      sections: [{ headingPath: ['A'], text: `${paragraph(1)}\n\f\n${paragraph(2)}\n\f\n${paragraph(3)}`, pageStart: 5, pageEnd: 7 }],
    };
    const chunks = await chunkDocument(paged, { targetTokens: 80, overlapTokens: 0, minTokens: 10 });
    expect(chunks.map((c) => [c.pageStart, c.pageEnd])).toEqual([[5, 5], [6, 6], [7, 7]]);
    expect(chunks[0]!.text).not.toContain('\f');
  });

  it('splits an oversized paragraph at sentence boundaries', async () => {
    const big: ParsedDoc = { title: 'B', kind: 'txt', hash: 'x', sections: [{ headingPath: [], text: paragraph(9, 40) }] };
    const chunks = await chunkDocument(big, { targetTokens: 100, overlapTokens: 0, minTokens: 20 });
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.tokenCount).toBeLessThanOrEqual(120);
    expect(chunks[1]!.text).toMatch(/^Sentence number/);
  });
});
