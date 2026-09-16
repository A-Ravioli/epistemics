/**
 * Lesson state machine (DESIGN §3.3, §7.2-7.3, §9.4).
 *
 * A pure reducer: `reduceLesson(state, event, lesson) → { state, effects }`.
 * No I/O, no LLM calls, no timers. The app executes effects (call the tutor,
 * grade an item, …) and feeds results back as events. State is plain JSON so a
 * session can be persisted and resumed.
 *
 * Pedagogical control lives here; the model only supplies language. The tutor
 * is steered through short natural-language control messages (`TutorControl`).
 */
import type {
  Concept,
  Confidence,
  GradeResult,
  Lesson,
  LessonPhase,
  ObserverResult,
  Rating,
  Scaffolding,
} from '../types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LessonItemKind = 'pretest' | 'check' | 'consolidate' | 'transfer';
export type RubricSource = 'script.pretest' | 'script.transfer' | 'item';

export interface TutorControl {
  phase: LessonPhase;
  conceptId: string;
  hintLevel: number;
  objectiveIds: string[];
  maxWords: number;
  instruction: string;
  allowHintContent?: string;
}

export interface TranscriptEntry {
  role: 'tutor' | 'learner' | 'system';
  content: string;
  phase: LessonPhase;
  conceptId?: string;
  hintLevel?: number;
}

export interface ActiveItem {
  itemId: string;
  kind: LessonItemKind;
  assisted: boolean;
}

/** An item sent to the grader whose result has not come back yet. */
export interface PendingGrade {
  itemId: string;
  kind: LessonItemKind;
  conceptId: string;
  answer: string;
  confidence?: Confidence;
  assisted: boolean;
}

export interface LessonResults {
  checkResults: Record<string, { rating: Rating; score: number }>;
  pretestRecord: Record<string, { answer: string; confidence: Confidence }>;
  misconceptions: Record<string, string[]>;
  summaryText?: string;
  jol?: Record<string, number>;
}

/** Per-concept phase sequence. CHECK must be last; WRAP is appended once for the lesson. */
export const FULL_PHASE_PLAN: readonly LessonPhase[] = ['PRIME', 'PROBE', 'DEVELOP', 'CONSOLIDATE', 'EXTEND', 'CHECK'];
export const REMEDIATION_PHASE_PLAN: readonly LessonPhase[] = ['DEVELOP', 'CONSOLIDATE', 'CHECK'];

export interface LessonState {
  sessionId: string;
  courseId: string;
  lessonId: string;
  conceptIds: string[];
  conceptIndex: number;
  phase: LessonPhase;
  hintLevel: number; // 0..3
  attemptsThisPhase: number;
  turnsThisPhase: number;
  scaffolding: Scaffolding;
  activeItem?: ActiveItem;
  pretestRecord: Record<string, { answer: string; confidence: Confidence }>;
  checkResults: Record<string, { rating: Rating; score: number }>;
  remediationCount: Record<string, number>;
  misconceptions: Record<string, string[]>;
  transcript: TranscriptEntry[];
  summaryText?: string;
  jolPending: boolean;
  done: boolean;
  // --- engine bookkeeping (serialisable) ---
  started: boolean;
  phasePlan: LessonPhase[];
  wrap: boolean; // false for remediation mini-lessons (no summary/JOL)
  workedExampleShown: boolean;
  guidingIndex: number;
  consolidateLoops: number;
  pendingGrades: Record<string, PendingGrade>;
  lastControl: TutorControl | null;
  regenerations: number;
  jol?: Record<string, number>;
}

export type LessonEvent =
  | { type: 'start' }
  | { type: 'learner_turn'; content: string; confidence?: Confidence }
  | { type: 'tutor_turn'; content: string }
  | { type: 'observer'; result: ObserverResult }
  | { type: 'grade'; itemKind: LessonItemKind; itemId: string; grade: GradeResult; rating: Rating }
  | { type: 'give_up' }
  | { type: 'summary_submitted'; text: string }
  | { type: 'jol_submitted'; predictions: Record<string, number> }
  | { type: 'leak_detected' };

export type LessonEffect =
  | { type: 'call_tutor'; control: TutorControl }
  | { type: 'call_observer'; learnerTurn: string; conceptId: string; objectiveIds: string[] }
  | {
      type: 'grade_item';
      itemKind: LessonItemKind;
      itemId: string;
      conceptId: string;
      answer: string;
      confidence?: Confidence;
      assisted: boolean;
      rubricSource: RubricSource;
    }
  | {
      type: 'record_receipt';
      itemKind: LessonItemKind;
      itemId: string;
      conceptId: string;
      answer: string;
      confidence?: Confidence;
      grade?: GradeResult;
      rating: Rating;
      assisted: boolean;
    }
  | { type: 'activate_items'; conceptId: string; firstRating: Rating }
  | { type: 'show_message'; text: string }
  | { type: 'request_summary' }
  | { type: 'request_jol'; conceptIds: string[] }
  | { type: 'schedule_remediation'; conceptId: string }
  | { type: 'lesson_complete'; results: LessonResults };

