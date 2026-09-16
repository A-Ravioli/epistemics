import { eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { settings } from '../schema.js';
import { parseJson, toJson } from './_util.js';

export async function getSetting<T = unknown>(db: Db, key: string): Promise<T | undefined> {
  const row = await db.select({ v: settings.valueJson }).from(settings).where(eq(settings.key, key)).get();
  return row ? parseJson<T | undefined>(row.v, undefined) : undefined;
}

export async function setSetting(db: Db, key: string, value: unknown): Promise<void> {
  const valueJson = toJson(value);
  await db.insert(settings).values({ key, valueJson }).onConflictDoUpdate({ target: settings.key, set: { valueJson } }).run();
}

export async function deleteSetting(db: Db, key: string): Promise<void> {
  await db.delete(settings).where(eq(settings.key, key)).run();
}

export async function getAllSettings(db: Db): Promise<Record<string, unknown>> {
  const rows = await db.select().from(settings).all();
  return Object.fromEntries(rows.map((r) => [r.key, parseJson<unknown>(r.valueJson, undefined)]));
}
