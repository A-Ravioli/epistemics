/**
 * Shared migration runner used by every executor. Works purely through the executor's own
 * `run`/`batch` primitives so node, web (worker) and tauri apply the identical embedded MIGRATIONS.
 *
 * Bookkeeping table: `_migrations(name TEXT PRIMARY KEY, applied_at INTEGER)`.
 * drizzle-kit separates statements with `--> statement-breakpoint`; each migration file is applied
 * as one transaction together with its `_migrations` row, so a crash mid-way leaves nothing half-applied.
 */
import type { DbExecutor, SqlValue } from '../executor.js';
import { MIGRATIONS } from '../migrations.js';

export const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

export function splitStatements(sql: string): string[] {
  return sql
    .split(STATEMENT_BREAKPOINT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function applyMigrations(
  exec: Pick<DbExecutor, 'run' | 'batch'>,
  migrations: { name: string; sql: string }[] = MIGRATIONS,
  now: number = Date.now(),
): Promise<number> {
  await exec.run('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER)', [], 'run');
  const { rows } = await exec.run('SELECT name FROM _migrations', [], 'all');
  const applied = new Set(rows.map((r) => String(r[0])));
  let n = 0;
  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    const statements: { sql: string; params: SqlValue[] }[] = splitStatements(m.sql).map((sql) => ({ sql, params: [] }));
    statements.push({ sql: 'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)', params: [m.name, now] });
    await exec.batch(statements);
    n++;
  }
  return n;
}

/** Normalise JS values into what every SQLite binding accepts: booleans → 0/1, undefined → null, Date → ms. */
export function normaliseParams(params: readonly unknown[]): SqlValue[] {
  return params.map((p): SqlValue => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p instanceof Date) return p.getTime();
    if (typeof p === 'string' || typeof p === 'number' || typeof p === 'bigint') return p;
    if (p instanceof Uint8Array) return p;
    if (ArrayBuffer.isView(p)) return new Uint8Array(p.buffer, p.byteOffset, p.byteLength);
    if (p instanceof ArrayBuffer) return new Uint8Array(p);
    // Objects/arrays are serialised (drizzle json mode does this itself, but be forgiving).
    return JSON.stringify(p);
  });
}
