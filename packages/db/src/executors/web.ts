/**
 * Browser executor: proxies every call to the sqlite-wasm Worker (web.worker.ts) over a request/response
 * channel. One tab owns the database at a time: we hold the Web Lock `epistemics-db` for the lifetime of the
 * executor and refuse to open (DbLockedError) when another tab already holds it, because opfs-sahpool
 * gives exclusive access handles to one context only.
 */
import type { DbExecutor, ExecMethod, SqlValue } from '../executor.js';
import { applyMigrations } from './migrate.js';
import type { WorkerRequest, WorkerResponse, WorkerStatus } from './web.worker.js';

export const DB_LOCK_NAME = 'epistemics-db';

export class DbLockedError extends Error {
  override readonly name = 'DbLockedError';
  constructor() {
    super('The Epistemics database is open in another tab. Close it there (or reload this tab after closing it) to continue.');
  }
}

export interface WebExecutor extends DbExecutor {
  /** 'opfs' when persisted; 'memory' when OPFS is unavailable (private mode) and data is lost on reload. */
  readonly storage: 'opfs' | 'memory';
  readonly sqliteVersion: string;
  exportDatabase(): Promise<Uint8Array>;
  importDatabase(bytes: Uint8Array): Promise<void>;
}

export interface WebExecutorOptions {
  /** Provide your own worker (e.g. bundler-specific construction). Defaults to a Vite-style `new URL()` worker. */
  worker?: Worker;
  /** Skip the Web Locks single-owner check (tests). */
  skipLock?: boolean;
}

export async function createWebExecutor(opts: WebExecutorOptions = {}): Promise<WebExecutor> {
  const releaseLock = opts.skipLock ? () => {} : await acquireLock();
  const worker = opts.worker ?? new Worker(new URL('./web.worker.ts', import.meta.url), { type: 'module' });

  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let statusResolve!: (s: WorkerStatus) => void;
  const status = new Promise<WorkerStatus>((r) => { statusResolve = r; });

  worker.onmessage = (ev: MessageEvent<WorkerResponse | WorkerStatus>) => {
    const m = ev.data;
    if ('type' in m && m.type === 'status') { statusResolve(m); return; }
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.result);
    else p.reject(new Error(m.error));
  };
  worker.onerror = (ev) => {
    const err = new Error(`sqlite worker error: ${ev.message ?? 'unknown'}`);
    for (const p of pending.values()) p.reject(err);
    pending.clear();
    statusResolve({ type: 'status', ok: false, error: err.message });
  };

  function request<T>(req: Omit<WorkerRequest, 'id'>, transfer?: Transferable[]): Promise<T> {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ ...req, id }, transfer ?? []);
    });
  }

  const s = await status;
  if (!s.ok) {
    worker.terminate();
    releaseLock();
    throw new Error(`Could not open the database: ${s.error}`);
  }

  const exec: WebExecutor = {
    platform: 'web',
    storage: s.storage,
    sqliteVersion: s.sqliteVersion,
    async run(sql: string, params: SqlValue[], method: ExecMethod) {
      const rows = await request<SqlValue[][]>({ type: 'run', sql, params, method });
      return { rows };
    },
    async batch(statements) {
      await request<void>({ type: 'batch', statements });
    },
    async migrate() {
      return applyMigrations(exec);
    },
    async exportDatabase() {
      return request<Uint8Array>({ type: 'export' });
    },
    async importDatabase(bytes: Uint8Array) {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      await request<void>({ type: 'import', bytes: copy }, [copy.buffer]);
    },
    async close() {
      try { await request<void>({ type: 'close' }); } finally {
        worker.terminate();
        releaseLock();
      }
    },
  };
  return exec;
}

/** Hold the single-owner lock until the returned function is called. Throws DbLockedError if another tab has it. */
async function acquireLock(): Promise<() => void> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (!locks) return () => {};
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  const acquired = await new Promise<boolean>((resolve, reject) => {
    locks.request(DB_LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (!lock) { resolve(false); return; }
      resolve(true);
      await held;
    }).catch(reject);
  });
  if (!acquired) throw new DbLockedError();
  return release;
}

/** Convenience wrappers for callers holding a plain DbExecutor. */
export async function exportDatabase(exec: DbExecutor): Promise<Uint8Array> {
  if (!('exportDatabase' in exec)) throw new Error('exportDatabase is only supported by the web executor');
  return (exec as WebExecutor).exportDatabase();
}
export async function importDatabase(exec: DbExecutor, bytes: Uint8Array): Promise<void> {
  if (!('importDatabase' in exec)) throw new Error('importDatabase is only supported by the web executor');
  return (exec as WebExecutor).importDatabase(bytes);
}
