/**
 * Learner model summary (DESIGN §4): a compact, deterministic rendering injected
 * into every tutor call after the cached curriculum prefix. ≤ ~600 tokens.
 * No timestamps, stable ordering, so the rendering is cache-friendly.
 */
import type { ConceptState, Course, LearnerModelSummary } from '../types.js';

export interface SummarizeLearnerModelInput {
  course: Course;
  conceptStates: ConceptState[];
  conceptNames: Map<string, string>;
  calibration: { brier: number; overconfidenceBias: number; n: number };
  recent: { lastLessonSummary?: string; openQuestions: string[] };
  preferences?: { verbosity?: 'terse' | 'normal'; examplesDomain?: string };
}

export const LEARNER_MODEL_MAX_FOCUS_CONCEPTS = 12;
export const LEARNER_MODEL_MAX_MISCONCEPTIONS = 3;
export const LEARNER_MODEL_MAX_OPEN_QUESTIONS = 4;
export const LEARNER_MODEL_MAX_SUMMARY_CHARS = 400;
export const MASTERED_THRESHOLD = 0.85;
export const SHAKY_THRESHOLD = 0.5;

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function summarizeLearnerModel(input: SummarizeLearnerModelInput): LearnerModelSummary {
  const concepts = input.conceptStates
    .map((cs) => ({
      id: cs.conceptId,
      name: input.conceptNames.get(cs.conceptId) ?? cs.conceptId,
      mastery: round2(clamp01(cs.mastery)),
      successfulSessions: cs.successfulSessions,
      misconceptions: cs.misconceptions.slice(0, LEARNER_MODEL_MAX_MISCONCEPTIONS),
    }))
    .sort(byId);
  const summary: LearnerModelSummary = {
    goals: input.course.goals,
    scaffolding: input.course.scaffolding,
    concepts,
    calibration: {
      brier: round2(input.calibration.brier),
      overconfidenceBias: round2(input.calibration.overconfidenceBias),
      n: input.calibration.n,
    },
    recent: {
      openQuestions: input.recent.openQuestions.slice(0, LEARNER_MODEL_MAX_OPEN_QUESTIONS).map(oneLine),
    },
    preferences: { verbosity: input.preferences?.verbosity ?? 'normal' },
  };
  if (input.recent.lastLessonSummary !== undefined) summary.recent.lastLessonSummary = truncate(oneLine(input.recent.lastLessonSummary), LEARNER_MODEL_MAX_SUMMARY_CHARS);
  if (input.preferences?.examplesDomain !== undefined) summary.preferences.examplesDomain = input.preferences.examplesDomain;
  return summary;
}

/**
 * Compact text for the prompt. Lists only concepts related to the lesson
 * (`focusConceptIds`, at most 12, sorted by id) plus aggregate counts.
 */
export function renderLearnerModel(summary: LearnerModelSummary, focusConceptIds: string[]): string {
  const focus = new Set(focusConceptIds);
  const all = summary.concepts;
  const mastered = all.filter((c) => c.mastery >= MASTERED_THRESHOLD).length;
  const shaky = all.filter((c) => c.mastery < SHAKY_THRESHOLD && (c.successfulSessions > 0 || c.misconceptions.length > 0)).length;
  const unseen = all.filter((c) => c.mastery === 0 && c.successfulSessions === 0).length;
  const withMisconceptions = all.filter((c) => c.misconceptions.length > 0).length;

  const lines: string[] = [];
  const g = summary.goals;
  const goalBits = [`purpose=${g.purpose}`, `weekly_minutes=${g.weeklyMinutes}`];
  if (g.examDate !== undefined) goalBits.push('exam=set');
  lines.push(`LEARNER MODEL`);
  lines.push(`goals: ${goalBits.join(' ')}${g.background ? ` background="${truncate(oneLine(g.background), 120)}"` : ''}`);
  lines.push(`scaffolding: ${summary.scaffolding}`);
  lines.push(`concepts: total=${all.length} mastered=${mastered} shaky=${shaky} unseen=${unseen} with_misconceptions=${withMisconceptions}`);

  const focused = all.filter((c) => focus.has(c.id)).sort(byId).slice(0, LEARNER_MODEL_MAX_FOCUS_CONCEPTS);
  if (focused.length > 0) {
    lines.push(`related concepts (${focused.length}):`);
    for (const c of focused) {
      const mis = c.misconceptions.length ? ` misconceptions=[${c.misconceptions.join(',')}]` : '';
      lines.push(`- ${truncate(oneLine(c.name), 60)} mastery=${c.mastery.toFixed(2)} sessions=${c.successfulSessions}${mis}`);
    }
  }
  const missing = focusConceptIds.filter((id) => !all.some((c) => c.id === id)).length;
  if (missing > 0) lines.push(`related concepts not yet started: ${missing}`);

  const cal = summary.calibration;
  lines.push(
    cal.n > 0
      ? `calibration: brier=${cal.brier.toFixed(2)} bias=${cal.overconfidenceBias >= 0 ? '+' : ''}${cal.overconfidenceBias.toFixed(2)} n=${cal.n}`
      : 'calibration: no data',
  );
  if (summary.recent.lastLessonSummary) lines.push(`last lesson (learner's words): "${summary.recent.lastLessonSummary}"`);
  if (summary.recent.openQuestions.length > 0) {
    lines.push('open questions:');
    for (const qn of summary.recent.openQuestions.slice(0, LEARNER_MODEL_MAX_OPEN_QUESTIONS)) lines.push(`- ${truncate(qn, 160)}`);
  }
  const prefs = [`verbosity=${summary.preferences.verbosity}`];
  if (summary.preferences.examplesDomain) prefs.push(`examples_domain="${truncate(oneLine(summary.preferences.examplesDomain), 60)}"`);
  lines.push(`preferences: ${prefs.join(' ')}`);
  return lines.join('\n');
}

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1))}…`;
}
