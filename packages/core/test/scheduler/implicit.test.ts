import { describe, expect, it } from 'vitest';
import type { Card, ConceptEdge } from '../../src/types.js';
import { encompassedBy, implicitCredit } from '../../src/scheduler/index.js';
import { DAY, NOW, mkCard, mkScheduler, reviewCard } from './helpers.js';

const s = mkScheduler();

const edges: ConceptEdge[] = [
  { from: 'B', to: 'A', kind: 'encompasses', weight: 0.4 },
  { from: 'B', to: 'Z', kind: 'encompasses', weight: 0.9 }, // clamped to 0.5
  { from: 'B', to: 'Q', kind: 'encompasses', weight: 0 },   // dropped
  { from: 'B', to: 'P', kind: 'prereq' },                   // wrong kind
  { from: 'C', to: 'A', kind: 'encompasses', weight: 0.5 }, // other source
];

function run(cards: Record<string, Card[]>, passed = 'B') {
  return implicitCredit({ passedConceptId: passed, edges, cardsByConcept: new Map(Object.entries(cards)), now: NOW, scheduler: s });
}

describe('encompassedBy', () => {
  it('collects encompasses edges from the passed concept, clamped to 0.5, dropping zero weights', () => {
    expect(encompassedBy('B', edges)).toEqual([{ conceptId: 'A', weight: 0.4 }, { conceptId: 'Z', weight: 0.5 }]);
    expect(encompassedBy('nope', edges)).toEqual([]);
  });
});

describe('implicitCredit (DESIGN §5.6)', () => {
  it('bumps stability by w × (S_good − S) and pushes the due date out, without touching D/reps/lastReview', () => {
    const a = reviewCard(8, 10, { id: 'a', conceptId: 'A' }); // R ≈ 0.92 < 0.97
    const [res, ...rest] = run({ A: [a] });
    expect(rest).toEqual([]);
    expect(res).toBeDefined();
    const sGood = s.previewRatings(a, NOW)[3].card.stability;
    expect(res!.card.stability).toBeCloseTo(10 + 0.4 * (sGood - 10), 9);
    expect(res!.card.stability).toBeGreaterThan(a.stability);
    expect(res!.card.stability).toBeLessThan(sGood);
    expect(res!.card.due).toBeGreaterThan(a.due);
    expect(res!.card.due).toBe(a.lastReview! + res!.card.scheduledDays * DAY);
    expect(res!.card.scheduledDays).toBe(s.intervalForStability(res!.card.stability));
    expect(res!.card.difficulty).toBe(a.difficulty);
    expect(res!.card.reps).toBe(a.reps);
    expect(res!.card.lastReview).toBe(a.lastReview);
    expect(res!.card.state).toBe(2);
    expect(res!.log).toMatchObject({
      cardId: 'a', courseId: a.courseId, reviewTime: NOW, rating: 3, stateBefore: 2, elapsedDays: 8,
      stability: res!.card.stability, difficulty: a.difficulty, source: 'implicit', assisted: false, scheduledDays: res!.card.scheduledDays,
    });
  });

  it('only touches Review-state cards with R < 0.97 and skips suspended ones', () => {
    const fresh = mkCard({ id: 'new', conceptId: 'A' });
    const learning = mkCard({ id: 'learn', conceptId: 'A', state: 1, stability: 0.5, difficulty: 5, lastReview: NOW - 60_000, due: NOW + 60_000 });
    const relearning = mkCard({ id: 'relearn', conceptId: 'A', state: 3, stability: 2, difficulty: 5, lastReview: NOW - 60_000, due: NOW + 600_000 });
    const justReviewed = reviewCard(0.1, 30, { id: 'strong' }); // R ≈ 1
    const suspended = reviewCard(8, 10, { id: 'susp', conceptId: 'A', suspended: true });
    const eligible = reviewCard(8, 10, { id: 'ok', conceptId: 'A' });
    const out = run({ A: [fresh, learning, relearning, justReviewed, suspended, eligible] });
    expect(out.map((o) => o.card.id)).toEqual(['ok']);
    expect(s.retrievability(justReviewed, NOW)).toBeGreaterThanOrEqual(0.97);
  });

  it('never reduces stability or moves the due date earlier, even for heavily overdue cards', () => {
    const overdue = reviewCard(200, 5, { id: 'od', conceptId: 'A' }); // R very low; S_good still > S
    const [res] = run({ A: [overdue] });
    expect(res).toBeDefined();
    expect(res!.card.stability).toBeGreaterThanOrEqual(overdue.stability);
    expect(res!.card.due).toBeGreaterThanOrEqual(overdue.due);
    for (let sInit = 0.5; sInit < 200; sInit *= 2.3) {
      for (const daysAgo of [0.5, 1, 3, 10, 40, 400]) {
        const c = reviewCard(daysAgo, sInit, { conceptId: 'A' });
        for (const r of run({ A: [c] })) {
          expect(r.card.stability).toBeGreaterThanOrEqual(c.stability);
          expect(r.card.due).toBeGreaterThanOrEqual(c.due);
        }
      }
    }
  });

  it('applies the clamped weight per target concept and ignores unrelated concepts', () => {
    const a = reviewCard(8, 10, { id: 'a', conceptId: 'A' });
    const z = reviewCard(8, 10, { id: 'z', conceptId: 'Z' });
    const p = reviewCard(8, 10, { id: 'p', conceptId: 'P' });
    const q = reviewCard(8, 10, { id: 'q', conceptId: 'Q' });
    const out = run({ A: [a], Z: [z], P: [p], Q: [q] });
    expect(out.map((o) => o.card.id).sort()).toEqual(['a', 'z']);
    const sGood = s.previewRatings(z, NOW)[3].card.stability;
    const zOut = out.find((o) => o.card.id === 'z')!;
    expect(zOut.card.stability).toBeCloseTo(10 + 0.5 * (sGood - 10), 9);
    const aOut = out.find((o) => o.card.id === 'a')!;
    expect(zOut.card.stability).toBeGreaterThan(aOut.card.stability);
  });

  it('returns nothing when the passed concept encompasses nothing', () => {
    expect(run({ A: [reviewCard(8, 10, { conceptId: 'A' })] }, 'A')).toEqual([]);
  });

  it('respects the exam cap when re-deriving the due date', () => {
    const capped = mkScheduler({ maximumIntervalDays: 3 });
    const a = reviewCard(8, 10, { id: 'a', conceptId: 'A', due: NOW - 5 * DAY });
    const [res] = implicitCredit({ passedConceptId: 'B', edges, cardsByConcept: new Map([['A', [a]]]), now: NOW, scheduler: capped });
    expect(res!.card.scheduledDays).toBe(3);
  });
});
