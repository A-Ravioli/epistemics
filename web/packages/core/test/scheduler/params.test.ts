import { describe, expect, it } from 'vitest';
import { default_w } from 'ts-fsrs';
import { DEFAULT_FSRS_W, LEECH_LAPSES, shouldOptimize } from '../../src/scheduler/index.js';
import { DAY, NOW } from './helpers.js';

describe('params', () => {
  it('DEFAULT_FSRS_W is the 21-parameter FSRS-6 default from ts-fsrs', () => {
    expect(DEFAULT_FSRS_W.length).toBe(21);
    expect([...DEFAULT_FSRS_W]).toEqual([...default_w]);
    expect(DEFAULT_FSRS_W[0]).toBeCloseTo(0.212, 6);
    expect(DEFAULT_FSRS_W[20]).toBeCloseTo(0.1542, 6);
    expect(Object.isFrozen(DEFAULT_FSRS_W)).toBe(true);
    expect(LEECH_LAPSES).toBe(8);
  });

  it('shouldOptimize needs ≥ 400 reviews and ≥ 30 days since the last fit', () => {
    expect(shouldOptimize(399, undefined, NOW)).toBe(false);
    expect(shouldOptimize(400, undefined, NOW)).toBe(true);
    expect(shouldOptimize(400, NOW - 29 * DAY, NOW)).toBe(false);
    expect(shouldOptimize(400, NOW - 30 * DAY, NOW)).toBe(true);
    expect(shouldOptimize(5000, NOW - DAY, NOW)).toBe(false);
  });
});
