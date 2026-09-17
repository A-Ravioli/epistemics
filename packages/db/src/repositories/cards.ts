import { and, asc, count, eq, gte } from 'drizzle-orm';
import type { Card, CardState, Confidence, Rating, ReviewLogEntry, ReviewSource } from '@epistemics/core';
import type { Db } from '../client.js';
import { cards, reviewLog } from '../schema.js';
import { batchAll, bool, int, opt } from './_util.js';
import { dirtyQueries, type WriteOptions } from './_outbox.js';

type CardRow = typeof cards.$inferSelect;
type LogRow = typeof reviewLog.$inferSelect;

export function rowToCard(r: CardRow): Card {
  const c: Card = {
    id: r.id, courseId: r.courseId, itemId: r.itemId, conceptId: r.conceptId,
    state: r.state as CardState, due: r.due,
    stability: r.stability, difficulty: r.difficulty, scheduledDays: r.scheduledDays, learningSteps: r.learningSteps,
    reps: r.reps, lapses: r.lapses, suspended: bool(r.suspended), provisional: bool(r.provisional),
  };
  if (r.lastReview !== null) c.lastReview = r.lastReview;
  return c;
}

function cardToRow(c: Card, now: number): typeof cards.$inferInsert {
  return {
    id: c.id, courseId: c.courseId, itemId: c.itemId, conceptId: c.conceptId,
    state: c.state, due: c.due, lastReview: c.lastReview ?? null,
    stability: c.stability, difficulty: c.difficulty, scheduledDays: c.scheduledDays, learningSteps: c.learningSteps,
    reps: c.reps, lapses: c.lapses, suspended: int(c.suspended), provisional: int(c.provisional), updatedAt: now,
  };
}

export async function getCards(db: Db, courseId: string): Promise<Card[]> {
  const rows = await db.select().from(cards).where(eq(cards.courseId, courseId)).orderBy(asc(cards.due)).all();
  return rows.map(rowToCard);
}

export async function getCard(db: Db, id: string): Promise<Card | undefined> {
  const row = await db.select().from(cards).where(eq(cards.id, id)).get();
  return row ? rowToCard(row) : undefined;
}

export async function getCardsForConcept(db: Db, courseId: string, conceptId: string): Promise<Card[]> {
  const rows = await db.select().from(cards)
    .where(and(eq(cards.courseId, courseId), eq(cards.conceptId, conceptId))).orderBy(asc(cards.due)).all();
  return rows.map(rowToCard);
}

export async function getCardByItem(db: Db, courseId: string, itemId: string): Promise<Card | undefined> {
  const row = await db.select().from(cards).where(and(eq(cards.courseId, courseId), eq(cards.itemId, itemId))).get();
  return row ? rowToCard(row) : undefined;
}

/** Upsert cards in one transaction (insert or overwrite every scheduling field). */
export async function saveCards(db: Db, list: readonly Card[], now: number = Date.now(), opts: WriteOptions = {}): Promise<void> {
  await batchAll(db, [
    ...list.map((c) => {
      const row = cardToRow(c, now);
      const { id: _id, ...set } = row;
      return db.insert(cards).values(row).onConflictDoUpdate({ target: cards.id, set });
    }),
    ...dirtyQueries(db, 'cards', list.map((c) => c.id), now, opts),
  ]);
}

/** Hard delete, local only: never used by the app (courses are soft-deleted instead) and not propagated by sync. */
export async function deleteCards(db: Db, courseId: string): Promise<void> {
  await db.delete(cards).where(eq(cards.courseId, courseId)).run();
}

function rowToLog(r: LogRow): ReviewLogEntry {
  const e: ReviewLogEntry = {
    id: r.id, cardId: r.cardId, courseId: r.courseId, reviewTime: r.reviewTime,
    rating: r.rating as Rating, stateBefore: r.stateBefore as CardState,
    elapsedDays: r.elapsedDays, scheduledDays: r.scheduledDays, stability: r.stability, difficulty: r.difficulty,
    source: r.source as ReviewSource, assisted: bool(r.assisted),
  };
  if (r.durationMs !== null) e.durationMs = r.durationMs;
  if (r.confidence !== null) e.confidence = r.confidence as Confidence;
  return e;
}

/** Append-only: entries are immutable, so a re-append of an existing id is ignored. */
export async function appendReviewLogs(db: Db, logs: readonly ReviewLogEntry[], now: number = Date.now(), opts: WriteOptions = {}): Promise<void> {
  await batchAll(db, [
    ...logs.map((l) => db.insert(reviewLog).values({
      id: l.id, cardId: l.cardId, courseId: l.courseId, reviewTime: l.reviewTime, rating: l.rating,
      stateBefore: l.stateBefore, elapsedDays: l.elapsedDays, scheduledDays: l.scheduledDays,
      stability: l.stability, difficulty: l.difficulty,
      durationMs: opt(l.durationMs) ?? null, confidence: l.confidence ?? null, source: l.source, assisted: int(l.assisted),
    }).onConflictDoNothing()),
    ...dirtyQueries(db, 'review_log', logs.map((l) => l.id), now, opts),
  ]);
}

export async function getReviewLog(db: Db, courseId: string, since?: number): Promise<ReviewLogEntry[]> {
  const where = since === undefined
    ? eq(reviewLog.courseId, courseId)
    : and(eq(reviewLog.courseId, courseId), gte(reviewLog.reviewTime, since));
  const rows = await db.select().from(reviewLog).where(where).orderBy(asc(reviewLog.reviewTime)).all();
  return rows.map(rowToLog);
}

export async function getReviewLogForCard(db: Db, cardId: string): Promise<ReviewLogEntry[]> {
  const rows = await db.select().from(reviewLog).where(eq(reviewLog.cardId, cardId)).orderBy(asc(reviewLog.reviewTime)).all();
  return rows.map(rowToLog);
}

export async function countReviews(db: Db, courseId: string, since?: number): Promise<number> {
  const where = since === undefined
    ? eq(reviewLog.courseId, courseId)
    : and(eq(reviewLog.courseId, courseId), gte(reviewLog.reviewTime, since));
  const row = await db.select({ n: count() }).from(reviewLog).where(where).get();
  return row?.n ?? 0;
}
