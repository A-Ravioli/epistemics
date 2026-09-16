import { describe, expect, it } from 'vitest';
import { buildStudentRequest, buildWarmupRequest, createMockProvider, gradeWarmup, PROMPTS, renderStudentControl, checkTurnShape } from '../src/index.js';

describe('student (teach-back)', () => {
  it('assembles a low-effort request with the student prompt, an opener, the transcript and a control', () => {
    const req = buildStudentRequest({
      conceptName: 'Independent events',
      definition: 'Two events are independent when one does not change the probability of the other.',
      objectives: [{ id: 'O1', text: 'State the multiplication rule.' }],
      transcript: [{ role: 'user', content: 'So independence means the events cannot happen together.' }],
      control: { poseWrongBelief: true, wrongBelief: 'Disjoint events are independent.', turn: 2 },
    });
    expect(req.role).toBe('student');
    expect(req.effort).toBe('low');
    expect(req.system[0]!.text).toBe(PROMPTS.student);
    expect(req.system[0]!.cache).toBe(true);
    expect(req.system[1]!.text).toContain('Independent events');
    expect(req.messages[0]).toMatchObject({ role: 'user', cache: true });
    expect(req.messages[1]!.content).toContain('cannot happen together');
    const ctl = req.messages.at(-1)!;
    expect(ctl.role).toBe('system');
    expect(ctl.content).toContain('pose_wrong_belief=yes');
    expect(ctl.content).toContain('Disjoint events are independent.');
    expect(ctl.content).toContain('At most 80 words');
    expect(ctl.content).toContain('turn=2');
  });

  it('control defaults to no wrong belief and 80 words', () => {
    const c = renderStudentControl({});
    expect(c).toContain('pose_wrong_belief=no');
    expect(c).toContain('ask_for_example=no');
    expect(c).toContain('Exactly one question. At most 80 words.');
    expect(renderStudentControl({ askForExample: true, maxWords: 50 })).toContain('concrete example');
  });

  it('mock student turn has one question and fits the cap', async () => {
    const mock = createMockProvider();
    const req = buildStudentRequest({ conceptName: 'x', definition: 'y', transcript: [] });
    const { text } = await mock.text(req);
    expect(checkTurnShape(text, 80).ok).toBe(true);
  });
});

describe('warm-up grader', () => {
  const concepts = [
    { id: 'c1', name: 'Independent events', definition: 'Two events are independent when one does not change the probability of the other.' },
    { id: 'c2', name: 'Conditional probability', definition: 'The probability of A given B is P(A and B) divided by P(B).' },
    { id: 'c3', name: 'Bayes theorem', definition: 'P(A|B) = P(B|A) P(A) / P(B).' },
  ];

  it('builds a structured request on the grader role at low effort', () => {
    const req = buildWarmupRequest({ dump: 'stuff', concepts });
    expect(req.role).toBe('grader');
    expect(req.effort).toBe('low');
    expect(req.system[0]!.text).toBe(PROMPTS.warmup);
    expect(req.messages[0]!.content).toContain('"c3"');
  });

  it('mock heuristics recall concepts named with a correct gloss and mark bare mentions partial', async () => {
    const mock = createMockProvider();
    const r = await gradeWarmup(mock, { dump: 'Independent events: one event does not change the probability of the other. I also remember conditional probability but not the formula.', concepts });
    expect(r.recalledConceptIds).toEqual(['c1']);
    expect(r.partial).toEqual(['c2']);
  });

  it('drops unknown ids and resolves overlaps in favour of recalled', async () => {
    const mock = createMockProvider({ queue: { grader: [{ recalledConceptIds: ['c1', 'zzz'], partial: ['c1', 'c2'] }] } });
    const r = await gradeWarmup(mock, { dump: 'x', concepts });
    expect(r).toEqual({ recalledConceptIds: ['c1'], partial: ['c2'] });
  });

  it('short-circuits on an empty dump without a call', async () => {
    const mock = createMockProvider();
    expect(await gradeWarmup(mock, { dump: '   ', concepts })).toEqual({ recalledConceptIds: [], partial: [] });
    expect(mock.calls).toHaveLength(0);
  });
});
