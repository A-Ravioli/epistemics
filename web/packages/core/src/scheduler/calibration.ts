/**
 * Confidence calibration (DESIGN §6.3): Brier score and over/underconfidence bias.
 */
import type { Confidence } from '../types.js';

/** Predicted probability of being correct for each confidence level (guess / fairly sure / certain). */
export const CONFIDENCE_PROBABILITY: Readonly<Record<Confidence, number>> = Object.freeze({ 1: 0.33, 2: 0.67, 3: 0.95 });

export interface CalibrationPair {
  confidence: Confidence;
  correct: boolean;
}

export interface CalibrationSummary {
  /** Mean squared error between predicted probability and outcome; 0 is perfect, 0.25 is chance-level guessing. */
  brier: number;
  /** mean(predicted) − mean(observed). Positive → overconfident, negative → underconfident. */
  overconfidenceBias: number;
  n: number;
}

export function brierScore(pairs: CalibrationPair[]): CalibrationSummary {
  const n = pairs.length;
  if (n === 0) return { brier: 0, overconfidenceBias: 0, n: 0 };
  let se = 0;
  let sumP = 0;
  let sumO = 0;
  for (const { confidence, correct } of pairs) {
    const p = CONFIDENCE_PROBABILITY[confidence];
    const o = correct ? 1 : 0;
    se += (p - o) ** 2;
    sumP += p;
    sumO += o;
  }
  return { brier: se / n, overconfidenceBias: (sumP - sumO) / n, n };
}

export interface CalibrationBin {
  confidence: Confidence;
  predicted: number;
  n: number;
  /** Observed accuracy within the bin (0 when empty). */
  observed: number;
  /** predicted − observed; positive → overconfident at this level. */
  gap: number;
}

/** One bin per confidence level, for the calibration chart on the progress screen. */
export function calibrationBins(pairs: CalibrationPair[]): CalibrationBin[] {
  const counts: Record<Confidence, { n: number; hits: number }> = { 1: { n: 0, hits: 0 }, 2: { n: 0, hits: 0 }, 3: { n: 0, hits: 0 } };
  for (const { confidence, correct } of pairs) {
    counts[confidence].n += 1;
    if (correct) counts[confidence].hits += 1;
  }
  return ([1, 2, 3] as const).map((c) => {
    const { n, hits } = counts[c];
    const predicted = CONFIDENCE_PROBABILITY[c];
    const observed = n === 0 ? 0 : hits / n;
    return { confidence: c, predicted, n, observed, gap: n === 0 ? 0 : predicted - observed };
  });
}
