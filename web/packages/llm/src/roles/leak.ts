/**
 * Leak detector and turn-shape checker (DESIGN §7.3). Run on every tutor turn before rendering.
 * 1. normalised containment of the exact answer;
 * 2. any run of ≥4 content words from the reference answer appearing contiguously in the tutor text;
 * 3. if inconclusive (heavy vocabulary overlap without a contiguous run) and a provider is given, ask the
 *    leakcheck model (Haiku) for a structured verdict.
 */
import { z } from 'zod';
import type { LlmProvider, LlmRequest } from '../provider.js';
import { PROMPTS } from '../prompts.js';
import { contentWords, normalise, stripCode, wordCount } from '../text.js';
import { encodeInput } from './shared.js';

export const PHRASE_WINDOW = 4;
/** Fraction of the reference's distinct content words present in the tutor text above which we ask the model. */
export const INCONCLUSIVE_OVERLAP = 0.6;
export const INCONCLUSIVE_MIN_WORDS = 3;

export type LeakReason = 'exact' | 'phrase' | 'model' | 'none' | 'inconclusive';

export interface LeakVerdict {
  leaked: boolean;
  reason: LeakReason;
  detail?: string;
}

export interface LeakReference { answer: string; exact?: string }

export const LeakCheckSchema = z.object({ leaked: z.boolean(), reason: z.string() });

function containsExact(tutorText: string, exact: string): boolean {
  const t = ` ${normalise(tutorText)} `;
  const e = normalise(exact);
  if (!e) return false;
  return t.includes(` ${e} `);
}

/** Longest contiguous run of reference content words that also appears contiguously in the tutor text. */
function longestSharedRun(tutorText: string, answer: string): { length: number; phrase: string } {
  const t = contentWords(tutorText);
  const a = contentWords(answer);
  if (t.length === 0 || a.length === 0) return { length: 0, phrase: '' };
  const tJoined = ` ${t.join(' ')} `;
  let best = { length: 0, phrase: '' };
  for (let i = 0; i < a.length; i++) {
    for (let len = Math.min(a.length - i, 12); len > best.length; len--) {
      const phrase = a.slice(i, i + len).join(' ');
      if (tJoined.includes(` ${phrase} `)) {
        best = { length: len, phrase };
        break;
      }
    }
  }
  return best;
}

function overlapFraction(tutorText: string, answer: string): number {
  const a = new Set(contentWords(answer));
  if (a.size === 0) return 0;
  const t = new Set(contentWords(tutorText));
  let n = 0;
  for (const w of a) if (t.has(w)) n++;
  return n / a.size;
}

/** Pure, synchronous part of the detector. `inconclusive` means a model check is advisable. */
export function heuristicLeak(tutorText: string, reference: LeakReference): LeakVerdict {
  const text = tutorText; // code blocks are checked too: reference answers may be code
  if (reference.exact && containsExact(text, reference.exact)) {
    return { leaked: true, reason: 'exact', detail: reference.exact };
  }
  const run = longestSharedRun(text, reference.answer);
  if (run.length >= PHRASE_WINDOW) return { leaked: true, reason: 'phrase', detail: run.phrase };
  const distinct = new Set(contentWords(reference.answer)).size;
  if (distinct >= INCONCLUSIVE_MIN_WORDS && overlapFraction(text, reference.answer) >= INCONCLUSIVE_OVERLAP) {
    return { leaked: false, reason: 'inconclusive', detail: `overlap ${overlapFraction(text, reference.answer).toFixed(2)}` };
  }
  return { leaked: false, reason: 'none' };
}

export function buildLeakCheckRequest(tutorText: string, reference: LeakReference, model?: string): LlmRequest {
  const req: LlmRequest = {
    role: 'leakcheck',
    system: [{ text: PROMPTS.leakcheck, cache: true }],
    messages: [{ role: 'user', content: encodeInput({ tutorText, reference: { answer: reference.answer, ...(reference.exact ? { exact: reference.exact } : {}) } }) }],
    effort: 'low',
    maxTokens: 256,
  };
  if (model) req.model = model;
  return req;
}

export async function detectLeak(tutorText: string, reference: LeakReference, provider?: LlmProvider): Promise<LeakVerdict> {
  const h = heuristicLeak(tutorText, reference);
  if (h.reason !== 'inconclusive' || !provider) return h;
  const { value } = await provider.structured(buildLeakCheckRequest(tutorText, reference), LeakCheckSchema, 'LeakCheck');
  return { leaked: value.leaked, reason: value.leaked ? 'model' : 'none', detail: value.reason };
}

export interface TurnShape { ok: boolean; questions: number; words: number }

/** Count question marks outside code and words; ok when ≤ 1 question and ≤ maxWords. */
export function checkTurnShape(text: string, maxWords: number): TurnShape {
  const prose = stripCode(text);
  // collapse runs like "??" or "?!" into one question
  const questions = (prose.match(/\?+/g) ?? []).length;
  const words = wordCount(text);
  return { ok: questions <= 1 && words <= maxWords, questions, words };
}
