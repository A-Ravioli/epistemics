/**
 * Blind grader (DESIGN §6.2). Sees only prompt, reference, rubric, answer and misconception list; never the dialogue.
 * Consensus deferral: when the first sample is low-confidence or sits within 0.05 of a rating boundary,
 * two more samples are drawn and the median score / per-criterion majority decides.
 */
import { GradeResultSchema, type GradeResult, type Rating, type RubricCriterion } from '@epistemics/core';
import type { LlmProvider, LlmRequest, Usage } from '../provider.js';
import { PROMPTS } from '../prompts.js';
import { normalise } from '../text.js';
import { encodeInput } from './shared.js';

export const RATING_BOUNDARIES = [0.4, 0.75, 0.95] as const;
export const CONSENSUS_CONFIDENCE = 0.7;
export const CONSENSUS_MARGIN = 0.05;
export const CONSENSUS_SAMPLES = 3;

export interface GradeReference { answer: string; exact?: string; notes?: string }

export interface GradeInput {
  prompt: string;
  reference: string | GradeReference;
  rubric: RubricCriterion[];
  answer: string;
  misconceptions: { tag: string; description: string }[];
  /** Force this many samples (≥1). Default: 1, escalating to 3 by consensus deferral. */
  samples?: number;
  model?: string;
  metadata?: LlmRequest['metadata'];
  signal?: AbortSignal;
}

export function buildGraderRequest(input: GradeInput): LlmRequest {
  const ref: GradeReference = typeof input.reference === 'string' ? { answer: input.reference } : input.reference;
  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    reference: ref.answer,
    ...(ref.exact ? { exactAnswer: ref.exact } : {}),
    ...(ref.notes ? { gradingNotes: ref.notes } : {}),
    rubric: input.rubric.map((c) => ({ id: c.id, text: c.text, ...(c.evidenceHint ? { evidenceHint: c.evidenceHint } : {}) })),
    answer: input.answer,
    misconceptions: input.misconceptions.map((m) => ({ tag: m.tag, description: m.description })),
  };
  const req: LlmRequest = {
    role: 'grader',
    system: [{ text: PROMPTS.grader, cache: true }],
    messages: [{ role: 'user', content: encodeInput(payload) }],
    effort: 'medium',
    maxTokens: 2048,
  };
  if (input.model) req.model = input.model;
  if (input.metadata) req.metadata = input.metadata;
  if (input.signal) req.signal = input.signal;
  return req;
}

