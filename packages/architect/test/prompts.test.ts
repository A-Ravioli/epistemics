import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ARCHITECT_PROMPTS, ARCHITECT_PROMPT_VERSION, ARCHITECT_STAGES } from '../src/index.js';

const REQUIRED: Record<string, string[]> = {
  outline: ['assumedReferences', 'chunkIds', 'never invent'],
  concepts: ['ONE phase', 'split', 'Bloom', '2-3 varied', 'domain', 'remedy', 'VERBATIM', 'Never invent'],
  graph: ['justification', 'confidence', 'never above 0.5', 'acyclic'],
  scripts: ['pretest', 'isomorph', '3-6 questions', 'probesMisconception', 'faded', 'transfer', 'three hint levels', 'partial worked example', 'ever states the answer'],
  items: ['6-10 items', '3-6 binary criteria', 'reference', 'discriminate', 'VERBATIM'],
  itemcheck: ['reference answers are withheld', 'ambiguous', 'rubric'],
};

describe('architect prompts', () => {
  for (const stage of ARCHITECT_STAGES) {
    it(`${stage}: TS module matches content/prompts/architect-${stage}.md`, () => {
      const md = readFileSync(fileURLToPath(new URL(`../../../content/prompts/architect-${stage}.md`, import.meta.url)), 'utf8');
      const m = /^<!--\s*version:\s*([\w.-]+)\s*-->\r?\n/.exec(md);
      expect(m?.[1]).toBe(ARCHITECT_PROMPT_VERSION);
      expect(md.slice(m![0].length).replace(/\r\n/g, '\n').trimEnd()).toBe(ARCHITECT_PROMPTS[stage]);
      for (const phrase of REQUIRED[stage]!) expect(ARCHITECT_PROMPTS[stage]).toContain(phrase);
      expect(ARCHITECT_PROMPTS[stage].startsWith('# Architect: ')).toBe(true);
    });
  }
});
