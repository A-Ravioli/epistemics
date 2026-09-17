import { describe, expect, it } from 'vitest';
import { createEmptyCard, State } from 'ts-fsrs';
import { fromFsrsCard, toFsrsCard, daysToExam, isLeech, DEFAULT_FSRS_W } from '../../src/scheduler/index.js';
import { DAY, HOUR, NOW, mkCard, mkScheduler, reviewCard } from './helpers.js';

describe('Card <-> ts-fsrs mapping', () => {
  it('round-trips a Review card exactly', () => {
    const card = reviewCard(3, 12.5, { learningSteps: 0, lapses: 1, reps: 7 });
    const back = fromFsrsCard(card, toFsrsCard(card));
    expect(back).toEqual(card);
  });

  it('round-trips a New card without lastReview', () => {
    const card = mkCard();
    const f = toFsrsCard(card);
    expect(f.last_review).toBeUndefined();
    expect(f.state).toBe(State.New);
    expect(fromFsrsCard(card, f)).toEqual(card);
    expect('lastReview' in fromFsrsCard(card, f)).toBe(false);
  });

  it('keeps ids and app flags from the base card', () => {
    const base = mkCard({ suspended: true, provisional: true });
    const empty = createEmptyCard(new Date(NOW));
    const out = fromFsrsCard(base, empty);
    expect(out.id).toBe(base.id);
    expect(out.itemId).toBe(base.itemId);
    expect(out.suspended).toBe(true);
    expect(out.provisional).toBe(true);
    expect(out.due).toBe(NOW);
  });
});

