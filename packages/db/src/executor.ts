/**
 * The one interface that differs per platform. Everything above it (Drizzle queries, repositories)
 * is shared. Implementations: node.ts (node:sqlite, tests/server), web.ts (sqlite-wasm on OPFS in a
 * Worker), tauri.ts (tauri-plugin-sql).
 */
export type SqlValue = string | number | bigint | Uint8Array | null;
export type ExecMethod = 'run' | 'all' | 'get' | 'values';

export interface DbExecutor {
  /** Execute one statement. `rows` are arrays of column values in column order (what drizzle's sqlite-proxy expects). */
  run(sql: string, params: SqlValue[], method: ExecMethod): Promise<{ rows: SqlValue[][] }>;
  /** Execute several statements atomically. */
  batch(statements: { sql: string; params: SqlValue[] }[]): Promise<void>;
  /** Apply pending migrations (idempotent). Returns the number applied. */
  migrate(): Promise<number>;
  close(): Promise<void>;
  readonly platform: 'node' | 'web' | 'tauri' | 'memory';
}
