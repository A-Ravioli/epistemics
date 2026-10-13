import { describe, expect, it } from 'vitest';
import { parseEpub } from '../src/index.js';
import { sampleEpub } from './helpers.js';

describe('parseEpub', () => {
  it('reads the OPF, spine and NCX and produces sections with heading paths', async () => {
    const doc = await parseEpub(sampleEpub(), { title: 'tiny.epub' });
    expect(doc.title).toBe('Tiny Probability & Statistics');
    expect(doc.spine).toEqual(['OEBPS/text/ch1.xhtml', 'OEBPS/text/ch2.xhtml']);
    expect(doc.toc.map((t) => t.path)).toEqual([['Part I: Foundations'], ['Part I: Foundations', 'Chapter 1'], ['Chapter 2: Independence']]);
    expect(doc.toc[1]).toMatchObject({ href: 'OEBPS/text/ch1.xhtml', fragment: 'c1' });
    expect(doc.sections.map((s) => s.headingPath)).toEqual([
      ['Part I: Foundations'],
      ['Part I: Foundations', 'Sample spaces'],
      ['Chapter 2: Independence', 'Independence'],
    ]);
    expect(doc.sections[0]!.text).toBe('Probability measures uncertainty & belief.');
    expect(doc.sections[1]!.text).toBe('The sample space is the set of all outcomes.\n\nAn event is a subset of it.');
    expect(doc.sections[2]!.text).toContain('Disjoint is not independent.');
    expect(doc.sections[2]!.text).not.toContain('<');
  });

  it('prefers the EPUB 3 nav document when present', async () => {
    const doc = await parseEpub(sampleEpub({ nav: true }));
    expect(doc.toc.map((t) => t.path)).toEqual([['Part I: Foundations'], ['Part I: Foundations', 'Chapter 1'], ['Chapter 2: Independence']]);
    expect(doc.spine).toEqual(['OEBPS/text/ch1.xhtml', 'OEBPS/text/ch2.xhtml']);
  });

  it('rejects non-EPUB zips', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    await expect(parseEpub(zipSync({ 'a.txt': strToU8('x') }))).rejects.toThrow(/container\.xml/);
  });
});
