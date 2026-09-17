/**
 * Warm-up brain dump (DESIGN §3.2): "write everything you remember from your
 * last lesson". Grading is done blind by the grader; this module only builds
 * the prompt and maps the grader's recalled-concept list to review outcomes.
 */
import type { Lesson, Rating } from '../types.js';

export const WARMUP_RATING: Rating = 3; // Good

/** Free-recall prompt. Deliberately names no concepts (that would be a cue, not recall). */
export function buildWarmupPrompt(lastLesson: Lesson): string {
  // The surface supplies the heading, the time box and "order and polish do not matter"; saying any of it
  // again here is the same instruction twice in one card.
  return (
    `Write everything you remember from your last lesson, "${lastLesson.title}": ` +
    'key ideas, definitions, examples, anything at all, in your own words. ' +
    'Do not look anything up; this is recall, not review.'
  );
}

export interface WarmupOutcome {
  /** Concepts the learner recalled: each counts as a review with rating Good. */
  reviewed: { conceptId: string; rating: Rating }[];
  /** Concepts of the lesson that were not recalled: queued first in today's review. */
  queuedFirst: string[];
}

/** Maps the grader's recalled concept ids (restricted to the lesson's concepts) to review outcomes. */
export function mapWarmupResult(recalledConceptIds: readonly string[], lesson: Lesson): WarmupOutcome {
  const recalled = new Set(recalledConceptIds);
  const reviewed: WarmupOutcome['reviewed'] = [];
  const queuedFirst: string[] = [];
  for (const c of lesson.concepts) {
    if (recalled.has(c.id)) reviewed.push({ conceptId: c.id, rating: WARMUP_RATING });
    else queuedFirst.push(c.id);
  }
  return { reviewed, queuedFirst };
}
