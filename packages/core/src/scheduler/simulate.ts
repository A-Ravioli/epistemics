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
  /** Epoch ms of the first simulated session. Default 2026-01-05 10:00 UTC. */
  startAt?: number;
  seed?: number;
  secondsPerItem?: number;
  /** Safety cap on answers per simulated day. */
  maxAnswersPerDay?: number;
}

export interface SimulatedDay {
  day: string;
  /** Answers on non-New cards, including same-day learning steps. */
  reviews: number;
  newCards: number;
  minutes: number;
  /** Cards due at the start of the day that did not fit under `reviewsPerDay`. */
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
  const newPerDay = Math.min(opts.newPerDay ?? 0, settings.maxNewItemsPerDay);
  const pNew = opts.pNew ?? 0.7;
  const secondsPerItem = opts.secondsPerItem ?? DEFAULT_SECONDS_PER_ITEM;
  const maxAnswers = opts.maxAnswersPerDay ?? 5_000;
  const stepMs = secondsPerItem * 1000;
  const dayCfg = { timezone: settings.timezone, dayStartHour: settings.dayStartHour };
  const startAt = opts.startAt ?? Date.UTC(2026, 0, 5, 10);
  const pRecall = opts.pRecall ?? ((c: Card, now: number) => (c.state === 0 ? pNew : scheduler.retrievability(c, now)));
  const daySettings: CourseSettings = { ...settings, maxNewItemsPerDay: newPerDay };

  const pool = new Map<string, Card>();
  const itemsByCard = new Map<string, QueueItemInfo>();
  for (const c of cards) {
    pool.set(c.id, c);
    itemsByCard.set(c.id, { conceptId: c.conceptId, type: 'recall' });
  }
  let synthetic = 0;
  const courseId = cards[0]?.courseId ?? 'sim';

  const out: SimulatedDay[] = [];
  for (let d = 0; d < days; d++) {
    const dayAt = startAt + d * DAY_MS;
    const dayEnd = studyDayStart(dayAt + 36 * 3_600_000, dayCfg);
    let now = dayAt;
    let reviews = 0;
    let reviewStateAnswers = 0;
    let newCards = 0;
    let debt = 0;
    let answers = 0;

    // Keep enough New cards in the pool for today's intake; synthetic cards get their own concept.
    let available = 0;
    for (const c of pool.values()) if (c.state === 0) available += 1;
    while (available < newPerDay) {
      synthetic += 1;
      const c = scheduler.newCard(courseId, `sim-item-${synthetic}`, `sim-concept-${synthetic}`, now, `sim-card-${synthetic}`);
      pool.set(c.id, c);
      itemsByCard.set(c.id, { conceptId: c.conceptId, type: 'recall' });
      available += 1;
    }

    const answer = (card: Card) => {
      // Wait out an intraday learning step, but never let the session clock cross the study-day boundary.
      // Cards due later today are answered at the current time, as a learner would.
      const isStep = (card.state === 1 || card.state === 3) && card.scheduledDays === 0;
      if (isStep && card.due > now) now = Math.min(card.due, dayEnd - stepMs);
      const rating = rng() < pRecall(card, now) ? 3 : 1;
      const { card: next } = scheduler.applyRating(card, rating, now, { source: 'review', assisted: false });
      pool.set(next.id, next);
      if (card.state === 2) reviewStateAnswers += 1;
      now += stepMs;
      answers += 1;
    };

    // Answer whatever the queue offers until it is empty: due learning/reviews first, then gated new cards
    // (which in turn spawn same-day learning steps that are picked up on the next build).
    for (let build = 0; answers < maxAnswers; build++) {
      const q = buildQueue({
        cards: [...pool.values()],
        now,
        settings: daySettings,
        itemsByCard,
        retrievability: (c) => scheduler.retrievability(c, now),
        rng,
        reviewsDoneToday: reviewStateAnswers,
        newDoneToday: newCards,
        learnAheadMs: Math.max(0, dayEnd - now),
      });
      if (build === 0) debt = q.debt;
      const due = [...q.learning, ...q.reviews];
      if (due.length > 0) {
        for (const c of due) {
          if (answers >= maxAnswers) break;
          answer(c);
          reviews += 1;
        }
      } else if (q.newCards.length > 0) {
        for (const c of q.newCards) {
          if (answers >= maxAnswers) break;
          answer(c);
          newCards += 1;
        }
      } else {
        break;
      }
    }

    out.push({ day: studyDay(dayAt, dayCfg), reviews, newCards, minutes: Math.ceil((answers * secondsPerItem) / 60), debt });
  }
  return out;
}
