/** Content-addressed cache for LLM generation outputs: key = sha256(inputHash + promptVersion + model + kind). */
import { eq, lt } from 'drizzle-orm';
import type { Db } from '../client.js';
import { genCache } from '../schema.js';
import { batchAll, parseJson, toJson } from './_util.js';
import { dirtyQueries, type WriteOptions } from './_outbox.js';

export async function getCached<T = unknown>(db: Db, key: string): Promise<T | undefined> {
  const row = await db.select({ json: genCache.json }).from(genCache).where(eq(genCache.key, key)).get();
  return row ? parseJson<T | undefined>(row.json, undefined) : undefined;
}

export async function putCached(db: Db, key: string, kind: string, value: unknown, now: number = Date.now(), opts: WriteOptions = {}): Promise<void> {
  const json = toJson(value);
  await batchAll(db, [
    db.insert(genCache).values({ key, kind, json, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: genCache.key, set: { kind, json, createdAt: now, updatedAt: now } }),
    ...dirtyQueries(db, 'gen_cache', [key], now, opts),
  ]);
}

/** Cache eviction is local only (hard delete, not synced): every device may regenerate or re-pull entries. */
export async function deleteCached(db: Db, key: string): Promise<void> {
  await db.delete(genCache).where(eq(genCache.key, key)).run();
}

/** Drop entries created before `olderThanMs`. */
export async function pruneCache(db: Db, olderThanMs: number): Promise<void> {
  await db.delete(genCache).where(lt(genCache.createdAt, olderThanMs)).run();
}
