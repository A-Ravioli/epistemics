import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../client.js';
import { settings } from '../schema.js';
import { batchAll, parseJson, toJson } from './_util.js';
import { dirtyQueries, markDirty, type WriteOptions } from './_outbox.js';

export async function getSetting<T = unknown>(db: Db, key: string): Promise<T | undefined> {
  const row = await db.select({ v: settings.valueJson }).from(settings)
    .where(and(eq(settings.key, key), isNull(settings.deletedAt))).get();
  return row ? parseJson<T | undefined>(row.v, undefined) : undefined;
}

export async function setSetting(db: Db, key: string, value: unknown, now: number = Date.now(), opts: WriteOptions = {}): Promise<void> {
  const valueJson = toJson(value);
  await batchAll(db, [
    db.insert(settings).values({ key, valueJson, updatedAt: now, deletedAt: null })
      .onConflictDoUpdate({ target: settings.key, set: { valueJson, updatedAt: now, deletedAt: null } }),
    ...dirtyQueries(db, 'settings', [key], now, opts),
  ]);
}

/** Soft delete (tombstone): the key reads as unset here and, after sync, on other devices. */
export async function deleteSetting(db: Db, key: string, now: number = Date.now()): Promise<void> {
  await db.update(settings).set({ deletedAt: now, updatedAt: now }).where(eq(settings.key, key)).run();
  await markDirty(db, 'settings', key, now);
}

export async function getAllSettings(db: Db): Promise<Record<string, unknown>> {
  const rows = await db.select().from(settings).where(isNull(settings.deletedAt)).all();
  return Object.fromEntries(rows.map((r) => [r.key, parseJson<unknown>(r.valueJson, undefined)]));
}
