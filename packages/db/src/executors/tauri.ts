/**
 * Desktop executor over `@tauri-apps/plugin-sql` (sqlx under the hood). Imported lazily by the Tauri platform
 * only, so the web bundle never pulls in Tauri APIs.
 *
 * Known limitations of tauri-plugin-sql (to be replaced by a rusqlite command per DESIGN.md §9.2):
 *  - `select` returns rows as objects. The plugin builds them from an IndexMap in column order, and JS
 *    preserves insertion order for non-integer keys, so we map `Object.values(row)` to the array drizzle
 *    expects. This breaks when a statement yields two columns with the same name (e.g. an un-aliased join
 *    selecting `a.id, b.id`): the second silently overwrites the first. Repositories therefore only issue
 *    single-table queries or alias every column.
 *  - Integer-like column names (`"1"`) would be reordered by JS; none exist in the schema.
 *  - BLOB values arrive as JSON arrays of bytes and are converted back to Uint8Array; large blobs are slow.
 *  - sqlx uses a connection pool, so BEGIN/COMMIT across separate `execute` calls are only reliable when no
 *    other statement runs concurrently. All calls are serialised through a queue here, which makes the pool
 *    reuse the same idle connection in practice.
 */
import type { DbExecutor, ExecMethod, SqlValue } from '../executor.js';
import { applyMigrations, normaliseParams } from './migrate.js';

export const TAURI_DB_URL = 'sqlite:epistemics.db';

type TauriDatabase = {
  execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  close(db?: string): Promise<boolean>;
};

const RETURNS_ROWS = /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i;
const HAS_RETURNING = /\bRETURNING\b/i;

export async function createTauriExecutor(url: string = TAURI_DB_URL): Promise<DbExecutor> {
  let db: TauriDatabase;
  try {
    const mod = await import('@tauri-apps/plugin-sql');
    db = await mod.default.load(url);
  } catch (e) {
    throw new Error(`Could not open the desktop database (${url}): ${e instanceof Error ? e.message : String(e)}`);
  }
  await db.execute('PRAGMA journal_mode = WAL');

  // Serialise all statements: sqlx pooling + explicit BEGIN/COMMIT need a single in-flight statement.
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  }

  async function execute(sql: string, params: SqlValue[], method: ExecMethod): Promise<SqlValue[][]> {
    const bound = toBind(params);
    const wantsRows = method !== 'run' || RETURNS_ROWS.test(sql) || HAS_RETURNING.test(sql);
    if (!wantsRows) {
      await db.execute(sql, bound);
      return [];
    }
    const objRows = await db.select<Record<string, unknown>[]>(sql, bound);
    const rows = objRows.map((r) => Object.values(r).map(fromTauri));
    if (method === 'run') return [];
    if (method === 'get') return rows.length ? [rows[0]!] : [];
    return rows;
  }

  const exec: DbExecutor = {
    platform: 'tauri',
    run(sql, params, method) {
      return serial(async () => ({ rows: await execute(sql, params, method) }));
    },
    batch(statements) {
      return serial(async () => {
        await db.execute('BEGIN');
        try {
          for (const s of statements) await execute(s.sql, s.params, 'run');
          await db.execute('COMMIT');
        } catch (e) {
          try { await db.execute('ROLLBACK'); } catch { /* ignore */ }
          throw e;
        }
      });
    },
    async migrate() {
      return applyMigrations(exec);
    },
    close() {
      return serial(async () => { await db.close(); });
    },
  };
  return exec;
}

function toBind(params: SqlValue[]): unknown[] {
  return normaliseParams(params).map((p) => {
    if (typeof p === 'bigint') return Number(p);
    if (p instanceof Uint8Array) return Array.from(p); // plugin-sql has no binary channel; see module doc
    return p;
  });
}

function fromTauri(v: unknown): SqlValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Uint8Array) return v;
  if (Array.isArray(v) && v.every((x) => typeof x === 'number')) return Uint8Array.from(v as number[]);
  return JSON.stringify(v);
}
