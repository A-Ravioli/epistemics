/**
 * Last-writer-wins row sync between the local SQLite database and Supabase (Postgres + PostgREST).
 *
 *   push(): drain the local `outbox` in batches, load the touched rows, upsert them to the server.
 *   pull(): per table, fetch rows with `server_updated_at >= cursor`, apply the ones whose client
 *           `updated_at` is newer than the local copy (or that are missing locally), advance the cursor.
 *
 * Pulled rows are written with raw executor statements, so nothing re-enters the outbox. Projections
 * (`concepts`, `items`, `concept_edges`) are rebuilt locally from pulled curricula; chunk embeddings are
 * reset and recomputed by the app through `onPulled`. Protocol and conflict policy: docs/SYNC.md.
 */
import type { Db, DbExecutor, SqlValue } from '@epistemics/db';
import { decodeRowKey, deleteOutbox, countOutbox, readOutbox, rebuildProjections, type OutboxEntry, type RowKey } from '@epistemics/db';
import type { Curriculum } from '@epistemics/core';
import type { Row, SupabaseLikeClient } from './client.js';
import { SYNC_TABLES, type SyncTableSpec } from './tables.js';

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'error' | 'stopped';
  /** Outbox rows waiting to be pushed. */
  pending: number;
  lastPushAt?: number;
  lastPullAt?: number;
  lastError?: string;
  /** Cumulative counters for this engine instance. */
  pushed: number;
  pulled: number;
}

export interface SyncEngineOptions {
  db: Db;
  executor: DbExecutor;
  client: SupabaseLikeClient;
  userId: string;
  tables?: SyncTableSpec[];
  now?: () => number;
  log?: (message: string, ...args: unknown[]) => void;
  /** Called after a pull applied `rows` of `table` (already written locally). */
  onPulled?: (table: string, rows: Row[]) => Promise<void> | void;
  /** Outbox rows per push batch. Default 500. */
  pushBatch?: number;
  /** Rows per pull page. Default 1000. */
  pullLimit?: number;
  /** Debounce for `requestSync()`. Default 2000ms. */
  debounceMs?: number;
}

export interface SyncEngine {
  push(): Promise<number>;
  pull(): Promise<number>;
  /** push then pull; never throws, errors land in `status().lastError`. */
  syncOnce(): Promise<SyncStatus>;
  /** Debounced `syncOnce()` for activity-driven syncs. */
  requestSync(): void;
  start(opts?: { intervalMs?: number; onStatus?: (s: SyncStatus) => void }): void;
  stop(): void;
  status(): SyncStatus;
  /** Recount the outbox (cheap) and notify listeners. */
  refreshPending(): Promise<number>;
}

const EPOCH = '1970-01-01T00:00:00.000Z';
const SQL_CHUNK = 200;

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

function toJs(v: SqlValue): unknown {
  if (typeof v === 'bigint') return Number(v);
  return v;
}

function toSql(v: unknown): SqlValue {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') return v;
  if (v instanceof Uint8Array) return v;
  return JSON.stringify(v);
}

export function keyOf(spec: SyncTableSpec, row: Row): RowKey {
  if (spec.pk.length === 1) return String(row[spec.pk[0]!]);
  const out: Record<string, string | number> = {};
  for (const c of spec.pk) {
    const v = row[c];
    out[camel(c)] = typeof v === 'number' ? v : String(v);
  }
  return out;
}

