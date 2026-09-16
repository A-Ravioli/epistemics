/**
 * Node executor on the built-in `node:sqlite` (Node ≥ 22.5). Synchronous under the hood, exposed as async.
 * Used by tests, the server, and CLI tooling. Rows are returned as arrays in column order via
 * `StatementSync.setReturnArrays(true)`.
 */
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type { DbExecutor, ExecMethod, SqlValue } from '../executor.js';
import { applyMigrations, normaliseParams } from './migrate.js';

export interface NodeExecutorOptions {
  /** Applied on open. Defaults enable WAL for file databases and foreign keys off (drizzle schema has no FKs). */
  pragmas?: string[];
}

export function createNodeExecutor(path: string | ':memory:' = ':memory:', opts: NodeExecutorOptions = {}): DbExecutor & { readonly raw: DatabaseSync } {
  const db = new DatabaseSync(path);
  const pragmas = opts.pragmas ?? (path === ':memory:' ? [] : ['PRAGMA journal_mode = WAL', 'PRAGMA synchronous = NORMAL']);
  for (const p of pragmas) db.exec(p);
  const cache = new Map<string, StatementSync>();

  function prepare(sql: string): StatementSync {
    let stmt = cache.get(sql);
    if (!stmt) {
      stmt = db.prepare(sql);
      stmt.setReadBigInts(false);
      stmt.setReturnArrays(true);
      if (cache.size > 256) cache.clear();
      cache.set(sql, stmt);
    }
    return stmt;
  }

  function execute(sql: string, params: SqlValue[], method: ExecMethod): SqlValue[][] {
    const stmt = prepare(sql);
    const bound = normaliseParams(params) as never[];
    if (method === 'run' && !/\breturning\b/i.test(sql)) {
      stmt.run(...bound);
      return [];
    }
    const rows = stmt.all(...bound) as unknown as SqlValue[][];
    if (method === 'get') return rows.length ? [rows[0]!] : [];
    return rows.map((r) => Array.from(r, toValue));
  }

  const exec: DbExecutor & { readonly raw: DatabaseSync } = {
    platform: path === ':memory:' ? 'memory' : 'node',
    raw: db,
    async run(sql, params, method) {
      return { rows: execute(sql, params, method) };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        for (const s of statements) execute(s.sql, s.params, 'run');
        db.exec('COMMIT');
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
        throw e;
      }
    },
    async migrate() {
      return applyMigrations(exec);
    },
    async close() {
      cache.clear();
      db.close();
    },
  };
  return exec;
}

function toValue(v: unknown): SqlValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') return v;
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  return String(v);
}
