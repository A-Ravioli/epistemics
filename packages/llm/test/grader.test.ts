import { describe, expect, it } from 'vitest';
import type { GradeResult } from '@epistemics/core';
import { combineGrades, createMockProvider, exactMatches, grade, gradeExact, gradeWithUsage, needsConsensus, ratingFromGrade, type GradeInput } from '../src/index.js';
import { ITEM_REFERENCE, makeConcept } from './fixtures.js';

const c = makeConcept();
const item = c.items[0]!;
const input: GradeInput = {
  prompt: item.prompt,
  reference: ITEM_REFERENCE,
  rubric: item.rubric,
  answer: 'Independence means the occurrence of B does not change the probability of A, so P(A|B) = P(A).',
  misconceptions: c.misconceptions,
};

function sample(score: number, confidence = 0.9, met: [boolean, boolean] = [true, true], tags: string[] = []): GradeResult {
  return { criteria: [{ id: 'c1', met: met[0], evidence: 'e1' }, { id: 'c2', met: met[1], evidence: 'e2' }], score, misconceptionTags: tags, feedback: `fb ${score}`, confidence };
}

describe('grader', () => {
  it('mock heuristics: overlapping answer scores 0.9, unrelated answer 0.3', async () => {
    const mock = createMockProvider();
    const good = await grade(mock, input);
    expect(good.score).toBe(0.9);
    expect(good.criteria.every((x) => x.met)).toBe(true);
    expect(good.samples).toBe(1);
    const bad = await grade(mock, { ...input, answer: 'Bananas are yellow fruit.' });
    expect(bad.score).toBe(0.3);
    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0]!.role).toBe('grader');
    // blind: the request carries no dialogue, only the item payload
    expect(mock.calls[0]!.messages).toHaveLength(1);
  });

  it('needsConsensus fires on low confidence or a score near a boundary', () => {
    expect(needsConsensus({ score: 0.9, confidence: 0.9 })).toBe(false);
    expect(needsConsensus({ score: 0.9, confidence: 0.6 })).toBe(true);
    expect(needsConsensus({ score: 0.76, confidence: 0.95 })).toBe(true);
    expect(needsConsensus({ score: 0.42, confidence: 0.95 })).toBe(true);
    expect(needsConsensus({ score: 0.95, confidence: 0.95 })).toBe(true);
    expect(needsConsensus({ score: 0.6, confidence: 0.95 })).toBe(false);
  });

  it('borderline first sample triggers three samples: median score, majority per criterion', async () => {
    const mock = createMockProvider({ queue: { grader: [sample(0.76, 0.9, [true, true]), sample(0.5, 0.8, [true, false]), sample(0.9, 0.7, [true, false], ['conflates-independent-and-disjoint'])] } });
    const { grade: g, disagreement } = await gradeWithUsage(mock, input);
    expect(mock.calls).toHaveLength(3);
    expect(g.samples).toBe(3);
    expect(g.score).toBe(0.76);
    expect(g.criteria).toEqual([{ id: 'c1', met: true, evidence: 'e1' }, { id: 'c2', met: false, evidence: 'e2' }]);
    expect(g.misconceptionTags).toEqual([]); // tag seen in only 1 of 3
    expect(g.confidence).toBeCloseTo(0.8, 5);
    expect(g.feedback).toBe('fb 0.76');
    expect(disagreement).toBe(true); // 0.5 → Hard, 0.76/0.9 → Good
  });

  it('a confident mid-band sample is not escalated', async () => {
    const mock = createMockProvider({ queue: { grader: [sample(0.6, 0.95)] } });
    const g = await grade(mock, input);
    expect(mock.calls).toHaveLength(1);
    expect(g.samples).toBe(1);
  });

  it('samples: N forces N draws', async () => {
    const mock = createMockProvider({ queue: { grader: [sample(0.6, 0.95), sample(0.6, 0.95)] } });
    const g = await grade(mock, { ...input, samples: 2 });
    expect(mock.calls).toHaveLength(2);
    expect(g.samples).toBe(2);
  });

  it('sanitises unknown criteria ids and tags from the model', async () => {
    const mock = createMockProvider({ queue: { grader: [{ ...sample(0.6, 0.95), criteria: [{ id: 'c2', met: true, evidence: 'x' }, { id: 'zzz', met: true, evidence: '' }], misconceptionTags: ['nope'] }] } });
    const g = await grade(mock, input);
    expect(g.criteria).toEqual([{ id: 'c1', met: false, evidence: '' }, { id: 'c2', met: true, evidence: 'x' }]);
    expect(g.misconceptionTags).toEqual([]);
  });

  it('combineGrades majority with two samples requires both to agree on met', () => {
    const g = combineGrades([sample(0.5, 0.9, [true, false]), sample(0.9, 0.9, [true, true])], item.rubric);
    expect(g.score).toBeCloseTo(0.7, 9);
    expect(g.criteria.map((x) => x.met)).toEqual([true, false]);
  });

  it('ratingFromGrade follows the DESIGN §6.2 map', () => {
    expect(ratingFromGrade({ score: 0.3, confidence: 1 })).toBe(1);
    expect(ratingFromGrade({ score: 0.5, confidence: 1 })).toBe(2);
    expect(ratingFromGrade({ score: 0.8, confidence: 1 })).toBe(3);
    expect(ratingFromGrade({ score: 0.97, confidence: 0.9 })).toBe(4);
    expect(ratingFromGrade({ score: 0.97, confidence: 0.5 })).toBe(3);
  });
});

describe('gradeExact', () => {
  it('matches normalised strings and numbers', () => {
    expect(exactMatches('  The answer is 42. ', '42')).toBe(true);
    expect(exactMatches('x = 3.50', '3.5')).toBe(true);
    expect(exactMatches('142', '42')).toBe(false);
    expect(exactMatches('Mitochondria!', 'mitochondria')).toBe(true);
    expect(exactMatches('I think it is the Krebs cycle', 'krebs cycle')).toBe(true);
    expect(exactMatches('Golgi', 'mitochondria')).toBe(false);
  });

  it('short-circuits to 1/0 with confidence 1', () => {
    const yes = gradeExact('42', '42', item.rubric);
    expect(yes.score).toBe(1);
    expect(yes.confidence).toBe(1);
    expect(yes.criteria.every((x) => x.met)).toBe(true);
    const no = gradeExact('41', '42');
    expect(no.score).toBe(0);
    expect(no.confidence).toBe(1);
  });

  it('grade() uses the exact match without calling the model on a hit', async () => {
    const mock = createMockProvider();
    const g = await grade(mock, { ...input, reference: { answer: ITEM_REFERENCE, exact: '42' }, answer: 'it is 42' });
    expect(g.score).toBe(1);
    expect(mock.calls).toHaveLength(0);
  });

  it('grade() on a miss with a rubric grades the reasoning but caps the score at 0.5', async () => {
    const mock = createMockProvider();
    const g = await grade(mock, { ...input, reference: { answer: ITEM_REFERENCE, exact: '42' } });
    expect(mock.calls).toHaveLength(1);
    expect(g.score).toBe(0.5);
    expect(g.feedback).toContain('does not match');
  });

  it('grade() on a miss without a rubric is 0 without a model call', async () => {
    const mock = createMockProvider();
    const g = await grade(mock, { ...input, rubric: [], reference: { answer: ITEM_REFERENCE, exact: '42' }, answer: '41' });
    expect(g.score).toBe(0);
    expect(mock.calls).toHaveLength(0);
  });
});
