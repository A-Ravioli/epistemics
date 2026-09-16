import { describe, expect, it } from 'vitest';
import type { Lesson, Rating, Scaffolding } from '../../src/types.js';
import {
  createLessonState,
  reduceLesson,
  buildTutorControl,
  LETS_FIND_OUT,
  MAX_HINT_LEVEL,
  type LessonEffect,
  type LessonEvent,
  type LessonState,
} from '../../src/session/lesson.js';
import { c1, c2, grade, observer, shortLesson } from './fixture.js';

// ---------------------------------------------------------------------------
// Driver: applies events, collects effects, and answers grade_item effects with a scripted grader.
// ---------------------------------------------------------------------------

type Grader = (eff: Extract<LessonEffect, { type: 'grade_item' }>) => { score: number; rating: Rating; tags?: string[] };

class Driver {
  state: LessonState;
  log: LessonEffect[] = [];
  phases: string[] = [];
  constructor(
    readonly lesson: Lesson,
    scaffolding: Scaffolding = 'developing',
    readonly grader: Grader = () => ({ score: 0.9, rating: 3 }),
    readonly autoGrade = true,
  ) {
    this.state = createLessonState({ sessionId: 's1', courseId: 'course1', lesson, scaffolding });
  }
  send(event: LessonEvent): LessonEffect[] {
    const { state, effects } = reduceLesson(this.state, event, this.lesson);
    this.state = state;
    this.phases.push(`${state.conceptIds[state.conceptIndex] ?? '-'}:${state.phase}`);
    this.log.push(...effects);
    // Simulate the app: the tutor speaks after every call_tutor; grades come back if autoGrade.
    const out = [...effects];
    for (const eff of effects) {
      if (eff.type === 'call_tutor') out.push(...this.send({ type: 'tutor_turn', content: `(tutor) ${eff.control.instruction.slice(0, 40)}` }));
      if (eff.type === 'grade_item' && this.autoGrade) {
        const g = this.grader(eff);
        out.push(...this.send({ type: 'grade', itemKind: eff.itemKind, itemId: eff.itemId, grade: grade(g.score, { misconceptionTags: g.tags ?? [] }), rating: g.rating }));
      }
    }
    return out;
  }
  /** Learner turn followed by the observer's verdict (if the reducer asked for one). */
  turn(content: string, obs: Parameters<typeof observer>[0] = {}, confidence?: 1 | 2 | 3): LessonEffect[] {
    const effs = this.send(confidence === undefined ? { type: 'learner_turn', content } : { type: 'learner_turn', content, confidence });
    if (effs.some((e) => e.type === 'call_observer')) return [...effs, ...this.send({ type: 'observer', result: observer(obs) })];
    return effs;
  }
  get phase() {
    return this.state.phase;
  }
  get conceptId() {
    return this.state.conceptIds[this.state.conceptIndex];
  }
  types(effs: LessonEffect[]) {
    return effs.map((e) => e.type);
  }
  lastControl() {
    const ct = [...this.log].reverse().find((e) => e.type === 'call_tutor');
    return ct && ct.type === 'call_tutor' ? ct.control : undefined;
  }
}

/** Drives one concept through PRIME..CHECK for a learner who states the key idea immediately. */
function runAdvancedConcept(d: Driver) {
  expect(d.phase).toBe('PRIME');
  d.turn('my guess', {}, 2);
  expect(d.phase).toBe('PROBE');
  d.turn('I know a bit', { priorKnowledgeElicited: true });
  expect(d.phase).toBe('DEVELOP');
  d.turn('the key idea is ...', { keyIdeaStated: true });
  expect(d.phase).toBe('CONSOLIDATE');
  d.turn('the principle is ...');
  expect(d.phase).toBe('EXTEND');
  d.turn('transfer attempt', { attemptMade: true });
  expect(d.phase).toBe('CHECK');
  d.turn('check answer', {}, 3);
}

