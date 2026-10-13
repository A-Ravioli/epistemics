import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { DbExecutor } from '@epistemics/db';
import { createMemoryExecutor } from '@epistemics/db/memory';
import {
  createDb, saveCurriculum, enrol, getCards, saveCards, appendReviewLogs, upsertConceptState, emptyConceptState,
  getConceptState, countOutbox, getConcept, getCurriculum, listCourses, setSetting, getSetting, saveSource, getChunksBySource,
  saveEmbedding, listChunksMissingEmbedding, insertLlmCall, listLlmCalls, getReviewLog, getCourse, type Db,
} from '@epistemics/db';
import { createSyncEngine, keyOf, SYNC_TABLES, type Row, type SyncEngine } from '../src/index.js';
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js';
import { makeCurriculum, goals, settings } from './fixture.js';

const NOW = 1_720_000_000_000;

interface Device { exec: DbExecutor; db: Db; engine: SyncEngine; pulled: { table: string; rows: Row[] }[] }

async function device(server: FakeSupabase, userId = 'user-a', extra: Partial<Parameters<typeof createSyncEngine>[0]> = {}): Promise<Device> {
  const exec = createMemoryExecutor();
  await exec.migrate();
  const db = createDb(exec);
  const pulled: Device['pulled'] = [];
  const engine = createSyncEngine({
    db, executor: exec, client: server.client, userId, now: () => NOW + 100,
    onPulled: (table, rows) => { pulled.push({ table, rows }); }, ...extra,
  });
  return { exec, db, engine, pulled };
}

let server: FakeSupabase;
let devices: Device[] = [];
beforeEach(() => { server = createFakeSupabase(); devices = []; });
afterEach(async () => { for (const d of devices) await d.exec.close(); });

async function newDevice(userId = 'user-a', extra: Partial<Parameters<typeof createSyncEngine>[0]> = {}): Promise<Device> {
  const d = await device(server, userId, extra);
  devices.push(d);
  return d;
}

describe('push', () => {
  it('writes dirty rows with user_id and updated_at, then clears the outbox', async () => {
    const a = await newDevice();
    const c = makeCurriculum();
    await saveCurriculum(a.db, c, NOW);
    const course = await enrol(a.db, c, goals, settings, NOW + 1);
    expect(await countOutbox(a.db)).toBeGreaterThan(0);

    const n = await a.engine.push();
    expect(n).toBe(1 + 1 + 6); // curriculum, course, six cards
    expect(await countOutbox(a.db)).toBe(0);
    const remoteCourse = server.rows('courses')[0]!;
    expect(remoteCourse['id']).toBe(course.id);
    expect(remoteCourse['user_id']).toBe('user-a');
    expect(remoteCourse['updated_at']).toBe(NOW + 1);
    expect(typeof remoteCourse['server_updated_at']).toBe('string');
    expect(server.rows('curricula')[0]!['version']).toBe(1);
    expect(server.rows('cards')).toHaveLength(6);
    // idempotent
    expect(await a.engine.push()).toBe(0);
  });

  it('pushes append-only tables using their own timestamp and skips local-only settings', async () => {
    const a = await newDevice();
    await appendReviewLogs(a.db, [{ id: 'rl1', cardId: 'k', courseId: 'co', reviewTime: NOW + 5, rating: 3, stateBefore: 0, elapsedDays: 0, scheduledDays: 1, stability: 1, difficulty: 5, source: 'review', assisted: false }]);
    await insertLlmCall(a.db, { id: 'l1', role: 'tutor', model: 'm', inputTokens: 1, cacheRead: 0, cacheWrite: 0, outputTokens: 1, costUsd: 0.1, latencyMs: 1, createdAt: NOW + 6 });
    await setSetting(a.db, 'llm', { mode: 'mock' }, NOW);
    await setSetting(a.db, 'sync', { supabaseUrl: 'x' }, NOW);
    await setSetting(a.db, 'activeCourseId', 'co', NOW);
    await a.engine.push();
    expect(server.rows('review_log')[0]!['updated_at']).toBe(NOW + 5);
    expect(server.rows('llm_calls')[0]!['updated_at']).toBe(NOW + 6);
    expect(server.rows('settings').map((r) => r['key'])).toEqual(['activeCourseId']);
    expect(await countOutbox(a.db)).toBe(0);
  });

  it('drops outbox entries for rows that no longer exist locally', async () => {
    const a = await newDevice();
    await setSetting(a.db, 'k', 1, NOW);
    await a.exec.run("DELETE FROM settings WHERE key = 'k'", [], 'run');
    expect(await a.engine.push()).toBe(0);
    expect(await countOutbox(a.db)).toBe(0);
  });

  it('pushes in batches and keeps the outbox on failure', async () => {
    const a = await newDevice('user-a', { pushBatch: 3 });
    for (let i = 0; i < 7; i++) await setSetting(a.db, `k${i}`, i, NOW + i);
    server.failWith = 'network down';
    await expect(a.engine.push()).rejects.toThrow('network down');
    expect(await countOutbox(a.db)).toBe(7);
    delete server.failWith;
    expect(await a.engine.push()).toBe(7);
    expect(server.calls.upserts).toBe(1 + 3);
    expect(await countOutbox(a.db)).toBe(0);
  });
});