export interface LessonStep {
  state: LessonState;
  effects: LessonEffect[];
}

export interface CreateLessonStateInput {
  sessionId: string;
  courseId: string;
  lesson: Lesson;
  scaffolding: Scaffolding;
  learnerMisconceptions?: Record<string, string[]>;
  /** Restrict the per-concept phase sequence (e.g. remediation: DEVELOP → CONSOLIDATE → CHECK). */
  phases?: readonly LessonPhase[];
  /** Run the WRAP phase (summary + JOL) after the last concept. Default true. */
  wrap?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_HINT_LEVEL = 3;
export const MAX_PROBE_TURNS = 2;
export const MAX_CONSOLIDATE_LOOPS = 2;
export const CONSOLIDATE_PASS_SCORE = 0.75;
export const CHECK_PASS_RATING: Rating = 3;
export const MAX_REMEDIATIONS_PER_CONCEPT = 1;
export const MAX_REMEDIATE_ATTEMPTS = 2;
export const MAX_LEAK_REGENERATIONS = 2;
export const WORDS_NORMAL = 120;
export const WORDS_WORKED_EXAMPLE = 220;
export const WORDS_SUMMARY_CHECK = 80;
export const LETS_FIND_OUT = "Let's find out.";

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function createLessonState(input: CreateLessonStateInput): LessonState {
  const plan = [...(input.phases ?? FULL_PHASE_PLAN)];
  if (plan.length === 0 || plan[plan.length - 1] !== 'CHECK') {
    throw new Error('lesson phase plan must end with CHECK');
  }
  const misconceptions: Record<string, string[]> = {};
  for (const c of input.lesson.concepts) {
    misconceptions[c.id] = [...(input.learnerMisconceptions?.[c.id] ?? [])];
  }
  const first = plan[0] as LessonPhase;
  return {
    sessionId: input.sessionId,
    courseId: input.courseId,
    lessonId: input.lesson.id,
    conceptIds: input.lesson.concepts.map((c) => c.id),
    conceptIndex: 0,
    phase: first,
    hintLevel: 0,
    attemptsThisPhase: 0,
    turnsThisPhase: 0,
    scaffolding: input.scaffolding,
    pretestRecord: {},
    checkResults: {},
    remediationCount: {},
    misconceptions,
    transcript: [],
    jolPending: false,
    done: false,
    started: false,
    phasePlan: plan,
    wrap: input.wrap ?? true,
    workedExampleShown: false,
    guidingIndex: 0,
    consolidateLoops: 0,
    pendingGrades: {},
    lastControl: null,
    regenerations: 0,
  };
}

// ---------------------------------------------------------------------------
// Item ids for script-backed items (the app maps these to receipts)
// ---------------------------------------------------------------------------

export function scriptItemId(conceptId: string, kind: Exclude<LessonItemKind, 'consolidate'> | 'consolidate'): string {
  return `${conceptId}#${kind}`;
}

/** The item graded in CONSOLIDATE: the concept's first `explain` item if any, else the script pretest. */
export function consolidateItem(concept: Concept): { itemId: string; rubricSource: RubricSource } {
  const explain = concept.items.find((i) => i.type === 'explain');
  return explain ? { itemId: explain.id, rubricSource: 'item' } : { itemId: scriptItemId(concept.id, 'pretest'), rubricSource: 'script.pretest' };
}

// ---------------------------------------------------------------------------
// Tutor control
// ---------------------------------------------------------------------------

export type ControlKind =
  | 'prime'
  | 'probe'
  | 'worked_example'
  | 'develop'
  | 'consolidate'
  | 'extend'
  | 'check'
  | 'remediate'
  | 'summary_check';

export interface ControlOptions {
  kind?: ControlKind;
  /** Text prepended to the instruction (e.g. feedback to deliver before the next prompt). */
  preamble?: string;
}

function q(text: string): string {
  return `"${text.replace(/\s+/g, ' ').trim()}"`;
}

function defaultControlKind(state: LessonState): ControlKind {
  switch (state.phase) {
    case 'PRIME':
      return 'prime';
    case 'PROBE':
      return 'probe';
    case 'DEVELOP':
      return state.scaffolding === 'novice' && !state.workedExampleShown ? 'worked_example' : 'develop';
    case 'CONSOLIDATE':
      return 'consolidate';
    case 'EXTEND':
      return 'extend';
    case 'CHECK':
      return 'check';
    case 'REMEDIATE':
      return 'remediate';
    case 'WRAP':
    case 'DONE':
      return 'summary_check';
  }
}

function hintClause(state: LessonState, concept: Concept): { text: string; allow?: string } {
  const h = state.hintLevel;
  const hints = concept.script.hints;
  if (h <= 0) return { text: 'No hint may be given at this level: ask the question and wait for an attempt.' };
  if (h < MAX_HINT_LEVEL) {
    const allow = hints[h - 1] ?? hints[0];
    return { text: `You may give this hint and nothing beyond it: ${q(allow)}.`, allow };
  }
  const allow = hints[2];
  return {
    text: `Bottom-out hint (level 3): present this partial worked example and ask the learner to complete and explain the final step themselves: ${q(allow)}. Never give the full answer.`,
    allow,
  };
}

/** Builds the control message the app appends as a mid-conversation system message before a tutor call. */
export function buildTutorControl(state: LessonState, lesson: Lesson, opts: ControlOptions = {}): TutorControl {
  const concept = currentConcept(state, lesson);
  const kind = opts.kind ?? defaultControlKind(state);
  const objectiveIds = concept ? concept.objectives.map((o) => o.id) : [];
  const conceptId = concept?.id ?? state.conceptIds[state.conceptIndex] ?? '';
  const pre = opts.preamble ? `${opts.preamble.trim()} ` : '';
  let maxWords = WORDS_NORMAL;
  let instruction: string;
  let allowHintContent: string | undefined;

  if (!concept && kind !== 'summary_check') {
    return { phase: state.phase, conceptId, hintLevel: state.hintLevel, objectiveIds, maxWords, instruction: `${pre}Say nothing.` };
  }

  switch (kind) {
    case 'prime': {
      const c = concept as Concept;
      instruction =
        `${pre}Phase PRIME. Ask the learner this pretest question verbatim and nothing else: ${q(c.script.pretest.prompt)} ` +
        'Do not explain, hint, or add context. Ask them to answer and rate their confidence (1 guess, 2 fairly sure, 3 certain). ' +
        `Ask exactly one question. ≤${maxWords} words.`;
      break;
    }
    case 'probe': {
      const c = concept as Concept;
      instruction =
        `${pre}Phase PROBE (turn ${Math.min(state.turnsThisPhase + 1, MAX_PROBE_TURNS)} of ${MAX_PROBE_TURNS}). ` +
        `Ask exactly one question to elicit what the learner already knows that bears on ${q(c.name)}; link to mastered prerequisites by name where relevant. ` +
        `Do not explain the concept and do not state the answer. ≤${maxWords} words.`;
      break;
    }
    case 'worked_example': {
      const c = concept as Concept;
      maxWords = WORDS_WORKED_EXAMPLE;
      const steps = c.script.workedExample.steps.map((s, i) => `${i + 1}. ${s}`).join(' ');
      instruction =
        `${pre}Phase DEVELOP, worked example first (novice scaffolding), hint level ${state.hintLevel} of ${MAX_HINT_LEVEL}. ` +
        `Present the worked example steps for ${q(c.script.workedExample.problem)}: ${steps} ` +
        `Then ask the learner to explain step 1 in their own words. Ask exactly one question. ≤${maxWords} words.`;
      break;
    }
    case 'develop': {
      const c = concept as Concept;
      const gqs = c.script.guidingQuestions;
      const gi = Math.min(state.guidingIndex, Math.max(0, gqs.length - 1));
      const gq = gqs[gi];
      const hint = hintClause(state, c);
      allowHintContent = hint.allow;
      instruction =
        `${pre}Phase DEVELOP, hint level ${state.hintLevel} of ${MAX_HINT_LEVEL}. ` +
        (gq
          ? `Guiding question ${gi + 1} of ${gqs.length}: ${q(gq.question)} (a good answer contains: ${gq.expected}). `
          : 'Guide the learner toward the key idea with one leading question. ') +
        `${hint.text} Ask exactly one question. ≤${maxWords} words. Do not state the answer.`;
      break;
    }
    case 'consolidate': {
      const c = concept as Concept;
      instruction =
        `${pre}Phase CONSOLIDATE. Ask the learner to state the principle of ${q(c.name)} in their own words, in one or two sentences. ` +
        `Ask exactly one question. Do not state the principle yourself. ≤${maxWords} words.`;
      break;
    }
    case 'extend': {
      const c = concept as Concept;
      const hint = hintClause(state, c);
      allowHintContent = hint.allow;
      instruction =
        `${pre}Phase EXTEND, hint level ${state.hintLevel} of ${MAX_HINT_LEVEL}. Pose this transfer question verbatim: ${q(c.script.transfer.prompt)} ` +
        `${hint.text} Ask exactly one question. ≤${maxWords} words. Do not state the answer.`;
      break;
    }
    case 'check': {
      const c = concept as Concept;
      instruction =
        `${pre}Phase CHECK (unaided). Ask this question verbatim and nothing else: ${q(c.script.pretest.isomorph)} ` +
        'Ask the learner to answer and rate their confidence 1-3. Give no hints, no feedback and no commentary; you will stay silent until it is graded. ' +
        `Ask exactly one question. ≤${maxWords} words.`;
      break;
    }
    case 'remediate': {
      const c = concept as Concept;
      const tags = state.misconceptions[c.id] ?? [];
      const targeted = c.misconceptions.filter((m) => tags.includes(m.tag));
      const remedies = targeted.length
        ? targeted.map((m) => `[${m.tag}] ${m.description} → ${m.remedy}`).join(' | ')
        : 'no tagged misconception; target the key idea of the concept directly';
      instruction =
        `${pre}Phase REMEDIATE. The learner's unaided check on ${q(c.name)} did not pass. Targeted remediation: ${remedies}. ` +
        `Ask exactly one question that surfaces and repairs the misunderstanding. Do not reveal the check answer. ≤${maxWords} words.`;
      break;
    }
    case 'summary_check': {
      maxWords = WORDS_SUMMARY_CHECK;
      instruction =
        `${pre}Phase WRAP. The learner wrote this summary of the lesson: ${q(state.summaryText ?? '')} ` +
        `Check it for errors briefly: name any incorrect or missing key idea. Do not ask a question. ≤${maxWords} words.`;
      break;
    }
  }

  const control: TutorControl = { phase: state.phase, conceptId, hintLevel: state.hintLevel, objectiveIds, maxWords, instruction };
  if (allowHintContent !== undefined) control.allowHintContent = allowHintContent;
  return control;
}

function strictControl(control: TutorControl, n: number): TutorControl {
  return {
    ...control,
    instruction:
      `STRICT REGENERATION ${n} of ${MAX_LEAK_REGENERATIONS}: your previous reply leaked the reference answer. ` +
      'Do not include any part of the answer, its key terms, or its final result; ask only the question. ' +
      control.instruction,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function currentConcept(state: LessonState, lesson: Lesson): Concept | undefined {
  const id = state.conceptIds[state.conceptIndex];
  return id === undefined ? undefined : lesson.concepts.find((c) => c.id === id);
}

function mergeTags(s: LessonState, conceptId: string, tags: readonly string[]): void {
  if (tags.length === 0) return;
  const existing = s.misconceptions[conceptId] ?? [];
  const merged = [...tags.filter((t) => !existing.includes(t)).reverse(), ...existing];
  s.misconceptions[conceptId] = merged.slice(0, 10);
}

function lastLearnerTurn(s: LessonState): string {
  for (let i = s.transcript.length - 1; i >= 0; i--) {
    const t = s.transcript[i];
    if (t && t.role === 'learner') return t.content;
  }
  return '';
}

function tutorEffect(s: LessonState, lesson: Lesson, opts: ControlOptions = {}): LessonEffect {
  const control = buildTutorControl(s, lesson, opts);
  s.lastControl = control;
  s.regenerations = 0;
  return { type: 'call_tutor', control };
}

function resetPhaseCounters(s: LessonState): void {
  s.hintLevel = 0;
  s.attemptsThisPhase = 0;
  s.turnsThisPhase = 0;
}

function completeLesson(s: LessonState, effects: LessonEffect[]): void {
  s.phase = 'DONE';
  s.done = true;
  s.jolPending = false;
  s.activeItem = undefined;
  s.lastControl = null;
  const results: LessonResults = {
    checkResults: s.checkResults,
    pretestRecord: s.pretestRecord,
    misconceptions: s.misconceptions,
  };
  if (s.summaryText !== undefined) results.summaryText = s.summaryText;
  if (s.jol !== undefined) results.jol = s.jol;
  effects.push({ type: 'lesson_complete', results });
}

function enterPhase(s: LessonState, lesson: Lesson, phase: LessonPhase, effects: LessonEffect[], preamble?: string): void {
  const concept = currentConcept(s, lesson);
  s.phase = phase;
  resetPhaseCounters(s);
  s.activeItem = undefined;
  const opts: ControlOptions = preamble ? { preamble } : {};
  switch (phase) {
    case 'PRIME':
      effects.push(tutorEffect(s, lesson, { ...opts, kind: 'prime' }));
      return;
    case 'PROBE':
      effects.push(tutorEffect(s, lesson, { ...opts, kind: 'probe' }));
      return;
    case 'DEVELOP': {
      s.guidingIndex = 0;
      if (s.scaffolding === 'novice' && !s.workedExampleShown) {
        effects.push(tutorEffect(s, lesson, { ...opts, kind: 'worked_example' }));
        s.workedExampleShown = true;
      } else {
        effects.push(tutorEffect(s, lesson, { ...opts, kind: 'develop' }));
      }
      return;
    }
    case 'CONSOLIDATE':
      s.consolidateLoops = 0;
      effects.push(tutorEffect(s, lesson, { ...opts, kind: 'consolidate' }));
      return;
    case 'EXTEND':
      if (concept) s.activeItem = { itemId: scriptItemId(concept.id, 'transfer'), kind: 'transfer', assisted: true };
      effects.push(tutorEffect(s, lesson, { ...opts, kind: 'extend' }));
      return;
    case 'CHECK':
      if (concept) s.activeItem = { itemId: scriptItemId(concept.id, 'check'), kind: 'check', assisted: false };
      effects.push(tutorEffect(s, lesson, { ...opts, kind: 'check' }));
      return;
    case 'REMEDIATE':
      effects.push(tutorEffect(s, lesson, { ...opts, kind: 'remediate' }));
      return;
    case 'WRAP':
      s.lastControl = null;
      effects.push({ type: 'request_summary' });
      return;
    case 'DONE':
      completeLesson(s, effects);
      return;
  }
}

/** Advance to the next phase in the per-concept plan after `from`. */
function nextPhase(s: LessonState, lesson: Lesson, from: LessonPhase, effects: LessonEffect[], preamble?: string): void {
  const idx = s.phasePlan.indexOf(from);
  const next = s.phasePlan[idx + 1];
  if (next === undefined) {
    // Plan exhausted without reaching CHECK (cannot happen with a valid plan); be defensive.
    finishConcept(s, lesson, effects);
    return;
  }
  enterPhase(s, lesson, next, effects, preamble);
}

function enterConcept(s: LessonState, lesson: Lesson, effects: LessonEffect[]): void {
  s.workedExampleShown = false;
  s.guidingIndex = 0;
  s.consolidateLoops = 0;
  s.activeItem = undefined;
  enterPhase(s, lesson, s.phasePlan[0] as LessonPhase, effects);
}

function finishConcept(s: LessonState, lesson: Lesson, effects: LessonEffect[]): void {
  s.conceptIndex += 1;
  s.activeItem = undefined;
  if (s.conceptIndex < s.conceptIds.length) {
    enterConcept(s, lesson, effects);
  } else if (s.wrap) {
    enterPhase(s, lesson, 'WRAP', effects);
  } else {
    completeLesson(s, effects);
  }
}

function failCheck(s: LessonState, lesson: Lesson, conceptId: string, rating: Rating, effects: LessonEffect[]): void {
  const count = s.remediationCount[conceptId] ?? 0;
  if (count < MAX_REMEDIATIONS_PER_CONCEPT) {
    s.remediationCount[conceptId] = count + 1;
    enterPhase(s, lesson, 'REMEDIATE', effects);
  } else {
    effects.push({ type: 'activate_items', conceptId, firstRating: rating });
    effects.push({ type: 'schedule_remediation', conceptId });
    finishConcept(s, lesson, effects);
  }
}

function gradeEffect(s: LessonState, pending: PendingGrade, rubricSource: RubricSource): LessonEffect {
  s.pendingGrades[pending.itemId] = pending;
  const eff: LessonEffect = {
    type: 'grade_item',
    itemKind: pending.kind,
    itemId: pending.itemId,
    conceptId: pending.conceptId,
    answer: pending.answer,
    assisted: pending.assisted,
    rubricSource,
  };
  if (pending.confidence !== undefined) eff.confidence = pending.confidence;
  return eff;
}

function receiptEffect(pending: PendingGrade, rating: Rating, grade?: GradeResult): LessonEffect {
  const eff: LessonEffect = {
    type: 'record_receipt',
    itemKind: pending.kind,
    itemId: pending.itemId,
    conceptId: pending.conceptId,
    answer: pending.answer,
    rating,
    assisted: pending.assisted,
  };
  if (pending.confidence !== undefined) eff.confidence = pending.confidence;
  if (grade) eff.grade = grade;
  return eff;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reduceLesson(state: LessonState, event: LessonEvent, lesson: Lesson): LessonStep {
  if (state.done) return { state, effects: [] };
  const s: LessonState = structuredClone(state);
  const effects: LessonEffect[] = [];

  switch (event.type) {
    case 'start':
      return onStart(s, lesson, effects);
    case 'tutor_turn':
      return onTutorTurn(s, event.content, effects);
    case 'learner_turn':
      return onLearnerTurn(s, lesson, event.content, event.confidence, effects);
    case 'observer':
      return onObserver(s, lesson, event.result, effects);
    case 'grade':
      return onGrade(s, lesson, event, effects);
    case 'give_up':
      return onGiveUp(s, lesson, effects);
    case 'summary_submitted':
      return onSummary(s, lesson, event.text, effects);
    case 'jol_submitted':
      return onJol(s, event.predictions, effects);
    case 'leak_detected':
      return onLeak(s, lesson, effects);
  }
}

function onStart(s: LessonState, lesson: Lesson, effects: LessonEffect[]): LessonStep {
  if (s.started) return { state: s, effects: [] };
  s.started = true;
  if (s.conceptIds.length === 0) {
    completeLesson(s, effects);
    return { state: s, effects };
  }
  enterConcept(s, lesson, effects);
  return { state: s, effects };
}

function onTutorTurn(s: LessonState, content: string, effects: LessonEffect[]): LessonStep {
  const entry: TranscriptEntry = { role: 'tutor', content, phase: s.phase, hintLevel: s.hintLevel };
  const conceptId = s.conceptIds[s.conceptIndex];
  if (conceptId !== undefined) entry.conceptId = conceptId;
  s.transcript.push(entry);
  s.regenerations = 0;
  return { state: s, effects };
}

function onLearnerTurn(
  s: LessonState,
  lesson: Lesson,
  content: string,
  confidence: Confidence | undefined,
  effects: LessonEffect[],
): LessonStep {
  const concept = currentConcept(s, lesson);
  if (!concept || !s.started) return { state: s, effects: [] };
  const phase = s.phase;
  if (phase === 'WRAP' || phase === 'DONE') return { state: s, effects: [] };

  s.transcript.push({ role: 'learner', content, phase, conceptId: concept.id, hintLevel: s.hintLevel });
  s.turnsThisPhase += 1;

  switch (phase) {
    case 'PRIME': {
      const conf: Confidence = confidence ?? 1;
      s.pretestRecord[concept.id] = { answer: content, confidence: conf };
      const pending: PendingGrade = {
        itemId: scriptItemId(concept.id, 'pretest'),
        kind: 'pretest',
        conceptId: concept.id,
        answer: content,
        confidence: conf,
        assisted: false,
      };
      s.activeItem = { itemId: pending.itemId, kind: 'pretest', assisted: false };
      effects.push(gradeEffect(s, pending, 'script.pretest'));
      // No correctness feedback after the pretest (errorful generation): move on regardless of the grade.
      effects.push({ type: 'show_message', text: LETS_FIND_OUT });
      nextPhase(s, lesson, 'PRIME', effects);
      return { state: s, effects };
    }
    case 'PROBE':
    case 'DEVELOP':
    case 'EXTEND':
    case 'REMEDIATE': {
      effects.push({ type: 'call_observer', learnerTurn: content, conceptId: concept.id, objectiveIds: concept.objectives.map((o) => o.id) });
      return { state: s, effects };
    }
    case 'CONSOLIDATE': {
      const target = consolidateItem(concept);
      const pending: PendingGrade = { itemId: target.itemId, kind: 'consolidate', conceptId: concept.id, answer: content, assisted: true };
      if (confidence !== undefined) pending.confidence = confidence;
      s.activeItem = { itemId: target.itemId, kind: 'consolidate', assisted: true };
      effects.push(gradeEffect(s, pending, target.rubricSource));
      return { state: s, effects };
    }
    case 'CHECK': {
      const itemId = scriptItemId(concept.id, 'check');
      const pending: PendingGrade = { itemId, kind: 'check', conceptId: concept.id, answer: content, confidence: confidence ?? 1, assisted: false };
      s.activeItem = { itemId, kind: 'check', assisted: false };
      // Tutor stays silent: no call_tutor until graded.
      effects.push(gradeEffect(s, pending, 'script.pretest'));
      return { state: s, effects };
    }
  }
}

function onObserver(s: LessonState, lesson: Lesson, r: ObserverResult, effects: LessonEffect[]): LessonStep {
  const concept = currentConcept(s, lesson);
  if (!concept) return { state: s, effects: [] };
  const phase = s.phase;
  if (phase !== 'PROBE' && phase !== 'DEVELOP' && phase !== 'EXTEND' && phase !== 'REMEDIATE') return { state: s, effects: [] };
  mergeTags(s, concept.id, r.misconceptionTags);

  switch (phase) {
    case 'PROBE': {
      if (r.priorKnowledgeElicited || s.turnsThisPhase >= MAX_PROBE_TURNS) {
        nextPhase(s, lesson, 'PROBE', effects);
      } else {
        effects.push(tutorEffect(s, lesson, { kind: 'probe' }));
      }
      return { state: s, effects };
    }
    case 'DEVELOP': {
      if (r.keyIdeaStated) {
        nextPhase(s, lesson, 'DEVELOP', effects);
        return { state: s, effects };
      }
      if (r.attemptMade) {
        s.attemptsThisPhase += 1;
        if (s.hintLevel >= MAX_HINT_LEVEL) {
          // Bottom-out hint has been given and explained (one more attempt): move on.
          nextPhase(s, lesson, 'DEVELOP', effects);
          return { state: s, effects };
        }
        s.guidingIndex = Math.min(s.guidingIndex + 1, Math.max(0, concept.script.guidingQuestions.length - 1));
        const withhold = s.scaffolding === 'advanced' && s.hintLevel === 0 && s.attemptsThisPhase < 2;
        if (!withhold) s.hintLevel = Math.min(MAX_HINT_LEVEL, s.hintLevel + 1);
        effects.push(tutorEffect(s, lesson, { kind: 'develop' }));
        return { state: s, effects };
      }
      // No attempt (question, off-topic, "idk"): re-ask at the same hint level; never advance without an attempt.
      const preamble = r.offTopic
        ? 'The learner went off topic; bring them back briefly.'
        : 'The learner did not make an attempt; briefly encourage one, then re-ask.';
      effects.push(tutorEffect(s, lesson, { kind: 'develop', preamble }));
      return { state: s, effects };
    }
    case 'EXTEND': {
      if (r.attemptMade) {
        s.attemptsThisPhase += 1;
        const pending: PendingGrade = {
          itemId: scriptItemId(concept.id, 'transfer'),
          kind: 'transfer',
          conceptId: concept.id,
          answer: lastLearnerTurn(s),
          assisted: true,
        };
        s.activeItem = { itemId: pending.itemId, kind: 'transfer', assisted: true };
        effects.push(gradeEffect(s, pending, 'script.transfer'));
      } else {
        effects.push(tutorEffect(s, lesson, { kind: 'extend', preamble: 'The learner did not make an attempt; briefly encourage one, then re-pose the question.' }));
      }
      return { state: s, effects };
    }
    case 'REMEDIATE': {
      if (r.attemptMade) s.attemptsThisPhase += 1;
      if (r.keyIdeaStated || s.attemptsThisPhase >= MAX_REMEDIATE_ATTEMPTS) {
        enterPhase(s, lesson, 'CHECK', effects, "Say briefly that you'll check again, then:");
      } else {
        effects.push(tutorEffect(s, lesson, { kind: 'remediate' }));
      }
      return { state: s, effects };
    }
  }
}

function onGrade(
  s: LessonState,
  lesson: Lesson,
  ev: { itemKind: LessonItemKind; itemId: string; grade: GradeResult; rating: Rating },
  effects: LessonEffect[],
): LessonStep {
  const pending = s.pendingGrades[ev.itemId];
  if (!pending || pending.kind !== ev.itemKind) return { state: s, effects: [] };
  delete s.pendingGrades[ev.itemId];
  mergeTags(s, pending.conceptId, ev.grade.misconceptionTags);

  if (pending.kind === 'pretest') {
    // Recorded whenever it arrives; the lesson has already moved on.
    effects.push(receiptEffect(pending, ev.rating, ev.grade));
    return { state: s, effects };
  }

  const concept = currentConcept(s, lesson);
  if (!concept || concept.id !== pending.conceptId) return { state: s, effects: [] };

  switch (pending.kind) {
    case 'consolidate': {
      if (s.phase !== 'CONSOLIDATE') return { state: s, effects: [] };
      effects.push(receiptEffect(pending, ev.rating, ev.grade));
      if (ev.grade.score >= CONSOLIDATE_PASS_SCORE || s.consolidateLoops >= MAX_CONSOLIDATE_LOOPS) {
        s.activeItem = undefined;
        nextPhase(s, lesson, 'CONSOLIDATE', effects, "Briefly affirm the learner's statement of the principle (one sentence), then:");
      } else {
        s.consolidateLoops += 1;
        effects.push(
          tutorEffect(s, lesson, {
            kind: 'consolidate',
            preamble: `The learner's statement was graded and fell short. Grader feedback: ${ev.grade.feedback} Give brief criterion-level corrective feedback in your own words without stating the full principle, then:`,
          }),
        );
      }
      return { state: s, effects };
    }
    case 'transfer': {
      if (s.phase !== 'EXTEND') return { state: s, effects: [] };
      effects.push(receiptEffect(pending, ev.rating, ev.grade));
      s.activeItem = undefined;
      nextPhase(
        s,
        lesson,
        'EXTEND',
        effects,
        `Give brief feedback on the learner's transfer attempt based on this grader feedback, without stating the reference answer: ${ev.grade.feedback} Then:`,
      );
      return { state: s, effects };
    }
    case 'check': {
      if (s.phase !== 'CHECK') return { state: s, effects: [] };
      s.checkResults[concept.id] = { rating: ev.rating, score: ev.grade.score };
      effects.push(receiptEffect(pending, ev.rating, ev.grade));
      effects.push({ type: 'show_message', text: ev.grade.feedback });
      s.activeItem = undefined;
      if (ev.rating >= CHECK_PASS_RATING) {
        effects.push({ type: 'activate_items', conceptId: concept.id, firstRating: ev.rating });
        finishConcept(s, lesson, effects);
      } else {
        failCheck(s, lesson, concept.id, ev.rating, effects);
      }
      return { state: s, effects };
    }
    case 'pretest':
      return { state: s, effects };
  }
}

function onGiveUp(s: LessonState, lesson: Lesson, effects: LessonEffect[]): LessonStep {
  const concept = currentConcept(s, lesson);
  if (!concept || !s.started) return { state: s, effects: [] };
  switch (s.phase) {
    case 'PRIME':
      // An explicit "I don't know" counts as the pretest attempt.
      return onLearnerTurn(s, lesson, "I don't know.", 1, effects);
    case 'PROBE':
      nextPhase(s, lesson, 'PROBE', effects);
      return { state: s, effects };
    case 'DEVELOP':
      // Reveal nothing; move to CONSOLIDATE.
      nextPhase(s, lesson, 'DEVELOP', effects, 'The learner gave up on the guided questions. Do not reveal the answer.');
      return { state: s, effects };
    case 'EXTEND': {
      const pending: PendingGrade = { itemId: scriptItemId(concept.id, 'transfer'), kind: 'transfer', conceptId: concept.id, answer: '', assisted: true };
      delete s.pendingGrades[pending.itemId];
      effects.push(receiptEffect(pending, 1));
      s.activeItem = undefined;
      nextPhase(s, lesson, 'EXTEND', effects, 'The learner skipped the transfer question. Do not reveal its answer.');
      return { state: s, effects };
    }
    case 'CHECK': {
      const itemId = scriptItemId(concept.id, 'check');
      delete s.pendingGrades[itemId];
      s.checkResults[concept.id] = { rating: 1, score: 0 };
      effects.push(receiptEffect({ itemId, kind: 'check', conceptId: concept.id, answer: '', confidence: 1, assisted: false }, 1));
      s.activeItem = undefined;
      failCheck(s, lesson, concept.id, 1, effects);
      return { state: s, effects };
    }
    case 'REMEDIATE':
      enterPhase(s, lesson, 'CHECK', effects, 'The learner asked to stop the remediation. Do not reveal the answer. Then:');
      return { state: s, effects };
    case 'CONSOLIDATE':
    case 'WRAP':
    case 'DONE':
      return { state: s, effects: [] };
  }
}

function onSummary(s: LessonState, lesson: Lesson, text: string, effects: LessonEffect[]): LessonStep {
  if (s.phase !== 'WRAP' || s.jolPending) return { state: s, effects: [] };
  s.summaryText = text;
  s.transcript.push({ role: 'learner', content: text, phase: 'WRAP' });
  s.jolPending = true;
  effects.push(tutorEffect(s, lesson, { kind: 'summary_check' }));
  effects.push({ type: 'request_jol', conceptIds: [...s.conceptIds] });
  return { state: s, effects };
}

function onJol(s: LessonState, predictions: Record<string, number>, effects: LessonEffect[]): LessonStep {
  if (s.phase !== 'WRAP' || !s.jolPending) return { state: s, effects: [] };
  const jol: Record<string, number> = {};
  for (const id of s.conceptIds) {
    const p = predictions[id];
    if (typeof p === 'number' && Number.isFinite(p)) jol[id] = Math.max(0, Math.min(1, p));
  }
  s.jol = jol;
  completeLesson(s, effects);
  return { state: s, effects };
}

function onLeak(s: LessonState, lesson: Lesson, effects: LessonEffect[]): LessonStep {
  const control = s.lastControl;
  if (!control) return { state: s, effects: [] };
  s.regenerations += 1;
  if (s.regenerations >= MAX_LEAK_REGENERATIONS) {
    s.regenerations = 0;
    const concept = currentConcept(s, lesson);
    const hints = concept?.script.hints;
    const canned = hints ? (s.hintLevel > 0 ? (hints[s.hintLevel - 1] ?? hints[0]) : hints[0]) : '';
    effects.push({ type: 'show_message', text: canned });
    return { state: s, effects };
  }
  effects.push({ type: 'call_tutor', control: strictControl(control, s.regenerations) });
  return { state: s, effects };
}
