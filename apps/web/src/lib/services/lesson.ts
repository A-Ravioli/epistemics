/**
 * LessonRunner: owns a LessonState, runs the pure reducer, executes its effects against the LLM layer
 * and the database, and persists the state after every reduce so a reload resumes.
 *
 *   call_tutor           → provider.stream(buildTutorRequest(...)); leak detector + turn-shape check on the
 *                          finished text; dispatch leak_detected on a leak, regenerate once on a bad shape,
 *                          else dispatch tutor_turn
 *   call_observer        → observe() → dispatch observer
 *   grade_item           → grade() with the item rubric or the script reference → dispatch grade
 *   record_receipt       → receipts repo + concept state fold
 *   activate_items       → activateCards + first review (CHECK result) + implicit credit
 *   show_message         → a system note in the chat
 *   request_summary/jol  → the WRAP panel (derived from state)
 *   schedule_remediation → pending remediation list in settings
 *   lesson_complete      → end session, save JOLs and turns
 */
import {
  brierScore,
  composeRemediation,
  createLessonState,
  currentConcept,
  reduceLesson,
  renderLearnerModel,
  summarizeLearnerModel,
  uuidv7,
  type CalibrationPair,
  type Concept,
  type Confidence,
  type Lesson,
  type LessonEffect,
  type LessonEvent,
  type LessonPhase,
  type LessonState,
  type Turn,
} from '@epistemics/core';
import {
  createSession,
  endSession,
  getConceptState,
  getReceipts,
  getState,
  listConceptStates,
  listSessions,
  saveJol,
  saveState,
  saveTurns,
} from '@epistemics/db';
import { budgetGuard, buildCurriculumContext, buildTutorRequest, checkTurnShape, detectLeak, modelForRole, observe, type ChatMessage, type LeakReference } from '@epistemics/llm';
import { createStore, type Store } from '../store.js';
import { addPendingRemediation, removePendingRemediation } from '../settings.js';
import type { CourseContext } from './context.js';
import { findConcept, findLesson } from './courses.js';
import { gradeAnswer, resolveGradeTarget, type Graded } from './grading.js';
import { activateConcept, grantImplicitCredit } from './queue.js';
import { recordReceipt } from './receipts.js';
import { syncEvents } from '../sync-events.js';

export const REMEDIATION_PREFIX = 'remediation:';

export interface LessonNote {
  /** Position in the transcript after which the note appears. */
  at: number;
  text: string;
}

export interface PersistedLesson {
  version: 1;
  state: LessonState;
  notes: LessonNote[];
}

export type LessonBusy = 'tutor' | 'observer' | 'grading' | 'saving' | null;
export type LessonInputMode = 'answer' | 'answer_confidence' | 'summary' | 'jol' | 'done';

export interface LessonMessage {
  key: string;
  role: 'tutor' | 'learner' | 'system';
  content: string;
  phase?: LessonPhase;
  streaming?: boolean;
}

export interface LessonView {
  sessionId: string;
  lesson: Lesson;
  state: LessonState;
  concept?: Concept;
  messages: LessonMessage[];
  streaming: string | null;
  busy: LessonBusy;
  inputMode: LessonInputMode;
  /** Most recent grade for the learner's answer (CONSOLIDATE / EXTEND / CHECK). */
  lastGrade?: { kind: string; graded: Graded };
  error?: string;
  isRemediation: boolean;
}

function transcriptToChat(state: LessonState): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const t of state.transcript) {
    if (t.role === 'learner') out.push({ role: 'user', content: t.content });
    else if (t.role === 'tutor') out.push({ role: 'assistant', content: t.content });
  }
  return out;
}

function inputModeFor(state: LessonState): LessonInputMode {
  if (state.done) return 'done';
  if (state.phase === 'WRAP') return state.jolPending ? 'jol' : 'summary';
  if (state.phase === 'PRIME' || state.phase === 'CHECK') return 'answer_confidence';
  return 'answer';
}

/** Hidden references the tutor must not reveal in the current phase. */
function leakReferencesFor(concept: Concept | undefined, phase: LessonPhase): LeakReference[] {
  if (!concept) return [];
  const refs: LeakReference[] = [{ answer: concept.script.pretest.reference }];
  if (phase === 'EXTEND') refs.push({ answer: concept.script.transfer.reference });
  return refs;
}

