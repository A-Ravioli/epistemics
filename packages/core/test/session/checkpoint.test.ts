import { describe, expect, it } from 'vitest';
import {
  composeCheckpoint,
  composeRemediation,
  createCheckpointState,
  reduceCheckpoint,
  scoreCheckpoint,
  CHECKPOINT_EXCLUDED_TYPES,
} from '../../src/session/checkpoint.js';
import { reduceLesson } from '../../src/session/lesson.js';
import { c4, grade, observer, seededRng, unit1, unit2 } from './fixture.js';

const unit2Concepts = new Set(['c6', 'c7', 'c8']);

describe('composeCheckpoint', () => {
  it('draws ~70% from the unit and ~30% from earlier units, excluding recall/cloze/teachback', () => {
    const mastery = new Map([
      ['c1', 0.9],
      ['c2', 0.3],
      ['c3', 0.6],
      ['c4', 0.95],
      ['c5', 0.2],
    ]);
    const items = composeCheckpoint({ unit: unit2, previousUnits: [unit1], conceptMastery: mastery, size: 10, rng: seededRng(7) });
    expect(items).toHaveLength(10);
    const fromUnit = items.filter((i) => unit2Concepts.has(i.conceptId));
    const fromPrev = items.filter((i) => !unit2Concepts.has(i.conceptId));
    expect(fromUnit).toHaveLength(7);
    expect(fromPrev).toHaveLength(3);
    for (const i of items) expect(CHECKPOINT_EXCLUDED_TYPES).not.toContain(i.type);
    // one item per unit concept before any second item
    const unitConcepts = new Set(fromUnit.map((i) => i.conceptId));
    expect(unitConcepts).toEqual(unit2Concepts);
    // earlier-unit picks favour the lowest-mastery concepts (c5, c2) and discriminate/apply items
    const prevConcepts = fromPrev.map((i) => i.conceptId);
    expect(prevConcepts).toContain('c5');
    expect(prevConcepts).toContain('c2');
    expect(prevConcepts).not.toContain('c4');
    for (const i of fromPrev) expect(['discriminate', 'apply']).toContain(i.type);
    // apply/analyze preferred for the unit's first picks
    const firstPicks = ['c6', 'c7', 'c8'].map((c) => fromUnit.find((i) => i.conceptId === c)!);
    for (const i of firstPicks) expect(['apply', 'analyze']).toContain(i.bloom);
    // no duplicates
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it('is deterministic for a given rng and uses the unit only when there are no previous units', () => {
    const a = composeCheckpoint({ unit: unit1, previousUnits: [], conceptMastery: new Map(), size: 12, rng: seededRng(1) });
    const b = composeCheckpoint({ unit: unit1, previousUnits: [], conceptMastery: new Map(), size: 12, rng: seededRng(1) });
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
    // unit1 has 8 eligible items in total; size is capped by availability
    expect(a.length).toBe(8);
    expect(a.every((i) => ['c1', 'c2', 'c3', 'c4', 'c5'].includes(i.conceptId))).toBe(true);
  });
});

describe('checkpoint reducer', () => {
  it('presents items in order, grades them, and reports per-concept pass/reopen at 0.8', () => {
    const items = composeCheckpoint({ unit: unit1, previousUnits: [], conceptMastery: new Map(), size: 6, rng: seededRng(3) });
    let { state, effects } = reduceCheckpoint(createCheckpointState({ sessionId: 's', courseId: 'c', unitId: 'U1', items }), { type: 'start' });
    expect(effects[0]).toMatchObject({ type: 'present_item', itemId: items[0]!.id, index: 0, total: 6 });
    const scores: Record<string, number> = { c1: 1, c2: 0.5, c3: 0.9, c4: 0.7, c5: 0.85 };
    let complete: unknown;
    for (const item of items) {
      const r1 = reduceCheckpoint(state, { type: 'answer_submitted', itemId: item.id, answer: 'ans', confidence: 2 });
      expect(r1.effects).toEqual([
        { type: 'grade_item', itemKind: 'checkpoint', itemId: item.id, conceptId: item.conceptId, answer: 'ans', confidence: 2, assisted: false, rubricSource: 'item' },
      ]);
      // A stray grade for an item that was not answered is ignored.
      expect(reduceCheckpoint(r1.state, { type: 'grade', itemId: 'nope', grade: grade(1), rating: 4 }).effects).toEqual([]);
      const score = scores[item.conceptId]!;
      const r2 = reduceCheckpoint(r1.state, { type: 'grade', itemId: item.id, grade: grade(score), rating: score >= 0.75 ? 3 : 1 });
      expect(r2.effects[0]).toMatchObject({ type: 'record_receipt', itemId: item.id, rating: score >= 0.75 ? 3 : 1 });
      state = r2.state;
      complete = r2.effects.find((e) => e.type === 'checkpoint_complete');
    }
    expect(state.done).toBe(true);
    expect(complete).toBeDefined();
    const result = scoreCheckpoint(state);
    for (const [conceptId, r] of Object.entries(result.perConcept)) {
      expect(r.score).toBeCloseTo(scores[conceptId]!);
      expect(r.passed).toBe(scores[conceptId]! >= 0.8);
    }
    expect(result.reopen).toEqual(Object.keys(scores).filter((c) => scores[c]! < 0.8 && c in result.perConcept).sort());
    expect(reduceCheckpoint(state, { type: 'finish' }).effects).toEqual([]);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('finish before the end treats ungraded items as failures', () => {
    const items = composeCheckpoint({ unit: unit1, previousUnits: [], conceptMastery: new Map(), size: 4, rng: seededRng(9) });
    const s0 = reduceCheckpoint(createCheckpointState({ sessionId: 's', courseId: 'c', unitId: 'U1', items }), { type: 'start' }).state;
    const r = reduceCheckpoint(s0, { type: 'finish' });
    const done = r.effects[0];
    expect(done?.type).toBe('checkpoint_complete');
    if (done?.type === 'checkpoint_complete') {
      expect(done.reopen.length).toBe(Object.keys(done.perConcept).length);
      expect(Object.values(done.perConcept).every((p) => !p.passed && p.score === 0)).toBe(true);
    }
  });
});

describe('composeRemediation', () => {
  it('builds a DEVELOP → CONSOLIDATE → CHECK mini-lesson for one concept with no wrap-up', () => {
    const { lesson, state } = composeRemediation(c4, { sessionId: 's', courseId: 'c', learnerMisconceptions: ['c4-mc-b'] });
    expect(state.phasePlan).toEqual(['DEVELOP', 'CONSOLIDATE', 'CHECK']);
    expect(state.conceptIds).toEqual(['c4']);
    expect(state.misconceptions.c4).toEqual(['c4-mc-b']);
    let r = reduceLesson(state, { type: 'start' }, lesson);
    expect(r.state.phase).toBe('DEVELOP');
    r = reduceLesson(r.state, { type: 'learner_turn', content: 'idea' }, lesson);
    r = reduceLesson(r.state, { type: 'observer', result: observer({ keyIdeaStated: true }) }, lesson);
    expect(r.state.phase).toBe('CONSOLIDATE');
    r = reduceLesson(r.state, { type: 'learner_turn', content: 'principle' }, lesson);
    const g = r.effects.find((e) => e.type === 'grade_item');
    expect(g).toMatchObject({ itemKind: 'consolidate', itemId: 'c4-i2', rubricSource: 'item' });
    r = reduceLesson(r.state, { type: 'grade', itemKind: 'consolidate', itemId: 'c4-i2', grade: grade(0.9), rating: 3 }, lesson);
    expect(r.state.phase).toBe('CHECK'); // EXTEND skipped
    r = reduceLesson(r.state, { type: 'learner_turn', content: 'check', confidence: 3 }, lesson);
    r = reduceLesson(r.state, { type: 'grade', itemKind: 'check', itemId: 'c4#check', grade: grade(0.95), rating: 4 }, lesson);
    expect(r.effects.map((e) => e.type)).toEqual(['record_receipt', 'show_message', 'activate_items', 'lesson_complete']);
    expect(r.state.done).toBe(true);
  });
});
