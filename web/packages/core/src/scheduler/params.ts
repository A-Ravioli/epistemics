/**
 * FSRS parameter defaults and optimizer policy (DESIGN §5.1, §5.7).
 * Pure constants and predicates; the worker that actually fits parameters lives outside core.
 */
import { generatorParameters } from 'ts-fsrs';
import { DAY_MS } from '../time.js';

/** FSRS-6 default 21-parameter vector, taken from ts-fsrs so both stay in lockstep. */
export const DEFAULT_FSRS_W: readonly number[] = Object.freeze([...generatorParameters().w]);

/** Learning / relearning steps adopted from DESIGN §5.1. */
export const DEFAULT_LEARNING_STEPS = ['1m', '10m'] as const;
export const DEFAULT_RELEARNING_STEPS = ['10m'] as const;

/** Maximum interval when no exam date is set (100 years, the FSRS convention). */
export const DEFAULT_MAXIMUM_INTERVAL_DAYS = 36_500;

/** Optimizer policy: first fit after this many logged reviews, then at most every 30 days. */
export const MIN_REVIEWS_FOR_OPTIMIZE = 400;
export const OPTIMIZE_INTERVAL_MS = 30 * DAY_MS;

/** Leech rule (DESIGN §5.1): suspend and flag for rewrite at 8 lapses. */
export const LEECH_LAPSES = 8;

/**
 * Whether the optimizer should run now.
 * @param nReviews        reviews logged for the course (excluding `implicit`/`manual`, if the caller filters).
 * @param lastOptimizedAt epoch ms of the last fit, or undefined if never.
 * @param now             epoch ms.
 */
export function shouldOptimize(nReviews: number, lastOptimizedAt: number | undefined, now: number): boolean {
  if (nReviews < MIN_REVIEWS_FOR_OPTIMIZE) return false;
  if (lastOptimizedAt === undefined) return true;
  return now - lastOptimizedAt >= OPTIMIZE_INTERVAL_MS;
}
