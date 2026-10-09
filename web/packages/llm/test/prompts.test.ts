import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROMPTS, PROMPT_FILES, PROMPT_VERSIONS, promptVersion, type PromptName } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const promptsDir = join(here, '..', '..', '..', 'content', 'prompts');

describe('prompts', () => {
  for (const name of Object.keys(PROMPTS) as PromptName[]) {
    it(`${name}: TS copy matches content/prompts/${PROMPT_FILES[name]}`, () => {
      const md = readFileSync(join(promptsDir, PROMPT_FILES[name]), 'utf8');
      expect(PROMPTS[name]).toBe(md);
    });
    it(`${name}: carries a version header`, () => {
      expect(PROMPT_VERSIONS[name]).toMatch(/^\d+\.\d+$/);
    });
  }

  it('promptVersion parses the header', () => {
    expect(promptVersion('<!-- version: 2.3 -->\n# x')).toBe('2.3');
    expect(promptVersion('no header')).toBe('0.0');
  });

  it('tutor charter states the core rules', () => {
    const c = PROMPTS.tutorCharter.toLowerCase();
    for (const needle of ['one question', 'never', 'hint', 'level 3', 'why', 'cite', 'praise', 'position']) {
      expect(c).toContain(needle);
    }
  });
});
