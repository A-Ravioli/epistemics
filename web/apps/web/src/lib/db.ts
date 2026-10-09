import { createDb, type Db } from '@epistemics/db';
import { getPlatform } from './platform.js';

let dbPromise: Promise<Db> | undefined;

/** Singleton Drizzle client over the platform executor, with migrations applied. */
export function getDb(): Promise<Db> {
  dbPromise ??= (async () => {
    const platform = await getPlatform();
    await platform.db.migrate(); // idempotent; the platform may already have run it
    return createDb(platform.db);
  })().catch((e: unknown) => {
    dbPromise = undefined;
    throw e;
  });
  return dbPromise;
}
