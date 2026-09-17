import { and, eq, isNull } from 'drizzle-orm';
import type { FsrsParams } from '@epistemics/core';
import type { Db } from '../client.js';
import { fsrsParams } from '../schema.js';
import { batchAll, parseJson, toJson } from './_util.js';
import { dirtyQueries, markDirty, type WriteOptions } from './_outbox.js';

export async function getFsrsParams(db: Db, courseId: string): Promise<FsrsParams | undefined> {
  const r = await db.select().from(fsrsParams).where(and(eq(fsrsParams.courseId, courseId), isNull(fsrsParams.deletedAt))).get();
  if (!r) return undefined;
  const p: FsrsParams = { courseId: r.courseId, w: parseJson<number[]>(r.wJson, []), desiredRetention: r.desiredRetention, nReviews: r.nReviews };
  if (r.optimizedAt !== null) p.optimizedAt = r.optimizedAt;
  if (r.logloss !== null) p.logloss = r.logloss;
  return p;
}

export async function saveFsrsParams(db: Db, p: FsrsParams, now: number = Date.now(), opts: WriteOptions = {}): Promise<void> {
  const row: typeof fsrsParams.$inferInsert = {
    courseId: p.courseId, wJson: toJson(p.w), desiredRetention: p.desiredRetention,
    optimizedAt: p.optimizedAt ?? null, nReviews: p.nReviews, logloss: p.logloss ?? null, updatedAt: now, deletedAt: null,
  };
  const { courseId: _c, ...set } = row;
  await batchAll(db, [
    db.insert(fsrsParams).values(row).onConflictDoUpdate({ target: fsrsParams.courseId, set }),
    ...dirtyQueries(db, 'fsrs_params', [p.courseId], now, opts),
  ]);
}

/** Soft delete (tombstone), so the deletion reaches other devices. */
export async function deleteFsrsParams(db: Db, courseId: string, now: number = Date.now()): Promise<void> {
  await db.update(fsrsParams).set({ deletedAt: now, updatedAt: now }).where(eq(fsrsParams.courseId, courseId)).run();
  await markDirty(db, 'fsrs_params', courseId, now);
}