export async function learnerModelText(ctx: CourseContext, focusConceptIds: string[]): Promise<string> {
  const states = await listConceptStates(ctx.db, ctx.course.id);
  const names = new Map<string, string>();
  for (const u of ctx.curriculum.units) for (const l of u.lessons) for (const c of l.concepts) names.set(c.id, c.name);
  const receipts = await getReceipts(ctx.db, ctx.course.id);
  const pairs: CalibrationPair[] = receipts
    .filter((r) => r.confidence !== undefined && !r.assisted)
    .slice(-200)
    .map((r) => ({ confidence: r.confidence as Confidence, correct: r.rating >= 3 }));
  const lastLesson = (await listSessions(ctx.db, ctx.course.id, { type: 'lesson' })).find((s) => s.endedAt !== undefined && typeof s.summary?.['summaryText'] === 'string');
  const summary = summarizeLearnerModel({
    course: ctx.course,
    conceptStates: states,
    conceptNames: names,
    calibration: brierScore(pairs),
    recent: { lastLessonSummary: lastLesson?.summary?.['summaryText'] as string | undefined, openQuestions: [] },
  });
  return renderLearnerModel(summary, focusConceptIds);
}

const runners = new Map<string, LessonRunner>();

export class LessonRunner {
  readonly store: Store<LessonView>;
  readonly lesson: Lesson;
  readonly sessionId: string;
  private state: LessonState;
  private notes: LessonNote[];
  private queue: LessonEvent[] = [];
  private pumping = false;
  private abort: AbortController | null = null;
  private pendingEffect: LessonEffect | null = null;
  private previousTurnNoProgress = false;
  private learnerModel = '';
  private curriculumContext = new Map<string, string>();

  private constructor(private readonly ctx: CourseContext, lesson: Lesson, sessionId: string, persisted: PersistedLesson, private readonly isRemediation: boolean) {
    this.lesson = lesson;
    this.sessionId = sessionId;
    this.state = persisted.state;
    this.notes = persisted.notes;
    this.store = createStore<LessonView>(this.view(null, null));
  }

  /** Open (or resume) the lesson runner for `lessonId`; `remediation:<conceptId>` opens a mini-lesson. */
  static async open(ctx: CourseContext, lessonId: string): Promise<LessonRunner> {
    const key = `${ctx.course.id}:${lessonId}`;
    const existing = runners.get(key);
    if (existing && !existing.state.done) return existing;

    let lesson: Lesson;
    let unitId: string | undefined;
    let fresh: LessonState;
    const isRemediation = lessonId.startsWith(REMEDIATION_PREFIX);
    const misconceptions: Record<string, string[]> = {};

    if (isRemediation) {
      const conceptId = lessonId.slice(REMEDIATION_PREFIX.length);
      const found = findConcept(ctx.curriculum, conceptId);
      if (!found) throw new Error(`Concept not found: ${conceptId}`);
      unitId = found.unit.id;
      const cs = await getConceptState(ctx.db, ctx.course.id, conceptId);
      const plan = composeRemediation(found.concept, { sessionId: '', courseId: ctx.course.id, scaffolding: ctx.course.scaffolding, learnerMisconceptions: cs?.misconceptions });
      lesson = plan.lesson;
      fresh = plan.state;
    } else {
      const found = findLesson(ctx.curriculum, lessonId);
      if (!found) throw new Error(`Lesson not found: ${lessonId}`);
      lesson = found.lesson;
      unitId = found.unit.id;
      for (const c of lesson.concepts) {
        const cs = await getConceptState(ctx.db, ctx.course.id, c.id);
        if (cs?.misconceptions.length) misconceptions[c.id] = cs.misconceptions;
      }
      fresh = createLessonState({ sessionId: '', courseId: ctx.course.id, lesson, scaffolding: ctx.course.scaffolding, learnerMisconceptions: misconceptions });
    }

    const open = (await listSessions(ctx.db, ctx.course.id, { type: 'lesson' })).find((s) => s.endedAt === undefined && s.lessonId === lessonId);
    let sessionId: string;
    let persisted: PersistedLesson | undefined;
    if (open) {
      sessionId = open.id;
      const saved = await getState<PersistedLesson>(ctx.db, open.id);
      if (saved && saved.version === 1 && saved.state.lessonId === lesson.id) persisted = saved;
    } else {
      sessionId = (await createSession(ctx.db, { courseId: ctx.course.id, type: 'lesson', lessonId, unitId }, ctx.now())).id;
    }
    if (!persisted) persisted = { version: 1, state: { ...fresh, sessionId }, notes: [] };

    const runner = new LessonRunner(ctx, lesson, sessionId, persisted, isRemediation);
    runner.learnerModel = await learnerModelText(ctx, lesson.concepts.map((c) => c.id));
    runners.set(key, runner);
    return runner;
  }

