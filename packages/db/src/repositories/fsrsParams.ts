import { eq } from 'drizzle-orm';
import type { FsrsParams } from '@epistemics/core';
import type { Db } from '../client.js';
import { fsrsParams } from '../schema.js';
import { parseJson, toJson } from './_util.js';

export async function getFsrsParams(db: Db, courseId: string): Promise<FsrsParams | undefined> {
  const r = await db.select().from(fsrsParams).where(eq(fsrsParams.courseId, courseId)).get();
  if (!r) return undefined;
  const p: FsrsParams = { courseId: r.courseId, w: parseJson<number[]>(r.wJson, []), desiredRetention: r.desiredRetention, nReviews: r.nReviews };
  if (r.optimizedAt !== null) p.optimizedAt = r.optimizedAt;
  if (r.logloss !== null) p.logloss = r.logloss;
  return p;
}

export async function saveFsrsParams(db: Db, p: FsrsParams): Promise<void> {
  const row: typeof fsrsParams.$inferInsert = {
    courseId: p.courseId, wJson: toJson(p.w), desiredRetention: p.desiredRetention,
    optimizedAt: p.optimizedAt ?? null, nReviews: p.nReviews, logloss: p.logloss ?? null,
  };
  const { courseId: _c, ...set } = row;
  await db.insert(fsrsParams).values(row).onConflictDoUpdate({ target: fsrsParams.courseId, set }).run();
}

export async function deleteFsrsParams(db: Db, courseId: string): Promise<void> {
  await db.delete(fsrsParams).where(eq(fsrsParams.courseId, courseId)).run();
}
