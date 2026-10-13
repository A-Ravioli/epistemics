import { describe, expect, it } from 'vitest';
import { adjustRatingForConfidence, isCorrect, needsConsensus, ratingFromGrade } from '../../src/scheduler/index.js';

describe('ratingFromGrade (DESIGN §6.2)', () => {
  it('maps score bands to ratings', () => {
    expect(ratingFromGrade(0, 1)).toBe(1);
    expect(ratingFromGrade(0.39, 1)).toBe(1);
    expect(ratingFromGrade(0.4, 1)).toBe(2);
    expect(ratingFromGrade(0.74, 1)).toBe(2);
    expect(ratingFromGrade(0.75, 1)).toBe(3);
    expect(ratingFromGrade(0.94, 1)).toBe(3);
    expect(ratingFromGrade(0.95, 0.8)).toBe(4);
    expect(ratingFromGrade(1, 1)).toBe(4);
  });

  it('withholds Easy when the grader is not confident', () => {
    expect(ratingFromGrade(0.95, 0.79)).toBe(3);
    expect(ratingFromGrade(1, 0.5)).toBe(3);
  });

  it('treats a non-finite score as Again', () => {
    expect(ratingFromGrade(Number.NaN, 1)).toBe(1);
  });
});

describe('needsConsensus', () => {
  it('defers on low grader confidence or a near-boundary score', () => {
    expect(needsConsensus(0.6, 0.69)).toBe(true);
    expect(needsConsensus(0.6, 0.9)).toBe(false);
    expect(needsConsensus(0.42, 0.9)).toBe(true);
    expect(needsConsensus(0.78, 0.9)).toBe(true);
    expect(needsConsensus(0.97, 0.9)).toBe(true);
    expect(needsConsensus(0.85, 0.9)).toBe(false);
  });
});

describe('adjustRatingForConfidence (DESIGN §3.4)', () => {
  it('high-confidence wrong → Again + hypercorrection', () => {
    expect(adjustRatingForConfidence(2, 3, false)).toEqual({ rating: 1, hypercorrection: true });
    expect(adjustRatingForConfidence(1, 3, false)).toEqual({ rating: 1, hypercorrection: true });
  });

  it('low-confidence right → Hard ("lucky")', () => {
    expect(adjustRatingForConfidence(3, 1, true)).toEqual({ rating: 2, hypercorrection: false });
    expect(adjustRatingForConfidence(4, 1, true)).toEqual({ rating: 2, hypercorrection: false });
  });

  it('otherwise unchanged, and never inflates', () => {
    expect(adjustRatingForConfidence(3, 2, true)).toEqual({ rating: 3, hypercorrection: false });
    expect(adjustRatingForConfidence(4, 3, true)).toEqual({ rating: 4, hypercorrection: false });
    expect(adjustRatingForConfidence(1, 1, false)).toEqual({ rating: 1, hypercorrection: false });
    expect(adjustRatingForConfidence(1, 2, false)).toEqual({ rating: 1, hypercorrection: false });
    expect(adjustRatingForConfidence(2, 2, false)).toEqual({ rating: 2, hypercorrection: false });
    for (const r of [1, 2, 3, 4] as const) {
      for (const c of [1, 2, 3] as const) {
        for (const ok of [true, false]) {
          expect(adjustRatingForConfidence(r, c, ok).rating).toBeLessThanOrEqual(r);
        }
      }
    }
  });

  it('isCorrect is Good or better', () => {
    expect([1, 2, 3, 4].map((r) => isCorrect(r as 1 | 2 | 3 | 4))).toEqual([false, false, true, true]);
  });
});