describe('lesson reducer', () => {
  it('(a) advanced learner: PRIME→PROBE→DEVELOP→CONSOLIDATE→EXTEND→CHECK pass → next concept → WRAP → complete', () => {
    const d = new Driver(shortLesson, 'advanced');
    const startEffs = d.send({ type: 'start' });
    expect(d.phase).toBe('PRIME');
    const first = startEffs[0];
    expect(first?.type).toBe('call_tutor');
    if (first?.type === 'call_tutor') {
      expect(first.control.instruction).toContain(c1.script.pretest.prompt);
      expect(first.control.instruction).toContain('verbatim');
      expect(first.control.maxWords).toBe(120);
    }

    // PRIME: learner answers with confidence; graded as pretest, "Let's find out.", then PROBE.
    const primeEffs = d.turn('my guess', {}, 2);
    expect(d.types(primeEffs)).toEqual(expect.arrayContaining(['grade_item', 'show_message', 'call_tutor']));
    const gi = primeEffs.find((e) => e.type === 'grade_item');
    expect(gi).toMatchObject({ itemKind: 'pretest', assisted: false, rubricSource: 'script.pretest', confidence: 2, conceptId: 'c1' });
    expect(primeEffs.find((e) => e.type === 'show_message')).toMatchObject({ text: LETS_FIND_OUT });
    expect(d.state.pretestRecord.c1).toEqual({ answer: 'my guess', confidence: 2 });
    expect(d.phase).toBe('PROBE');
    // pretest receipt was recorded once the grade arrived (even though the phase moved on)
    expect(d.log.filter((e) => e.type === 'record_receipt' && e.itemKind === 'pretest')).toHaveLength(1);

    d.turn('I know a bit', { priorKnowledgeElicited: true });
    expect(d.phase).toBe('DEVELOP');
    expect(d.lastControl()?.instruction).toContain('hint level 0');

    d.turn('the key idea is ...', { keyIdeaStated: true });
    expect(d.phase).toBe('CONSOLIDATE');
    expect(d.state.hintLevel).toBe(0);

    const consEffs = d.turn('the principle is ...');
    const consGrade = consEffs.find((e) => e.type === 'grade_item');
    expect(consGrade).toMatchObject({ itemKind: 'consolidate', itemId: 'c1-i1', rubricSource: 'item' });
    expect(d.phase).toBe('EXTEND');
    expect(d.lastControl()?.instruction).toContain(c1.script.transfer.prompt);

    const extEffs = d.turn('transfer attempt', { attemptMade: true });
    expect(extEffs.find((e) => e.type === 'grade_item')).toMatchObject({ itemKind: 'transfer', assisted: true, rubricSource: 'script.transfer' });
    expect(d.phase).toBe('CHECK');
    const checkControl = d.lastControl();
    expect(checkControl?.instruction).toContain(c1.script.pretest.isomorph);
    expect(checkControl?.phase).toBe('CHECK');

    // CHECK: the tutor is silent until graded.
    const checkEffs = d.send({ type: 'learner_turn', content: 'check answer', confidence: 3 });
    expect(checkEffs.filter((e) => e.type === 'call_tutor' && e.control.conceptId === 'c1')).toHaveLength(0);
    expect(checkEffs.find((e) => e.type === 'grade_item')).toMatchObject({ itemKind: 'check', assisted: false, confidence: 3 });
    expect(d.types(checkEffs)).toEqual(expect.arrayContaining(['record_receipt', 'show_message', 'activate_items']));
    expect(checkEffs.find((e) => e.type === 'activate_items')).toEqual({ type: 'activate_items', conceptId: 'c1', firstRating: 3 });
    expect(d.state.checkResults.c1).toEqual({ rating: 3, score: 0.9 });
    // next concept started
    expect(d.conceptId).toBe('c2');
    expect(d.phase).toBe('PRIME');

    runAdvancedConcept(d);
    expect(d.phase).toBe('WRAP');
    expect(d.log.at(-1)).toEqual({ type: 'request_summary' });

    const sumEffs = d.send({ type: 'summary_submitted', text: 'my summary of the lesson' });
    const check = sumEffs.find((e) => e.type === 'call_tutor');
    expect(check && check.type === 'call_tutor' ? check.control.maxWords : 0).toBe(80);
    expect(check && check.type === 'call_tutor' ? check.control.instruction : '').toContain('my summary of the lesson');
    expect(sumEffs.find((e) => e.type === 'request_jol')).toEqual({ type: 'request_jol', conceptIds: ['c1', 'c2'] });
    expect(d.state.jolPending).toBe(true);

    const jolEffs = d.send({ type: 'jol_submitted', predictions: { c1: 0.9, c2: 0.4 } });
    const done = jolEffs.find((e) => e.type === 'lesson_complete');
    expect(done).toBeDefined();
    if (done?.type === 'lesson_complete') {
      expect(done.results.summaryText).toBe('my summary of the lesson');
      expect(Object.keys(done.results.checkResults)).toEqual(['c1', 'c2']);
      expect(done.results.pretestRecord.c2).toBeDefined();
      expect(done.results.jol).toEqual({ c1: 0.9, c2: 0.4 });
    }
    expect(d.state.done).toBe(true);
    expect(d.phase).toBe('DONE');
    // Once done, everything is ignored.
    expect(d.send({ type: 'learner_turn', content: 'hello?' })).toEqual([]);
  });

  it('(b) novice path shows a worked example before guiding questions', () => {
    const d = new Driver(shortLesson, 'novice');
    d.send({ type: 'start' });
    d.turn('guess', {}, 1);
    d.turn('nothing really', { priorKnowledgeElicited: true });
    expect(d.phase).toBe('DEVELOP');
    const ctl = d.lastControl();
    expect(ctl?.maxWords).toBe(220);
    expect(ctl?.instruction).toContain('Present the worked example steps');
    expect(ctl?.instruction).toContain('explain step 1');
    expect(ctl?.instruction).toContain(c1.script.workedExample.steps[0]);
    // After the first attempt, guiding questions follow (normal budget).
    d.turn('step one means...', { attemptMade: true });
    const ctl2 = d.lastControl();
    expect(ctl2?.maxWords).toBe(120);
    expect(ctl2?.instruction).toContain('Guiding question');
    expect(d.state.workedExampleShown).toBe(true);
  });

  it('(c) stuck learner climbs hints 0→1→2→3 only after attempts and never past 3', () => {
    const d = new Driver(shortLesson, 'developing');
    d.send({ type: 'start' });
    d.turn('guess', {}, 1);
    d.turn('hmm', {});
    d.turn('hmm again', {}); // 2 PROBE turns → DEVELOP
    expect(d.phase).toBe('DEVELOP');
    expect(d.state.hintLevel).toBe(0);

    // A non-attempt does not advance the ladder.
    d.turn('what do you mean?', { attemptMade: false });
    expect(d.state.hintLevel).toBe(0);
    expect(d.phase).toBe('DEVELOP');

    const levels: number[] = [];
    for (let i = 0; i < 3; i++) {
      d.turn(`wrong attempt ${i}`, { attemptMade: true });
      levels.push(d.state.hintLevel);
      expect(d.phase).toBe('DEVELOP');
      const ctl = d.lastControl();
      expect(ctl?.hintLevel).toBe(d.state.hintLevel);
      expect(ctl?.allowHintContent).toBe(c1.script.hints[d.state.hintLevel - 1]);
    }
    expect(levels).toEqual([1, 2, 3]);
    expect(d.lastControl()?.instruction).toContain('Bottom-out hint');
    // One more attempt at level 3 exits DEVELOP; the level never exceeds 3.
    d.turn('final attempt', { attemptMade: true });
    expect(d.phase).toBe('CONSOLIDATE');
    expect(Math.max(...d.log.filter((e) => e.type === 'call_tutor').map((e) => (e.type === 'call_tutor' ? e.control.hintLevel : 0)))).toBe(MAX_HINT_LEVEL);
  });

  it('advanced scaffolding withholds hints for two attempts', () => {
    const d = new Driver(shortLesson, 'advanced');
    d.send({ type: 'start' });
    d.turn('guess', {}, 1);
    d.turn('yes', { priorKnowledgeElicited: true });
    d.turn('attempt 1', { attemptMade: true });
    expect(d.state.hintLevel).toBe(0);
    d.turn('attempt 2', { attemptMade: true });
    expect(d.state.hintLevel).toBe(1);
  });

  it('(d) give_up in DEVELOP reveals nothing and moves to CONSOLIDATE', () => {
    const d = new Driver(shortLesson, 'developing');
    d.send({ type: 'start' });
    d.turn('guess', {}, 1);
    d.turn('prior', { priorKnowledgeElicited: true });
    expect(d.phase).toBe('DEVELOP');
    const effs = d.send({ type: 'give_up' });
    expect(d.phase).toBe('CONSOLIDATE');
    expect(effs.some((e) => e.type === 'show_message')).toBe(false);
    const ctl = effs.find((e) => e.type === 'call_tutor');
    expect(ctl && ctl.type === 'call_tutor' ? ctl.control.instruction : '').toContain('Do not reveal the answer');
    for (const e of effs) {
      if (e.type === 'call_tutor') expect(e.control.instruction).not.toContain('REFERENCE(');
      if (e.type === 'show_message') expect(e.text).not.toContain('REFERENCE(');
    }
  });

  it('give_up in EXTEND records Again for the transfer and moves to CHECK; give_up in CHECK records Again', () => {
    const d = new Driver(shortLesson, 'advanced');
    d.send({ type: 'start' });
    d.turn('guess', {}, 1);
    d.turn('prior', { priorKnowledgeElicited: true });
    d.turn('key idea', { keyIdeaStated: true });
    d.turn('principle');
    expect(d.phase).toBe('EXTEND');
    const effs = d.send({ type: 'give_up' });
    expect(effs.find((e) => e.type === 'record_receipt')).toMatchObject({ itemKind: 'transfer', rating: 1, assisted: true });
    expect(d.phase).toBe('CHECK');
    const effs2 = d.send({ type: 'give_up' });
    expect(effs2.find((e) => e.type === 'record_receipt')).toMatchObject({ itemKind: 'check', rating: 1, assisted: false });
    expect(d.state.checkResults.c1).toEqual({ rating: 1, score: 0 });
    expect(d.phase).toBe('REMEDIATE');
  });

  it('(e) CHECK fail → REMEDIATE → second fail → schedule_remediation and move on', () => {
    const grader: Grader = (eff) => (eff.itemKind === 'check' ? { score: 0.2, rating: 1, tags: ['c1-mc-a'] } : { score: 0.9, rating: 3 });
    const d = new Driver(shortLesson, 'advanced', grader);
    d.send({ type: 'start' });
    d.turn('guess', {}, 1);
    d.turn('prior', { priorKnowledgeElicited: true });
    d.turn('key idea', { keyIdeaStated: true });
    d.turn('principle');
    d.turn('transfer', { attemptMade: true });
    expect(d.phase).toBe('CHECK');

    const fail1 = d.turn('wrong check answer', {}, 3);
    expect(fail1.find((e) => e.type === 'show_message')).toMatchObject({ text: 'feedback for score 0.2' });
    expect(d.phase).toBe('REMEDIATE');
    expect(d.conceptId).toBe('c1');
    expect(d.state.remediationCount.c1).toBe(1);
    expect(d.state.misconceptions.c1).toContain('c1-mc-a');
    const rem = d.lastControl();
    expect(rem?.instruction).toContain('c1-mc-a');
    expect(rem?.instruction).toContain(c1.misconceptions[0]!.remedy);
    expect(fail1.some((e) => e.type === 'activate_items')).toBe(false);

    d.turn('oh I see, it is ...', { keyIdeaStated: true });
    expect(d.phase).toBe('CHECK');
    expect(d.lastControl()?.instruction).toContain(c1.script.pretest.isomorph);

    const fail2 = d.turn('still wrong', {}, 2);
    expect(fail2.find((e) => e.type === 'schedule_remediation')).toEqual({ type: 'schedule_remediation', conceptId: 'c1' });
    expect(fail2.find((e) => e.type === 'activate_items')).toEqual({ type: 'activate_items', conceptId: 'c1', firstRating: 1 });
    expect(d.conceptId).toBe('c2');
    expect(d.phase).toBe('PRIME');
    expect(d.state.remediationCount.c1).toBe(1);
  });

  it('CONSOLIDATE runs at most two corrective loops before EXTEND', () => {
    const grader: Grader = (eff) => (eff.itemKind === 'consolidate' ? { score: 0.3, rating: 1 } : { score: 0.9, rating: 3 });
    const d = new Driver(shortLesson, 'advanced', grader);
    d.send({ type: 'start' });
    d.turn('guess', {}, 1);
    d.turn('prior', { priorKnowledgeElicited: true });
    d.turn('key idea', { keyIdeaStated: true });
    d.turn('bad principle 1');
    expect(d.phase).toBe('CONSOLIDATE');
    expect(d.lastControl()?.instruction).toContain('corrective feedback');
    d.turn('bad principle 2');
    expect(d.phase).toBe('CONSOLIDATE');
    d.turn('bad principle 3');
    expect(d.phase).toBe('EXTEND');
  });

  it('(f) leak_detected re-issues a stricter tutor call, and twice → canned hint', () => {
    const d = new Driver(shortLesson, 'developing');
    d.send({ type: 'start' });
    d.turn('guess', {}, 1);
    d.turn('prior', { priorKnowledgeElicited: true });
    d.turn('attempt', { attemptMade: true }); // hint level 1
    expect(d.state.hintLevel).toBe(1);
    const original = d.lastControl();

    const leak1 = reduceLesson(d.state, { type: 'leak_detected' }, shortLesson);
    expect(leak1.effects).toHaveLength(1);
    const re = leak1.effects[0];
    expect(re?.type).toBe('call_tutor');
    if (re?.type === 'call_tutor') {
      expect(re.control.instruction).toContain('STRICT REGENERATION 1');
      expect(re.control.instruction).toContain(original!.instruction);
      expect(re.control.hintLevel).toBe(1);
    }
    expect(leak1.state.regenerations).toBe(1);

    const leak2 = reduceLesson(leak1.state, { type: 'leak_detected' }, shortLesson);
    expect(leak2.effects).toEqual([{ type: 'show_message', text: c1.script.hints[0] }]);
    expect(leak2.state.regenerations).toBe(0);

    // At hint level 0 the canned hint is hints[0]; a clean tutor turn resets the counter.
    const fresh = reduceLesson(leak2.state, { type: 'tutor_turn', content: 'ok' }, shortLesson);
    expect(fresh.state.regenerations).toBe(0);
  });

  it('(g) state round-trips through JSON', () => {
    const d = new Driver(shortLesson, 'novice');
    d.send({ type: 'start' });
    d.turn('guess', {}, 2);
    d.turn('prior', { priorKnowledgeElicited: true });
    d.turn('step one is', { attemptMade: true });
    const json = JSON.stringify(d.state);
    const revived = JSON.parse(json) as LessonState;
    expect(revived).toEqual(d.state);
    // Resume from the revived state and continue the lesson.
    const a = reduceLesson(d.state, { type: 'observer', result: observer({ keyIdeaStated: true }) }, shortLesson);
    const b = reduceLesson(revived, { type: 'observer', result: observer({ keyIdeaStated: true }) }, shortLesson);
    expect(b).toEqual(a);
    expect(b.state.phase).toBe('CONSOLIDATE');
    expect(JSON.parse(JSON.stringify(b.state))).toEqual(b.state);
  });

  it('is defensive: unknown events in a phase are ignored and the reducer does not mutate its input', () => {
    const d = new Driver(shortLesson, 'developing');
    const before = JSON.stringify(d.state);
    expect(reduceLesson(d.state, { type: 'learner_turn', content: 'before start' }, shortLesson).effects).toEqual([]);
    expect(reduceLesson(d.state, { type: 'observer', result: observer() }, shortLesson).effects).toEqual([]);
    expect(reduceLesson(d.state, { type: 'summary_submitted', text: 'x' }, shortLesson).effects).toEqual([]);
    expect(reduceLesson(d.state, { type: 'jol_submitted', predictions: {} }, shortLesson).effects).toEqual([]);
    expect(reduceLesson(d.state, { type: 'leak_detected' }, shortLesson).effects).toEqual([]);
    expect(reduceLesson(d.state, { type: 'grade', itemKind: 'check', itemId: 'nope', grade: grade(1), rating: 4 }, shortLesson).effects).toEqual([]);
    d.send({ type: 'start' });
    const started = JSON.stringify(d.state);
    // An observer result in PRIME, a grade for an unknown item, a second start: all ignored.
    expect(reduceLesson(d.state, { type: 'observer', result: observer() }, shortLesson).effects).toEqual([]);
    expect(reduceLesson(d.state, { type: 'start' }, shortLesson).effects).toEqual([]);
    expect(reduceLesson(d.state, { type: 'grade', itemKind: 'pretest', itemId: 'c1#pretest', grade: grade(1), rating: 4 }, shortLesson).effects).toEqual([]);
    expect(JSON.stringify(d.state)).toBe(started);
    expect(before).not.toBe(started);
  });

  it('never emits reference text in any effect', () => {
    const grader: Grader = (eff) => (eff.itemKind === 'check' ? { score: 0.1, rating: 1 } : { score: 0.5, rating: 2 });
    const d = new Driver(shortLesson, 'novice', grader);
    d.send({ type: 'start' });
    for (const cid of ['c1', 'c2']) {
      d.turn('guess', {}, 1);
      d.turn('hmm');
      d.turn('hmm');
      for (let i = 0; i < 5 && d.phase === 'DEVELOP'; i++) d.turn('try', { attemptMade: true });
      for (let i = 0; i < 4 && d.phase === 'CONSOLIDATE'; i++) d.turn('principle?');
      d.turn('transfer', { attemptMade: true });
      d.turn('check', {}, 3);
      expect(d.phase).toBe('REMEDIATE');
      d.turn('a', {});
      d.turn('b', {});
      expect(d.phase).toBe('CHECK');
      d.turn('check again', {}, 1);
      expect(d.conceptId === cid).toBe(false);
    }
    expect(d.phase).toBe('WRAP');
    const text = JSON.stringify(d.log);
    expect(text).not.toContain('REFERENCE(');
    expect(text).not.toContain('reference 1 for');
    // The tutor never received a call while a CHECK item was awaiting its grade.
    const s = d.log;
    for (let i = 0; i < s.length; i++) {
      const e = s[i]!;
      if (e.type === 'grade_item' && e.itemKind === 'check') {
        const next = s[i + 1];
        expect(next?.type).toBe('record_receipt');
      }
    }
  });

  it('buildTutorControl reflects phase, hint level, objectives and word budgets', () => {
    const state = createLessonState({ sessionId: 's', courseId: 'c', lesson: shortLesson, scaffolding: 'novice' });
    const prime = buildTutorControl(state, shortLesson);
    expect(prime).toMatchObject({ phase: 'PRIME', conceptId: 'c1', hintLevel: 0, objectiveIds: ['c1-o1', 'c1-o2'], maxWords: 120 });
    const dev = buildTutorControl({ ...state, phase: 'DEVELOP' }, shortLesson);
    expect(dev.maxWords).toBe(220); // novice worked example
    const dev2 = buildTutorControl({ ...state, phase: 'DEVELOP', workedExampleShown: true, hintLevel: 2 }, shortLesson);
    expect(dev2.maxWords).toBe(120);
    expect(dev2.allowHintContent).toBe(c1.script.hints[1]);
    expect(dev2.instruction).toContain('hint level 2 of 3');
    expect(dev2.instruction).toContain('Do not state the answer');
    const wrap = buildTutorControl({ ...state, phase: 'WRAP', conceptIndex: 2, summaryText: 'sum' }, shortLesson);
    expect(wrap.maxWords).toBe(80);
    const c2check = buildTutorControl({ ...state, phase: 'CHECK', conceptIndex: 1 }, shortLesson);
    expect(c2check.instruction).toContain(c2.script.pretest.isomorph);
  });

  it('records learner-model misconceptions passed in and merges observer tags most-recent-first', () => {
    const state = createLessonState({ sessionId: 's', courseId: 'c', lesson: shortLesson, scaffolding: 'developing', learnerMisconceptions: { c1: ['old-tag'] } });
    const d = new Driver(shortLesson);
    d.state = state;
    d.send({ type: 'start' });
    d.turn('guess', {}, 1);
    d.turn('prior', { priorKnowledgeElicited: true, misconceptionTags: ['c1-mc-b'] });
    expect(d.state.misconceptions.c1).toEqual(['c1-mc-b', 'old-tag']);
  });
});