describe('pull', () => {
  it('applies newer rows, skips older ones, and never re-enters the outbox', async () => {
    const a = await newDevice();
    const b = await newDevice();
    await setSetting(a.db, 'theme', 'dark', NOW + 10);
    await a.engine.push();
    // B has an older local value and a newer one for another key
    await setSetting(b.db, 'theme', 'light', NOW + 5);
    await setSetting(b.db, 'other', 'mine', NOW + 20);
    await b.engine.push();
    expect(server.rows('settings').find((r) => r['key'] === 'theme')!['value_json']).toBe('"dark"'); // server LWW kept A's
    await b.engine.pull();
    expect(await getSetting(b.db, 'theme')).toBe('dark');
    expect(await getSetting(b.db, 'other')).toBe('mine');
    expect(await countOutbox(b.db)).toBe(0);
    // A pulls B's row but keeps its own newer theme
    await a.engine.pull();
    expect(await getSetting(a.db, 'other')).toBe('mine');
    expect(await getSetting(a.db, 'theme')).toBe('dark');
    expect(await countOutbox(a.db)).toBe(0);
    expect(a.pulled.map((p) => p.table)).toEqual(['settings']);
  });

  it('two devices converge: A writes, both sync, B writes, both sync', async () => {
    const a = await newDevice();
    const b = await newDevice();
    const c = makeCurriculum();
    await saveCurriculum(a.db, c, NOW);
    const course = await enrol(a.db, c, goals, settings, NOW + 1);
    await a.engine.syncOnce();
    await b.engine.syncOnce();

    expect((await listCourses(b.db)).map((x) => x.id)).toEqual([course.id]);
    expect(await getCurriculum(b.db, 'curr-1', 1)).toEqual(c);
    expect((await getConcept(b.db, 'c1'))?.items.map((i) => i.id).sort()).toEqual(['i1', 'i2']); // projections rebuilt
    expect((await getCards(b.db, course.id))).toHaveLength(6);
    expect(await countOutbox(b.db)).toBe(0);

    // B reviews a card and records concept state
    const card = (await getCards(b.db, course.id))[0]!;
    await saveCards(b.db, [{ ...card, reps: 1, due: NOW + 50 }], NOW + 50);
    await appendReviewLogs(b.db, [{ id: 'rl1', cardId: card.id, courseId: course.id, reviewTime: NOW + 50, rating: 3, stateBefore: 0, elapsedDays: 0, scheduledDays: 1, stability: 1, difficulty: 5, source: 'review', assisted: false }]);
    await upsertConceptState(b.db, { ...emptyConceptState(course.id, 'c1', NOW + 51), mastery: 0.4 });
    await b.engine.syncOnce();
    await a.engine.syncOnce();

    const cardA = (await getCards(a.db, course.id)).find((x) => x.id === card.id)!;
    expect(cardA.reps).toBe(1);
    expect(cardA.due).toBe(NOW + 50);
    expect((await getReviewLog(a.db, course.id)).map((l) => l.id)).toEqual(['rl1']);
    expect((await getConceptState(a.db, course.id, 'c1'))?.mastery).toBe(0.4);
    expect(await countOutbox(a.db)).toBe(0);
    expect(a.engine.status().state).toBe('idle');
    expect(a.engine.status().lastError).toBeUndefined();
  });

  it('handles composite keys and conflicting concurrent edits by client clock', async () => {
    const a = await newDevice();
    const b = await newDevice();
    await upsertConceptState(a.db, { ...emptyConceptState('co', 'c1', NOW + 10), mastery: 0.1 });
    await upsertConceptState(b.db, { ...emptyConceptState('co', 'c1', NOW + 20), mastery: 0.2 });
    await saveCurriculum(a.db, makeCurriculum(1), NOW + 1);
    await saveCurriculum(a.db, makeCurriculum(2), NOW + 2);
    await b.engine.syncOnce();
    await a.engine.syncOnce();
    await b.engine.syncOnce();
    expect((await getConceptState(a.db, 'co', 'c1'))?.mastery).toBe(0.2);
    expect((await getConceptState(b.db, 'co', 'c1'))?.mastery).toBe(0.2);
    expect(server.rows('concept_state')).toHaveLength(1);
    expect(server.rows('curricula').map((r) => r['version']).sort()).toEqual([1, 2]);
    expect((await getCurriculum(b.db, 'curr-1', 2))?.manifest.version).toBe(2);
    expect(keyOf(SYNC_TABLES.find((t) => t.table === 'concept_state')!, { course_id: 'co', concept_id: 'c1' })).toEqual({ courseId: 'co', conceptId: 'c1' });
  });

  it('append-only rows are inserted once and never overwritten', async () => {
    const a = await newDevice();
    const b = await newDevice();
    await insertLlmCall(a.db, { id: 'l1', role: 'tutor', model: 'm', inputTokens: 1, cacheRead: 0, cacheWrite: 0, outputTokens: 1, costUsd: 0.1, latencyMs: 1, createdAt: NOW + 6 });
    await a.engine.syncOnce();
    await b.engine.syncOnce();
    expect((await listLlmCalls(b.db)).map((c) => c.id)).toEqual(['l1']);
    // a second pull of the same row is a no-op
    await b.exec.run('DELETE FROM _sync_state', [], 'run');
    expect(await b.engine.pull()).toBe(0);
    expect((await listLlmCalls(b.db))).toHaveLength(1);
  });

  it('chunks arrive without embeddings and the app is told to recompute them', async () => {
    const a = await newDevice();
    const b = await newDevice();
    await saveSource(a.db, { id: 'src-1', title: 'Book', kind: 'pdf', hash: 'h' }, [
      { id: 'ch-1', sourceId: 'src-1', ordinal: 0, headingPath: ['A'], text: 'hello world', tokenCount: 2, hash: 'x' },
    ], NOW);
    await saveEmbedding(a.db, 'ch-1', new Float32Array([1, 2, 3]));
    await a.engine.syncOnce();
    expect(server.rows('chunks')[0]!['embedding']).toBeUndefined();
    await b.engine.syncOnce();
    expect((await getChunksBySource(b.db, 'src-1')).map((c) => c.text)).toEqual(['hello world']);
    expect(await listChunksMissingEmbedding(b.db)).toEqual([{ id: 'ch-1', text: 'hello world' }]);
    expect(b.pulled.find((p) => p.table === 'chunks')?.rows.map((r) => r['id'])).toEqual(['ch-1']);
    // A's local embedding survives a no-op pull
    await a.engine.pull();
    expect(await listChunksMissingEmbedding(a.db)).toEqual([]);
  });

  it('persists cursors across engine restarts and pages through large tables', async () => {
    const a = await newDevice();
    for (let i = 0; i < 25; i++) await setSetting(a.db, `k${i}`, i, NOW + i);
    await a.engine.push();
    const b1 = await newDevice('user-a', { pullLimit: 10 });
    await b1.engine.pull();
    expect(server.calls.selects).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < 25; i++) expect(await getSetting(b1.db, `k${i}`)).toBe(i);
    const before = server.calls.selects;
    // restart the engine on the same database: the cursor is stored in _sync_state
    const b2 = createSyncEngine({ db: b1.db, executor: b1.exec, client: server.client, userId: 'user-a', pullLimit: 10 });
    expect(await b2.pull()).toBe(0);
    const state = await b1.exec.run("SELECT last_pull_server_ts FROM _sync_state WHERE table_name = 'settings'", [], 'get');
    expect(String(state.rows[0]?.[0])).toBe(String(server.rows('settings').map((r) => r['server_updated_at']).sort().at(-1)));
    // one page per table (all rows share the cursor timestamp or are empty)
    expect(server.calls.selects - before).toBe(SYNC_TABLES.length);
    // new writes after the cursor still arrive
    await setSetting(a.db, 'late', true, NOW + 100);
    await a.engine.push();
    await b2.pull();
    expect(await getSetting(b1.db, 'late')).toBe(true);
  });

  it('a full page sharing one server timestamp does not loop forever', async () => {
    const a = await newDevice();
    for (let i = 0; i < 10; i++) await setSetting(a.db, `k${i}`, i, NOW + i);
    server.timestampMode = 'per-call'; // as if the trigger used now(): one server_updated_at for all ten rows
    await a.engine.push();
    const b = await newDevice('user-a', { pullLimit: 5 });
    await b.engine.pull();
    // rows beyond the page that share the timestamp are skipped by design; the ones fetched are applied
    expect((await b.exec.run('SELECT COUNT(*) FROM settings', [], 'get')).rows[0]?.[0]).toBe(5);
  });

  it('rows of other users are never visible', async () => {
    const a = await newDevice('user-a');
    await setSetting(a.db, 'k', 'a', NOW);
    await a.engine.push();
    server.setUser({ id: 'user-b' });
    const b = await newDevice('user-b');
    await b.engine.pull();
    expect(await getSetting(b.db, 'k')).toBeUndefined();
  });

  it('soft deletes propagate as tombstones', async () => {
    const a = await newDevice();
    const b = await newDevice();
    const c = makeCurriculum();
    await saveCurriculum(a.db, c, NOW);
    const course = await enrol(a.db, c, goals, settings, NOW + 1);
    await a.engine.syncOnce();
    await b.engine.syncOnce();
    expect(await getCourse(b.db, course.id)).toBeDefined();
    const { deleteCourse } = await import('@epistemics/db');
    await deleteCourse(a.db, course.id, NOW + 2);
    await a.engine.syncOnce();
    await b.engine.syncOnce();
    expect(await getCourse(b.db, course.id)).toBeUndefined();
  });
});

describe('orchestration', () => {
  it('syncOnce reports errors in status instead of throwing, and recovers', async () => {
    const a = await newDevice();
    await setSetting(a.db, 'k', 1, NOW);
    server.failWith = 'boom';
    const s = await a.engine.syncOnce();
    expect(s.state).toBe('error');
    expect(s.lastError).toContain('boom');
    expect(s.pending).toBe(1);
    delete server.failWith;
    const s2 = await a.engine.syncOnce();
    expect(s2.state).toBe('idle');
    expect(s2.pending).toBe(0);
    expect(s2.lastError).toBeUndefined();
  });

  it('requestSync debounces and start/stop drive the poll', async () => {
    const statuses: string[] = [];
    const a = await newDevice('user-a', { debounceMs: 5 });
    await setSetting(a.db, 'k', 1, NOW);
    a.engine.start({ intervalMs: 10_000, onStatus: (s) => statuses.push(s.state) });
    a.engine.requestSync();
    a.engine.requestSync();
    await new Promise((r) => setTimeout(r, 60));
    expect(server.rows('settings')).toHaveLength(1);
    expect(statuses).toContain('syncing');
    a.engine.stop();
    expect(a.engine.status().state).toBe('stopped');
  });
});
