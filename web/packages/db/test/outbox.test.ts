import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { DbExecutor } from '@epistemics/core';
import { createMemoryExecutor } from '../src/executors/memory.js';
import { createDb, type Db } from '../src/client.js';
import {
  saveCurriculum, enrol, getCards, saveCards, appendReviewLogs, upsertConceptState, emptyConceptState,
  createSession, endSession, saveTurns, saveReceipt, saveJol, resolveJol, saveFsrsParams, deleteFsrsParams, getFsrsParams,
  insertLlmCall, setSetting, deleteSetting, getSetting, putCached, saveSource, deleteSource, getChunksBySource, listSources,
  saveEmbedding, readOutbox, countOutbox, deleteOutbox, decodeRowKey, rebuildProjections, getConcept, listChunksMissingEmbedding,
} from '../src/repositories/index.js';
import { makeCurriculum, goals, settings } from './fixture.js';

let exec: DbExecutor;
let db: Db;
const NOW = 1_720_000_000_000;

beforeEach(async () => {
  exec = createMemoryExecutor();
  await exec.migrate();
  db = createDb(exec);
});
afterEach(async () => { await exec.close(); });

async function outboxKeys(): Promise<Record<string, unknown[]>> {
  const rows = await readOutbox(db, 10_000);
  const out: Record<string, unknown[]> = {};
  for (const r of rows) (out[r.tableName] ??= []).push(decodeRowKey(r.rowId));
  return out;
}