  static forget(courseId: string, lessonId: string): void {
    runners.delete(`${courseId}:${lessonId}`);
  }

  get current(): LessonState {
    return this.state;
  }

  // ---------------------------------------------------------------------------
  // Public actions
  // ---------------------------------------------------------------------------

  /** Start a fresh lesson, or re-issue the last tutor call when resuming mid-turn. */
  async start(): Promise<void> {
    if (!this.state.started) {
      await this.dispatch({ type: 'start' });
      return;
    }
    if (this.state.done || this.pumping) return;
    const last = this.state.transcript[this.state.transcript.length - 1];
    const waitingForTutor = this.state.lastControl && (!last || last.role !== 'tutor') && this.state.phase !== 'WRAP';
    const pendingCheck = this.state.activeItem?.kind === 'check' && last?.role === 'learner';
    if (pendingCheck && Object.keys(this.state.pendingGrades).length > 0) {
      // A grade was in flight when the page unloaded: re-grade the last answer.
      const pending = Object.values(this.state.pendingGrades)[0]!;
      await this.run({ type: 'grade_item', itemKind: pending.kind, itemId: pending.itemId, conceptId: pending.conceptId, answer: pending.answer, confidence: pending.confidence, assisted: pending.assisted, rubricSource: pending.kind === 'transfer' ? 'script.transfer' : pending.kind === 'consolidate' ? (pending.itemId.includes('#') ? 'script.pretest' : 'item') : 'script.pretest' });
      await this.pump();
      return;
    }
    if (waitingForTutor && this.state.lastControl) {
      await this.run({ type: 'call_tutor', control: this.state.lastControl });
      await this.pump();
    }
  }

  submit(content: string, confidence?: Confidence): Promise<void> {
    const text = content.trim();
    if (!text) return Promise.resolve();
    this.setError(undefined);
    return this.dispatch({ type: 'learner_turn', content: text, confidence });
  }

  giveUp(): Promise<void> {
    this.setError(undefined);
    return this.dispatch({ type: 'give_up' });
  }

  submitSummary(text: string): Promise<void> {
    return this.dispatch({ type: 'summary_submitted', text: text.trim() });
  }

  submitJol(predictions: Record<string, number>): Promise<void> {
    return this.dispatch({ type: 'jol_submitted', predictions });
  }

  /** Re-run the effect that failed (network error etc.). */
  async retry(): Promise<void> {
    const eff = this.pendingEffect;
    if (!eff) return;
    this.pendingEffect = null;
    this.setError(undefined);
    await this.run(eff);
    await this.pump();
  }

  cancel(): void {
    this.abort?.abort();
  }

  // ---------------------------------------------------------------------------
  // Engine loop
  // ---------------------------------------------------------------------------

