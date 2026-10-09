import { describe, expect, it } from 'vitest';
import { mulberry32, simulateLoad } from '../../src/scheduler/index.js';
import { DAY, NOW, mkScheduler, reviewCard, settings } from './helpers.js';

describe('mulberry32', () => {
  it('is deterministic and uniform-ish in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(Array.from({ length: 1000 }, () => b())).toEqual(xs);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const mean = xs.reduce((p, c) => p + c, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('simulateLoad', () => {
  const s = mkScheduler({ enableFuzz: true });

  it('produces a stable, bounded daily load for a 10-new-per-day learner over 60 days', () => {
    const days = simulateLoad([], 60, settings, s, { newPerDay: 10, seed: 3, startAt: NOW });
    expect(days.length).toBe(60);
    expect(days[0]!.day).toBe('2026-03-10');
    expect(days[59]!.day).toBe('2026-05-08');
    for (const d of days) {
      expect(d.newCards).toBe(10);
      expect(d.reviews).toBeLessThanOrEqual(settings.reviewsPerDay + 60); // cap plus same-day learning steps
      expect(d.debt).toBe(0);
      expect(d.minutes).toBeGreaterThan(0);
    }
    // Load ramps up then plateaus: the last 20 days are not still growing steeply.
    const mean = (xs: number[]) => xs.reduce((p, c) => p + c, 0) / xs.length;
    const early = mean(days.slice(10, 20).map((d) => d.reviews));
    const late = mean(days.slice(40, 60).map((d) => d.reviews));
    const veryLate = mean(days.slice(50, 60).map((d) => d.reviews));
    expect(late).toBeGreaterThan(early);
    expect(veryLate).toBeLessThan(late * 1.5);
    expect(late).toBeGreaterThan(10);
    expect(late).toBeLessThan(100);
  });

  it('is deterministic for a seed and differs across seeds', () => {
    const a = simulateLoad([], 20, settings, s, { newPerDay: 5, seed: 9, startAt: NOW });
    const b = simulateLoad([], 20, settings, s, { newPerDay: 5, seed: 9, startAt: NOW });
    const c = simulateLoad([], 20, settings, s, { newPerDay: 5, seed: 10, startAt: NOW });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('reports debt and works through an existing backlog under the daily cap', () => {
    const backlog = Array.from({ length: 30 }, (_, i) => reviewCard(10, 8, { id: `b${i}`, conceptId: `c${i}`, due: NOW - (i % 5) * DAY }));
    const days = simulateLoad(backlog, 5, { ...settings, reviewsPerDay: 10 }, s, { seed: 1, startAt: NOW, pRecall: () => 1 });
    expect(days[0]!.debt).toBe(20);
    expect(days[0]!.reviews).toBe(10);
    expect(days[1]!.debt).toBe(10);
    expect(days[2]!.debt).toBe(0);
    expect(days[0]!.newCards).toBe(0);
  });

  it('honours the per-day new cap and the gate', () => {
    const backlog = Array.from({ length: 5 }, (_, i) => reviewCard(10, 8, { id: `b${i}`, conceptId: `c${i}`, due: NOW - DAY }));
    const days = simulateLoad(backlog, 2, { ...settings, maxNewItemsPerDay: 3 }, s, { newPerDay: 10, seed: 1, startAt: NOW, pRecall: () => 1 });
    expect(days[0]!.reviews).toBeGreaterThanOrEqual(5);
    expect(days[0]!.newCards).toBe(3); // reviews cleared first, then the gate opens
    expect(days[1]!.newCards).toBe(3);
  });

  it('never loops forever on a learner who forgets everything', () => {
    const days = simulateLoad([], 3, settings, s, { newPerDay: 2, seed: 1, startAt: NOW, pRecall: () => 0, maxAnswersPerDay: 50 });
    expect(days.every((d) => d.reviews + d.newCards <= 50)).toBe(true);
  });
});
