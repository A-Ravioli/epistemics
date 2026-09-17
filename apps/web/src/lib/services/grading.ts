/**
 * Blind grading glue: builds the grader input for an item or a script-backed lesson item, calls the
 * grader, and derives the FSRS rating (score → rating, then the confidence adjustment).
 */
import {
  adjustRatingForConfidence,
  isCorrect,
  ratingFromGrade,
  type Confidence,
  type Curriculum,
  type GradeResult,
  type Rating,
  type RubricCriterion,
} from '@epistemics/core';
import type { LessonItemKind, RubricSource } from '@epistemics/core';
import { gradeWithUsage, type GradeInput, type LlmProvider } from '@epistemics/llm';
import { findConcept, findItem } from './courses.js';

export const SCRIPT_RUBRIC: RubricCriterion[] = [{ id: 'c1', text: 'Answer matches the reference answer in substance' }];

export interface GradeTarget {
  conceptId: string;
  prompt: string;
  reference: GradeInput['reference'];
  rubric: RubricCriterion[];
  misconceptions: { tag: string; description: string }[];
}

/** Resolve what to grade against. Script-backed ids look like `<conceptId>#<kind>`. */
export function resolveGradeTarget(curriculum: Curriculum, itemId: string, rubricSource: RubricSource, kind?: LessonItemKind): GradeTarget {
  if (rubricSource === 'item') {
    const found = findItem(curriculum, itemId);
    if (!found) throw new Error(`Item not found: ${itemId}`);
    return {
      conceptId: found.concept.id,
      prompt: found.item.prompt,
      reference: found.item.reference,
      rubric: found.item.rubric.length ? found.item.rubric : SCRIPT_RUBRIC,
      misconceptions: found.concept.misconceptions,
    };
  }
  const conceptId = itemId.includes('#') ? itemId.slice(0, itemId.indexOf('#')) : itemId;
  const found = findConcept(curriculum, conceptId);
  if (!found) throw new Error(`Concept not found: ${conceptId}`);
  const s = found.concept.script;
  if (rubricSource === 'script.transfer') {
    return { conceptId, prompt: s.transfer.prompt, reference: s.transfer.reference, rubric: SCRIPT_RUBRIC, misconceptions: found.concept.misconceptions };
  }
  const prompt = kind === 'check' ? s.pretest.isomorph : s.pretest.prompt;
  return { conceptId, prompt, reference: s.pretest.reference, rubric: SCRIPT_RUBRIC, misconceptions: found.concept.misconceptions };
}

export interface Graded {
  grade: GradeResult;
  /** Rating before the confidence adjustment. */
  rawRating: Rating;
  rating: Rating;
  hypercorrection: boolean;
  disagreement: boolean;
}

export function deriveRating(grade: GradeResult, confidence?: Confidence): Pick<Graded, 'rawRating' | 'rating' | 'hypercorrection'> {
  const rawRating = ratingFromGrade(grade.score, grade.confidence);
  if (confidence === undefined) return { rawRating, rating: rawRating, hypercorrection: false };
  const adj = adjustRatingForConfidence(rawRating, confidence, isCorrect(rawRating));
  return { rawRating, rating: adj.rating, hypercorrection: adj.hypercorrection };
}

export async function gradeAnswer(
  provider: LlmProvider,
  target: GradeTarget,
  answer: string,
  opts: { confidence?: Confidence; samples?: number; metadata?: GradeInput['metadata']; signal?: AbortSignal } = {},
): Promise<Graded> {
  const out = await gradeWithUsage(provider, {
    prompt: target.prompt,
    reference: target.reference,
    rubric: target.rubric,
    answer,
    misconceptions: target.misconceptions,
    samples: opts.samples,
    metadata: opts.metadata,
    signal: opts.signal,
  });
  return { grade: out.grade, disagreement: out.disagreement, ...deriveRating(out.grade, opts.confidence) };
}