describe('outbox', () => {
  it('records every repository write with its primary key and sets updated_at', async () => {
    const c = makeCurriculum();
    await saveCurriculum(db, c, NOW);
    const course = await enrol(db, c, goals, settings, NOW);
    const cards = await getCards(db, course.id);
    await saveCards(db, [cards[0]!], NOW + 1);
    await appendReviewLogs(db, [{ id: 'rl1', cardId: cards[0]!.id, courseId: course.id, reviewTime: NOW + 1, rating: 3, stateBefore: 0, elapsedDays: 0, scheduledDays: 1, stability: 1, difficulty: 5, source: 'review', assisted: false }]);
    await upsertConceptState(db, emptyConceptState(course.id, 'c1', NOW + 2));
    const s = await createSession(db, { courseId: course.id, type: 'lesson' }, NOW + 3);
    await saveTurns(db, [{ id: 't1', sessionId: s.id, ordinal: 0, role: 'tutor', content: 'hi', createdAt: NOW + 3 }], NOW + 3);
    await endSession(db, s.id, { ok: true }, NOW + 4);
    await saveReceipt(db, { id: 'r1', sessionId: s.id, courseId: course.id, itemId: 'i1', conceptId: 'c1', answer: 'a', rating: 3, assisted: false, disputed: false, createdAt: NOW + 4 }, NOW + 4);
    await saveJol(db, { id: 'j1', sessionId: s.id, courseId: course.id, conceptId: 'c1', predictedRecall: 0.7, createdAt: NOW + 4 }, NOW + 4);
    await resolveJol(db, 'j1', true, NOW + 5);
    await saveFsrsParams(db, { courseId: course.id, w: [1, 2], desiredRetention: 0.9, nReviews: 0 }, NOW + 5);
    await insertLlmCall(db, { id: 'l1', role: 'tutor', model: 'm', inputTokens: 1, cacheRead: 0, cacheWrite: 0, outputTokens: 1, costUsd: 0, latencyMs: 1, createdAt: NOW + 5 });
    await setSetting(db, 'k', { a: 1 }, NOW + 6);
    await putCached(db, 'ck', 'lesson', { x: 1 }, NOW + 6);
    await saveSource(db, { id: 'src-1', title: 'Book', kind: 'pdf', hash: 'h' }, [
      { id: 'ch-1', sourceId: 'src-1', ordinal: 0, headingPath: [], text: 'hello world', tokenCount: 2, hash: 'x' },
    ], NOW + 7);

    const keys = await outboxKeys();
    expect(keys['curricula']).toEqual([{ id: 'curr-1', version: 1 }]);
    expect(keys['courses']).toEqual([course.id]);
    expect(keys['cards']).toHaveLength(cards.length + 1);
    expect(keys['review_log']).toEqual(['rl1']);
    expect(keys['concept_state']).toEqual([{ courseId: course.id, conceptId: 'c1' }]);
    expect(keys['sessions']).toEqual([s.id, s.id]);
    expect(keys['turns']).toEqual(['t1']);
    expect(keys['receipts']).toEqual(['r1']);
    expect(keys['jol']).toEqual(['j1', 'j1']);
    expect(keys['fsrs_params']).toEqual([course.id]);
    expect(keys['llm_calls']).toEqual(['l1']);
    expect(keys['settings']).toEqual(['k']);
    expect(keys['gen_cache']).toEqual(['ck']);
    expect(keys['sources']).toEqual(['src-1']);
    expect(keys['chunks']).toEqual(['ch-1']);
    // projections are local-only
    expect(keys['concepts']).toBeUndefined();
    expect(keys['items']).toBeUndefined();

    const upd = async (table: string, where: string) => Number((await exec.run(`SELECT updated_at FROM ${table} WHERE ${where}`, [], 'get')).rows[0]?.[0]);
    expect(await upd('sessions', `id = '${s.id}'`)).toBe(NOW + 4);
    expect(await upd('turns', "id = 't1'")).toBe(NOW + 3);
    expect(await upd('receipts', "id = 'r1'")).toBe(NOW + 4);
    expect(await upd('jol', "id = 'j1'")).toBe(NOW + 5);
    expect(await upd('settings', "key = 'k'")).toBe(NOW + 6);
    expect(await upd('gen_cache', "key = 'ck'")).toBe(NOW + 6);
    expect(await upd('sources', "id = 'src-1'")).toBe(NOW + 7);
    expect(await upd('chunks', "id = 'ch-1'")).toBe(NOW + 7);
  });

  it('fromSync writes are not recorded; embeddings never are', async () => {
    await saveCurriculum(db, makeCurriculum(), NOW, { fromSync: true });
    await setSetting(db, 'k', 1, NOW, { fromSync: true });
    await saveSource(db, { id: 'src-1', title: 'Book', kind: 'pdf', hash: 'h' }, [
      { id: 'ch-1', sourceId: 'src-1', ordinal: 0, headingPath: [], text: 'hello', tokenCount: 1, hash: 'x' },
    ], NOW, null, { fromSync: true });
    await saveEmbedding(db, 'ch-1', new Float32Array([1, 2]));
    await rebuildProjections(db, makeCurriculum());
    expect(await countOutbox(db)).toBe(0);
    expect((await getConcept(db, 'c1'))?.name).toBe('Concept c1');
    expect(await listChunksMissingEmbedding(db)).toEqual([]);
  });

  it('soft deletes leave tombstones that read as absent', async () => {
    await setSetting(db, 'k', 1, NOW);
    await deleteSetting(db, 'k', NOW + 1);
    expect(await getSetting(db, 'k')).toBeUndefined();
    await saveFsrsParams(db, { courseId: 'co', w: [], desiredRetention: 0.9, nReviews: 0 }, NOW);
    await deleteFsrsParams(db, 'co', NOW + 1);
    expect(await getFsrsParams(db, 'co')).toBeUndefined();
    await saveSource(db, { id: 'src-1', title: 'Book', kind: 'pdf', hash: 'h' }, [
      { id: 'ch-1', sourceId: 'src-1', ordinal: 0, headingPath: [], text: 'hello', tokenCount: 1, hash: 'x' },
    ], NOW);
    // replacing chunks tombstones the old ones
    await saveSource(db, { id: 'src-1', title: 'Book', kind: 'pdf', hash: 'h' }, [
      { id: 'ch-2', sourceId: 'src-1', ordinal: 0, headingPath: [], text: 'hello again', tokenCount: 2, hash: 'y' },
    ], NOW + 1);
    expect((await getChunksBySource(db, 'src-1')).map((c) => c.id)).toEqual(['ch-2']);
    await deleteSource(db, 'src-1', NOW + 2);
    expect(await listSources(db)).toEqual([]);
    expect(await getChunksBySource(db, 'src-1')).toEqual([]);
    const keys = await outboxKeys();
    expect([...(keys['chunks'] as string[])].sort()).toEqual(['ch-1', 'ch-1', 'ch-2', 'ch-2']);
    const tomb = await exec.run("SELECT deleted_at FROM chunks WHERE id = 'ch-1'", [], 'get');
    expect(tomb.rows[0]?.[0]).toBe(NOW + 1);
  });

  it('readOutbox / deleteOutbox page in creation order', async () => {
    for (let i = 0; i < 5; i++) await setSetting(db, `k${i}`, i, NOW + i);
    const first = await readOutbox(db, 2);
    expect(first.map((r) => r.rowId)).toEqual(['"k0"', '"k1"']);
    await deleteOutbox(db, first.map((r) => r.id));
    expect(await countOutbox(db)).toBe(3);
    expect((await readOutbox(db, 10)).map((r) => r.rowId)).toEqual(['"k2"', '"k3"', '"k4"']);
  });
});
