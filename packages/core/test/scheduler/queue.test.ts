import { describe, expect, it } from 'vitest';
import type { Card } from '../../src/types.js';
import { buildQueue, estimateMinutes, mulberry32, type BuildQueueInput } from '../../src/scheduler/index.js';
import { DAY, HOUR, NOW, mkCard, mkScheduler, reviewCard, settings } from './helpers.js';

const s = mkScheduler();

function build(cards: Card[], over: Partial<BuildQueueInput> = {}) {
  const itemsByCard = new Map(cards.map((c) => [c.id, { conceptId: c.conceptId, type: 'recall' as const }]));
  return buildQueue({
    cards,
    now: NOW,
    settings,
    itemsByCard,
    retrievability: (c) => s.retrievability(c, NOW),
    rng: mulberry32(7),
    ...over,
  });
}

const ids = (cards: Card[]) => cards.map((c) => c.id);

describe('buildQueue ordering (DESIGN §5.3)', () => {
  it('puts intraday learning first, then interday learning, then reviews, then new', () => {
    const intraday = mkCard({ id: 'intra', state: 1, scheduledDays: 0, due: NOW - 60_000, stability: 0.2, difficulty: 5, lastReview: NOW - 2 * 60_000 });
    const interday = mkCard({ id: 'inter', state: 3, scheduledDays: 1, due: NOW - HOUR, stability: 1, difficulty: 5, lastReview: NOW - DAY });
    const review = reviewCard(5, 5, { id: 'rev' });
    const fresh = mkCard({ id: 'new' });
    const q = build([fresh, review, interday, intraday]);
    expect(ids(q.learning)).toEqual(['intra', 'inter']);
    expect(ids(q.reviews)).toEqual(['rev']);
    expect(q.newCards).toEqual([]); // gate closed while reviews remain
    expect(q.dueToday).toBe(3);
  });

  it('includes intraday learning due within the learn-ahead window only', () => {
    const soon = mkCard({ id: 'soon', state: 1, scheduledDays: 0, due: NOW + 5 * 60_000, stability: 0.2, difficulty: 5, lastReview: NOW - 5 * 60_000 });
    const later = mkCard({ id: 'later', state: 1, scheduledDays: 0, due: NOW + 3 * HOUR, stability: 0.2, difficulty: 5, lastReview: NOW - 5 * 60_000 });
    expect(ids(build([soon, later]).learning)).toEqual(['soon']);
    expect(ids(build([soon, later], { learnAheadMs: 0 }).learning)).toEqual([]);
    expect(ids(build([soon, later], { learnAheadMs: 4 * HOUR }).learning)).toEqual(['soon', 'later']);
  });

  it('treats reviews due later today as due, but not tomorrow', () => {
    const laterToday = reviewCard(5, 5, { id: 'today', due: NOW + 10 * HOUR }); // 22:00, day ends 04:00 next day
    const tomorrow = reviewCard(5, 5, { id: 'tomorrow', due: NOW + 17 * HOUR }); // 05:00 next day
    const q = build([tomorrow, laterToday]);
    expect(ids(q.reviews)).toEqual(['today']);
  });

  it('orders reviews by due date, breaking ties with the rng', () => {
    const a = reviewCard(5, 5, { id: 'a', due: NOW - 2 * DAY });
    const b = reviewCard(5, 5, { id: 'b', due: NOW - DAY });
    const c = reviewCard(5, 5, { id: 'c', due: NOW - DAY });
    const d = reviewCard(5, 5, { id: 'd', due: NOW - 3 * DAY });
    const q = build([a, b, c, d]);
    expect(q.reviews[0]!.id).toBe('d');
    expect(q.reviews[1]!.id).toBe('a');
    expect(new Set(ids(q.reviews.slice(2)))).toEqual(new Set(['b', 'c']));
    // Tie order depends on the rng; a different seed can flip it, and the same seed is stable.
    const same = build([a, b, c, d]);
    expect(ids(same.reviews)).toEqual(ids(q.reviews));
    const seeds = new Set<string>();
    for (let seed = 1; seed < 20; seed++) seeds.add(ids(build([a, b, c, d], { rng: mulberry32(seed) }).reviews).join());
    expect(seeds.size).toBe(2);
  });

  it('excludes suspended cards everywhere', () => {
    const q = build([reviewCard(5, 5, { id: 'x', suspended: true, due: NOW - DAY }), mkCard({ id: 'n', suspended: true })]);
    expect(q.reviews).toEqual([]);
    expect(q.newCards).toEqual([]);
    expect(q.dueToday).toBe(0);
    expect(q.gateOpen).toBe(true);
  });
});

