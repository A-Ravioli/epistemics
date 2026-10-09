import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CurriculumSchema } from '@epistemics/core';
import { createDb, enrol, getCards, getCurriculum, getSource, listSources, type Db, type DbExecutor } from '@epistemics/db';
import { createNodeExecutor } from '@epistemics/db/node';
import { createMockProvider, type MockProvider } from '@epistemics/llm';
import { isUnitBuilt } from '@epistemics/architect';
import { createArchitectMockResponder, architectStageOf } from '../architect-mock.js';
import { getBuiltCurricula } from '../settings.js';
import { CurriculumBuilder, addCardsForUnit, isFullyBuilt, unitsToPrepare, type BuildProgress } from './build.js';

const T0 = Date.UTC(2026, 2, 10, 15, 0, 0);
const spec = { subject: 'Real analysis', level: 'intro undergraduate', goals: 'understand', sourceIds: [] };
const GOALS = { purpose: 'understand' as const, weeklyMinutes: 120 };
const SETTINGS = { desiredRetention: 0.9, reviewsPerDay: 120, maxNewItemsPerDay: 40, easyDays: [], dayStartHour: 4, timezone: 'UTC' };

let exec: DbExecutor;
let db: Db;
let provider: MockProvider;

/** Scripted provider: schema-valid outputs per stage, and every call recorded in `provider.calls`. */
function scripted(): MockProvider {
  return createMockProvider({ respond: createArchitectMockResponder({ units: 3, lessonsPerUnit: 2, conceptsPerLesson: 2 }) });
}

const stages = (p: MockProvider) => p.calls.map((c) => architectStageOf(c));

beforeEach(async () => {
  exec = createNodeExecutor(':memory:');
  await exec.migrate();
  db = createDb(exec);
  provider = scripted();
});
afterEach(async () => {
  await exec.close();
});

