/**
 * Daily queue + review persistence (DESIGN §5.3-5.6).
 *
 * applyReview: scheduler.applyRating → saveCards + appendReviewLogs → (optional) receipt + concept state →
 * implicit credit for encompassed concepts on unaided passes.
 */
import {
  buildQueue,
  estimateMinutes,
  implicitCredit,
  isCorrect,
  isLeech,
  studyDay,
  studyDayStart,
  uuidv7,
  type Card,
  type Confidence,
  type GradeResult,
  type Item,
  type QueueItemInfo,
  type Rating,
  type ReviewLogEntry,
  type ReviewSource,
  type Queue,
} from '@epistemics/core';
import { activateCards, appendReviewLogs, getCards, getReviewLog, isActivated, saveCards } from '@epistemics/db';
import { findItem } from './courses.js';
import { dayCfg, type CourseContext } from './context.js';
import { recordReceipt } from './receipts.js';
import { syncEvents } from '../sync-events.js';

export interface LoadedQueue {
  queue: Queue;
  /** All activated, non-suspended cards of the course. */
  cards: Card[];
  itemsByCard: Map<string, Item>;
  minutes: number;
  reviewsDoneToday: number;
  /** Cards to answer, in order: learning → reviews, with warm-up misses first. */
  order: Card[];
}

export function itemIndex(ctx: Pick<CourseContext, 'curriculum'>): Map<string, Item> {
  const out = new Map<string, Item>();
  for (const u of ctx.curriculum.units) for (const l of u.lessons) for (const c of l.concepts) for (const i of c.items) out.set(i.id, i);
  return out;
}

export async function countReviewsToday(ctx: CourseContext, sources: ReviewSource[] = ['review']): Promise<number> {
  const now = ctx.now();
  const since = studyDayStart(now, dayCfg(ctx));
  const log = await getReviewLog(ctx.db, ctx.course.id, since);
  return log.filter((l) => sources.includes(l.source) && l.stateBefore === 2).length;
}

export async function loadQueue(ctx: CourseContext, opts: { recentlyShownConceptIds?: Set<string>; queueFirstConceptIds?: string[] } = {}): Promise<LoadedQueue> {
  const now = ctx.now();
  const all = await getCards(ctx.db, ctx.course.id);
  const items = itemIndex(ctx);
  const cards = all.filter((c) => isActivated(c, now) && items.has(c.itemId));
  const itemsByCard = new Map<string, Item>();
  const info = new Map<string, QueueItemInfo>();
  for (const c of cards) {
    const it = items.get(c.itemId)!;
    itemsByCard.set(c.id, it);
    info.set(c.id, { conceptId: it.conceptId, type: it.type });
  }
  const reviewsDoneToday = await countReviewsToday(ctx);
  const queue = buildQueue({
    cards,
    now,
    settings: ctx.course.settings,
    itemsByCard: info,
    retrievability: (c) => ctx.scheduler.retrievability(c, now),
    recentlyShownConceptIds: opts.recentlyShownConceptIds,
    rng: Math.random,
    reviewsDoneToday,
  });
  let order = [...queue.learning, ...queue.reviews];
  const first = new Set(opts.queueFirstConceptIds ?? []);
  if (first.size > 0) order = [...order.filter((c) => first.has(c.conceptId)), ...order.filter((c) => !first.has(c.conceptId))];
  return { queue, cards, itemsByCard, minutes: estimateMinutes(queue), reviewsDoneToday, order };
}

export interface ApplyReviewInput {
  card: Card;
  rating: Rating;
  source: ReviewSource;
  assisted: boolean;
  confidence?: Confidence;
  durationMs?: number;
  /** When given, a receipt is stored and the concept state is folded. */
  receipt?: { sessionId: string; answer: string; grade?: GradeResult };
  /** Skip implicit credit (e.g. when the caller batches it). */
  noImplicitCredit?: boolean;
}

export interface ApplyReviewResult {
  card: Card;
  log: ReviewLogEntry;
  implicit: { card: Card; log: ReviewLogEntry }[];
  leech: boolean;
}