describe('sibling burying', () => {
  it('shows at most one card per concept per build and defers the rest', () => {
    const a1 = reviewCard(5, 5, { id: 'a1', conceptId: 'A', due: NOW - 2 * DAY });
    const a2 = reviewCard(5, 5, { id: 'a2', conceptId: 'A', due: NOW - DAY });
    const b1 = reviewCard(5, 5, { id: 'b1', conceptId: 'B', due: NOW - DAY });
    const q = build([a1, a2, b1]);
    expect(ids(q.reviews)).toEqual(['a1', 'b1']);
    expect(ids(q.buried)).toEqual(['a2']);
    expect(q.dueToday).toBe(3); // buried cards are still owed today
    expect(q.gateOpen).toBe(false);
  });

  it('buries siblings of recently shown concepts and across sections', () => {
    const learning = mkCard({ id: 'l', conceptId: 'A', state: 1, scheduledDays: 0, due: NOW - 1000, stability: 0.2, difficulty: 5, lastReview: NOW - 60_000 });
    const rev = reviewCard(5, 5, { id: 'r', conceptId: 'A', due: NOW - DAY });
    const other = reviewCard(5, 5, { id: 'o', conceptId: 'C', due: NOW - DAY });
    const q = build([learning, rev, other], { recentlyShownConceptIds: new Set(['C']) });
    expect(ids(q.learning)).toEqual(['l']);
    expect(ids(q.reviews)).toEqual([]);
    expect(new Set(ids(q.buried))).toEqual(new Set(['r', 'o']));
  });

  it('uses itemsByCard concept ids when present', () => {
    const x = mkCard({ id: 'x', conceptId: 'wrong' });
    const y = mkCard({ id: 'y', conceptId: 'wrong2' });
    const itemsByCard = new Map([
      ['x', { conceptId: 'same', type: 'recall' as const }],
      ['y', { conceptId: 'same', type: 'explain' as const }],
    ]);
    const q = build([x, y], { itemsByCard });
    expect(q.newCards.length).toBe(1);
    expect(q.buried.length).toBe(1);
  });
});

