import { describe, expect, it } from 'vitest';
import { parseMarkdown, parseText, htmlToBlocks, blocksToSections } from '../src/index.js';

const MD = `# Linear Algebra

Intro paragraph.

## Vectors

A vector is an ordered list of numbers.

\`\`\`
# not a heading
\`\`\`

### Norms

The norm measures length.

## Matrices

A matrix is a rectangular array.
`;

describe('parseMarkdown', () => {
  it('builds a heading tree into sections with heading paths', async () => {
    const doc = await parseMarkdown(MD);
    expect(doc.title).toBe('Linear Algebra');
    expect(doc.kind).toBe('md');
    expect(doc.sections.map((s) => s.headingPath)).toEqual([
      ['Linear Algebra'],
      ['Linear Algebra', 'Vectors'],
      ['Linear Algebra', 'Vectors', 'Norms'],
      ['Linear Algebra', 'Matrices'],
    ]);
    expect(doc.sections[1]!.text).toContain('# not a heading');
    expect(doc.sections[3]!.text).toBe('A matrix is a rectangular array.');
  });

  it('keeps preamble before the first heading and handles no headings', async () => {
    const doc = await parseMarkdown('Just text.\n\n## Later\n\nMore.', { title: 'notes' });
    expect(doc.title).toBe('notes');
    expect(doc.sections[0]).toEqual({ headingPath: [], text: 'Just text.' });
    const plain = await parseText('a\r\nb\r\n\r\n\r\nc', { title: 't' });
    expect(plain.kind).toBe('txt');
    expect(plain.sections[0]!.text).toBe('a\nb\n\nc');
  });
});

describe('htmlToBlocks (fallback tokenizer)', () => {
  it('extracts headings and paragraphs, drops scripts/styles and decodes entities', () => {
    const blocks = htmlToBlocks(
      '<html><head><style>p{}</style><script>x<y</script></head><body><h1>T&amp;C</h1><p>Hello <b>bold</b> world&#33;</p><div>Second<br/>line</div></body></html>',
      { forceFallback: true },
    );
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'T&C' },
      { kind: 'para', text: 'Hello bold world!' },
      { kind: 'para', text: 'Second' },
      { kind: 'para', text: 'line' },
    ]);
    const sections = blocksToSections(blocks, ['Book']);
    expect(sections).toEqual([{ headingPath: ['Book', 'T&C'], text: 'Hello bold world!\n\nSecond\n\nline' }]);
  });
});
