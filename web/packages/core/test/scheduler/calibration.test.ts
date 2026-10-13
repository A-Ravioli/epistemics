import { describe, expect, it } from 'vitest';
import { brierScore, calibrationBins, CONFIDENCE_PROBABILITY, type CalibrationPair } from '../../src/scheduler/index.js';

describe('brierScore', () => {
  it('matches a hand-computed fixture', () => {
    const pairs: CalibrationPair[] = [
      { confidence: 3, correct: true },   // (0.95 − 1)² = 0.0025
      { confidence: 3, correct: false },  // (0.95 − 0)² = 0.9025
      { confidence: 2, correct: true },   // (0.67 − 1)² = 0.1089
      { confidence: 1, correct: false },  // (0.33 − 0)² = 0.1089
    ];
    const { brier, overconfidenceBias, n } = brierScore(pairs);
    expect(n).toBe(4);
    expect(brier).toBeCloseTo((0.0025 + 0.9025 + 0.1089 + 0.1089) / 4, 10); // 0.2807
    // mean predicted = (0.95+0.95+0.67+0.33)/4 = 0.725; mean observed = 0.5
    expect(overconfidenceBias).toBeCloseTo(0.225, 10);
  });

  it('is 0 for a perfectly calibrated-and-certain learner, negative bias when underconfident', () => {
    expect(brierScore([])).toEqual({ brier: 0, overconfidenceBias: 0, n: 0 });
    const under = brierScore([{ confidence: 1, correct: true }, { confidence: 1, correct: true }]);
    expect(under.overconfidenceBias).toBeCloseTo(0.33 - 1, 10);
    expect(under.brier).toBeCloseTo(0.67 ** 2, 10);
  });

  it('exposes the confidence → probability map', () => {
    expect(CONFIDENCE_PROBABILITY).toEqual({ 1: 0.33, 2: 0.67, 3: 0.95 });
  });
});

describe('calibrationBins', () => {
  it('reports observed accuracy per confidence level with empty bins at 0', () => {
    const bins = calibrationBins([
      { confidence: 3, correct: true }, { confidence: 3, correct: true }, { confidence: 3, correct: false },
      { confidence: 1, correct: true },
    ]);
    expect(bins).toEqual([
      { confidence: 1, predicted: 0.33, n: 1, observed: 1, gap: expect.closeTo(-0.67, 10) },
      { confidence: 2, predicted: 0.67, n: 0, observed: 0, gap: 0 },
      { confidence: 3, predicted: 0.95, n: 3, observed: expect.closeTo(2 / 3, 10), gap: expect.closeTo(0.95 - 2 / 3, 10) },
    ]);
  });
});
