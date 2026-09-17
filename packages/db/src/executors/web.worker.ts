/**
 * Dedicated Worker hosting sqlite-wasm. Storage: `opfs-sahpool` VFS (works in Safari/WKWebView and
 * without cross-origin isolation, because it only needs synchronous access handles in a worker). Falls
 * back to an in-memory database when OPFS is unavailable (private mode, old browsers, file:// origins),
 * which the main thread learns from the `status` message.
 *
 * Protocol (see web.ts): every request carries an `id`; the worker answers `{ id, ok, result | error }`.
 * On start it posts `{ type: 'status', ... }` once the database is open.
 */
import sqlite3InitModule, { type Database, type SAHPoolUtil, type Sqlite3Static, type SqlValue as WasmSqlValue } from '@sqlite.org/sqlite-wasm';
import type { ExecMethod, SqlValue } from '../executor.js';

export const DB_FILENAME = '/epistemics.db';
export const VFS_NAME = 'epistemics';

export type WorkerRequest =
  | { id: number; type: 'run'; sql: string; params: SqlValue[]; method: ExecMethod }
  | { id: number; type: 'batch'; statements: { sql: string; params: SqlValue[] }[] }
  | { id: number; type: 'export' }
  | { id: number; type: 'import'; bytes: Uint8Array }
  | { id: number; type: 'close' };

export type WorkerStatus = { type: 'status'; ok: true; storage: 'opfs' | 'memory'; sqliteVersion: string }
  | { type: 'status'; ok: false; error: string };

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

let sqlite3: Sqlite3Static;
let db: Database;
let pool: SAHPoolUtil | undefined;
let storage: 'opfs' | 'memory' = 'memory';

const post = (m: WorkerResponse | WorkerStatus, transfer?: Transferable[]) =>
  (self as unknown as Worker).postMessage(m, transfer ?? []);

async function openDatabase(): Promise<void> {
  if (typeof navigator !== 'undefined' && 'storage' in navigator && typeof (navigator.storage as StorageManager).getDirectory === 'function') {
    try {
      pool = await sqlite3.installOpfsSAHPoolVfs({ name: VFS_NAME, initialCapacity: 6 });
      db = new pool.OpfsSAHPoolDb(DB_FILENAME);
      storage = 'opfs';
      return;
    } catch (e) {
      console.warn('[epistemics-db] OPFS unavailable, falling back to in-memory database:', e);
      pool = undefined;
    }
  }
  db = new sqlite3.oo1.DB(':memory:');
  storage = 'memory';
}

function bindParams(params: SqlValue[]): WasmSqlValue[] {
  return params.map((p): WasmSqlValue => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p as WasmSqlValue;
  });
}

function exec(sql: string, params: SqlValue[], method: ExecMethod): SqlValue[][] {
  const rows = db.exec({ sql, bind: bindParams(params), rowMode: 'array', returnValue: 'resultRows' }) as unknown as SqlValue[][];
  if (method === 'run') return [];
  if (method === 'get') return rows.length ? [rows[0]!] : [];
  return rows;
}

function exportBytes(): Uint8Array {
  return sqlite3.capi.sqlite3_js_db_export(db.pointer!);
}

async function importBytes(bytes: Uint8Array): Promise<void> {
  db.close();
  if (pool && storage === 'opfs') {
    await pool.importDb(DB_FILENAME, bytes);
    db = new pool.OpfsSAHPoolDb(DB_FILENAME);
    return;
  }
  db = new sqlite3.oo1.DB(':memory:');
  const p = sqlite3.wasm.allocFromTypedArray(bytes);
  const flags = sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE;
  const rc = sqlite3.capi.sqlite3_deserialize(db.pointer!, 'main', p, bytes.byteLength, bytes.byteLength, flags);
  db.checkRc(rc);
}

async function handle(req: WorkerRequest): Promise<unknown> {
  switch (req.type) {
    case 'run':
      return exec(req.sql, req.params, req.method);
    case 'batch':
      db.exec('BEGIN');
      try {
        for (const s of req.statements) exec(s.sql, s.params, 'run');
        db.exec('COMMIT');
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch { /* ignore */ }
        throw e;
      }
      return undefined;
    case 'export':
      return exportBytes();
    case 'import':
      await importBytes(req.bytes);
      return undefined;
    case 'close':
      db.close();
      return undefined;
  }
}

const ready = (async () => {
  try {
    sqlite3 = await sqlite3InitModule();
    await openDatabase();
    post({ type: 'status', ok: true, storage, sqliteVersion: sqlite3.version.libVersion });
  } catch (e) {
    post({ type: 'status', ok: false, error: errorMessage(e) });
    throw e;
  }
})();

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    await ready;
    const result = await handle(req);
    if (result instanceof Uint8Array) post({ id: req.id, ok: true, result }, [result.buffer as ArrayBuffer]);
    else post({ id: req.id, ok: true, result });
  } catch (e) {
    post({ id: req.id, ok: false, error: errorMessage(e) });
  }
};

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