/** Outbox keys use the repository's camelCase field names (`{courseId, conceptId}`); SQL columns are snake_case. */
function camel(col: string): string {
  return col.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

function keyValues(spec: SyncTableSpec, key: RowKey): SqlValue[] {
  if (typeof key === 'string') return [key];
  return spec.pk.map((c) => key[camel(c)] ?? key[c] ?? null);
}

const keyId = (spec: SyncTableSpec, key: RowKey): string => JSON.stringify(keyValues(spec, key));

/** SELECT the given rows by primary key. Returns a map from `keyId` to row object (SQL column names). */
async function loadLocal(executor: DbExecutor, spec: SyncTableSpec, keys: RowKey[], columns: string[]): Promise<Map<string, Row>> {
  const out = new Map<string, Row>();
  const cols = columns.map(q).join(', ');
  for (let i = 0; i < keys.length; i += SQL_CHUNK) {
    const slice = keys.slice(i, i + SQL_CHUNK);
    const params: SqlValue[] = [];
    let where: string;
    if (spec.pk.length === 1) {
      where = `${q(spec.pk[0]!)} IN (${slice.map(() => '?').join(', ')})`;
      for (const k of slice) params.push(...keyValues(spec, k));
    } else {
      const tuple = `(${spec.pk.map(() => '?').join(', ')})`;
      where = `(${spec.pk.map(q).join(', ')}) IN (VALUES ${slice.map(() => tuple).join(', ')})`;
      for (const k of slice) params.push(...keyValues(spec, k));
    }
    const { rows } = await executor.run(`SELECT ${cols} FROM ${q(spec.table)} WHERE ${where}`, params, 'all');
    for (const r of rows) {
      const obj: Row = {};
      columns.forEach((c, idx) => { obj[c] = toJs(r[idx] ?? null); });
      out.set(keyId(spec, keyOf(spec, obj)), obj);
    }
  }
  return out;
}

export function createSyncEngine(opts: SyncEngineOptions): SyncEngine {
  const { db, executor, client, userId } = opts;
  const tables = opts.tables ?? SYNC_TABLES;
  const byName = new Map(tables.map((t) => [t.table, t]));
  const now = opts.now ?? (() => Date.now());
  const log = opts.log ?? (() => undefined);
  const pushBatch = opts.pushBatch ?? 500;
  const pullLimit = opts.pullLimit ?? 1000;
  const debounceMs = opts.debounceMs ?? 2000;

  const status: SyncStatus = { state: 'idle', pending: 0, pushed: 0, pulled: 0 };
  let onStatus: ((s: SyncStatus) => void) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<SyncStatus> | undefined;
  let rerun = false;

  const notify = () => onStatus?.({ ...status });

  // ---------------- sync state ----------------

  async function getCursor(table: string): Promise<string> {
    const { rows } = await executor.run('SELECT last_pull_server_ts FROM _sync_state WHERE table_name = ?', [table], 'get');
    const v = rows[0]?.[0];
    return typeof v === 'string' && v ? v : EPOCH;
  }

  async function setState(table: string, patch: { lastPullServerTs?: string; lastPushAt?: number; lastPullAt?: number }): Promise<void> {
    await executor.run(
      `INSERT INTO _sync_state (table_name, last_pull_server_ts, last_push_at, last_pull_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(table_name) DO UPDATE SET
         last_pull_server_ts = COALESCE(excluded.last_pull_server_ts, _sync_state.last_pull_server_ts),
         last_push_at = COALESCE(excluded.last_push_at, _sync_state.last_push_at),
         last_pull_at = COALESCE(excluded.last_pull_at, _sync_state.last_pull_at)`,
      [table, patch.lastPullServerTs ?? null, patch.lastPushAt ?? null, patch.lastPullAt ?? null],
      'run',
    );
  }

  // ---------------- push ----------------

  async function pushEntries(entries: OutboxEntry[]): Promise<number> {
    const groups = new Map<string, Map<string, RowKey>>();
    for (const e of entries) {
      const spec = byName.get(e.tableName);
      if (!spec) continue; // table no longer synced: drop the entry
      const key = decodeRowKey(e.rowId);
      const g = groups.get(e.tableName) ?? new Map<string, RowKey>();
      g.set(keyId(spec, key), key);
      groups.set(e.tableName, g);
    }
    let n = 0;
    const t = now();
    for (const [table, keys] of groups) {
      const spec = byName.get(table)!;
      const updCol = spec.updatedAtColumn ?? 'updated_at';
      const local = await loadLocal(executor, spec, [...keys.values()], spec.columns);
      const remote: Row[] = [];
      for (const row of local.values()) {
        if (spec.pushFilter && !spec.pushFilter(row)) continue;
        remote.push({ ...row, user_id: userId, updated_at: Number(row[updCol] ?? 0) });
      }
      if (remote.length === 0) continue;
      const { error } = await client.from(table).upsert(remote, { onConflict: ['user_id', ...spec.pk].join(',') });
      if (error) throw new Error(`push ${table}: ${error.message}`);
      n += remote.length;
      await setState(table, { lastPushAt: t });
    }
    await deleteOutbox(db, entries.map((e) => e.id));
    return n;
  }

  async function push(): Promise<number> {
    let total = 0;
    for (;;) {
      const entries = await readOutbox(db, pushBatch);
      if (entries.length === 0) break;
      total += await pushEntries(entries);
      if (entries.length < pushBatch) break;
    }
    if (total > 0 || (await countOutbox(db)) === 0) status.lastPushAt = now();
    status.pushed += total;
    log('push', total);
    return total;
  }

  // ---------------- pull ----------------

  async function applyRows(spec: SyncTableSpec, rows: Row[]): Promise<Row[]> {
    if (rows.length === 0) return [];
    const updCol = spec.updatedAtColumn ?? 'updated_at';
    const keys = rows.map((r) => keyOf(spec, r));
    const local = await loadLocal(executor, spec, keys, [...spec.pk, updCol]);
    const applied: Row[] = [];
    const statements: { sql: string; params: SqlValue[] }[] = [];
    const cols = spec.columns;
    const resets = spec.resetOnPull ?? [];
    const insertCols = [...cols, ...resets];
    const placeholders = insertCols.map(() => '?').join(', ');
    const nonPk = cols.filter((c) => !spec.pk.includes(c));
    const setClause = [...nonPk.map((c) => `${q(c)} = excluded.${q(c)}`), ...resets.map((c) => `${q(c)} = NULL`)].join(', ');
    const conflict = `ON CONFLICT(${spec.pk.map(q).join(', ')})`;
    const sql = spec.appendOnly || nonPk.length === 0
      ? `INSERT INTO ${q(spec.table)} (${insertCols.map(q).join(', ')}) VALUES (${placeholders}) ${conflict} DO NOTHING`
      : `INSERT INTO ${q(spec.table)} (${insertCols.map(q).join(', ')}) VALUES (${placeholders}) ${conflict} DO UPDATE SET ${setClause} WHERE excluded.${q(updCol)} > ${q(spec.table)}.${q(updCol)}`;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const incoming = Number(r['updated_at'] ?? r[updCol] ?? 0);
      const mine = local.get(keyId(spec, keys[i]!));
      if (mine && !(incoming > Number(mine[updCol] ?? 0))) continue;
      if (mine && spec.appendOnly) continue;
      const localRow: Row = {};
      for (const c of cols) localRow[c] = c === updCol ? incoming : (r[c] ?? null);
      statements.push({ sql, params: [...cols.map((c) => toSql(localRow[c])), ...resets.map(() => null)] });
      applied.push(localRow);
    }
    for (let i = 0; i < statements.length; i += SQL_CHUNK) await executor.batch(statements.slice(i, i + SQL_CHUNK));
    return applied;
  }

  async function afterPull(spec: SyncTableSpec, applied: Row[]): Promise<void> {
    if (applied.length === 0) return;
    if (spec.table === 'curricula') {
      const latest = new Map<string, Row>();
      for (const r of applied) {
        if (r['deleted_at'] !== null && r['deleted_at'] !== undefined) continue;
        const prev = latest.get(String(r['id']));
        if (!prev || Number(r['version']) > Number(prev['version'])) latest.set(String(r['id']), r);
      }
      for (const r of latest.values()) {
        const { rows } = await executor.run('SELECT MAX(version) FROM curricula WHERE id = ? AND deleted_at IS NULL', [String(r['id'])], 'get');
        if (Number(rows[0]?.[0]) !== Number(r['version'])) continue; // an even newer version is already projected locally
        try {
          await rebuildProjections(db, JSON.parse(String(r['curriculum_json'])) as Curriculum);
        } catch (e) {
          log('rebuildProjections failed', r['id'], e);
        }
      }
    }
    await opts.onPulled?.(spec.table, applied);
  }

  async function pullTable(spec: SyncTableSpec): Promise<number> {
    let cursor = await getCursor(spec.table);
    let useGt = false;
    let total = 0;
    for (;;) {
      let query = client.from(spec.table).select('*');
      query = useGt ? query.gt('server_updated_at', cursor) : query.gte('server_updated_at', cursor);
      query = query.order('server_updated_at', { ascending: true });
      for (const c of spec.pk) query = query.order(c, { ascending: true }); // tiebreaker for equal timestamps
      query = query.limit(pullLimit);
      const { data, error } = await query;
      if (error) throw new Error(`pull ${spec.table}: ${error.message}`);
      const rows = data ?? [];
      const applied = await applyRows(spec, rows);
      total += applied.length;
      await afterPull(spec, applied);
      if (rows.length === 0) break;
      const last = String(rows[rows.length - 1]!['server_updated_at']);
      // A full page whose rows all share one timestamp cannot advance with `>=`; step past it.
      useGt = rows.length === pullLimit && last === cursor;
      cursor = last;
      await setState(spec.table, { lastPullServerTs: cursor, lastPullAt: now() });
      if (rows.length < pullLimit) break;
    }
    return total;
  }

  async function pull(): Promise<number> {
    let total = 0;
    for (const spec of tables) total += await pullTable(spec);
    status.lastPullAt = now();
    status.pulled += total;
    log('pull', total);
    return total;
  }

  // ---------------- orchestration ----------------

  async function refreshPending(): Promise<number> {
    status.pending = await countOutbox(db);
    notify();
    return status.pending;
  }

  async function run(): Promise<SyncStatus> {
    status.state = 'syncing';
    notify();
    try {
      await push();
      await pull();
      status.state = 'idle';
      delete status.lastError;
    } catch (e) {
      status.state = 'error';
      status.lastError = e instanceof Error ? e.message : String(e);
      log('sync failed', e);
    }
    try {
      status.pending = await countOutbox(db);
    } catch { /* ignore */ }
    notify();
    return { ...status };
  }

  function syncOnce(): Promise<SyncStatus> {
    if (running) {
      rerun = true;
      return running;
    }
    running = run().finally(() => {
      running = undefined;
      if (rerun) {
        rerun = false;
        void syncOnce();
      }
    });
    return running;
  }

  return {
    push,
    pull,
    syncOnce,
    requestSync() {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { debounce = undefined; void syncOnce(); }, debounceMs);
    },
    start(o = {}) {
      onStatus = o.onStatus;
      if (timer) clearInterval(timer);
      timer = setInterval(() => void syncOnce(), o.intervalMs ?? 60_000);
      status.state = 'idle';
      void syncOnce();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (debounce) clearTimeout(debounce);
      debounce = undefined;
      status.state = 'stopped';
      notify();
    },
    status: () => ({ ...status }),
    refreshPending,
  };
}
