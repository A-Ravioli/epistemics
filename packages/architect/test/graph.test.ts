import { describe, expect, it } from 'vitest';
import type { ConceptEdge } from '@epistemics/core';
import { createHashEmbedder } from '@epistemics/ingest';
import { findConfusablePairs, topoOrder, validateGraph } from '../src/index.js';

const p = (from: string, to: string, confidence?: number): ConceptEdge => ({ from, to, kind: 'prereq', ...(confidence !== undefined ? { confidence } : {}) });

describe('validateGraph', () => {
  it('drops self and unknown edges, dedupes, and clamps encompassing weights', () => {
    const { edges, dropped } = validateGraph(['a', 'b', 'c'], [
      p('a', 'a'), p('a', 'zzz'), p('a', 'b', 0.4), p('a', 'b', 0.9),
      { from: 'b', to: 'c', kind: 'encompasses', weight: 0.9 }, { from: 'a', to: 'c', kind: 'encompasses' },
    ]);
    expect(dropped).toHaveLength(3);
    expect(edges.find((e) => e.kind === 'prereq')).toMatchObject({ from: 'a', to: 'b', confidence: 0.9 });
    expect(edges.find((e) => e.kind === 'encompasses' && e.from === 'b')!.weight).toBe(0.5);
    expect(edges.find((e) => e.kind === 'encompasses' && e.from === 'a')!.weight).toBe(0.5);
    expect(edges).toHaveLength(3);
  });

  it('breaks a cycle by dropping its lowest-confidence edge and keeps chapter order otherwise', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const { edges, dropped, order } = validateGraph(ids, [p('a', 'b', 0.9), p('b', 'c', 0.8), p('c', 'a', 0.2), p('d', 'a', 0.95)]);
    expect(dropped).toEqual([p('c', 'a', 0.2)]);
    expect(edges).toHaveLength(3);
    // d must precede a because of the strong prereq, everything else keeps source order.
    expect(order).toEqual(['d', 'a', 'b', 'c']);
  });

  it('breaks several cycles and never leaves a cycle behind', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const { edges, order } = validateGraph(ids, [p('a', 'b', 0.5), p('b', 'a', 0.6), p('c', 'd', 0.3), p('d', 'c', 0.3), p('b', 'c', 0.9)]);
    expect(edges.map((e) => `${e.from}>${e.to}`).sort()).toEqual(['b>a', 'b>c', 'c>d'].sort());
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
    expect(new Set(order).size).toBe(4);
  });

  it('topoOrder uses concept order as tie-breaker', () => {
    expect(topoOrder(['x', 'y', 'z'], [])).toEqual(['x', 'y', 'z']);
    expect(topoOrder(['x', 'y', 'z'], [p('z', 'x')])).toEqual(['y', 'z', 'x']);
  });
});

describe('findConfusablePairs', () => {
  const concepts = [
    { id: '1', name: 'Independent events', definition: 'Events whose joint probability equals the product of their probabilities.', lessonId: 'L1' },
    { id: '2', name: 'Disjoint events', definition: 'Events that cannot both occur; their joint probability is zero.', lessonId: 'L1' },
    { id: '3', name: 'Matrix transpose', definition: 'Swap rows and columns of a matrix.', lessonId: 'L2' },
    { id: '4', name: 'Conditional independence', definition: 'Events whose joint probability equals the product of their probabilities given a third event.', lessonId: 'L3' },
  ];

  it('finds shared-parent pairs (same lesson or same prerequisite) and lexically similar pairs', async () => {
    const pairs = await findConfusablePairs(concepts, [p('3', '1'), p('3', '4')]);
    const keys = pairs.map((x) => `${x.a}-${x.b}`);
    expect(keys).toContain('1-2'); // same lesson
    expect(keys).toContain('1-4'); // same prerequisite (3) and similar definition
    expect(keys).not.toContain('2-3');
    expect(pairs.find((x) => x.a === '1' && x.b === '4')!.reason).toBe('similar');
  });

  it('uses the embedder when supplied', async () => {
    const pairs = await findConfusablePairs(concepts, [], createHashEmbedder(), { similarity: 0.6 });
    const keys = pairs.map((x) => `${x.a}-${x.b}`);
    expect(keys).toContain('1-4');
    expect(keys).not.toContain('3-4');
  });
});