  private async dispatch(event: LessonEvent): Promise<void> {
    this.queue.push(event);
    await this.pump();
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length > 0) {
        const ev = this.queue.shift()!;
        const { state, effects } = reduceLesson(this.state, ev, this.lesson);
        this.state = state;
        this.publish(null);
        await this.persist();
        for (const eff of effects) {
          const ok = await this.run(eff);
          if (!ok) break;
        }
      }
    } finally {
      this.pumping = false;
      this.publish(null);
    }
  }

  /** Execute one effect. Returns false when it failed and was parked for `retry()`. */
  private async run(eff: LessonEffect): Promise<boolean> {
    try {
      switch (eff.type) {
        case 'call_tutor':
          await this.callTutor(eff.control);
          return true;
        case 'call_observer':
          await this.callObserver(eff.learnerTurn, eff.conceptId);
          return true;
        case 'grade_item': {
          this.publish('grading');
          const target = resolveGradeTarget(this.ctx.curriculum, eff.itemId, eff.rubricSource, eff.itemKind);
          const graded = await gradeAnswer(this.ctx.provider, target, eff.answer, {
            confidence: eff.assisted ? undefined : eff.confidence,
            metadata: { sessionId: this.sessionId, courseId: this.ctx.course.id },
          });
          this.store.set((v) => ({ ...v, lastGrade: { kind: eff.itemKind, graded } }));
          this.queue.push({ type: 'grade', itemKind: eff.itemKind, itemId: eff.itemId, grade: graded.grade, rating: graded.rating });
          return true;
        }
        case 'record_receipt':
          await recordReceipt(this.ctx, {
            sessionId: this.sessionId,
            itemId: eff.itemId,
            conceptId: eff.conceptId,
            answer: eff.answer,
            confidence: eff.confidence,
            grade: eff.grade,
            rating: eff.rating,
            assisted: eff.assisted,
          });
          return true;
        case 'activate_items':
          await activateConcept(this.ctx, eff.conceptId, eff.firstRating);
          if (eff.firstRating >= 3) await grantImplicitCredit(this.ctx, eff.conceptId);
          return true;
        case 'show_message':
          if (eff.text.trim()) {
            this.notes.push({ at: this.state.transcript.length, text: eff.text });
            await this.persist();
            this.publish(null);
          }
          return true;
        case 'request_summary':
        case 'request_jol':
          return true; // derived from state.phase / state.jolPending
        case 'schedule_remediation':
          await addPendingRemediation(this.ctx.db, this.ctx.course.id, eff.conceptId);
          return true;
        case 'lesson_complete':
          await this.complete(eff.results);
          return true;
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return false;
      this.pendingEffect = eff;
      this.setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  private async callTutor(control: NonNullable<LessonState['lastControl']>): Promise<void> {
    const concept = currentConcept(this.state, this.lesson);
    const conceptId = control.conceptId || concept?.id || this.lesson.concepts[0]!.id;
    let context = this.curriculumContext.get(conceptId);
    if (!context) {
      context = buildCurriculumContext(this.lesson, conceptId);
      this.curriculumContext.set(conceptId, context);
    }
    let instruction = control.instruction;
    let text = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      text = await this.streamTutor(context, { ...control, instruction });
      const shape = checkTurnShape(text, control.maxWords);
      if (shape.ok || attempt === 1) break;
      instruction = `REGENERATE: your previous reply had ${shape.questions} questions and ${shape.words} words; ask at most one question in at most ${control.maxWords} words. ${control.instruction}`;
    }
    for (const ref of leakReferencesFor(concept, control.phase)) {
      const verdict = await detectLeak(text, ref, this.ctx.provider);
      if (verdict.leaked) {
        this.store.set((v) => ({ ...v, streaming: null }));
        this.queue.push({ type: 'leak_detected' });
        return;
      }
    }
    this.store.set((v) => ({ ...v, streaming: null }));
    this.queue.push({ type: 'tutor_turn', content: text });
  }

  /** Cost guard (DESIGN §7.3): degrade the tutor before stopping. Returns a model override or undefined. */
  private tutorModel(): string | undefined {
    const { ledger, dailyBudgetUsd, course } = this.ctx;
    if (!ledger || !dailyBudgetUsd) return undefined;
    const verdict = budgetGuard(ledger, dailyBudgetUsd, { role: 'tutor', courseId: course.id, currentModel: modelForRole('tutor') });
    if (!verdict.allowed) throw new Error(`Daily LLM budget reached ($${verdict.spentUsd.toFixed(2)} of $${verdict.budgetUsd.toFixed(2)}). Raise it in Settings or continue tomorrow.`);
    return verdict.degradeToModel;
  }

  private async streamTutor(curriculumContext: string, control: NonNullable<LessonState['lastControl']>): Promise<string> {
    this.abort = new AbortController();
    const model = this.tutorModel();
    const req = buildTutorRequest({
      model,
      curriculumContext,
      learnerModelText: this.learnerModel,
      transcript: transcriptToChat(this.state),
      control: {
        phase: control.phase,
        conceptId: control.conceptId,
        hintLevel: control.hintLevel,
        maxWords: control.maxWords,
        instruction: control.instruction,
        allowHintContent: control.allowHintContent !== undefined,
        objectiveId: control.objectiveIds[0],
      },
      metadata: { sessionId: this.sessionId, courseId: this.ctx.course.id },
      signal: this.abort.signal,
    });
    let text = '';
    this.store.set((v) => ({ ...v, streaming: '', busy: 'tutor' }));
    for await (const ev of this.ctx.provider.stream(req)) {
      if (ev.type === 'delta' && ev.text) {
        text += ev.text;
        const snapshot = text;
        this.store.set((v) => ({ ...v, streaming: snapshot }));
      } else if (ev.type === 'error') {
        throw new Error(ev.error ?? 'Tutor call failed');
      }
    }
    return text.trim();
  }

  private async callObserver(learnerTurn: string, conceptId: string): Promise<void> {
    this.publish('observer');
    const concept = this.lesson.concepts.find((c) => c.id === conceptId);
    if (!concept) return;
    const tutorBefore = [...this.state.transcript].reverse().find((t) => t.role === 'tutor')?.content ?? '';
    const result = await observe(this.ctx.provider, {
      learnerTurn,
      tutorTurnBefore: tutorBefore,
      concept: { name: concept.name, definition: concept.definition, objectives: concept.objectives, misconceptions: concept.misconceptions },
      sourcesLoaded: concept.spans.length > 0,
      previousTurnNoProgress: this.previousTurnNoProgress,
      metadata: { sessionId: this.sessionId, courseId: this.ctx.course.id },
    });
    this.previousTurnNoProgress = !result.attemptMade || result.objectiveProgress.every((o) => o.status === 'none');
    this.queue.push({ type: 'observer', result });
  }

  private async complete(results: import('@epistemics/core').LessonResults): Promise<void> {
    this.publish('saving');
    const now = this.ctx.now();
    const turns: Turn[] = this.state.transcript.map((t, i) => ({
      id: uuidv7(now + i),
      sessionId: this.sessionId,
      ordinal: i,
      role: t.role,
      content: t.content,
      phase: t.phase,
      conceptId: t.conceptId,
      hintLevel: t.hintLevel,
      createdAt: now,
    }));
    await saveTurns(this.ctx.db, turns);
    if (results.jol) {
      for (const [conceptId, p] of Object.entries(results.jol)) {
        await saveJol(this.ctx.db, { id: uuidv7(now), sessionId: this.sessionId, courseId: this.ctx.course.id, conceptId, predictedRecall: p, createdAt: now });
      }
    }
    const summary: Record<string, unknown> = {
      lessonId: this.lesson.id,
      checkResults: results.checkResults,
      misconceptions: results.misconceptions,
      summaryText: results.summaryText,
      jol: results.jol,
      remediation: this.isRemediation,
    };
    await endSession(this.ctx.db, this.sessionId, summary, now);
    if (this.isRemediation) await removePendingRemediation(this.ctx.db, this.ctx.course.id, this.lesson.concepts[0]!.id);
    syncEvents.emit('activity');
  }

  // ---------------------------------------------------------------------------
  // Persistence and view
  // ---------------------------------------------------------------------------

  private async persist(): Promise<void> {
    if (this.state.done) return; // endSession clears stateJson
    const payload: PersistedLesson = { version: 1, state: this.state, notes: this.notes };
    await saveState(this.ctx.db, this.sessionId, payload);
  }

  private setError(error: string | undefined): void {
    this.store.set((v) => ({ ...v, error, busy: null, streaming: null }));
  }

  private publish(busy: LessonBusy): void {
    this.store.set((v) => this.view(busy ?? (this.pumping ? v.busy : null), v.streaming));
  }

  private view(busy: LessonBusy, streaming: string | null): LessonView {
    const messages: LessonMessage[] = [];
    const notesAt = new Map<number, LessonNote[]>();
    for (const n of this.notes) {
      const list = notesAt.get(n.at) ?? [];
      list.push(n);
      notesAt.set(n.at, list);
    }
    const pushNotes = (at: number) => {
      for (const n of notesAt.get(at) ?? []) messages.push({ key: `n${at}-${messages.length}`, role: 'system', content: n.text });
    };
    pushNotes(0);
    this.state.transcript.forEach((t, i) => {
      if (t.role !== 'system') messages.push({ key: `t${i}`, role: t.role, content: t.content, phase: t.phase });
      pushNotes(i + 1);
    });
    if (streaming !== null) messages.push({ key: 'streaming', role: 'tutor', content: streaming, phase: this.state.phase, streaming: true });
    const prev = this.store?.get();
    const view: LessonView = {
      sessionId: this.sessionId,
      lesson: this.lesson,
      state: this.state,
      concept: currentConcept(this.state, this.lesson),
      messages,
      streaming,
      busy: streaming !== null ? 'tutor' : busy,
      inputMode: inputModeFor(this.state),
      isRemediation: this.isRemediation,
    };
    if (prev?.lastGrade) view.lastGrade = prev.lastGrade;
    if (prev?.error) view.error = prev.error;
    return view;
  }
}
