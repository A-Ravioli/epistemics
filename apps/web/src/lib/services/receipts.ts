/**
 * Receipts and the concept-state fold (DESIGN §5.5, §6.5): every graded/rated attempt becomes a receipt,
 * updates the concept's pass counters and successful-session count, then mastery is recomputed from the
 * concept's cards' retrievability.
 */
import {
  conceptMastery,
  conceptRetention,
  studyDay,
  updateConceptStateAfterReceipt,
  uuidv7,
  type Confidence,
  type ConceptState,
  type GradeResult,
  type Rating,
  type Receipt,
} from '@epistemics/core';
import { emptyConceptState, getCardsForConcept, getConceptState, saveReceipt, upsertConceptState } from '@epistemics/db';
import { dayCfg, type CourseContext } from './context.js';

export interface ReceiptInput {
  sessionId: string;
  itemId: string;
  conceptId: string;
  answer: string;
  confidence?: Confidence;
  grade?: GradeResult;
  rating: Rating;
  assisted: boolean;
}

export async function recordReceipt(ctx: CourseContext, input: ReceiptInput): Promise<Receipt> {
  const now = ctx.now();
  const receipt: Receipt = {
    id: uuidv7(now),
    sessionId: input.sessionId,
    courseId: ctx.course.id,
    itemId: input.itemId,
    conceptId: input.conceptId,
    answer: input.answer,
    confidence: input.confidence,
    grade: input.grade,
    rating: input.rating,
    assisted: input.assisted,
    disputed: false,
    createdAt: now,
  };
  await saveReceipt(ctx.db, receipt);
  await foldReceiptIntoConcept(ctx, receipt);
  return receipt;
}

export async function foldReceiptIntoConcept(ctx: CourseContext, r: Pick<Receipt, 'conceptId' | 'rating' | 'assisted' | 'grade' | 'createdAt'>): Promise<ConceptState> {
  const prev = (await getConceptState(ctx.db, ctx.course.id, r.conceptId)) ?? emptyConceptState(ctx.course.id, r.conceptId, r.createdAt);
  const next = updateConceptStateAfterReceipt(prev, {
    rating: r.rating,
    assisted: r.assisted,
    misconceptionTags: r.grade?.misconceptionTags ?? [],
    day: studyDay(r.createdAt, dayCfg(ctx)),
    at: r.createdAt,
  });
  return recomputeMastery(ctx, next);
}

/** mastery = retention × min(1, sessions/3), persisted. */
export async function recomputeMastery(ctx: CourseContext, state: ConceptState): Promise<ConceptState> {
  const now = ctx.now();
  const cards = await getCardsForConcept(ctx.db, ctx.course.id, state.conceptId);
  const retention = conceptRetention(cards, now, (c, at) => ctx.scheduler.retrievability(c, at));
  const next: ConceptState = { ...state, mastery: conceptMastery(retention, state.successfulSessions), updatedAt: Math.max(state.updatedAt, now) };
  await upsertConceptState(ctx.db, next);
  return next;
}

export async function recomputeMasteryFor(ctx: CourseContext, conceptId: string): Promise<ConceptState> {
  const prev = (await getConceptState(ctx.db, ctx.course.id, conceptId)) ?? emptyConceptState(ctx.course.id, conceptId, ctx.now());
  return recomputeMastery(ctx, prev);
}
