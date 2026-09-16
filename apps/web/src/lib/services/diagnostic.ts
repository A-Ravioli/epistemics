/**
 * Diagnostic placement (DESIGN §6.4): adaptive probes over the prerequisite DAG. Known concepts are
 * activated and seeded with a conservative provisional memory state; their concept state gets three
 * successful sessions so mastery-based gating treats them as prerequisites met, pending real reviews.
 */
import {
  createDiagnostic,
  diagnosticResult,
  nextProbe,
  recordResult,
  type Confidence,
  type DiagnosticProbe,
  type DiagnosticState,
  type Item,
} from '@epistemics/core';
import { activateCards, createSession, emptyConceptState, endSession, getCards, getConceptState, saveCards, studyDay as _unused, upsertConceptState } from '@epistemics/db';
import { studyDay } from '@epistemics/core';
import { createStore, type Store } from '../store.js';
import { setDiagnosticDone } from '../settings.js';
import { dayCfg, type CourseContext } from './context.js';
import { findItem } from './courses.js';
import { gradeAnswer, resolveGradeTarget, type Graded } from './grading.js';
import { recomputeMastery } from './receipts.js';
import { recordReceipt } from './receipts.js';

void _unused;

export interface DiagnosticView {
  state: DiagnosticState;
  probe: DiagnosticProbe | null;
  item?: Item;
  busy: boolean;
  lastGrade?: Graded;
  done: boolean;
  knownConceptIds?: string[];
  error?: string;
}

export class DiagnosticRunner {
  readonly store: Store<DiagnosticView>;
  private state: DiagnosticState;
  private sessionId: string | undefined;

  constructor(private readonly ctx: CourseContext) {
    this.state = createDiagnostic(ctx.curriculum);
    this.store = createStore(this.view(false));
  }

  get total(): number {
    return Object.keys(this.state.probeItem).length;
  }

  async submit(answer: string, confidence: Confidence): Promise<void> {
    const probe = nextProbe(this.state);
    if (!probe) return;
    this.store.set((v) => ({ ...v, busy: true, error: undefined }));
    try {
      this.sessionId ??= (await createSession(this.ctx.db, { courseId: this.ctx.course.id, type: 'diagnostic' }, this.ctx.now())).id;
      const target = resolveGradeTarget(this.ctx.curriculum, probe.itemId, 'item');
      const graded = await gradeAnswer(this.ctx.provider, target, answer.trim() || '(no answer)', { confidence, metadata: { sessionId: this.sessionId, courseId: this.ctx.course.id } });
      await recordReceipt(this.ctx, { sessionId: this.sessionId, itemId: probe.itemId, conceptId: probe.conceptId, answer, confidence, grade: graded.grade, rating: graded.rating, assisted: false });
      this.state = recordResult(this.state, probe.conceptId, graded.rating >= 3);
      this.store.set((v) => ({ ...this.view(false), lastGrade: graded }));
      if (nextProbe(this.state) === null) await this.finish();
    } catch (e) {
      this.store.set((v) => ({ ...v, busy: false, error: e instanceof Error ? e.message : String(e) }));
    }
  }

  /** Skip the diagnostic: nothing seeded. */
  async skip(): Promise<void> {
    await setDiagnosticDone(this.ctx.db, this.ctx.course.id);
    this.store.set((v) => ({ ...v, done: true, knownConceptIds: [] }));
  }

  private async finish(): Promise<void> {
    const now = this.ctx.now();
    const result = diagnosticResult(this.state);
    const all = await getCards(this.ctx.db, this.ctx.course.id);
    for (const conceptId of result.knownConceptIds) {
      await activateCards(this.ctx.db, this.ctx.course.id, conceptId, now);
      const mine = all.filter((c) => c.conceptId === conceptId && c.state === 0);
      const seeded = mine.map((c) => this.ctx.scheduler.seedKnownCard({ ...c, due: now }, now));
      await saveCards(this.ctx.db, seeded, now);
      const prev = (await getConceptState(this.ctx.db, this.ctx.course.id, conceptId)) ?? emptyConceptState(this.ctx.course.id, conceptId, now);
      const next = { ...prev, successfulSessions: Math.max(prev.successfulSessions, 3), lastSuccessDay: studyDay(now, dayCfg(this.ctx)) };
      await upsertConceptState(this.ctx.db, next);
      await recomputeMastery(this.ctx, next);
    }
    if (this.sessionId) await endSession(this.ctx.db, this.sessionId, { knownConceptIds: result.knownConceptIds, frontierDepth: result.frontierDepth, probes: result.probes }, now);
    await setDiagnosticDone(this.ctx.db, this.ctx.course.id);
    this.store.set((v) => ({ ...v, busy: false, done: true, knownConceptIds: result.knownConceptIds }));
  }

  private view(busy: boolean): DiagnosticView {
    const probe = nextProbe(this.state);
    const item = probe ? findItem(this.ctx.curriculum, probe.itemId)?.item : undefined;
    return { state: this.state, probe, item, busy, done: this.state.done && probe === null && this.state.probes > 0 ? false : false };
  }
}
