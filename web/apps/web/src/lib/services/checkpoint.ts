/**
 * Checkpoint runner (DESIGN §3.5): unaided, blind-graded, no tutor.
 *   present_item        → the screen shows the item prompt
 *   grade_item          → grade() with the item rubric → dispatch grade
 *   record_receipt      → receipts + concept state
 *   checkpoint_complete → passed concepts get a review with the derived rating; failing concepts are
 *                         rescheduled with Again and queued for a remediation mini-lesson
 */
import {
  composeCheckpoint,
  createCheckpointState,
  mulberry32,
  reduceCheckpoint,
  type CheckpointEffect,
  type CheckpointEvent,
  type CheckpointResult,
  type CheckpointState,
  type Confidence,
  type Item,
  type Unit,
} from '@epistemics/core';
import { createSession, endSession, getCardByItem, getState, listConceptStates, listSessions, saveState } from '@epistemics/db';
import { createStore, type Store } from '../store.js';
import { addPendingRemediation } from '../settings.js';
import type { CourseContext } from './context.js';
import { findItem, findUnit } from './courses.js';
import { gradeAnswer, resolveGradeTarget, type Graded } from './grading.js';
import { applyReview, rescheduleConceptAgain } from './queue.js';
import { recordReceipt } from './receipts.js';
import { syncEvents } from '../sync-events.js';

export interface CheckpointView {
  sessionId: string;
  unit: Unit;
  state: CheckpointState;
  item?: Item;
  index: number;
  total: number;
  busy: boolean;
  lastGrade?: Graded;
  result?: CheckpointResult;
  error?: string;
}

const runners = new Map<string, CheckpointRunner>();

export class CheckpointRunner {
  readonly store: Store<CheckpointView>;
  private queue: CheckpointEvent[] = [];
  private pumping = false;
  private pendingEffect: CheckpointEffect | null = null;
  private result: CheckpointResult | undefined;

  private constructor(private readonly ctx: CourseContext, readonly unit: Unit, readonly sessionId: string, private state: CheckpointState) {
    this.store = createStore(this.view(false));
  }

  static async open(ctx: CourseContext, unitId: string): Promise<CheckpointRunner> {
    const key = `${ctx.course.id}:${unitId}`;
    const existing = runners.get(key);
    if (existing && !existing.state.done) return existing;
    const unit = findUnit(ctx.curriculum, unitId);
    if (!unit) throw new Error(`Unit not found: ${unitId}`);

    const open = (await listSessions(ctx.db, ctx.course.id, { type: 'checkpoint' })).find((s) => s.endedAt === undefined && s.unitId === unitId);
    let sessionId: string;
    let state: CheckpointState | undefined;
    if (open) {
      sessionId = open.id;
      const saved = await getState<CheckpointState>(ctx.db, open.id);
      if (saved && saved.unitId === unitId && !saved.done) state = saved;
    } else {
      sessionId = (await createSession(ctx.db, { courseId: ctx.course.id, type: 'checkpoint', unitId }, ctx.now())).id;
    }
    if (!state) {
      const mastery = new Map((await listConceptStates(ctx.db, ctx.course.id)).map((s) => [s.conceptId, s.mastery]));
      const previousUnits = ctx.curriculum.units.filter((u) => u.ordinal < unit.ordinal);
      const items = composeCheckpoint({ unit, previousUnits, conceptMastery: mastery, rng: mulberry32(ctx.now() % 2_147_483_647) });
      state = createCheckpointState({ sessionId, courseId: ctx.course.id, unitId, items });
    }
    const runner = new CheckpointRunner(ctx, unit, sessionId, state);
    runners.set(key, runner);
    return runner;
  }

  async start(): Promise<void> {
    if (!this.state.started) await this.dispatch({ type: 'start' });
  }

  submit(answer: string, confidence: Confidence): Promise<void> {
    const cur = this.state.items[this.state.index];
    if (!cur) return Promise.resolve();
    return this.dispatch({ type: 'answer_submitted', itemId: cur.itemId, answer: answer.trim() || '(no answer)', confidence });
  }

  finishEarly(): Promise<void> {
    return this.dispatch({ type: 'finish' });
  }

  async retry(): Promise<void> {
    const eff = this.pendingEffect;
    if (!eff) return;
    this.pendingEffect = null;
    this.store.set((v) => ({ ...v, error: undefined }));
    await this.run(eff);
    await this.pump();
  }

  private async dispatch(ev: CheckpointEvent): Promise<void> {
    this.queue.push(ev);
    await this.pump();
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    this.store.set((v) => ({ ...v, busy: true }));
    try {
      while (this.queue.length > 0) {
        const ev = this.queue.shift()!;
        const step = reduceCheckpoint(this.state, ev);
        this.state = step.state;
        if (!this.state.done) await saveState(this.ctx.db, this.sessionId, this.state);
        this.store.set((v) => ({ ...this.view(true), lastGrade: v.lastGrade, error: v.error }));
        for (const eff of step.effects) if (!(await this.run(eff))) break;
      }
    } finally {
      this.pumping = false;
      this.store.set((v) => ({ ...this.view(false), lastGrade: v.lastGrade, error: v.error }));
    }
  }

  private async run(eff: CheckpointEffect): Promise<boolean> {
    try {
      switch (eff.type) {
        case 'present_item':
          this.store.set((v) => ({ ...v, lastGrade: undefined }));
          return true;
        case 'grade_item': {
          const target = resolveGradeTarget(this.ctx.curriculum, eff.itemId, 'item');
          const graded = await gradeAnswer(this.ctx.provider, target, eff.answer, { confidence: eff.confidence, metadata: { sessionId: this.sessionId, courseId: this.ctx.course.id } });
          this.store.set((v) => ({ ...v, lastGrade: graded }));
          this.queue.push({ type: 'grade', itemId: eff.itemId, grade: graded.grade, rating: graded.rating });
          return true;
        }
        case 'record_receipt': {
          await recordReceipt(this.ctx, { sessionId: this.sessionId, itemId: eff.itemId, conceptId: eff.conceptId, answer: eff.answer, confidence: eff.confidence, grade: eff.grade, rating: eff.rating, assisted: false });
          // The checkpoint answer is a real unaided retrieval of the item: log it as a review.
          const card = await getCardByItem(this.ctx.db, this.ctx.course.id, eff.itemId);
          if (card && card.state !== 0) await applyReview(this.ctx, { card, rating: eff.rating, source: 'checkpoint', assisted: false, confidence: eff.confidence, noImplicitCredit: eff.rating < 3 });
          return true;
        }
        case 'checkpoint_complete': {
          const result: CheckpointResult = { perConcept: eff.perConcept, reopen: eff.reopen };
          this.result = result;
          for (const conceptId of result.reopen) {
            await rescheduleConceptAgain(this.ctx, conceptId);
            await addPendingRemediation(this.ctx.db, this.ctx.course.id, conceptId);
          }
          await endSession(this.ctx.db, this.sessionId, { unitId: this.unit.id, ...result }, this.ctx.now());
          syncEvents.emit('activity');
          return true;
        }
      }
    } catch (e) {
      this.pendingEffect = eff;
      this.store.set((v) => ({ ...v, error: e instanceof Error ? e.message : String(e), busy: false }));
      return false;
    }
  }

  private view(busy: boolean): CheckpointView {
    const cur = this.state.items[this.state.index];
    const item = cur ? findItem(this.ctx.curriculum, cur.itemId)?.item : undefined;
    return { sessionId: this.sessionId, unit: this.unit, state: this.state, item, index: this.state.index, total: this.state.items.length, busy, result: this.result };
  }
}