describe('createScheduler', () => {
  const s = mkScheduler();

  it('newCard is New, due now, with a stamped id', () => {
    const c = s.newCard('course', 'item', 'concept', NOW, 'fixed');
    expect(c).toMatchObject({ id: 'fixed', courseId: 'course', itemId: 'item', conceptId: 'concept', state: 0, due: NOW, reps: 0, lapses: 0 });
    const auto = s.newCard('course', 'item', 'concept', NOW);
    expect(auto.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('first ratings use S0 = w[G-1] and move New into the right state', () => {
    const c = s.newCard('course', 'item', 'concept', NOW, 'c');
    const p = s.previewRatings(c, NOW);
    expect(p[1].card.state).toBe(1); // Learning, step 1m
    expect(p[1].card.due).toBe(NOW + 60_000);
    expect(p[1].card.stability).toBeCloseTo(DEFAULT_FSRS_W[0]!, 6);
    expect(p[3].card.state).toBe(1); // Learning, step 10m
    expect(p[3].card.due).toBe(NOW + 10 * 60_000);
    expect(p[3].card.stability).toBeCloseTo(DEFAULT_FSRS_W[2]!, 6);
    expect(p[4].card.state).toBe(2); // Easy graduates immediately
    expect(p[4].card.stability).toBeCloseTo(DEFAULT_FSRS_W[3]!, 6);
    expect(p[4].card.scheduledDays).toBe(Math.round(DEFAULT_FSRS_W[3]!));
    expect(p[4].card.due).toBe(NOW + p[4].card.scheduledDays * DAY);
    for (const r of [1, 2, 3, 4] as const) {
      expect(p[r].log.rating).toBe(r);
      expect(p[r].log.stateBefore).toBe(0);
      expect(p[r].log.source).toBe('review');
    }
  });

  it('applyRating returns a log draft with post-review stability and the context', () => {
    const c = reviewCard(10, 10);
    const { card, log } = s.applyRating(c, 3, NOW, { source: 'lesson', assisted: true, confidence: 2, durationMs: 4200 });
    expect(card.state).toBe(2);
    expect(card.reps).toBe(c.reps + 1);
    expect(card.lastReview).toBe(NOW);
    expect(log).toMatchObject({
      cardId: c.id, courseId: c.courseId, reviewTime: NOW, rating: 3, stateBefore: 2, elapsedDays: 10,
      stability: card.stability, difficulty: card.difficulty, scheduledDays: card.scheduledDays,
      source: 'lesson', assisted: true, confidence: 2, durationMs: 4200,
    });
    expect('id' in log).toBe(false);
  });

  it('Good grows stability, Easy grows it more, Again lapses and shrinks it', () => {
    const c = reviewCard(10, 10);
    const p = s.previewRatings(c, NOW);
    expect(p[3].card.stability).toBeGreaterThan(c.stability);
    expect(p[4].card.stability).toBeGreaterThan(p[3].card.stability);
    expect(p[2].card.stability).toBeGreaterThan(c.stability);
    expect(p[2].card.stability).toBeLessThan(p[3].card.stability);
    expect(p[1].card.state).toBe(3); // Relearning
    expect(p[1].card.lapses).toBe(c.lapses + 1);
    expect(p[1].card.stability).toBeLessThan(c.stability);
    expect(p[1].card.due).toBe(NOW + 10 * 60_000); // 10m relearning step
    expect(p[3].card.due).toBeGreaterThan(NOW + 10 * DAY);
  });

  it('a lower retrievability at review time yields a larger stability gain (spacing effect)', () => {
    const early = s.applyRating(reviewCard(2, 10), 3, NOW, { source: 'review', assisted: false }).card;
    const late = s.applyRating(reviewCard(20, 10), 3, NOW, { source: 'review', assisted: false }).card;
    expect(late.stability).toBeGreaterThan(early.stability);
  });

  it('retrievability is 0 for New, ~0.9 at due for desired retention 0.9, and decays', () => {
    expect(s.retrievability(mkCard(), NOW)).toBe(0);
    const c = reviewCard(10, 10);
    expect(s.retrievability(c, NOW)).toBeCloseTo(0.9, 2);
    expect(s.retrievability(c, NOW - 5 * DAY)).toBeGreaterThan(0.9);
    expect(s.retrievability(c, NOW + 30 * DAY)).toBeLessThan(0.8);
    expect(s.retrievability(c, NOW - 10 * DAY)).toBe(1);
  });

  it('learning steps: Good twice graduates to Review', () => {
    let c = s.newCard('course', 'item', 'concept', NOW, 'c');
    c = s.applyRating(c, 3, NOW, { source: 'lesson', assisted: false }).card;
    expect(c.state).toBe(1);
    c = s.applyRating(c, 3, NOW + 10 * 60_000, { source: 'lesson', assisted: false }).card;
    expect(c.state).toBe(2);
    expect(c.scheduledDays).toBeGreaterThanOrEqual(1);
  });

  it('respects maximumIntervalDays as the exam cap', () => {
    const capped = mkScheduler({ maximumIntervalDays: 5 });
    const uncapped = mkScheduler();
    const c = reviewCard(30, 30);
    expect(uncapped.previewRatings(c, NOW)[4].card.scheduledDays).toBeGreaterThan(5);
    const p = capped.previewRatings(c, NOW);
    for (const r of [2, 3, 4] as const) {
      expect(p[r].card.scheduledDays).toBeLessThanOrEqual(5);
      expect(p[r].card.due).toBeLessThanOrEqual(NOW + 5 * DAY);
    }
    expect(capped.intervalForStability(1000)).toBe(5);
    expect(capped.params.maximum_interval).toBe(5);
    expect(daysToExam(NOW, NOW + 4.2 * DAY)).toBe(5);
    expect(daysToExam(NOW, NOW - DAY)).toBe(1);
  });

  it('seedKnownCard produces a provisional Review card at stability 21 / difficulty 5', () => {
    const seeded = s.seedKnownCard(mkCard(), NOW);
    expect(seeded).toMatchObject({ state: 2, stability: 21, difficulty: 5, provisional: true, lastReview: NOW, scheduledDays: 21, due: NOW + 21 * DAY });
    expect(s.retrievability(seeded, NOW + 21 * DAY)).toBeCloseTo(0.9, 2);
    const custom = s.seedKnownCard(mkCard(), NOW, 7);
    expect(custom.stability).toBe(7);
    expect(custom.scheduledDays).toBe(7);
  });

  it('a real review clears the provisional flag and Again demotes the seeded card', () => {
    const seeded = s.seedKnownCard(mkCard(), NOW);
    const good = s.applyRating(seeded, 3, NOW + 5 * DAY, { source: 'review', assisted: false }).card;
    expect(good.provisional).toBe(false);
    expect(good.state).toBe(2);
    const again = s.applyRating(seeded, 1, NOW + 5 * DAY, { source: 'review', assisted: false }).card;
    expect(again.provisional).toBe(false);
    expect(again.state).toBe(3);
    expect(again.stability).toBeLessThan(21);
  });

  it('fuzz is deterministic for a fixed input and stays within the cap', () => {
    const fz = mkScheduler({ enableFuzz: true, maximumIntervalDays: 40 });
    const c = reviewCard(30, 30);
    const a = fz.applyRating(c, 3, NOW, { source: 'review', assisted: false }).card;
    const b = fz.applyRating(c, 3, NOW, { source: 'review', assisted: false }).card;
    expect(a.due).toBe(b.due);
    expect(a.scheduledDays).toBeLessThanOrEqual(40);
  });

  it('accepts a custom parameter vector and a different desired retention', () => {
    const w = [...DEFAULT_FSRS_W];
    w[2] = 5;
    const custom = mkScheduler({ w, desiredRetention: 0.8 });
    expect(custom.params.w[2]).toBe(5);
    expect(custom.previewRatings(mkCard(), NOW)[3].card.stability).toBeCloseTo(5, 6);
    // Lower desired retention → longer intervals for the same stability.
    expect(custom.intervalForStability(10)).toBeGreaterThan(s.intervalForStability(10));
  });

  it('isLeech flags 8 lapses', () => {
    expect(isLeech(mkCard({ lapses: 7 }))).toBe(false);
    expect(isLeech(mkCard({ lapses: 8 }))).toBe(true);
  });

  it('due dates are absolute epoch ms independent of hour of day', () => {
    const c = reviewCard(10, 10);
    const at = NOW + 7 * HOUR;
    const { card } = s.applyRating(c, 3, at, { source: 'review', assisted: false });
    expect(card.due).toBe(at + card.scheduledDays * DAY);
  });
});
