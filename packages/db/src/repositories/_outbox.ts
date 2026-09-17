/**
 * Outbox bookkeeping for sync (docs/SYNC.md). Every repository write records the primary keys it touched so
 * the sync engine can push them later. Writes that come *from* the sync pull path pass `{ fromSync: true }`
 * and are not recorded, otherwise every pulled row would bounce straight back to the server.
 */
import { asc, count, inArray } from 'drizzle-orm';
import { uuidv7 } from '@epistemics/core';
import type { Db } from '../client.js';
import { outbox } from '../schema.js';

/** A primary key: the id string for single-column keys, or the named columns for composite keys. */
export type RowKey = string | Record<string, string | number>;

export interface WriteOptions {
  /** The write applies rows received from the server; do not record them in the outbox. */
  fromSync?: boolean;
}

export const encodeRowKey = (key: RowKey): string => JSON.stringify(key);
export const decodeRowKey = (s: string): RowKey => JSON.parse(s) as RowKey;

/** Insert query recording `keys` of `table` as dirty; push it into the same batch as the write itself. */
export function dirtyQuery(db: Db, table: string, keys: readonly RowKey[], now: number) {
  const rows: (typeof outbox.$inferInsert)[] = keys.map((k) => ({ id: uuidv7(now), tableName: table, rowId: encodeRowKey(k), op: 'upsert', createdAt: now }));
  return db.insert(outbox).values(rows);
}

/** Record `keys` as dirty (no-op for an empty list or when the write came from sync). */
export async function markDirty(db: Db, table: string, keys: RowKey | readonly RowKey[], now: number = Date.now(), opts: WriteOptions = {}): Promise<void> {
  if (opts.fromSync) return;
  const list = Array.isArray(keys) ? (keys as readonly RowKey[]) : [keys as RowKey];
  if (list.length === 0) return;
  await dirtyQuery(db, table, list, now).run();
}

/** Queries to append to a batch: the outbox rows for `keys`, or nothing when the write came from sync. */
export function dirtyQueries(db: Db, table: string, keys: readonly RowKey[], now: number, opts: WriteOptions = {}) {
  if (opts.fromSync || keys.length === 0) return [];
  return [dirtyQuery(db, table, keys, now)];
}

export interface OutboxEntry { id: string; tableName: string; rowId: string; op: string; createdAt: number }

export async function countOutbox(db: Db): Promise<number> {
  const row = await db.select({ n: count() }).from(outbox).get();
  return row?.n ?? 0;
}

/** Oldest `limit` outbox entries. */
export async function readOutbox(db: Db, limit: number): Promise<OutboxEntry[]> {
  return db.select().from(outbox).orderBy(asc(outbox.createdAt), asc(outbox.id)).limit(limit).all();
}

export async function deleteOutbox(db: Db, ids: readonly string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 500) {
    await db.delete(outbox).where(inArray(outbox.id, ids.slice(i, i + 500))).run();
  }
}
