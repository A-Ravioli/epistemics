import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Card, Chunk, ReviewLogEntry, Turn, LlmCall, DbExecutor } from '@epistemics/core';
import { createMemoryExecutor } from '../src/executors/memory.js';
import { createDb, type Db } from '../src/client.js';
import {
  saveCurriculum, getCurriculum, listCurricula, getConcept, getItem, getItemsForConcept, getEdges, getConcepts,
  enrol, getCourse, listCourses, updateCourse, activateCards, isActivated, UNACTIVATED_OFFSET_MS,
  getCards, getCardsForConcept, getCardByItem, saveCards, appendReviewLogs, getReviewLog, countReviews,
  getConceptState, upsertConceptState, listConceptStates, emptyConceptState,
  createSession, getOpenSession, saveTurns, getTurns, saveState, getState, endSession, getSession,
  saveReceipt, getReceipts, saveJol, resolveJol, getUnresolvedJols, getFsrsParams, saveFsrsParams,
  insertLlmCall, sumCost, usageByRole, getSetting, setSetting, getCached, putCached,
  saveSource, getSource, getChunksBySource, getChunksByIds, searchChunks, saveEmbedding, getEmbeddings, listSources,
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

describe('curricula', () => {
  it('round-trips a curriculum and its projections', async () => {
    const c = makeCurriculum();
    await saveCurriculum(db, c, NOW);
    expect(await getCurriculum(db, 'curr-1', 1)).toEqual(c);
    expect(await getCurriculum(db, 'curr-1', 2)).toBeUndefined();
    const list = await listCurricula(db);
    expect(list.map((m) => [m.id, m.version, m.title])).toEqual([['curr-1', 1, 'Intro Probability']]);

    const c1 = await getConcept(db, 'c1');
    expect(c1?.name).toBe('Concept c1');
    expect(c1?.unitId).toBe('u1');
    expect(c1?.lessonId).toBe('l1');
    expect(c1?.items.map((i) => i.id).sort()).toEqual(['i1', 'i2']);
    expect(c1?.script.hints).toEqual(['h1', 'h2', 'h3']);
    expect(await getItem(db, 'i4')).toEqual(c.units[0]!.lessons[1]!.concepts[0]!.items[0]);
    expect((await getItemsForConcept(db, 'c3')).map((i) => i.id).sort()).toEqual(['i4', 'i5', 'i6']);
    const edges = await getEdges(db, 'curr-1', 1);
    expect(edges).toHaveLength(2);
    expect(edges.find((e) => e.kind === 'prereq')).toEqual(c.edges[0]);
    expect(edges.find((e) => e.kind === 'encompasses')).toEqual(c.edges[1]);
    expect((await getConcepts(db, 'curr-1', 1)).map((x) => x.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('re-saving replaces projections and keeps versions separate', async () => {
    await saveCurriculum(db, makeCurriculum(1), NOW);
    const v2 = makeCurriculum(2);
    v2.units[0]!.lessons[0]!.concepts[0]!.items.pop(); // drop i2
    await saveCurriculum(db, v2, NOW + 1);
    await saveCurriculum(db, v2, NOW + 2); // idempotent
    expect((await getCurriculum(db, 'curr-1', 1))?.manifest.version).toBe(1);
    expect((await getItemsForConcept(db, 'c1')).map((i) => i.id)).toEqual(['i1']);
    expect((await getEdges(db, 'curr-1', 1))).toEqual([]);
    expect((await getEdges(db, 'curr-1', 2))).toHaveLength(2);
    expect((await listCurricula(db)).map((m) => m.version)).toEqual([2]);
  });
});

describe('courses & cards', () => {
  it('enrol creates one unactivated New card per item; activateCards makes them due', async () => {
    const c = makeCurriculum();
    await saveCurriculum(db, c, NOW);
    const course = await enrol(db, c, goals, settings, NOW);
    expect(course.title).toBe('Intro Probability');
    expect((await getCourse(db, course.id))).toEqual(course);
    expect((await listCourses(db)).map((x) => x.id)).toEqual([course.id]);

    const cards = await getCards(db, course.id);
    expect(cards).toHaveLength(6);
    for (const card of cards) {
      expect(card.state).toBe(0);
      expect(card.due).toBe(NOW + UNACTIVATED_OFFSET_MS);
      expect(isActivated(card, NOW)).toBe(false);
      expect(card.suspended).toBe(false);
      expect(card.provisional).toBe(false);
      expect(card.lastReview).toBeUndefined();
    }
    expect(await activateCards(db, course.id, 'c1', NOW + 5)).toBe(2);
    expect(await activateCards(db, course.id, 'c1', NOW + 6)).toBe(0);
    const c1 = await getCardsForConcept(db, course.id, 'c1');
    expect(c1.every((k) => k.due === NOW + 5 && isActivated(k, NOW))).toBe(true);
    expect(isActivated((await getCardByItem(db, course.id, 'i4'))!, NOW)).toBe(false);

    const updated = await updateCourse(db, course.id, { scaffolding: 'advanced', goals: { ...goals, weeklyMinutes: 60 } }, NOW + 10);
    expect(updated?.scaffolding).toBe('advanced');
    expect(updated?.goals.weeklyMinutes).toBe(60);
    expect(updated?.updatedAt).toBe(NOW + 10);
  });

  it('saveCards upserts and review logs append/query', async () => {
    const c = makeCurriculum();
    await saveCurriculum(db, c, NOW);
    const course = await enrol(db, c, goals, settings, NOW);
    const card = (await getCardByItem(db, course.id, 'i1'))!;
    const next: Card = { ...card, state: 2, due: NOW + 86_400_000, lastReview: NOW, stability: 3.2, difficulty: 5.1, scheduledDays: 1, reps: 1, provisional: true };
    await saveCards(db, [next], NOW);
    expect(await getCardByItem(db, course.id, 'i1')).toEqual(next);
    const fresh: Card = { ...next, id: 'card-new', itemId: 'i-extra', conceptId: 'c1' };
    await saveCards(db, [fresh, next]);
    expect(await getCards(db, course.id)).toHaveLength(7);

    const log = (i: number, t: number): ReviewLogEntry => ({
      id: `log-${i}`, cardId: card.id, courseId: course.id, reviewTime: t, rating: 3, stateBefore: 0,
      elapsedDays: 0, scheduledDays: 1, stability: 3.2, difficulty: 5.1, source: 'review', assisted: false, confidence: 2, durationMs: 1200,
    });
    await appendReviewLogs(db, [log(1, NOW), log(2, NOW + 1000), log(3, NOW + 2000)]);
    const all = await getReviewLog(db, course.id);
    expect(all.map((l) => l.id)).toEqual(['log-1', 'log-2', 'log-3']);
    expect(all[0]).toEqual(log(1, NOW));
    expect((await getReviewLog(db, course.id, NOW + 1000)).map((l) => l.id)).toEqual(['log-2', 'log-3']);
    expect(await countReviews(db, course.id)).toBe(3);
    expect(await countReviews(db, course.id, NOW + 2000)).toBe(1);
  });
});

describe('concept state', () => {
  it('upserts and lists', async () => {
    const s = { ...emptyConceptState('course', 'c1', NOW), mastery: 0.4, misconceptions: ['mc-1'], lastSuccessDay: '2024-07-01' };
    await upsertConceptState(db, s);
    await upsertConceptState(db, { ...s, mastery: 0.6 });
    await upsertConceptState(db, emptyConceptState('course', 'c2', NOW));
    expect((await getConceptState(db, 'course', 'c1'))?.mastery).toBe(0.6);
    expect((await getConceptState(db, 'course', 'c1'))?.misconceptions).toEqual(['mc-1']);
    expect((await listConceptStates(db, 'course')).map((x) => x.conceptId).sort()).toEqual(['c1', 'c2']);
    expect((await getConceptState(db, 'course', 'c2'))?.lastSuccessDay).toBeUndefined();
  });
});

describe('sessions & turns', () => {
  it('create, resume, turns, state, end', async () => {
    const s = await createSession(db, { courseId: 'course', type: 'lesson', lessonId: 'l1' }, NOW);
    expect(await getOpenSession(db, 'course', 'lesson')).toEqual(s);
    expect(await getOpenSession(db, 'course', 'review')).toBeUndefined();

    const turns: Turn[] = [
      { id: 't1', sessionId: s.id, ordinal: 0, role: 'tutor', content: 'hi', phase: 'PRIME', createdAt: NOW },
      { id: 't2', sessionId: s.id, ordinal: 1, role: 'learner', content: 'hello', conceptId: 'c1', hintLevel: 1, createdAt: NOW + 1,
        observer: { attemptMade: true, gaveUp: false, offTopic: false, objectiveProgress: [], misconceptionTags: [], keyIdeaStated: false, priorKnowledgeElicited: true, stuck: false, unsourcedClaims: [] } },
    ];
    await saveTurns(db, turns);
    expect(await getTurns(db, s.id)).toEqual(turns);

    await saveState(db, s.id, { phase: 'PROBE', n: 2 });
    expect(await getState(db, s.id)).toEqual({ phase: 'PROBE', n: 2 });
    await saveState(db, s.id, '{"raw":true}');
    expect(await getState(db, s.id)).toEqual({ raw: true });

    await endSession(db, s.id, { score: 1 }, NOW + 100);
    expect(await getOpenSession(db, 'course', 'lesson')).toBeUndefined();
    const ended = await getSession(db, s.id);
    expect(ended?.endedAt).toBe(NOW + 100);
    expect(ended?.summary).toEqual({ score: 1 });
    expect(await getState(db, s.id)).toBeUndefined();
  });
});

describe('receipts, jol, fsrs params', () => {
  it('round-trip', async () => {
    await saveReceipt(db, { id: 'r1', sessionId: 's', courseId: 'course', itemId: 'i1', conceptId: 'c1', answer: 'a', rating: 3, assisted: true, disputed: false, createdAt: NOW,
      grade: { criteria: [{ id: 'c1', met: true, evidence: 'e' }], score: 1, misconceptionTags: [], feedback: 'f', confidence: 0.8 }, confidence: 3 });
    const [r] = await getReceipts(db, 'course');
    expect(r?.grade?.score).toBe(1);
    expect(r?.assisted).toBe(true);

    await saveJol(db, { id: 'j1', sessionId: 's', courseId: 'course', conceptId: 'c1', predictedRecall: 0.7, createdAt: NOW });
    expect((await getUnresolvedJols(db, 'course')).map((j) => j.id)).toEqual(['j1']);
    await resolveJol(db, 'j1', true, NOW + 5);
    expect(await getUnresolvedJols(db, 'course')).toEqual([]);

    expect(await getFsrsParams(db, 'course')).toBeUndefined();
    await saveFsrsParams(db, { courseId: 'course', w: [0.4, 0.6], desiredRetention: 0.9, nReviews: 0 });
    await saveFsrsParams(db, { courseId: 'course', w: [0.5, 0.7], desiredRetention: 0.85, nReviews: 400, optimizedAt: NOW, logloss: 0.31 });
    expect(await getFsrsParams(db, 'course')).toEqual({ courseId: 'course', w: [0.5, 0.7], desiredRetention: 0.85, nReviews: 400, optimizedAt: NOW, logloss: 0.31 });
  });
});

describe('llm calls', () => {
  it('sumCost and usageByRole aggregate', async () => {
    const call = (id: string, role: LlmCall['role'], cost: number, at: number): LlmCall => ({
      id, role, model: 'claude', inputTokens: 100, cacheRead: 10, cacheWrite: 5, outputTokens: 50, costUsd: cost, latencyMs: 200, createdAt: at,
    });
    await insertLlmCall(db, call('a', 'tutor', 0.01, NOW));
    await insertLlmCall(db, call('b', 'tutor', 0.02, NOW + 1000));
    await insertLlmCall(db, call('c', 'grader', 0.005, NOW + 2000));
    expect(await sumCost(db)).toBeCloseTo(0.035);
    expect(await sumCost(db, NOW + 1000)).toBeCloseTo(0.025);
    expect(await sumCost(db, NOW + 5000)).toBe(0);
    const byRole = await usageByRole(db);
    expect(byRole.map((r) => r.role)).toEqual(['grader', 'tutor']);
    expect(byRole[1]).toMatchObject({ calls: 2, inputTokens: 200, outputTokens: 100, avgLatencyMs: 200 });
    expect(byRole[1]!.costUsd).toBeCloseTo(0.03);
  });
});

describe('settings & gen cache', () => {
  it('get/set JSON values', async () => {
    expect(await getSetting(db, 'llmMode')).toBeUndefined();
    await setSetting(db, 'llmMode', 'byok');
    await setSetting(db, 'prefs', { verbosity: 'terse' });
    expect(await getSetting<string>(db, 'llmMode')).toBe('byok');
    await setSetting(db, 'llmMode', 'proxy');
    expect(await getSetting<string>(db, 'llmMode')).toBe('proxy');
    expect(await getSetting(db, 'prefs')).toEqual({ verbosity: 'terse' });
  });

  it('gen cache put/get', async () => {
    expect(await getCached(db, 'k')).toBeUndefined();
    await putCached(db, 'k', 'items', { items: [1, 2] }, NOW);
    expect(await getCached(db, 'k')).toEqual({ items: [1, 2] });
    await putCached(db, 'k', 'items', { items: [3] }, NOW + 1);
    expect(await getCached(db, 'k')).toEqual({ items: [3] });
  });
});

describe('sources & chunks', () => {
  it('save, fetch, search, embeddings', async () => {
    const mk = (i: number, text: string): Chunk => ({ id: `ch-${i}`, sourceId: 'src-1', ordinal: i, headingPath: ['Ch 1', `§${i}`], text, tokenCount: 10, hash: `h${i}`, pageStart: i, pageEnd: i });
    const list = [mk(0, 'Bayes theorem relates conditional probabilities.'), mk(1, 'Independent events: P(A and B) = P(A)P(B).'), mk(2, 'Conditional probability of B given A; Bayes again.')];
    await saveSource(db, { id: 'src-1', title: 'Book', kind: 'pdf', hash: 'x', pageCount: 3 }, list, NOW, 'curr-1');
    expect(await getSource(db, 'src-1')).toEqual({ id: 'src-1', title: 'Book', kind: 'pdf', hash: 'x', pageCount: 3 });
    expect((await listSources(db, 'curr-1')).length).toBe(1);
    expect(await getChunksBySource(db, 'src-1')).toEqual(list);
    expect((await getChunksByIds(db, ['ch-2', 'ch-0', 'nope'])).map((c) => c.id)).toEqual(['ch-2', 'ch-0']);
    expect((await searchChunks(db, ['src-1'], 'bayes conditional')).map((c) => c.id)).toEqual(['ch-0', 'ch-2']);
    expect((await searchChunks(db, ['src-1'], 'bayes')).map((c) => c.id)).toEqual(['ch-0', 'ch-2']);
    expect((await searchChunks(db, [], 'independent')).map((c) => c.id)).toEqual(['ch-1']);
    expect(await searchChunks(db, ['other'], 'bayes')).toEqual([]);
    expect(await searchChunks(db, [], '100% _x')).toEqual([]);

    await saveEmbedding(db, 'ch-1', new Float32Array([0.5, -1.25, 3]));
    const emb = await getEmbeddings(db, ['src-1']);
    expect(emb).toHaveLength(1);
    expect(Array.from(emb[0]!.embedding)).toEqual([0.5, -1.25, 3]);

    // re-save replaces chunks
    await saveSource(db, { id: 'src-1', title: 'Book 2', kind: 'pdf', hash: 'y' }, [mk(0, 'only one')], NOW + 1);
    expect((await getChunksBySource(db, 'src-1')).length).toBe(1);
    expect((await getSource(db, 'src-1'))?.title).toBe('Book 2');
  });
});
