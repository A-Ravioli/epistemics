import { describe, expect, it } from 'vitest';
import { CurriculumSchema } from '@epistemics/core';
import type { ConceptEdge } from '@epistemics/core';
import { ingest } from '@epistemics/ingest';
import {
  assumedReferencesFromDescription, buildCurriculum, buildUnit, generateOutline, isUnitBuilt, MemoryGenCache, type ProgressEvent,
} from '../src/index.js';
import { createMockProvider } from './mockProvider.js';

const base = { subject: 'Probability', level: 'intro undergraduate', goals: 'understand', now: () => 1_700_000_000_000 };

describe('buildCurriculum (subject only)', () => {
  it('produces a Curriculum that passes CurriculumSchema, with deterministic ids and no invented citations', async () => {
    const provider = createMockProvider();
    const cache = new MemoryGenCache();
    const events: ProgressEvent[] = [];
    const cur = await buildCurriculum({ ...base, provider, cache, unitsToBuild: 'all', onProgress: (e) => events.push(e) });
    expect(CurriculumSchema.safeParse(cur).success).toBe(true);
    expect(cur.units).toHaveLength(2);
    expect(cur.units.every(isUnitBuilt)).toBe(true);
    const concepts = cur.units.flatMap((u) => u.lessons.flatMap((l) => l.concepts));
    expect(concepts).toHaveLength(8);
    expect(concepts.map((c) => c.ordinal)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const c of concepts) {
      expect(c.spans).toEqual([]); // subject-only: invented citation dropped
      expect(c.items.length).toBe(6);
      expect(c.script.guidingQuestions[0]!.probesMisconception).toBe('mixes-things-up');
      expect(c.misconceptions[0]!.tag).toBe('mixes-things-up');
      for (const it of c.items) {
        expect(it.conceptId).toBe(c.id);
        expect(it.generatorVersion).toBe('architect@1.0');
        expect(it.spans).toEqual([]);
        if (['recall', 'cloze', 'predict'].includes(it.type)) expect(it.rubric).toEqual([]);
        else expect(it.rubric.map((r) => r.id)).toEqual(['c1', 'c2', 'c3']);
      }
    }
    // Graph: chain of prereqs validated, bogus edge dropped, encompass weight clamped.
    expect(cur.edges.some((e) => e.to === 'unknown-id')).toBe(false);
    expect(cur.edges.filter((e) => e.kind === 'prereq')).toHaveLength(7);
    expect(cur.edges.find((e) => e.kind === 'encompasses')!.weight).toBe(0.5);
    // Manifest.
    expect(cur.manifest.title).toBe('Probability Basics');
    expect(cur.manifest.generator).toEqual({ name: 'architect', version: '0.1.0', promptVersion: '1.0' });
    expect(cur.manifest.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(assumedReferencesFromDescription(cur.manifest.description)).toEqual([
      'Introduction to Probability, Blitzstein & Hwang', 'A First Course in Probability, Ross',
    ]);
    expect(cur.sources).toEqual([]);
    // Call accounting: 1 outline + 4 concepts + 1 graph + 8 scripts + 8 items + 8 checks.
    expect(provider.count()).toBe(1 + 4 + 1 + 8 + 8 + 8);
    expect(events.filter((e) => e.stage === 'freeze' && e.status === 'done')).toHaveLength(1);

    // Determinism: a fresh provider + cache yields identical ids and content hash.
    const again = await buildCurriculum({ ...base, provider: createMockProvider(), cache: new MemoryGenCache(), unitsToBuild: 'all' });
    expect(again.manifest.id).toBe(cur.manifest.id);
    expect(again.manifest.contentHash).toBe(cur.manifest.contentHash);
    expect(again.units[1]!.lessons[1]!.concepts[1]!.id).toBe(cur.units[1]!.lessons[1]!.concepts[1]!.id);
    expect(again.units[0]!.lessons[0]!.concepts[0]!.items[2]!.id).toBe(cur.units[0]!.lessons[0]!.concepts[0]!.items[2]!.id);
  });

  it('cache hits skip provider calls on a second run', async () => {
    const cache = new MemoryGenCache();
    const first = createMockProvider();
    const a = await buildCurriculum({ ...base, provider: first, cache, unitsToBuild: 'all' });
    expect(first.count()).toBeGreaterThan(0);
    const second = createMockProvider();
    const events: ProgressEvent[] = [];
    const b = await buildCurriculum({ ...base, provider: second, cache, unitsToBuild: 'all', onProgress: (e) => events.push(e) });
    expect(second.count()).toBe(0);
    expect(events.filter((e) => e.status === 'cached')).toHaveLength(first.count());
    expect(b).toEqual(a);
    // A different prompt version misses the cache.
    const third = createMockProvider();
    await buildCurriculum({ ...base, provider: third, cache, unitsToBuild: 'all', promptVersion: '1.1' });
    expect(third.count()).toBe(first.count());
  });

  it('builds units lazily: unitsToBuild=1 leaves later units empty and buildUnit fills exactly one', async () => {
    const provider = createMockProvider({ units: 3 });
    const cache = new MemoryGenCache();
    const cur = await buildCurriculum({ ...base, provider, cache, unitsToBuild: 1 });
    expect(cur.units).toHaveLength(3);
    expect(isUnitBuilt(cur.units[0]!)).toBe(true);
    expect(isUnitBuilt(cur.units[1]!)).toBe(false);
    expect(isUnitBuilt(cur.units[2]!)).toBe(false);
    expect(cur.units[1]!.lessons.every((l) => l.concepts.length === 0)).toBe(true);
    expect(CurriculumSchema.safeParse(cur).success).toBe(false); // core schema requires ≥1 concept per lesson
    const before = provider.count();

    const next = await buildUnit(cur, 1, { ...base, provider, cache });
    expect(isUnitBuilt(next.units[0]!)).toBe(true);
    expect(isUnitBuilt(next.units[1]!)).toBe(true);
    expect(isUnitBuilt(next.units[2]!)).toBe(false);
    expect(next.units[0]).toEqual(cur.units[0]); // untouched
    expect(cur.units[1]!.lessons[0]!.concepts).toHaveLength(0); // input not mutated
    // Outline came from the cache; 2 concepts + 1 graph + 4 scripts + 4 items + 4 checks.
    expect(provider.count() - before).toBe(2 + 1 + 4 + 4 + 4);
    // Incremental graph: the edge from the last known concept into the new unit is kept, old edges preserved.
    const oldEdges = cur.edges;
    for (const e of oldEdges) expect(next.edges).toContainEqual(e);
    const lastOld = cur.units[0]!.lessons[1]!.concepts[1]!.id;
    const firstNew = next.units[1]!.lessons[0]!.concepts[0]!.id;
    expect(next.edges).toContainEqual(expect.objectContaining({ from: lastOld, to: firstNew, kind: 'prereq' }));
    expect(next.manifest.contentHash).not.toBe(cur.manifest.contentHash);
    // Passing the outline explicitly gives the same result.
    const outline = await generateOutline({ ...base, provider, cache });
    const viaOutline = await buildUnit(cur, 1, { ...base, provider, cache, outline });
    expect(viaOutline.manifest.contentHash).toBe(next.manifest.contentHash);

    const full = await buildUnit(next, 2, { ...base, provider, cache });
    expect(CurriculumSchema.safeParse(full).success).toBe(true);
  });

  it('regenerates flagged items once and drops the ambiguous ones', async () => {
    const provider = createMockProvider({ units: 1, lessonsPerUnit: 1, conceptsPerLesson: 1, flagOne: true });
    const cur = await buildCurriculum({ ...base, provider, cache: new MemoryGenCache(), unitsToBuild: 'all' });
    const concept = cur.units[0]!.lessons[0]!.concepts[0]!;
    expect(concept.items.some((it) => it.prompt.startsWith('AMBIG'))).toBe(false);
    expect(concept.items.some((it) => it.prompt.startsWith('Replacement'))).toBe(true);
    expect(concept.items).toHaveLength(7);
    expect(provider.count('items')).toBe(2);
    expect(provider.count('itemcheck')).toBe(2);
  });

  it('breaks cycles proposed by the model', async () => {
    const provider = createMockProvider({
      units: 1, lessonsPerUnit: 1, conceptsPerLesson: 3,
      edges: (ids) => [
        { from: ids[0], to: ids[1], kind: 'prereq', justification: 'j', confidence: 0.9 },
        { from: ids[1], to: ids[2], kind: 'prereq', justification: 'j', confidence: 0.8 },
        { from: ids[2], to: ids[0], kind: 'prereq', justification: 'weak', confidence: 0.1 },
      ],
    });
    const cur = await buildCurriculum({ ...base, provider, cache: new MemoryGenCache(), unitsToBuild: 'all' });
    const ids = cur.units[0]!.lessons[0]!.concepts.map((c) => c.id);
    const edges: ConceptEdge[] = cur.edges;
    expect(edges).toHaveLength(2);
    expect(edges.some((e) => e.from === ids[2] && e.to === ids[0])).toBe(false);
  });

  it('honours an abort signal', async () => {
    const ac = new AbortController();
    const provider = createMockProvider();
    let n = 0;
    await expect(
      buildCurriculum({ ...base, provider, cache: new MemoryGenCache(), signal: ac.signal, onProgress: () => { if (++n === 3) ac.abort(); } }),
    ).rejects.toThrow(/aborted/);
    expect(provider.count()).toBeLessThan(5);
  });
});

describe('buildCurriculum (with sources)', () => {
  const MD = `# Probability\n\n## Sample spaces\n\nThe sample space is the set of all possible outcomes of an experiment. An event is a subset of the sample space, and we assign probabilities to events.\n\n## Independence\n\nTwo events are independent when the probability of both equals the product of the individual probabilities. Independence is not the same as being disjoint.\n`;

  it('threads chunk ids through the outline and keeps only verbatim spans', async () => {
    const { source, chunks } = await ingest({ name: 'prob.md', bytes: new TextEncoder().encode(MD) }, { targetTokens: 40, minTokens: 10, overlapTokens: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    const provider = createMockProvider({ units: 1, lessonsPerUnit: 1, conceptsPerLesson: 1 });
    const cur = await buildCurriculum({ ...base, provider, cache: new MemoryGenCache(), sources: [{ source, chunks }], unitsToBuild: 'all' });
    expect(CurriculumSchema.safeParse(cur).success).toBe(true);
    expect(cur.sources).toEqual([source]);
    expect(assumedReferencesFromDescription(cur.manifest.description)).toEqual([]);
    const concept = cur.units[0]!.lessons[0]!.concepts[0]!;
    expect(concept.spans).toHaveLength(1);
    expect(concept.spans[0]).toMatchObject({ chunkId: chunks[0]!.id, quote: chunks[0]!.text.slice(0, 40), page: 1, heading: 'H' });
    expect(concept.items.every((it) => it.spans.length === 1 && chunks[0]!.text.includes(it.spans[0]!.quote))).toBe(true);
    expect(concept.items[0]!.spans[0]!.heading).toBe(chunks[0]!.headingPath.at(-1));
    // The outline call saw the source manifest and the concepts call saw the lesson's chunk text.
    const outlineReq = provider.calls.find((c) => c.stage === 'outline')!.req;
    expect(outlineReq.messages[0]!.content).toContain(chunks[0]!.id);
    expect(outlineReq.system[0]!.cache).toBe(true);
    const conceptsReq = provider.calls.find((c) => c.stage === 'concepts')!.req;
    expect(conceptsReq.messages[0]!.content).toContain('sample space');
    // Different sources → different curriculum id.
    const other = await buildCurriculum({ ...base, provider: createMockProvider(), cache: new MemoryGenCache(), unitsToBuild: 'all' });
    expect(other.manifest.id).not.toBe(cur.manifest.id);
  });

  it('uses the retriever to widen lesson context', async () => {
    const { source, chunks } = await ingest({ name: 'prob.md', bytes: new TextEncoder().encode(MD) }, { targetTokens: 40, minTokens: 10, overlapTokens: 0 });
    const queries: string[] = [];
    const provider = createMockProvider({ units: 1, lessonsPerUnit: 1, conceptsPerLesson: 1 });
    await buildCurriculum({
      ...base, provider, cache: new MemoryGenCache(), sources: [{ source, chunks }], unitsToBuild: 'all',
      retrieve: async (q) => { queries.push(q); return chunks.slice(-1); },
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('Lesson 1.1');
    const conceptsReq = provider.calls.find((c) => c.stage === 'concepts')!.req;
    expect(conceptsReq.messages[0]!.content).toContain(chunks.at(-1)!.id);
  });
});
