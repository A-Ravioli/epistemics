/**
 * Load simulator: replays the daily queue for N days with a synthetic learner and reports per-day load.
 * Deterministic given a seed (mulberry32). Used for "projected days to clear" and the shortfall estimate.
 */
import type { Card, CourseSettings } from '../types.js';
import { DAY_MS, studyDay, studyDayStart } from '../time.js';
import type { Scheduler } from './fsrs.js';
import { buildQueue, DEFAULT_SECONDS_PER_ITEM, type QueueItemInfo } from './queue.js';

/** Small, fast seeded PRNG returning uniform [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimulateOptions {
  /** Probability the learner recalls `card` at `now`. Default: FSRS retrievability, or `pNew` for New cards. */
  pRecall?: (card: Card, now: number) => number;
  /** New cards introduced per day (bounded by the gate and `maxNewItemsPerDay`). Default 0. */
  newPerDay?: number;
  /** Recall probability for a card's first exposure. Default 0.7. */
  pNew?: number;
  /** Epoch ms of the first simulated day. Default 2026-01-05 10:00 UTC. */
  startAt?: number;
  seed?: number;
  secondsPerItem?: number;
  /** Safety cap on answers per simulated day. */
  maxAnswersPerDay?: number;
}

export interface SimulatedDay {
  day: string;
  reviews: number;
  newCards: number;
  minutes: number;
  /** Cards due today that did not fit under `reviewsPerDay`. */
  debt: number;
}

export function simulateLoad(
  cards: Card[],
  days: number,
  settings: CourseSettings,
  scheduler: Scheduler,
  opts: SimulateOptions = {},
): SimulatedDay[] {
  const rng = mulberry32(opts.seed ?? 1);
  const newPerDay = opts.newPerDay ?? 0;
  const pNew = opts.pNew ?? 0.7;
  const secondsPerItem = opts.secondsPerItem ?? DEFAULT_SECONDS_PER_ITEM;
  const maxAnswers = opts.maxAnswersPerDay ?? 5_000;
  const stepMs = secondsPerItem * 1000;
  const dayCfg = { timezone: settings.timezone, dayStartHour: settings.dayStartHour };
  const startAt = opts.startAt ?? Date.UTC(2026, 0, 5, 10);
  const pRecall = opts.pRecall ?? ((c: Card, now: number) => (c.state === 0 ? pNew : scheduler.retrievability(c, now)));

  const pool = new Map<string, Card>();
  for (const c of cards) pool.set(c.id, c);
  const itemsByCard = new Map<string, QueueItemInfo>();
  for (const c of cards) itemsByCard.set(c.id, { conceptId: c.conceptId, type: 'recall' });
  let synthetic = 0;
  const courseId = cards[0]?.courseId ?? 'sim';

  const out: SimulatedDay[] = [];
  for (let d = 0; d < days; d++) {
    const dayAt = startAt + d * DAY_MS;
    let now = dayAt;
    let reviews = 0;
    let newCards = 0;
    let debt = 0;
    let answers = 0;
    const shown = new Set<string>();

    const answer = (card: Card) => {
      const p = pRecall(card, now);
      const rating = rng() < p ? 3 : 1;
      const { card: next } = scheduler.applyRating(card, rating, now, { source: 'review', assisted: false });
      pool.set(next.id, next);
      now += stepMs;
      answers += 1;
    };

    // Reviews and learning until nothing is due; intraday steps are answered as they come due today.
    let first = true;
    for (;;) {
      const q = buildQueue({
        cards: [...pool.values()],
        now,
        settings,
        itemsByCard,
        retrievability: (c) => scheduler.retrievability(c, now),
        rng,
        reviewsDoneToday: reviews,
        newDoneToday: newCards,
        learnAheadMs: DAY_MS,
        recentlyShownConceptIds: shown,
      });
      if (first) {
        debt = q.debt;
        first = false;
      }
      const due = [...q.learning, ...q.reviews];
      if (due.length === 0 || answers >= maxAnswers) break;
      for (const c of due) {
        if (answers >= maxAnswers) break;
        // Learning cards not yet due: jump the clock to them (the learner waits out the step).
        if (c.due > now) now = c.due;
        answer(c);
        reviews += 1;
        shown.add(c.conceptId);
      }
      shown.clear();
    }

    // New cards: top the pool up with synthetic New cards, then let the gate decide how many to show.
    const want = Math.min(newPerDay, settings.maxNewItemsPerDay);
    let available = [...pool.values()].filter((c) => c.state === 0).length;
    while (available < want) {
      synthetic += 1;
      const c = scheduler.newCard(courseId, `sim-item-${synthetic}`, `sim-concept-${synthetic}`, now, `sim-card-${synthetic}`);
      pool.set(c.id, c);
      itemsByCard.set(c.id, { conceptId: c.conceptId, type: 'recall' });
      available += 1;
    }
    if (want > 0) {
      const q = buildQueue({
        cards: [...pool.values()],
        now,
        settings: { ...settings, maxNewItemsPerDay: want },
        itemsByCard,
        retrievability: (c) => scheduler.retrievability(c, now),
        rng,
        reviewsDoneToday: reviews,
        learnAheadMs: 0,
      });
      for (const c of q.newCards) {
        answer(c);
        newCards += 1;
      }
      // Their same-day learning steps.
      for (let guard = 0; guard < 10; guard++) {
        const steps = buildQueue({
          cards: [...pool.values()],
          now,
          settings,
          itemsByCard,
          retrievability: (c) => scheduler.retrievability(c, now),
          rng,
          reviewsDoneToday: reviews,
          learnAheadMs: DAY_MS,
        }).learning.filter((c) => c.scheduledDays === 0 && c.due < studyDayStart(dayAt + 36 * 3_600_000, dayCfg));
        if (steps.length === 0) break;
        for (const c of steps) {
          if (c.due > now) now = c.due;
          answer(c);
          reviews += 1;
        }
      }
    }

    out.push({
      day: studyDay(dayAt, dayCfg),
      reviews,
      newCards,
      minutes: Math.ceil((answers * secondsPerItem) / 60),
      debt,
    });
  }
  return out;
}
