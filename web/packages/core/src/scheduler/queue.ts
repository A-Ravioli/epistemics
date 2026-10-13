/**
 * Daily queue construction and the review gate (DESIGN §5.3-5.4).
 *
 *   intraday learning (due now) → interday learning → reviews due today → new items (gate permitting)
 *
 *   debt      = max(0, due_reviews_today − reviews_per_day)
 *   gate_open = due_reviews_remaining_today == 0 && overdue_days < 3
 *   recovery  = overdue_days ≥ 3 (session capped, lowest retrievability first, lesson hidden)
 *
 * Pure: takes `now`, an optional rng and the caller's retrievability function.
 */
import type { Card, CourseSettings, ItemType } from '../types.js';
import { daysBetween, studyDayStart } from '../time.js';

export const RECOVERY_OVERDUE_DAYS = 3;
export const DEFAULT_LEARN_AHEAD_MS = 20 * 60_000;
export const DEFAULT_SECONDS_PER_ITEM = 25;

export interface QueueItemInfo {
  conceptId: string;
  type: ItemType;
}

export interface BuildQueueInput {
  cards: Card[];
  now: number;
  settings: CourseSettings;
  /** Item metadata per card id; falls back to `card.conceptId` when a card is missing here. */
  itemsByCard: Map<string, QueueItemInfo>;
  retrievability: (card: Card) => number;
  /** Concepts already shown this session; their remaining siblings are buried. */
  recentlyShownConceptIds?: Set<string>;
  /** Uniform [0,1) source for the random tie-break. Defaults to a fixed sequence (deterministic). */
  rng?: () => number;
  /** Reviews already answered today, subtracted from `reviewsPerDay`. */
  reviewsDoneToday?: number;
  /** New cards already introduced today, subtracted from `maxNewItemsPerDay`. */
  newDoneToday?: number;
  /** Intraday learning cards due within this window count as due now. Default 20 min. */
  learnAheadMs?: number;
  /** Days the backlog has already been carried over, if the caller tracks it; merged with the derived value. */
  debtCarriedOverDays?: number;
}

export interface Queue {
  /** Intraday learning (due now) followed by interday learning due today. */
  learning: Card[];
  /** Review-state cards due today, capped at `reviewsPerDay`. */
  reviews: Card[];
  /** New cards to introduce, empty unless the gate is open. */
  newCards: Card[];
  /** Cards due today but held back by sibling burying; they surface on the next build. */
  buried: Card[];
  /** max(0, due reviews today − reviews_per_day). */
  debt: number;
  /** Count of learning + review cards due today before capping/burying. */
  dueToday: number;
  gateOpen: boolean;
  recoveryMode: boolean;
  /** Study days the oldest due review in an over-capacity backlog has been waiting. */
  overdueDays: number;
  /** Study days needed to clear today's due reviews at `reviewsPerDay`. */
  daysToClear: number;
}

const LEARNING_STATES = new Set<number>([1, 3]);

/** Fixed-sequence fallback so builds without an rng are still deterministic. */
function defaultRng(): () => number {
  let s = 0x9e3779b9;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildQueue(input: BuildQueueInput): Queue {
  const { cards, now, settings, itemsByCard } = input;
  const rng = input.rng ?? defaultRng();
  const learnAheadMs = input.learnAheadMs ?? DEFAULT_LEARN_AHEAD_MS;
  const dayCfg = { timezone: settings.timezone, dayStartHour: settings.dayStartHour };
  const dayStart = studyDayStart(now, dayCfg);
  const dayEnd = studyDayStart(dayStart + 36 * 3_600_000, dayCfg);

  const conceptOf = (c: Card) => itemsByCard.get(c.id)?.conceptId ?? c.conceptId;
  const active = cards.filter((c) => !c.suspended);

  const intraday: Card[] = [];
  const interday: Card[] = [];
  const dueReviews: Card[] = [];
  const fresh: Card[] = [];
  for (const c of active) {
    if (c.state === 0) {
      fresh.push(c);
    } else if (LEARNING_STATES.has(c.state)) {
      if (c.scheduledDays === 0) {
        if (c.due <= now + learnAheadMs) intraday.push(c);
      } else if (c.due < dayEnd) {
        interday.push(c);
      }
    } else if (c.due < dayEnd) {
      dueReviews.push(c);
    }
  }

  const reviewsLeftToday = Math.max(0, settings.reviewsPerDay - (input.reviewsDoneToday ?? 0));
  const debt = Math.max(0, dueReviews.length - reviewsLeftToday);

  let overdueDays = 0;
  if (debt > 0) {
    for (const c of dueReviews) {
      const age = daysBetween(studyDayStart(c.due, dayCfg), dayStart);
      if (age > overdueDays) overdueDays = age;
    }
  }
  overdueDays = Math.max(overdueDays, input.debtCarriedOverDays ?? 0);
  const recoveryMode = overdueDays >= RECOVERY_OVERDUE_DAYS;

  // Ordering. Random tie-break keys are drawn once per card so the sort comparator stays consistent.
  const tie = new Map<string, number>();
  const tieOf = (c: Card) => {
    let t = tie.get(c.id);
    if (t === undefined) {
      t = rng();
      tie.set(c.id, t);
    }
    return t;
  };
  const byDueThenRandom = (a: Card, b: Card) => a.due - b.due || tieOf(a) - tieOf(b) || a.id.localeCompare(b.id);
  intraday.sort(byDueThenRandom);
  interday.sort(byDueThenRandom);
  if (debt > 0) {
    const r = new Map<string, number>();
    for (const c of dueReviews) r.set(c.id, input.retrievability(c));
    dueReviews.sort((a, b) => r.get(a.id)! - r.get(b.id)! || a.due - b.due || a.id.localeCompare(b.id));
  } else {
    dueReviews.sort(byDueThenRandom);
  }
  fresh.sort(byDueThenRandom);

  // Sibling burying: at most one card per concept per build (DESIGN §5.1).
  const seen = new Set<string>(input.recentlyShownConceptIds ?? []);
  const buried: Card[] = [];
  const take = (list: Card[], limit: number): Card[] => {
    const out: Card[] = [];
    for (const c of list) {
      if (out.length >= limit) break;
      const concept = conceptOf(c);
      if (seen.has(concept)) {
        buried.push(c);
        continue;
      }
      seen.add(concept);
      out.push(c);
    }
    return out;
  };

  const learning = [...take(intraday, Infinity), ...take(interday, Infinity)];
  const reviews = take(dueReviews, reviewsLeftToday);

  const dueToday = intraday.length + interday.length + dueReviews.length;
  const gateOpen = dueToday === 0 && overdueDays < RECOVERY_OVERDUE_DAYS;
  const newLimit = Math.max(0, settings.maxNewItemsPerDay - (input.newDoneToday ?? 0));
  const newCards = gateOpen && !recoveryMode ? take(fresh, newLimit) : [];

  return {
    learning,
    reviews,
    newCards,
    buried,
    debt,
    dueToday,
    gateOpen,
    recoveryMode,
    overdueDays,
    daysToClear: settings.reviewsPerDay > 0 ? Math.ceil(dueReviews.length / settings.reviewsPerDay) : 0,
  };
}

/** Whole minutes (rounded up) the queue will take at `secondsPerItem` per card. */
export function estimateMinutes(
  queue: Pick<Queue, 'learning' | 'reviews' | 'newCards'>,
  secondsPerItem: number = DEFAULT_SECONDS_PER_ITEM,
): number {
  const n = queue.learning.length + queue.reviews.length + queue.newCards.length;
  return Math.ceil((n * secondsPerItem) / 60);
}
