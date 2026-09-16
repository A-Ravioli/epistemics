import type { Db } from '../client.js';

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (s === null || s === undefined || s === '') return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export const toJson = (v: unknown): string => JSON.stringify(v);
export const bool = (v: number | boolean | null | undefined): boolean => v === true || v === 1;
export const int = (b: boolean | undefined): number => (b ? 1 : 0);
/** null → undefined for optional domain fields. */
export const opt = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

type BatchQuery = Parameters<Db['batch']>[0][number];

/**
 * Run any number of drizzle queries in one executor transaction. drizzle's `batch` types demand a non-empty
 * tuple; this helper accepts a plain array (no-op when empty) and chunks very large batches so a single
 * worker message / IPC call stays reasonable.
 */
export async function batchAll(db: Db, queries: BatchQuery[], chunkSize = 500): Promise<void> {
  for (let i = 0; i < queries.length; i += chunkSize) {
    const slice = queries.slice(i, i + chunkSize);
    if (slice.length === 0) return;
    await db.batch(slice as unknown as [BatchQuery, ...BatchQuery[]]);
  }
}

export function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
