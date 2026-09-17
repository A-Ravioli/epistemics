import { and, asc, eq, gte, isNull } from 'drizzle-orm';
import type { JudgmentOfLearning } from '@epistemics/core';
import type { Db } from '../client.js';
import { jol } from '../schema.js';
import { batchAll, bool, int } from './_util.js';
import { dirtyQueries, markDirty, type WriteOptions } from './_outbox.js';

type Row = typeof jol.$inferSelect;

function rowToJol(r: Row): JudgmentOfLearning {
  const j: JudgmentOfLearning = { id: r.id, sessionId: r.sessionId, courseId: r.courseId, conceptId: r.conceptId, predictedRecall: r.predictedRecall, createdAt: r.createdAt };
  if (r.actualOutcome !== null) j.actualOutcome = bool(r.actualOutcome);
  if (r.checkedAt !== null) j.checkedAt = r.checkedAt;
  return j;
}

export async function saveJol(db: Db, j: JudgmentOfLearning, now: number = Date.now(), opts: WriteOptions = {}): Promise<void> {
  const row: typeof jol.$inferInsert = {
    id: j.id, sessionId: j.sessionId, courseId: j.courseId, conceptId: j.conceptId, predictedRecall: j.predictedRecall,
    actualOutcome: j.actualOutcome === undefined ? null : int(j.actualOutcome), checkedAt: j.checkedAt ?? null, createdAt: j.createdAt,
    updatedAt: now,
  };
  const { id: _id, ...set } = row;
  await batchAll(db, [
    db.insert(jol).values(row).onConflictDoUpdate({ target: jol.id, set }),
    ...dirtyQueries(db, 'jol', [j.id], now, opts),
  ]);
}

/** Record the outcome of the retrieval the judgement predicted. */
export async function resolveJol(db: Db, id: string, actualOutcome: boolean, checkedAt: number = Date.now()): Promise<void> {
  await db.update(jol).set({ actualOutcome: int(actualOutcome), checkedAt, updatedAt: checkedAt }).where(eq(jol.id, id)).run();
  await markDirty(db, 'jol', id, checkedAt);
}

export async function getJols(db: Db, courseId: string, since?: number): Promise<JudgmentOfLearning[]> {
  const where = since === undefined ? eq(jol.courseId, courseId) : and(eq(jol.courseId, courseId), gte(jol.createdAt, since));
  const rows = await db.select().from(jol).where(where).orderBy(asc(jol.createdAt)).all();
  return rows.map(rowToJol);
}

export async function getUnresolvedJols(db: Db, courseId: string, conceptId?: string): Promise<JudgmentOfLearning[]> {
  const where = conceptId === undefined
    ? and(eq(jol.courseId, courseId), isNull(jol.checkedAt))
    : and(eq(jol.courseId, courseId), eq(jol.conceptId, conceptId), isNull(jol.checkedAt));
  const rows = await db.select().from(jol).where(where).orderBy(asc(jol.createdAt)).all();
  return rows.map(rowToJol);
}
