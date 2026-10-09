/**
 * Grade → rating mapping (DESIGN §6.2) and confidence adjustment (DESIGN §3.4).
 */
import type { Confidence, Rating } from '../types.js';

/** A rating of Good or Easy counts as a successful retrieval. Hard is a pass for FSRS but not "correct" here. */
export function isCorrect(rating: Rating): boolean {
  return rating >= 3;
}

/**
 * DESIGN §6.2: `score < 0.4 → Again`, `0.4-0.75 → Hard`, `0.75-0.95 → Good`, `≥ 0.95 && confidence ≥ 0.8 → Easy`.
 * A score ≥ 0.95 with a less confident grader is Good, never Easy.
 */
export function ratingFromGrade(score: number, graderConfidence: number): Rating {
  if (!Number.isFinite(score)) return 1;
  if (score < 0.4) return 1;
  if (score < 0.75) return 2;
  if (score < 0.95) return 3;
  return graderConfidence >= 0.8 ? 4 : 3;
}

/**
 * DESIGN §6.2 consensus deferral: draw more grader samples when the grader is unsure or the score
 * sits within 0.05 of a rating boundary.
 */
export function needsConsensus(score: number, graderConfidence: number, margin: number = 0.05): boolean {
  if (graderConfidence < 0.7) return true;
  return [0.4, 0.75, 0.95].some((b) => Math.abs(score - b) <= margin);
}

/**
 * DESIGN §3.4. High-confidence wrong → Again and flagged hypercorrection; low-confidence right → Hard
 * ("lucky"); otherwise unchanged. Confidence never inflates a rating.
 */
export function adjustRatingForConfidence(
  rating: Rating,
  confidence: Confidence,
  correct: boolean,
): { rating: Rating; hypercorrection: boolean } {
  if (!correct && confidence === 3) return { rating: 1, hypercorrection: true };
  if (correct && confidence === 1) return { rating: rating < 2 ? rating : 2, hypercorrection: false };
  return { rating, hypercorrection: false };
}