describe('CurriculumBuilder', () => {
  it('proposes an outline, builds two units from the edited outline, saves the curriculum and creates cards', async () => {
    const builder = new CurriculumBuilder(db, provider, { now: () => T0 });
    const proposal = await builder.proposeOutline(spec);
    expect(stages(provider)).toEqual(['outline']);
    expect(proposal.outline.units).toHaveLength(3);
    expect(proposal.outlineCacheKey).toMatch(/^[0-9a-f]{64}$/);

    // Edit: rename unit 1, reorder units 2/3, drop the second lesson of unit 3.
    const edited = structuredClone(proposal.outline);
    edited.units[0]!.title = 'Sequences and limits';
    [edited.units[1], edited.units[2]] = [edited.units[2]!, edited.units[1]!];
    edited.units[2]!.lessons = edited.units[2]!.lessons.slice(0, 1);

    const events: BuildProgress[] = [];
    const unsub = builder.store.subscribe(() => events.push(builder.store.get()));
    const cur = await builder.build(proposal, edited);
    unsub();

    // The pipeline used the edited outline verbatim (outline stage was a cache hit: no second outline call).
    expect(stages(provider).filter((s) => s === 'outline')).toHaveLength(1);
    expect(cur.manifest.id).toBe(proposal.curriculumId);
    expect(cur.units.map((u) => u.title)).toEqual([
      'Sequences and limits', proposal.outline.units[2]!.title, proposal.outline.units[1]!.title,
    ]);
    expect(cur.units[2]!.lessons).toHaveLength(1);
    expect(isUnitBuilt(cur.units[0]!)).toBe(true);
    expect(isUnitBuilt(cur.units[1]!)).toBe(true);
    expect(isUnitBuilt(cur.units[2]!)).toBe(false);
    expect(isFullyBuilt(cur)).toBe(false);
    // 1 outline (cached) + 4 concepts + 1 graph + 8 scripts + 8 items + 8 checks
    expect(provider.calls).toHaveLength(1 + 4 + 1 + 8 + 8 + 8);
    // progress events reached the store: the outline stage was reported as cached, the rest ran
    const last = events[events.length - 1]!;
    expect(last.phase).toBe('done');
    expect(last.cached).toBeGreaterThanOrEqual(1);
    expect(last.log.some((e) => e.event.stage === 'outline' && e.event.status === 'cached')).toBe(true);
    expect(last.log.some((e) => e.event.stage === 'freeze' && e.event.status === 'done')).toBe(true);

    // Saved, and listed as built by the learner.
    const saved = await getCurriculum(db, cur.manifest.id, 1);
    expect(saved?.manifest.contentHash).toBe(cur.manifest.contentHash);
    expect(saved?.units[0]!.title).toBe('Sequences and limits');
    expect((await getBuiltCurricula(db)).map((r) => r.id)).toEqual([cur.manifest.id]);

    // Enrolment creates cards for the built units only; the lazy unit adds its own later.
    const course = await enrol(db, cur, GOALS, SETTINGS, T0);
    const itemsIn = (u: number) => cur.units[u]!.lessons.flatMap((l) => l.concepts.flatMap((c) => c.items)).length;
    expect(itemsIn(0)).toBe(24);
    expect((await getCards(db, course.id))).toHaveLength(itemsIn(0) + itemsIn(1));
    expect(unitsToPrepare(cur, cur.units[0]!.ordinal)).toEqual([cur.units[2]]);

    // Second build of the same spec + outline: zero provider calls, identical output.
    const again = scripted();
    const builder2 = new CurriculumBuilder(db, again, { now: () => T0 });
    const proposal2 = await builder2.proposeOutline(spec);
    expect(again.calls).toHaveLength(0);
    // The cache now returns the edited outline: the proposal already reflects the learner's edits.
    expect(proposal2.outline.units[0]!.title).toBe('Sequences and limits');
    expect(proposal2.outlineCacheKey).toBe(proposal.outlineCacheKey);
    const cur2 = await builder2.build(proposal2);
    expect(again.calls).toHaveLength(0);
    expect(cur2.manifest.contentHash).toBe(cur.manifest.contentHash);
    expect(cur2).toEqual(cur);
    // every stage of the build was a cache hit (the store is reset when a build starts, so the proposal's event is not counted)
    expect(builder2.store.get().cached).toBe(1 + 4 + 1 + 8 + 8 + 8);
    // only the code-level stages (graph validate, freeze) ran; no provider-backed stage started
    expect(builder2.store.get().started).toBe(2);
    expect(builder2.store.get().log.filter((e) => e.event.status === 'start').map((e) => e.event.stage)).toEqual(['validate', 'freeze']);
  });

  it('ensureUnitsAhead builds the missing unit lazily, saves it and adds its cards; buildNextUnit then has nothing to do', async () => {
    const builder = new CurriculumBuilder(db, provider, { now: () => T0 });
    const cur = await builder.build(await builder.proposeOutline(spec));
    const course = await enrol(db, cur, GOALS, SETTINGS, T0);
    const before = (await getCards(db, course.id)).length;
    const calls = provider.calls.length;

    // Learner in unit 1 with two units ahead: unit 3 is unbuilt and within range.
    const [a, b] = await Promise.all([
      builder.ensureUnitsAhead(course, cur.units[0]!.ordinal),
      builder.ensureUnitsAhead(course, cur.units[0]!.ordinal), // concurrent call is serialised, not duplicated
    ]);
    expect(a).toBeDefined();
    expect(b?.manifest.contentHash).toBe(a?.manifest.contentHash);
    // 2 concepts + 1 graph + 4 scripts + 4 items + 4 checks, once (no outline call: the stored outline was passed in)
    expect(provider.calls.length - calls).toBe(2 + 1 + 4 + 4 + 4);
    const full = await getCurriculum(db, cur.manifest.id, 1);
    expect(full && full.units.every(isUnitBuilt)).toBe(true);
    expect(CurriculumSchema.safeParse(full).success).toBe(true);
    expect(full && isFullyBuilt(full)).toBe(true);
    const cards = await getCards(db, course.id);
    expect(cards.length).toBe(before + 4 * 6);
    expect(cards.every((c) => c.state === 0)).toBe(true);
    // idempotent: no duplicate cards, no more calls
    expect(await addCardsForUnit(db, course, full!.units[2]!, T0)).toBe(0);
    expect(await builder.buildNextUnit(course.id)).toBeUndefined();
    expect(await builder.ensureUnitsAhead(course, cur.units[0]!.ordinal)).toBeUndefined();
    expect(provider.calls.length - calls).toBe(2 + 1 + 4 + 4 + 4);
  });

  it('ingests material, stores chunks and embeddings, and builds a sourced curriculum with retrieval', async () => {
    const md = [
      '# Limits', '', 'A sequence converges to L when its terms eventually stay within any epsilon of L. '.repeat(8), '',
      '## Cauchy sequences', '', 'A sequence is Cauchy when its terms eventually stay within epsilon of each other. '.repeat(8), '',
      '# Series', '', 'A series converges when its partial sums converge. '.repeat(8),
    ].join('\n');
    const builder = new CurriculumBuilder(db, provider, { now: () => T0 });
    const r = await builder.ingestFiles([
      { name: 'analysis-notes.md', bytes: new TextEncoder().encode(md), mime: 'text/markdown' },
      { name: 'bogus.xyz', bytes: new Uint8Array([1, 2, 3]) },
    ]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('bogus.xyz');
    expect(r.sources).toHaveLength(1);
    const src = r.sources[0]!;
    expect(src.source.kind).toBe('md');
    expect(src.source.title).toBe('Limits'); // first H1
    expect(src.chunkCount).toBeGreaterThan(0);
    expect(await getSource(db, src.source.id)).toBeDefined();
    expect((await listSources(db, null)).map((s) => s.id)).toEqual([src.source.id]);

    const sourced = { ...spec, subject: 'Analysis notes', sourceIds: [src.source.id] };
    const proposal = await builder.proposeOutline(sourced);
    expect(proposal.outline.units[0]!.lessons[0]!.chunkIds.length).toBeGreaterThan(0);
    const cur = await builder.build(proposal);
    expect(cur.sources.map((s) => s.id)).toEqual([src.source.id]);
    expect((await listSources(db, cur.manifest.id)).map((s) => s.id)).toEqual([src.source.id]);
    // grounded: concepts carry validated spans into the stored chunks
    const concepts = cur.units[0]!.lessons.flatMap((l) => l.concepts);
    expect(concepts.some((c) => c.spans.length > 0)).toBe(true);
    // the source manifest was in the outline prompt and retrieval widened the lesson context
    const outlineCall = provider.calls.find((c) => architectStageOf(c) === 'outline')!;
    expect(outlineCall.messages[0]!.content).toContain(src.source.id);
    const conceptCall = provider.calls.find((c) => architectStageOf(c) === 'concepts')!;
    expect(conceptCall.messages[0]!.content).toContain('sourceText');
  });
});
