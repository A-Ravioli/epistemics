import { describe, expect, it } from 'vitest';
import type { Concept, ConceptEdge, ConceptState, Curriculum } from '../../src/types.js';
import {
  conceptMastery, conceptRetention, isAvailable, isMastered, nextAvailableLesson, topologicalOrder,
  unassistedPassRate, updateConceptStateAfterReceipt,
} from '../../src/scheduler/index.js';
import { NOW, mkCard, mkScheduler, reviewCard } from './helpers.js';

const s = mkScheduler();
const R = (c: Parameters<typeof s.retrievability>[0], now: number) => s.retrievability(c, now);

describe('conceptRetention / conceptMastery', () => {
  it('averages retrievability over non-suspended cards; New cards count as 0', () => {
    const due = reviewCard(10, 10); // R ≈ 0.9
    expect(conceptRetention([due], NOW, R)).toBeCloseTo(0.9, 2);
    expect(conceptRetention([due, mkCard()], NOW, R)).toBeCloseTo(0.45, 2);
    expect(conceptRetention([due, mkCard({ suspended: true })], NOW, R)).toBeCloseTo(0.9, 2);
    expect(conceptRetention([], NOW, R)).toBe(0);
  });

  it('scales retention by successful sessions / 3, capped at 1', () => {
    expect(conceptMastery(0.9, 0)).toBe(0);
    expect(conceptMastery(0.9, 1)).toBeCloseTo(0.3, 6);
    expect(conceptMastery(0.9, 3)).toBeCloseTo(0.9, 6);
    expect(conceptMastery(0.9, 10)).toBeCloseTo(0.9, 6);
    expect(conceptMastery(1.5, 3)).toBe(1);
  });

  it('isMastered needs both mastery ≥ 0.85 and unassisted pass rate ≥ 0.8', () => {
    expect(isMastered(0.85, 0.8)).toBe(true);
    expect(isMastered(0.84, 0.9)).toBe(false);
    expect(isMastered(0.95, 0.79)).toBe(false);
  });
});

describe('isAvailable', () => {
  const edges: ConceptEdge[] = [
    { from: 'a', to: 'c', kind: 'prereq' },
    { from: 'b', to: 'c', kind: 'prereq' },
    { from: 'z', to: 'c', kind: 'encompasses', weight: 0.4 }, // ignored
  ];
  it('requires every prereq at or above the threshold; unknown mastery is 0', () => {
    expect(isAvailable('c', edges, new Map([['a', 0.7], ['b', 0.9]]))).toBe(true);
    expect(isAvailable('c', edges, new Map([['a', 0.69], ['b', 0.9]]))).toBe(false);
    expect(isAvailable('c', edges, new Map([['a', 0.9]]))).toBe(false);
    expect(isAvailable('c', edges, new Map([['a', 0.5], ['b', 0.5]]), 0.5)).toBe(true);
    expect(isAvailable('a', edges, new Map())).toBe(true); // no prereqs
  });
});

describe('updateConceptStateAfterReceipt', () => {
  const base: ConceptState = {
    courseId: 'course', conceptId: 'c', mastery: 0, successfulSessions: 0, misconceptions: [],
    assistedPass: 0, assistedN: 0, unassistedPass: 0, unassistedN: 0, updatedAt: 0,
  };

  it('counts an unassisted success once per distinct day', () => {
    let st = updateConceptStateAfterReceipt(base, { rating: 3, assisted: false, misconceptionTags: [], day: '2026-03-10', at: 10 });
    expect(st).toMatchObject({ successfulSessions: 1, lastSuccessDay: '2026-03-10', unassistedPass: 1, unassistedN: 1, updatedAt: 10 });
    st = updateConceptStateAfterReceipt(st, { rating: 4, assisted: false, misconceptionTags: [], day: '2026-03-10' });
    expect(st.successfulSessions).toBe(1);
    expect(st.unassistedPass).toBe(2);
    st = updateConceptStateAfterReceipt(st, { rating: 3, assisted: false, misconceptionTags: [], day: '2026-03-11' });
    expect(st.successfulSessions).toBe(2);
    // An out-of-order older receipt never double-counts.
    st = updateConceptStateAfterReceipt(st, { rating: 3, assisted: false, misconceptionTags: [], day: '2026-03-09' });
    expect(st.successfulSessions).toBe(2);
    expect(st.lastSuccessDay).toBe('2026-03-11');
  });

  it('assisted results only touch the assisted counters', () => {
    const st = updateConceptStateAfterReceipt(base, { rating: 4, assisted: true, misconceptionTags: [], day: '2026-03-10' });
    expect(st).toMatchObject({ successfulSessions: 0, assistedPass: 1, assistedN: 1, unassistedPass: 0, unassistedN: 0 });
    expect(st.lastSuccessDay).toBeUndefined();
  });

  it('failures increment N but not pass, and Hard is not a success', () => {
    let st = updateConceptStateAfterReceipt(base, { rating: 1, assisted: false, misconceptionTags: [], day: '2026-03-10' });
    st = updateConceptStateAfterReceipt(st, { rating: 2, assisted: false, misconceptionTags: [], day: '2026-03-10' });
    expect(st).toMatchObject({ successfulSessions: 0, unassistedPass: 0, unassistedN: 2 });
    expect(unassistedPassRate(st)).toBe(0);
    expect(unassistedPassRate(base)).toBe(0);
  });

  it('keeps the 5 most recent misconception tags, most recent first, de-duplicated', () => {
    let st = { ...base, misconceptions: ['m1', 'm2', 'm3', 'm4'] };
    st = updateConceptStateAfterReceipt(st, { rating: 1, assisted: false, misconceptionTags: ['m5', 'm2', 'm5'], day: '2026-03-10' });
    expect(st.misconceptions).toEqual(['m5', 'm2', 'm1', 'm3', 'm4']);
    st = updateConceptStateAfterReceipt(st, { rating: 1, assisted: false, misconceptionTags: ['m6'], day: '2026-03-10' });
    expect(st.misconceptions).toEqual(['m6', 'm5', 'm2', 'm1', 'm3']);
    const untouched = updateConceptStateAfterReceipt(st, { rating: 3, assisted: false, misconceptionTags: [], day: '2026-03-10' });
    expect(untouched.misconceptions).toEqual(st.misconceptions);
  });

  it('does not mutate the input', () => {
    const frozen = Object.freeze({ ...base, misconceptions: Object.freeze(['x']) as unknown as string[] });
    const st = updateConceptStateAfterReceipt(frozen, { rating: 3, assisted: false, misconceptionTags: ['y'], day: '2026-03-10' });
    expect(frozen.misconceptions).toEqual(['x']);
    expect(st.misconceptions).toEqual(['y', 'x']);
  });
});

