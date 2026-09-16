/**
 * Thin, explicit wrapper over ts-fsrs (FSRS-6) that speaks our `Card` / `ReviewLogEntry` types.
 *
 * Pure: no clock, no I/O. Every function takes `now` as epoch ms. Fuzz (when enabled) is seeded by
 * ts-fsrs from review time, reps and D×S, so results are deterministic for a given input.
 */
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  State,
  type Card as FsrsCard,
  type FSRS,
  type FSRSParameters,
  type Grade,
} from 'ts-fsrs';
import type { Card, CardState, Confidence, Rating, ReviewLogEntry, ReviewSource } from '../types.js';
import { uuidv7 } from '../ids.js';
import { DAY_MS } from '../time.js';
import {
  DEFAULT_LEARNING_STEPS,
  DEFAULT_MAXIMUM_INTERVAL_DAYS,
  DEFAULT_RELEARNING_STEPS,
  LEECH_LAPSES,
} from './params.js';

export interface SchedulerParams {
  /** FSRS parameter vector (17/19/21 entries; ts-fsrs migrates). Defaults to FSRS-6 defaults. */
  w?: readonly number[];
  /** Desired retention, 0.8..0.95 (DESIGN §5.1). */
  desiredRetention: number;
  /** Interval cap in days; pass days-to-exam when an exam date is set. Default 36,500. */
  maximumIntervalDays?: number;
  /** Interval fuzz with load balancing. Default true (DESIGN §5.1). */
  enableFuzz?: boolean;
}

/** A review log row before it has been assigned an id by the DB layer. */
export type ReviewLogDraft = Omit<ReviewLogEntry, 'id'>;

export interface RatingOutcome {
  card: Card;
  log: ReviewLogDraft;
}

/** Context attached to a review when it is applied (or previewed). */
export interface ReviewContext {
  source: ReviewSource;
  assisted: boolean;
  confidence?: Confidence;
  durationMs?: number;
}

export interface Scheduler {
  /** Effective ts-fsrs parameters (read-only view). */
  readonly params: Readonly<FSRSParameters>;
  /** Underlying engine, exposed for callers that need raw formulas (implicit credit, simulator). */
  readonly engine: FSRS;
  /** Create a New card for an item. `id` defaults to a fresh UUIDv7 stamped with `now`. */
  newCard(courseId: string, itemId: string, conceptId: string, now: number, id?: string): Card;
  /** Outcome for every rating without committing. Log drafts carry `ctx` (default: review, unassisted). */
  previewRatings(card: Card, now: number, ctx?: Partial<ReviewContext>): Record<Rating, RatingOutcome>;
  /** Apply one rating and produce the next card plus its review-log draft. */
  applyRating(card: Card, rating: Rating, now: number, ctx: ReviewContext): RatingOutcome;
  /** Probability of recall at `now` (0..1). 0 for New cards. */
  retrievability(card: Card, now: number): number;
  /** Diagnostic seeding (DESIGN §6.4): state Review, given stability, difficulty 5, provisional. */
  seedKnownCard(card: Card, now: number, stabilityDays?: number): Card;
  /** Un-fuzzed interval in days for a stability at the configured desired retention, capped. */
  intervalForStability(stability: number): number;
}

// ---------------------------------------------------------------------------
// Card mapping
// ---------------------------------------------------------------------------

/** Our Card → ts-fsrs Card. States and ratings share numeric values, so only dates change shape. */
export function toFsrsCard(card: Card): FsrsCard {
  const out: FsrsCard = {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: 0,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as State,
  };
  if (card.lastReview !== undefined) out.last_review = new Date(card.lastReview);
  return out;
}

/** ts-fsrs Card → our Card, keeping ids and app-level flags from `base`. */
export function fromFsrsCard(base: Card, f: FsrsCard): Card {
  const out: Card = {
    ...base,
    state: f.state as CardState,
    due: f.due.getTime(),
    stability: f.stability,
    difficulty: f.difficulty,
    scheduledDays: f.scheduled_days,
    learningSteps: f.learning_steps,
    reps: f.reps,
    lapses: f.lapses,
  };
  if (f.last_review) out.lastReview = f.last_review.getTime();
  else delete out.lastReview;
  return out;
}

