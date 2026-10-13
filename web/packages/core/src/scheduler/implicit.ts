/**
 * Implicit credit, FIRe-lite (DESIGN §5.6).
 *
 * When the learner passes an unaided item on concept B, every concept A with an encompassing edge
 * `B → A (w)` gets a synthetic partial review on its Review-state cards with R < 0.97:
 * stability += w × (S'_good − S), due re-derived from the new stability. Difficulty, reps and the
 * last real review time are untouched, so the optimizer's replay of real reviews stays valid.
 */
import type { Card, ConceptEdge } from '../types.js';
import { DAY_MS, daysBetween } from '../time.js';
import type { RatingOutcome, Scheduler } from './fsrs.js';

export const IMPLICIT_MAX_WEIGHT = 0.5;
export const IMPLICIT_MAX_RETRIEVABILITY = 0.97;

export interface ImplicitCreditInput {
  passedConceptId: string;
  edges: ConceptEdge[];
  cardsByConcept: Map<string, Card[]>;
  now: number;
  scheduler: Scheduler;
}

/** Encompassing edges leaving `conceptId`, with weights clamped to [0, 0.5]; zero-weight edges dropped. */
export function encompassedBy(conceptId: string, edges: ConceptEdge[]): { conceptId: string; weight: number }[] {
  const out = new Map<string, number>();
  for (const e of edges) {
    if (e.kind !== 'encompasses' || e.from !== conceptId || e.weight === undefined) continue;
    const w = Math.min(IMPLICIT_MAX_WEIGHT, Math.max(0, e.weight));
    if (w <= 0) continue;
    out.set(e.to, Math.max(out.get(e.to) ?? 0, w));
  }
  return [...out].map(([id, weight]) => ({ conceptId: id, weight }));
}

export function implicitCredit(input: ImplicitCreditInput): RatingOutcome[] {
  const { edges, cardsByConcept, now, scheduler } = input;
  const results: RatingOutcome[] = [];

  for (const { conceptId, weight } of encompassedBy(input.passedConceptId, edges)) {
    for (const card of cardsByConcept.get(conceptId) ?? []) {
      if (card.state !== 2 || card.suspended) continue;
      const r = scheduler.retrievability(card, now);
      if (r >= IMPLICIT_MAX_RETRIEVABILITY) continue;

      const sGood = scheduler.previewRatings(card, now)[3].card.stability;
      const stability = Math.max(card.stability, card.stability + weight * (sGood - card.stability));
      if (stability === card.stability) continue;

      const interval = scheduler.intervalForStability(stability);
      const anchor = card.lastReview ?? now;
      const due = Math.max(card.due, anchor + interval * DAY_MS);

      const next: Card = { ...card, stability, due, scheduledDays: interval };
      results.push({
        card: next,
        log: {
          cardId: card.id,
          courseId: card.courseId,
          reviewTime: now,
          rating: 3,
          stateBefore: card.state,
          elapsedDays: card.lastReview === undefined ? 0 : Math.max(0, daysBetween(card.lastReview, now)),
          scheduledDays: interval,
          stability,
          difficulty: card.difficulty,
          source: 'implicit',
          assisted: false,
        },
      });
    }
  }
  return results;
}
