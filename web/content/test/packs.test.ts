/**
 * Structural validation of every bundled pack in content/packs/*.epistemics.json.
 * Packs are loaded eagerly through Vite's import.meta.glob so no filesystem access is needed
 * (and so a new pack is picked up automatically).
 */
import { describe, expect, it } from 'vitest';
import { CurriculumSchema, canonicalJson, sha256, type Concept, type ConceptEdge, type Curriculum } from '@epistemics/core';

declare global {
  interface ImportMeta {
    glob<T = unknown>(pattern: string, options: { eager: true }): Record<string, T>;
  }
}

const modules = import.meta.glob<{ default: unknown }>('../packs/*.epistemics.json', { eager: true });
const packs = Object.entries(modules).map(([path, mod]) => ({ path, raw: mod.default }));

function conceptsOf(pack: Curriculum): Concept[] {
  return pack.units.flatMap((u) => u.lessons.flatMap((l) => l.concepts));
}

/** Kahn-free DFS cycle detection over prereq edges; returns the first cycle found (as ids) or null. */
function findCycle(ids: string[], edges: ConceptEdge[]): string[] | null {
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) adj.get(e.from)!.push(e.to);
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    const s = state.get(id) ?? 0;
    if (s === 1) return [...stack.slice(stack.indexOf(id)), id];
    if (s === 2) return null;
    state.set(id, 1);
    stack.push(id);
    for (const next of adj.get(id) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const id of ids) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

describe('bundled packs', () => {
  it('finds at least one pack', () => {
    expect(packs.length).toBeGreaterThan(0);
  });

  for (const { path, raw } of packs) {
    describe(path, () => {
      // Parse once; every other test relies on the schema having accepted the file.
      const pack: Curriculum = CurriculumSchema.parse(raw);
      const concepts = conceptsOf(pack);
      const conceptIds = new Set(concepts.map((c) => c.id));
      const items = concepts.flatMap((c) => c.items);

      it('validates against CurriculumSchema', () => {
        expect(() => CurriculumSchema.parse(raw)).not.toThrow();
        expect(pack.manifest.version).toBeGreaterThanOrEqual(1);
      });

      it('has unique ids across units, lessons, concepts, items and objectives', () => {
        const ids = [
          ...pack.units.map((u) => u.id),
          ...pack.units.flatMap((u) => u.lessons.map((l) => l.id)),
          ...concepts.map((c) => c.id),
          ...items.map((i) => i.id),
          ...concepts.flatMap((c) => c.objectives.map((o) => o.id)),
        ];
        const seen = new Set<string>();
        const dupes = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
        expect(dupes).toEqual([]);
      });

      it('every item belongs to the concept that contains it', () => {
        for (const c of concepts) for (const i of c.items) expect(i.conceptId, `item ${i.id}`).toBe(c.id);
      });

      it('edges reference existing concepts, never self-loop, and encompasses edges carry a weight ≤ 0.5', () => {
        for (const e of pack.edges) {
          expect(conceptIds.has(e.from), `edge from ${e.from}`).toBe(true);
          expect(conceptIds.has(e.to), `edge to ${e.to}`).toBe(true);
          expect(e.from, 'self loop').not.toBe(e.to);
          if (e.kind === 'encompasses') {
            expect(e.weight, `weight on ${e.from}→${e.to}`).toBeDefined();
            expect(e.weight!).toBeGreaterThan(0);
            expect(e.weight!).toBeLessThanOrEqual(0.5);
          }
        }
        const keys = pack.edges.map((e) => `${e.kind}:${e.from}>${e.to}`);
        expect(new Set(keys).size, 'duplicate edges').toBe(keys.length);
      });

      it('prerequisite edges form a DAG', () => {
        const prereqs = pack.edges.filter((e) => e.kind === 'prereq');
        expect(prereqs.length).toBeGreaterThan(0);
        expect(findCycle([...conceptIds], prereqs)).toBeNull();
      });

      it('prerequisites respect teaching order (a concept is never taught before its prerequisite)', () => {
        const ordinal = new Map(concepts.map((c) => [c.id, c.ordinal]));
        for (const e of pack.edges) {
          if (e.kind !== 'prereq') continue;
          expect(ordinal.get(e.from)!, `${e.from} must precede ${e.to}`).toBeLessThan(ordinal.get(e.to)!);
        }
      });

      it('every concept has a complete script, ≥1 explain item, ≥1 apply item and exactly one teachback', () => {
        for (const c of concepts) {
          const types = c.items.map((i) => i.type);
          expect(types, `${c.id} explain`).toContain('explain');
          expect(types, `${c.id} apply`).toContain('apply');
          expect(types.filter((t) => t === 'teachback').length, `${c.id} teachback`).toBe(1);
          expect(c.items.length, `${c.id} item count`).toBeGreaterThanOrEqual(5);
          expect(c.script.guidingQuestions.length, `${c.id} guiding questions`).toBeGreaterThanOrEqual(3);
          expect(c.script.guidingQuestions.length, `${c.id} guiding questions`).toBeLessThanOrEqual(6);
          expect(c.objectives.length, `${c.id} objectives`).toBeGreaterThanOrEqual(2);
          expect(c.misconceptions.length, `${c.id} misconceptions`).toBeGreaterThanOrEqual(1);
          expect(c.examples.length, `${c.id} examples`).toBeGreaterThanOrEqual(2);
          for (const h of c.script.hints) expect(h.length, `${c.id} hint`).toBeGreaterThan(0);
        }
      });

      it('rubric-graded items carry rubrics with unique criterion ids; self-graded items carry none', () => {
        for (const i of items) {
          if (i.type === 'explain' || i.type === 'apply' || i.type === 'discriminate' || i.type === 'teachback' || i.type === 'map') {
            expect(i.rubric.length, `${i.id} rubric size`).toBeGreaterThanOrEqual(3);
            expect(i.rubric.length, `${i.id} rubric size`).toBeLessThanOrEqual(6);
            const ids = i.rubric.map((r) => r.id);
            expect(new Set(ids).size, `${i.id} rubric ids`).toBe(ids.length);
          } else {
            expect(i.rubric, `${i.id} should be self-graded`).toEqual([]);
          }
          expect(i.reference.answer.trim().length, `${i.id} reference`).toBeGreaterThan(0);
        }
      });

      it('guiding questions only probe misconceptions the concept declares', () => {
        for (const c of concepts) {
          const tags = new Set(c.misconceptions.map((m) => m.tag));
          for (const q of c.script.guidingQuestions) {
            if (q.probesMisconception) expect(tags.has(q.probesMisconception), `${c.id}: ${q.probesMisconception}`).toBe(true);
          }
        }
      });

      it('item hashes equal sha256(canonicalJson({prompt, reference, rubric}))', async () => {
        for (const i of items) {
          const expected = await sha256(canonicalJson({ prompt: i.prompt, reference: i.reference, rubric: i.rubric }));
          expect(i.hash, `hash of ${i.id}`).toBe(expected);
        }
      });

      it('manifest.contentHash equals sha256(canonicalJson({units, edges}))', async () => {
        const expected = await sha256(canonicalJson({ units: pack.units, edges: pack.edges }));
        expect(pack.manifest.contentHash).toBe(expected);
      });
    });
  }
});