describe('topologicalOrder', () => {
  it('orders prerequisites first, keeping input order among ties', () => {
    const edges: ConceptEdge[] = [
      { from: 'b', to: 'c', kind: 'prereq' },
      { from: 'a', to: 'b', kind: 'prereq' },
      { from: 'a', to: 'd', kind: 'prereq' },
      { from: 'x', to: 'a', kind: 'encompasses', weight: 0.3 }, // not an ordering constraint
    ];
    expect(topologicalOrder(['d', 'c', 'b', 'a', 'x'], edges)).toEqual(['a', 'x', 'd', 'b', 'c']);
  });

  it('ignores edges to concepts outside the set', () => {
    expect(topologicalOrder(['a', 'b'], [{ from: 'zzz', to: 'a', kind: 'prereq' }, { from: 'b', to: 'a', kind: 'prereq' }])).toEqual(['b', 'a']);
  });

  it('throws on a cycle and names the concepts involved', () => {
    const edges: ConceptEdge[] = [
      { from: 'a', to: 'b', kind: 'prereq' },
      { from: 'b', to: 'c', kind: 'prereq' },
      { from: 'c', to: 'a', kind: 'prereq' },
      { from: 'a', to: 'd', kind: 'prereq' },
    ];
    expect(() => topologicalOrder(['a', 'b', 'c', 'd'], edges)).toThrow(/cycle.*a, b, c, d/);
    expect(() => topologicalOrder(['a'], [{ from: 'a', to: 'a', kind: 'prereq' }])).toThrow(/cycle/);
  });
});

describe('nextAvailableLesson', () => {
  const concept = (id: string): Concept => ({
    id, ordinal: 0, name: id, definition: id, objectives: [], misconceptions: [], examples: [], spans: [],
    script: { pretest: { prompt: '', isomorph: '', reference: '' }, guidingQuestions: [], workedExample: { problem: '', steps: [] }, transfer: { prompt: '', reference: '' }, hints: ['', '', ''] },
    items: [],
  });
  const curriculum: Curriculum = {
    manifest: { id: 'cur', version: 1, title: 't', subject: 's', description: '', level: '', contentHash: '', generator: { name: 'x', version: '1' }, createdAt: 0 },
    units: [
      {
        id: 'u2', ordinal: 2, title: 'U2', summary: '', lessons: [
          { id: 'l3', ordinal: 1, title: 'L3', concepts: [concept('e')] },
        ],
      },
      {
        id: 'u1', ordinal: 1, title: 'U1', summary: '', lessons: [
          { id: 'l2', ordinal: 2, title: 'L2', concepts: [concept('c'), concept('d')] },
          { id: 'l1', ordinal: 1, title: 'L1', concepts: [concept('a'), concept('b')] },
        ],
      },
    ],
    edges: [
      { from: 'a', to: 'b', kind: 'prereq' },  // intra-lesson: ignored for availability
      { from: 'b', to: 'c', kind: 'prereq' },
      { from: 'c', to: 'd', kind: 'prereq' },  // intra-lesson
      { from: 'd', to: 'e', kind: 'prereq' },
    ],
    sources: [],
  };

  it('walks units and lessons by ordinal and ignores intra-lesson prereqs', () => {
    expect(nextAvailableLesson(curriculum, new Map(), new Set())?.id).toBe('l1');
    expect(nextAvailableLesson(curriculum, new Map(), new Set(['l1']))).toBeNull(); // l2 needs b ≥ 0.7
    expect(nextAvailableLesson(curriculum, new Map([['b', 0.7]]), new Set(['l1']))?.id).toBe('l2');
    expect(nextAvailableLesson(curriculum, new Map([['b', 0.9]]), new Set(['l1', 'l2']))).toBeNull(); // l3 needs d
    expect(nextAvailableLesson(curriculum, new Map([['b', 0.9], ['d', 0.75]]), new Set(['l1', 'l2']))?.id).toBe('l3');
    expect(nextAvailableLesson(curriculum, new Map([['b', 0.9], ['d', 0.75]]), new Set(['l1', 'l2', 'l3']))).toBeNull();
  });

  it('skips a locked lesson to a later available one', () => {
    // l2 locked (b low) but l3 available if d is somehow mastered.
    expect(nextAvailableLesson(curriculum, new Map([['d', 0.9]]), new Set(['l1']))?.id).toBe('l3');
  });
});