/** Normalised exact-match check for `reference.exact` (numbers compare numerically, strings after normalisation). */
export function exactMatches(answer: string, exact: string): boolean {
  const a = normalise(answer);
  const e = normalise(exact);
  if (!e) return false;
  if (a === e) return true;
  const numE = Number(e.replace(/,/g, ''));
  if (Number.isFinite(numE)) {
    // any number token in the answer equal to the exact value (tolerating "x = 42", "42.0", "42 m/s")
    for (const tok of a.split(' ')) {
      const n = Number(tok.replace(/,/g, ''));
      if (Number.isFinite(n) && tok !== '' && Math.abs(n - numE) <= Math.abs(numE) * 1e-9 + 1e-12) return true;
    }
    return false;
  }
  // multi-word exact answers: whole-phrase containment on word boundaries
  return new RegExp(`(^| )${e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(a);
}

/** Short-circuit grade for items with an exact canonical answer: 1 or 0 with confidence 1. */
export function gradeExact(answer: string, exact: string, rubric: RubricCriterion[] = []): GradeResult {
  const met = exactMatches(answer, exact);
  return {
    criteria: rubric.map((c) => ({ id: c.id, met, evidence: met ? answer.trim().slice(0, 200) : '' })),
    score: met ? 1 : 0,
    misconceptionTags: [],
    feedback: met ? 'Your final answer matches the expected result.' : `Your final answer does not match the expected result (${exact}).`,
    confidence: 1,
    samples: 0,
  };
}

/** True when a first sample should be escalated to three (DESIGN §6.2). */
export function needsConsensus(r: Pick<GradeResult, 'score' | 'confidence'>): boolean {
  if (r.confidence < CONSENSUS_CONFIDENCE) return true;
  // strictly inside the margin, on 3-decimal rounding (0.90 vs 0.95 is exactly 0.05 away: not borderline)
  return RATING_BOUNDARIES.some((b) => Math.round(Math.abs(r.score - b) * 1000) / 1000 < CONSENSUS_MARGIN);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Combine N grader samples: median score, per-criterion majority, majority misconception tags, mean confidence. */
export function combineGrades(samples: GradeResult[], rubric: RubricCriterion[]): GradeResult {
  if (samples.length === 0) throw new Error('combineGrades: no samples');
  if (samples.length === 1) return { ...samples[0]!, samples: 1 };
  const score = median(samples.map((s) => s.score));
  const need = Math.floor(samples.length / 2) + 1;
  const ids = rubric.length > 0 ? rubric.map((c) => c.id) : [...new Set(samples.flatMap((s) => s.criteria.map((c) => c.id)))];
  const criteria = ids.map((id) => {
    const votes = samples.map((s) => s.criteria.find((c) => c.id === id)).filter((c): c is GradeResult['criteria'][number] => !!c);
    const metVotes = votes.filter((c) => c.met).length;
    const met = metVotes >= need;
    const evidence = votes.find((c) => c.met === met)?.evidence ?? votes[0]?.evidence ?? '';
    return { id, met, evidence };
  });
  const tagCounts = new Map<string, number>();
  for (const s of samples) for (const t of new Set(s.misconceptionTags)) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const misconceptionTags = [...tagCounts.entries()].filter(([, n]) => n >= need).map(([t]) => t);
  // feedback from the sample whose score is closest to the median
  const closest = [...samples].sort((a, b) => Math.abs(a.score - score) - Math.abs(b.score - score))[0]!;
  const confidence = samples.reduce((a, s) => a + s.confidence, 0) / samples.length;
  return { criteria, score, misconceptionTags, feedback: closest.feedback, confidence, samples: samples.length };
}

/** Whether the samples disagree on the rating band: the caller should then ask the learner to self-grade. */
export function samplesDisagree(samples: GradeResult[]): boolean {
  const bands = new Set(samples.map((s) => ratingFromGrade(s)));
  return bands.size > 1;
}

export function ratingFromGrade(g: Pick<GradeResult, 'score' | 'confidence'>): Rating {
  if (g.score < 0.4) return 1;
  if (g.score < 0.75) return 2;
  if (g.score < 0.95) return 3;
  return g.confidence >= 0.8 ? 4 : 3;
}

export interface GradeOutcome { grade: GradeResult; usage: Usage; disagreement: boolean }

export async function gradeWithUsage(provider: LlmProvider, input: GradeInput): Promise<GradeOutcome> {
  const ref: GradeReference = typeof input.reference === 'string' ? { answer: input.reference } : input.reference;
  const zero: Usage = { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, latencyMs: 0, model: '' };

  if (ref.exact !== undefined) {
    const g = gradeExact(input.answer, ref.exact, input.rubric);
    if (g.score === 1 || input.rubric.length === 0) return { grade: g, usage: zero, disagreement: false };
    // Wrong final answer but a rubric exists: grade the reasoning, capped below the Good band.
    const llm = await gradeWithUsage(provider, { ...input, reference: { answer: ref.answer, ...(ref.notes ? { notes: ref.notes } : {}) } });
    const capped = Math.min(llm.grade.score, 0.5);
    return {
      ...llm,
      grade: { ...llm.grade, score: capped, feedback: `${llm.grade.feedback} Your final answer (${input.answer.trim().slice(0, 80)}) does not match the expected result.` },
    };
  }

  const req = buildGraderRequest(input);
  const samples: GradeResult[] = [];
  let usage = zero;
  const add = (u: Usage) => {
    usage = {
      model: u.model,
      inputTokens: usage.inputTokens + u.inputTokens,
      outputTokens: usage.outputTokens + u.outputTokens,
      cacheRead: usage.cacheRead + u.cacheRead,
      cacheWrite: usage.cacheWrite + u.cacheWrite,
      costUsd: usage.costUsd + u.costUsd,
      latencyMs: usage.latencyMs + u.latencyMs,
    };
  };
  const draw = async () => {
    const r = await provider.structured(req, GradeResultSchema, 'GradeResult');
    add(r.usage);
    samples.push(sanitiseGrade(r.value, input));
  };

  const forced = Math.max(1, Math.floor(input.samples ?? 1));
  for (let i = 0; i < forced; i++) await draw();
  if (forced === 1 && needsConsensus(samples[0]!)) {
    while (samples.length < CONSENSUS_SAMPLES) await draw();
  }
  const grade = combineGrades(samples, input.rubric);
  return { grade, usage, disagreement: samples.length > 1 && samplesDisagree(samples) };
}

export async function grade(provider: LlmProvider, input: GradeInput): Promise<GradeResult> {
  return (await gradeWithUsage(provider, input)).grade;
}

/** Keep only rubric ids and known tags; clamp numbers. */
export function sanitiseGrade(g: GradeResult, input: Pick<GradeInput, 'rubric' | 'misconceptions'>): GradeResult {
  const known = new Set(input.rubric.map((c) => c.id));
  const tags = new Set(input.misconceptions.map((m) => m.tag));
  const criteria = input.rubric.length === 0 ? g.criteria : input.rubric.map((c) => {
    const found = g.criteria.find((x) => x.id === c.id);
    return found ? { id: c.id, met: found.met, evidence: found.evidence } : { id: c.id, met: false, evidence: '' };
  });
  const clamp = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
  return {
    ...g,
    criteria: criteria.filter((c) => input.rubric.length === 0 || known.has(c.id)),
    score: clamp(g.score),
    confidence: clamp(g.confidence),
    misconceptionTags: [...new Set(g.misconceptionTags.filter((t) => tags.has(t)))],
  };
}
