import { describe, expect, it } from 'vitest';
import { createTeachbackState, reduceTeachback, learnerExplanation, TEACHBACK_MAX_LEARNER_TURNS, type TeachbackEffect } from '../../src/session/teachback.js';
import { c1, c2, grade } from './fixture.js';

function moves(effs: TeachbackEffect[]) {
  return effs.filter((e) => e.type === 'call_student').map((e) => (e.type === 'call_student' ? e.control.move : ''));
}

describe('teach-back reducer', () => {
  it('poses exactly one wrong belief, asks for an example, and grades the concatenated explanation after 6 turns', () => {
    let s = createTeachbackState({ sessionId: 's', courseId: 'c', concept: c1 });
    expect(s.itemId).toBe('c1-i4');
    const all: TeachbackEffect[] = [];
    let r = reduceTeachback(s, { type: 'start' });
    all.push(...r.effects);
    s = r.state;
    expect(moves(r.effects)).toEqual(['clarify']);
    for (let i = 1; i <= TEACHBACK_MAX_LEARNER_TURNS; i++) {
      r = reduceTeachback(s, { type: 'student_turn', content: `student ${i}` });
      s = r.state;
      r = reduceTeachback(s, { type: 'learner_turn', content: `explanation part ${i}` });
      all.push(...r.effects);
      s = r.state;
    }
    const ms = moves(all);
    expect(ms.filter((m) => m === 'wrong_belief')).toHaveLength(1);
    expect(ms.indexOf('wrong_belief')).toBe(2); // third student turn
    expect(ms.filter((m) => m === 'example')).toHaveLength(1);
    expect(ms.at(-1)).toBe('closing');
    expect(s.wrongBeliefPosed).toBe(true);
    const g = all.find((e) => e.type === 'grade_item');
    expect(g).toMatchObject({ itemKind: 'teachback', itemId: 'c1-i4', conceptId: 'c1', assisted: false, rubricSource: 'item' });
    expect(g && g.type === 'grade_item' ? g.answer : '').toBe(learnerExplanation(s));
    expect(learnerExplanation(s)).toContain('explanation part 1');
    expect(learnerExplanation(s)).toContain('explanation part 6');
    for (const e of all) if (e.type === 'call_student') expect(e.control.maxWords).toBe(80);
    // Further learner turns are ignored while grading.
    expect(reduceTeachback(s, { type: 'learner_turn', content: 'more' }).effects).toEqual([]);
    r = reduceTeachback(s, { type: 'grade', grade: grade(0.8), rating: 3 });
    expect(r.effects.map((e) => e.type)).toEqual(['record_receipt', 'teachback_complete']);
    expect(r.effects[1]).toMatchObject({ type: 'teachback_complete', conceptId: 'c1', score: 0.8, rating: 3, learnerTurns: 6 });
    expect(r.state.done).toBe(true);
    expect(JSON.parse(JSON.stringify(r.state))).toEqual(r.state);
  });

  it('ends early when the learner says they are done, and synthesises an item id when the concept has no teachback item', () => {
    let s = createTeachbackState({ sessionId: 's', courseId: 'c', concept: c2 });
    expect(s.itemId).toBe('c2#teachback');
    s = reduceTeachback(s, { type: 'start' }).state;
    s = reduceTeachback(s, { type: 'learner_turn', content: 'one' }).state;
    const r = reduceTeachback(s, { type: 'learner_turn', content: 'two, and I am done', done: true });
    expect(r.effects.map((e) => e.type)).toEqual(['call_student', 'grade_item']);
    expect(r.state.wrongBeliefPosed).toBe(false);
    expect(r.state.grading).toBe(true);
  });
});
