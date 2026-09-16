import { describe, expect, it } from 'vitest';
import { checkTurnShape, createMockProvider, detectLeak, heuristicLeak } from '../src/index.js';
import { PRETEST_REFERENCE } from './fixtures.js';

const reference = { answer: PRETEST_REFERENCE, exact: undefined as string | undefined };

describe('detectLeak', () => {
  it('flags the exact answer, normalised', async () => {
    const v = await detectLeak('So the answer is: MITOCHONDRIA.', { answer: 'The mitochondria.', exact: 'mitochondria' });
    expect(v).toMatchObject({ leaked: true, reason: 'exact' });
    const num = await detectLeak('You should get 42 here.', { answer: 'forty-two', exact: '42' });
    expect(num.leaked).toBe(true);
    const partial = await detectLeak('Try 142 next.', { answer: 'x', exact: '42' });
    expect(partial.leaked).toBe(false);
  });

  it('flags a long distinctive phrase from the reference answer', async () => {
    const v = await detectLeak('Remember: two events are independent when P(A and B) equals P(A) times P(B).', reference);
    expect(v).toMatchObject({ leaked: true, reason: 'phrase' });
  });

  it('flags the phrase even when punctuation and case differ', async () => {
    const v = await detectLeak('KNOWING ONE tells you NOTHING about the other!!', reference);
    expect(v.leaked).toBe(true);
  });

  it('does not flag a question or an orientation hint', async () => {
    const q = await detectLeak('What happens to the chance of a king once you know the card is red?', reference);
    expect(q).toMatchObject({ leaked: false, reason: 'none' });
    const hint = await detectLeak('Think about whether learning one event changes the odds of the other.', reference);
    expect(hint.leaked).toBe(false);
  });

  it('does not flag short common overlaps', async () => {
    const v = await detectLeak('Good. Now, is P(A) the same as before?', { answer: 'P(A) is unchanged.' });
    expect(v.leaked).toBe(false);
  });

  it('asks the leakcheck model when the heuristic is inconclusive and a provider is given', async () => {
    // heavy vocabulary overlap but no contiguous 4-word run
    const text = 'Independent... P(A)... times... P(B)... equals... knowing... nothing... other... events?';
    const h = heuristicLeak(text, reference);
    expect(h.reason).toBe('inconclusive');
    expect(h.leaked).toBe(false);

    const mock = createMockProvider({ queue: { leakcheck: [{ leaked: true, reason: 'it lists the whole rule' }] } });
    const v = await detectLeak(text, reference, mock);
    expect(v).toMatchObject({ leaked: true, reason: 'model', detail: 'it lists the whole rule' });
    expect(mock.calls[0]!.role).toBe('leakcheck');
    expect(mock.calls[0]!.effort).toBe('low');

    const noProvider = await detectLeak(text, reference);
    expect(noProvider.leaked).toBe(false);
  });

  it('model verdict false stays false', async () => {
    const text = 'Independent... P(A)... times... P(B)... equals... knowing... nothing... other... events?';
    const mock = createMockProvider({ queue: { leakcheck: [{ leaked: false, reason: 'fragments only' }] } });
    const v = await detectLeak(text, reference, mock);
    expect(v).toMatchObject({ leaked: false, reason: 'none' });
  });
});

describe('checkTurnShape', () => {
  it('accepts one question within the word cap', () => {
    expect(checkTurnShape('Good start. What is P(A and B) for disjoint events?', 120)).toEqual({ ok: true, questions: 1, words: 9 });
  });
  it('rejects two questions', () => {
    const r = checkTurnShape('Why? And what is P(A)?', 120);
    expect(r.ok).toBe(false);
    expect(r.questions).toBe(2);
  });
  it('rejects too many words', () => {
    const r = checkTurnShape(Array(130).fill('word').join(' '), 120);
    expect(r.ok).toBe(false);
    expect(r.words).toBe(130);
  });
  it('ignores question marks inside code', () => {
    const r = checkTurnShape('Try this:\n```js\nconst x = a ? b : c;\nconst y = d ? e : f;\n```\nWhat does `x ? 1 : 0` give?', 120);
    expect(r.questions).toBe(1);
    expect(r.ok).toBe(true);
    expect(r.words).toBeLessThan(10);
  });
  it('treats "??" as one question', () => {
    expect(checkTurnShape('Really??', 10).questions).toBe(1);
  });
});
