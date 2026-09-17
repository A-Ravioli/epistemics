/**
 * Teach-back runner (DESIGN §3.6).
 *   call_student       → provider.stream(buildStudentRequest(...)) → dispatch student_turn
 *   grade_item         → grade() with the concept's teachback item rubric (or its objectives) → dispatch grade
 *   record_receipt     → receipts + concept state
 *   teachback_complete → a review on the concept's teach-back (or explain) card with the derived rating
 */
import {
  createTeachbackState,
  reduceTeachback,
  type Concept,
  type RubricCriterion,
  type StudentControl,
  type TeachbackEffect,
  type TeachbackEvent,
  type TeachbackState,
} from '@epistemics/core';
import { createSession, endSession, getCardByItem, getCardsForConcept } from '@epistemics/db';
import { buildStudentRequest, type ChatMessage } from '@epistemics/llm';
import { createStore, type Store } from '../store.js';
import type { CourseContext } from './context.js';
import { findConcept } from './courses.js';
import { gradeAnswer, type GradeTarget, type Graded } from './grading.js';
import { applyReview } from './queue.js';
import { recordReceipt } from './receipts.js';

export interface TeachbackView {
  concept: Concept;
  state: TeachbackState;
  streaming: string | null;
  busy: boolean;
  grade?: Graded;
  done: boolean;
  error?: string;
}

export class TeachbackRunner {
  readonly store: Store<TeachbackView>;
  private state: TeachbackState;
  private queue: TeachbackEvent[] = [];
  private pumping = false;
  private streaming: string | null = null;
  private grade: Graded | undefined;
  readonly sessionId: string;

  private constructor(private readonly ctx: CourseContext, readonly concept: Concept, sessionId: string) {
    this.sessionId = sessionId;
    this.state = createTeachbackState({ sessionId, courseId: ctx.course.id, concept });
    this.store = createStore(this.view(false));
  }

  static async open(ctx: CourseContext, conceptId: string): Promise<TeachbackRunner> {
    const found = findConcept(ctx.curriculum, conceptId);
    if (!found) throw new Error(`Concept not found: ${conceptId}`);
    const session = await createSession(ctx.db, { courseId: ctx.course.id, type: 'teachback', lessonId: found.lesson.id, unitId: found.unit.id }, ctx.now());
    return new TeachbackRunner(ctx, found.concept, session.id);
  }

  start(): Promise<void> {
    return this.dispatch({ type: 'start' });
  }

  submit(content: string, done = false): Promise<void> {
    const text = content.trim();
    if (!text) return Promise.resolve();
    return this.dispatch({ type: 'learner_turn', content: text, done });
  }

  end(): Promise<void> {
    return this.dispatch({ type: 'end' });
  }

  private async dispatch(ev: TeachbackEvent): Promise<void> {
    this.queue.push(ev);
    await this.pump();
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    this.publish(true);
    try {
      while (this.queue.length > 0) {
        const ev = this.queue.shift()!;
        const step = reduceTeachback(this.state, ev);
        this.state = step.state;
        this.publish(true);
        for (const eff of step.effects) await this.run(eff);
      }
    } catch (e) {
      this.store.set((v) => ({ ...v, error: e instanceof Error ? e.message : String(e) }));
    } finally {
      this.pumping = false;
      this.publish(false);
    }
  }

  private async run(eff: TeachbackEffect): Promise<void> {
    switch (eff.type) {
      case 'call_student':
        await this.callStudent(eff.control);
        return;
      case 'grade_item': {
        const graded = await gradeAnswer(this.ctx.provider, this.gradeTarget(), eff.answer, { metadata: { sessionId: this.sessionId, courseId: this.ctx.course.id } });
        this.grade = graded;
        this.queue.push({ type: 'grade', grade: graded.grade, rating: graded.rating });
        return;
      }
      case 'record_receipt':
        await recordReceipt(this.ctx, { sessionId: this.sessionId, itemId: eff.itemId, conceptId: eff.conceptId, answer: eff.answer, grade: eff.grade, rating: eff.rating, assisted: false });
        return;
      case 'teachback_complete': {
        let card = await getCardByItem(this.ctx.db, this.ctx.course.id, eff.itemId);
        if (!card || card.state === 0) {
          const cards = await getCardsForConcept(this.ctx.db, this.ctx.course.id, eff.conceptId);
          card = cards.find((c) => c.state !== 0 && !c.suspended);
        }
        if (card) await applyReview(this.ctx, { card, rating: eff.rating, source: 'teachback', assisted: false });
        await endSession(this.ctx.db, this.sessionId, { conceptId: eff.conceptId, score: eff.score, rating: eff.rating, learnerTurns: eff.learnerTurns }, this.ctx.now());
        return;
      }
    }
  }

  private gradeTarget(): GradeTarget {
    const item = this.concept.items.find((i) => i.type === 'teachback');
    const rubric: RubricCriterion[] = item?.rubric.length
      ? item.rubric
      : this.concept.objectives.map((o) => ({ id: o.id, text: o.text }));
    return {
      conceptId: this.concept.id,
      prompt: item?.prompt ?? `Explain "${this.concept.name}" to a student who has never heard of it.`,
      reference: item?.reference ?? this.concept.definition,
      rubric,
      misconceptions: this.concept.misconceptions,
    };
  }

  private async callStudent(control: StudentControl): Promise<void> {
    const transcript: ChatMessage[] = this.state.turns.map((t) => ({ role: t.role === 'learner' ? 'user' : 'assistant', content: t.content }));
    const req = buildStudentRequest({
      conceptName: this.concept.name,
      definition: this.concept.definition,
      objectives: this.concept.objectives.map((o) => ({ id: o.id, text: o.text })),
      transcript,
      control: {
        poseWrongBelief: control.move === 'wrong_belief',
        wrongBelief: control.move === 'wrong_belief' ? this.concept.misconceptions[0]?.description : undefined,
        askForExample: control.move === 'example',
        maxWords: control.maxWords,
        instruction: control.instruction,
        turn: control.turn,
      },
      metadata: { sessionId: this.sessionId, courseId: this.ctx.course.id },
    });
    let text = '';
    this.streaming = '';
    this.publish(true);
    for await (const ev of this.ctx.provider.stream(req)) {
      if (ev.type === 'delta' && ev.text) {
        text += ev.text;
        this.streaming = text;
        this.publish(true);
      } else if (ev.type === 'error') {
        throw new Error(ev.error ?? 'Student call failed');
      }
    }
    this.streaming = null;
    this.queue.push({ type: 'student_turn', content: text.trim() });
  }

  private publish(busy: boolean): void {
    this.store.set((v) => ({ ...this.view(busy), error: v.error }));
  }

  private view(busy: boolean): TeachbackView {
    return { concept: this.concept, state: this.state, streaming: this.streaming, busy, grade: this.grade, done: this.state.done };
  }
}