export async function applyReview(ctx: CourseContext, input: ApplyReviewInput): Promise<ApplyReviewResult> {
  const now = ctx.now();
  const { card, log: draft } = ctx.scheduler.applyRating(input.card, input.rating, now, {
    source: input.source,
    assisted: input.assisted,
    confidence: input.confidence,
    durationMs: input.durationMs,
  });
  const leech = isLeech(card);
  const next: Card = leech ? { ...card, suspended: true } : card;
  const log: ReviewLogEntry = { id: uuidv7(now), ...draft };
  await saveCards(ctx.db, [next], now);
  await appendReviewLogs(ctx.db, [log]);

  if (input.receipt) {
    const item = findItem(ctx.curriculum, input.card.itemId);
    await recordReceipt(ctx, {
      sessionId: input.receipt.sessionId,
      itemId: input.card.itemId,
      conceptId: item?.concept.id ?? input.card.conceptId,
      answer: input.receipt.answer,
      confidence: input.confidence,
      grade: input.receipt.grade,
      rating: input.rating,
      assisted: input.assisted,
    });
  }

  let implicit: ApplyReviewResult['implicit'] = [];
  if (!input.noImplicitCredit && !input.assisted && isCorrect(input.rating)) {
    implicit = await grantImplicitCredit(ctx, input.card.conceptId);
  }
  syncEvents.emit('activity');
  return { card: next, log, implicit, leech };
}

/** FIRe-lite (DESIGN §5.6): synthetic partial reviews on encompassed concepts' Review-state cards. */
export async function grantImplicitCredit(ctx: CourseContext, passedConceptId: string): Promise<{ card: Card; log: ReviewLogEntry }[]> {
  const now = ctx.now();
  const all = await getCards(ctx.db, ctx.course.id);
  const byConcept = new Map<string, Card[]>();
  for (const c of all) {
    if (!isActivated(c, now)) continue;
    const list = byConcept.get(c.conceptId) ?? [];
    list.push(c);
    byConcept.set(c.conceptId, list);
  }
  const outcomes = implicitCredit({ passedConceptId, edges: ctx.curriculum.edges, cardsByConcept: byConcept, now, scheduler: ctx.scheduler });
  if (outcomes.length === 0) return [];
  const logs = outcomes.map((o) => ({ id: uuidv7(now), ...o.log }));
  await saveCards(ctx.db, outcomes.map((o) => o.card), now);
  await appendReviewLogs(ctx.db, logs);
  return outcomes.map((o, i) => ({ card: o.card, log: logs[i]! }));
}

/**
 * Lesson wrap-up (DESIGN §3.3): a concept's cards enter FSRS with the CHECK result as their first review.
 * Returns the activated cards after the first rating.
 */
export async function activateConcept(ctx: CourseContext, conceptId: string, firstRating: Rating): Promise<Card[]> {
  const now = ctx.now();
  await activateCards(ctx.db, ctx.course.id, conceptId, now);
  const all = await getCards(ctx.db, ctx.course.id);
  const mine = all.filter((c) => c.conceptId === conceptId && isActivated(c, now) && c.state === 0 && !c.suspended);
  if (mine.length === 0) return [];
  const outs = mine.map((c) => ctx.scheduler.applyRating(c, firstRating, now, { source: 'lesson', assisted: false }));
  await saveCards(ctx.db, outs.map((o) => o.card), now);
  await appendReviewLogs(ctx.db, outs.map((o) => ({ id: uuidv7(now), ...o.log })));
  return outs.map((o) => o.card);
}

/** Reschedule a concept's activated cards with Again (checkpoint failure). */
export async function rescheduleConceptAgain(ctx: CourseContext, conceptId: string, source: ReviewSource = 'checkpoint'): Promise<void> {
  const now = ctx.now();
  const all = await getCards(ctx.db, ctx.course.id);
  const mine = all.filter((c) => c.conceptId === conceptId && isActivated(c, now) && c.state !== 0 && !c.suspended);
  if (mine.length === 0) return;
  const outs = mine.map((c) => ctx.scheduler.applyRating(c, 1, now, { source, assisted: false }));
  await saveCards(ctx.db, outs.map((o) => o.card), now);
  await appendReviewLogs(ctx.db, outs.map((o) => ({ id: uuidv7(now), ...o.log })));
}

export function todayKey(ctx: CourseContext): string {
  return studyDay(ctx.now(), dayCfg(ctx));
}
