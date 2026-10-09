/**
 * Prompt texts, embedded as TS strings so they load in vitest/node/browser without a raw-import plugin.
 * The human-readable copies live in content/prompts/*.md; test/prompts.test.ts asserts they are identical.
 */
import { TUTOR_CHARTER } from './prompts/tutor-charter.js';
import { OBSERVER_PROMPT } from './prompts/observer.js';
import { GRADER_PROMPT } from './prompts/grader.js';
import { STUDENT_PROMPT } from './prompts/student.js';
import { LEAKCHECK_PROMPT } from './prompts/leakcheck.js';
import { WARMUP_PROMPT } from './prompts/warmup.js';

export const PROMPTS = {
  tutorCharter: TUTOR_CHARTER,
  observer: OBSERVER_PROMPT,
  grader: GRADER_PROMPT,
  student: STUDENT_PROMPT,
  leakcheck: LEAKCHECK_PROMPT,
  warmup: WARMUP_PROMPT,
} as const;

export type PromptName = keyof typeof PROMPTS;

/** Maps prompt name to its content/prompts/*.md file name. */
export const PROMPT_FILES: Record<PromptName, string> = {
  tutorCharter: 'tutor-charter.md',
  observer: 'observer.md',
  grader: 'grader.md',
  student: 'student.md',
  leakcheck: 'leakcheck.md',
  warmup: 'warmup.md',
};

/** Reads the `<!-- version: x.y -->` header of a prompt. */
export function promptVersion(text: string): string {
  const m = /^<!--\s*version:\s*([^\s]+)\s*-->/.exec(text);
  return m?.[1] ?? '0.0';
}

export const PROMPT_VERSIONS: Record<PromptName, string> = Object.fromEntries(
  (Object.keys(PROMPTS) as PromptName[]).map((k) => [k, promptVersion(PROMPTS[k])]),
) as Record<PromptName, string>;