/** Days from `now` to `examDate` (at least 1), for `maximumIntervalDays` on exam courses. */
export function daysToExam(now: number, examDate: number): number {
  return Math.max(1, Math.ceil((examDate - now) / DAY_MS));
}

/** Leech rule (DESIGN §5.1). */
export function isLeech(card: Card, threshold: number = LEECH_LAPSES): boolean {
  return card.lapses >= threshold;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export function createScheduler(params: SchedulerParams): Scheduler {
  const fsrsParams = generatorParameters({
    ...(params.w ? { w: [...params.w] } : {}),
    request_retention: params.desiredRetention,
    maximum_interval: Math.max(1, Math.floor(params.maximumIntervalDays ?? DEFAULT_MAXIMUM_INTERVAL_DAYS)),
    enable_fuzz: params.enableFuzz ?? true,
    enable_short_term: true,
    learning_steps: [...DEFAULT_LEARNING_STEPS],
    relearning_steps: [...DEFAULT_RELEARNING_STEPS],
  });
  const engine = fsrs(fsrsParams);

  const toGrade = (r: Rating): Grade => r as unknown as Grade;

  function outcome(base: Card, item: { card: FsrsCard; log: { state: State; elapsed_days: number } }, now: number, ctx: ReviewContext, rating: Rating): RatingOutcome {
    const card = fromFsrsCard(base, item.card);
    // A provisional (diagnostic-seeded) card is confirmed by its first real review; demoted on Again.
    card.provisional = false;
    const log: ReviewLogDraft = {
      cardId: base.id,
      courseId: base.courseId,
      reviewTime: now,
      rating,
      stateBefore: item.log.state as CardState,
      elapsedDays: item.log.elapsed_days,
      scheduledDays: card.scheduledDays,
      stability: card.stability,
      difficulty: card.difficulty,
      source: ctx.source,
      assisted: ctx.assisted,
    };
    if (ctx.confidence !== undefined) log.confidence = ctx.confidence;
    if (ctx.durationMs !== undefined) log.durationMs = ctx.durationMs;
    return { card, log };
  }

  const scheduler: Scheduler = {
    params: fsrsParams,
    engine,

    newCard(courseId, itemId, conceptId, now, id = uuidv7(now)) {
      const empty = createEmptyCard(new Date(now));
      const base: Card = {
        id,
        courseId,
        itemId,
        conceptId,
        state: 0,
        due: now,
        stability: 0,
        difficulty: 0,
        scheduledDays: 0,
        learningSteps: 0,
        reps: 0,
        lapses: 0,
        suspended: false,
        provisional: false,
      };
      return fromFsrsCard(base, empty);
    },

    previewRatings(card, now, ctx = {}) {
      const full: ReviewContext = { source: ctx.source ?? 'review', assisted: ctx.assisted ?? false };
      if (ctx.confidence !== undefined) full.confidence = ctx.confidence;
      if (ctx.durationMs !== undefined) full.durationMs = ctx.durationMs;
      const preview = engine.repeat(toFsrsCard(card), new Date(now));
      const out = {} as Record<Rating, RatingOutcome>;
      for (const r of [1, 2, 3, 4] as const) {
        out[r] = outcome(card, preview[toGrade(r)], now, full, r);
      }
      return out;
    },

    applyRating(card, rating, now, ctx) {
      const item = engine.next(toFsrsCard(card), new Date(now), toGrade(rating));
      return outcome(card, item, now, ctx, rating);
    },

    retrievability(card, now) {
      if (card.state === 0) return 0;
      return engine.get_retrievability(toFsrsCard(card), new Date(now), false);
    },

    seedKnownCard(card, now, stabilityDays = 21) {
      const stability = Math.max(0.001, stabilityDays);
      const interval = scheduler.intervalForStability(stability);
      return {
        ...card,
        state: 2,
        stability,
        difficulty: 5,
        lastReview: now,
        due: now + interval * DAY_MS,
        scheduledDays: interval,
        learningSteps: 0,
        provisional: true,
      };
    },

    intervalForStability(stability) {
      const raw = Math.round(stability * engine.interval_modifier);
      return Math.min(Math.max(1, raw), fsrsParams.maximum_interval);
    },
  };
  return scheduler;
}