describe('review gate, debt and recovery (DESIGN §5.4)', () => {
  it('opens the gate and releases new cards only when nothing is due', () => {
    const fresh = [mkCard({ id: 'n1', due: NOW - 3000 }), mkCard({ id: 'n2', due: NOW - 2000 }), mkCard({ id: 'n3', due: NOW - 1000 })];
    const q = build(fresh);
    expect(q.gateOpen).toBe(true);
    expect(q.recoveryMode).toBe(false);
    expect(ids(q.newCards)).toEqual(['n1', 'n2', 'n3']);
    const closed = build([...fresh, reviewCard(5, 5, { id: 'r', due: NOW - DAY })]);
    expect(closed.gateOpen).toBe(false);
    expect(closed.newCards).toEqual([]);
    const future = build([...fresh, reviewCard(5, 5, { id: 'r', due: NOW + 3 * DAY })]);
    expect(future.gateOpen).toBe(true);
  });

  it('caps new cards by maxNewItemsPerDay minus those already introduced', () => {
    const fresh = Array.from({ length: 6 }, (_, i) => mkCard({ id: `n${i}`, due: NOW + i }));
    expect(build(fresh, { settings: { ...settings, maxNewItemsPerDay: 4 } }).newCards.length).toBe(4);
    expect(build(fresh, { settings: { ...settings, maxNewItemsPerDay: 4 }, newDoneToday: 3 }).newCards.length).toBe(1);
    expect(build(fresh, { settings: { ...settings, maxNewItemsPerDay: 4 }, newDoneToday: 9 }).newCards.length).toBe(0);
  });

  it('caps reviews at reviewsPerDay and reports the debt', () => {
    const due = Array.from({ length: 10 }, (_, i) => reviewCard(5, 5, { id: `r${i}`, due: NOW - DAY + i }));
    const q = build(due, { settings: { ...settings, reviewsPerDay: 6 } });
    expect(q.reviews.length).toBe(6);
    expect(q.debt).toBe(4);
    expect(q.daysToClear).toBe(2);
    expect(q.gateOpen).toBe(false);
    expect(q.recoveryMode).toBe(false);
    expect(q.overdueDays).toBe(1);
    const partial = build(due, { settings: { ...settings, reviewsPerDay: 6 }, reviewsDoneToday: 4 });
    expect(partial.reviews.length).toBe(2);
    expect(partial.debt).toBe(8);
  });

  it('no debt when the due count fits, even with an old card', () => {
    const q = build([reviewCard(5, 5, { id: 'old', due: NOW - 10 * DAY })]);
    expect(q.debt).toBe(0);
    expect(q.overdueDays).toBe(0);
    expect(q.recoveryMode).toBe(false);
  });

  it('enters recovery mode for a backlog ≥ 3 days and orders by retrievability ascending', () => {
    // Four due cards with capacity 2: debt > 0, oldest due 4 days ago → recovery.
    const strong = reviewCard(4, 40, { id: 'strong', due: NOW - 4 * DAY });   // R high
    const weak = reviewCard(4, 1, { id: 'weak', due: NOW - 3 * DAY });         // R low
    const mid = reviewCard(4, 5, { id: 'mid', due: NOW - 3 * DAY });
    const fresh = reviewCard(4, 20, { id: 'fresh', due: NOW - 2 * DAY });
    const q = build([strong, fresh, mid, weak, mkCard({ id: 'new' })], { settings: { ...settings, reviewsPerDay: 2 } });
    expect(q.recoveryMode).toBe(true);
    expect(q.gateOpen).toBe(false);
    expect(q.overdueDays).toBe(4);
    expect(q.debt).toBe(2);
    expect(ids(q.reviews)).toEqual(['weak', 'mid']);
    expect(q.newCards).toEqual([]);
  });

  it('a backlog of 1-2 days keeps normal ordering but closes the gate', () => {
    const a = reviewCard(3, 30, { id: 'a', due: NOW - 2 * DAY });
    const b = reviewCard(3, 1, { id: 'b', due: NOW - DAY });
    const c = reviewCard(3, 5, { id: 'c', due: NOW - DAY });
    const q = build([a, b, c], { settings: { ...settings, reviewsPerDay: 2 } });
    expect(q.recoveryMode).toBe(false);
    expect(q.overdueDays).toBe(2);
    // Backlog exists → retrievability ascending; 'b' (S=1, 3 days elapsed) is weakest.
    expect(q.reviews[0]!.id).toBe('b');
    expect(q.gateOpen).toBe(false);
  });

  it('honours a caller-tracked carried-over debt', () => {
    const q = build([mkCard({ id: 'n' })], { debtCarriedOverDays: 3 });
    expect(q.recoveryMode).toBe(true);
    expect(q.gateOpen).toBe(false);
    expect(q.newCards).toEqual([]);
  });

  it('respects the study-day boundary at dayStartHour in the course timezone', () => {
    // 03:00 Tokyo on 11 March is still study day 10 March (day starts 04:00).
    const tokyo = { ...settings, timezone: 'Asia/Tokyo' };
    const at = Date.UTC(2026, 2, 10, 18); // 03:00 JST on 2026-03-11
    const dueEarlyMorning = reviewCard(5, 5, { id: 'x', due: Date.UTC(2026, 2, 10, 18, 30) }); // 03:30 JST, same study day
    const dueAfterBoundary = reviewCard(5, 5, { id: 'y', due: Date.UTC(2026, 2, 10, 19, 30) }); // 04:30 JST, next study day
    const q = build([dueEarlyMorning, dueAfterBoundary], { now: at, settings: tokyo });
    expect(ids(q.reviews)).toEqual(['x']);
  });
});

describe('estimateMinutes', () => {
  it('sums all sections at secondsPerItem and rounds up', () => {
    const q = { learning: [mkCard()], reviews: [mkCard(), mkCard()], newCards: [mkCard()] };
    expect(estimateMinutes(q)).toBe(2); // 4 × 25s = 100s
    expect(estimateMinutes(q, 60)).toBe(4);
    expect(estimateMinutes({ learning: [], reviews: [], newCards: [] })).toBe(0);
  });
});
