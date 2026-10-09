import { describe, expect, it } from 'vitest';
import { parseDocx } from '../src/index.js';
import { sampleDocx } from './helpers.js';

describe('parseDocx', () => {
  it('keeps headings as # lines and builds sections', async () => {
    const doc = await parseDocx(sampleDocx(), { title: 'bayes.docx' });
    expect(doc.title).toBe('Bayes Rule');
    expect(doc.markdown).toBe('# Bayes Rule\n\nBayes rule updates a prior with a likelihood.\n\n## Worked example\n\nA test with 99% sensitivity.');
    expect(doc.sections).toEqual([
      { headingPath: ['Bayes Rule'], text: 'Bayes rule updates a prior with a likelihood.' },
      { headingPath: ['Bayes Rule', 'Worked example'], text: 'A test with 99% sensitivity.' },
    ]);
  });
});
