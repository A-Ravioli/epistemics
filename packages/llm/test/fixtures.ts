import type { Concept, Lesson } from '@epistemics/core';

export const PRETEST_REFERENCE = 'Two events are independent when P(A and B) equals P(A) times P(B), so knowing one tells you nothing about the other.';
export const TRANSFER_REFERENCE = 'Disjoint events with nonzero probability are never independent because P(A and B) is zero while P(A)P(B) is positive.';
export const ITEM_REFERENCE = 'Independence means P(A|B) = P(A); the occurrence of B does not change the probability of A.';

export function makeConcept(over: Partial<Concept> = {}): Concept {
  return {
    id: 'c-indep',
    ordinal: 1,
    name: 'Independent events',
    definition: 'Two events are independent when the occurrence of one does not change the probability of the other.',
    objectives: [
      { id: 'O1', bloom: 'understand', text: 'State the multiplication rule for independent events in your own words.' },
      { id: 'O2', bloom: 'apply', text: 'Decide whether two given events are independent from their probabilities.' },
    ],
    misconceptions: [
      { tag: 'conflates-independent-and-disjoint', description: 'Believes disjoint (mutually exclusive) events are independent.', remedy: 'Ask what P(A and B) is for disjoint events and compare with P(A)P(B).' },
    ],
    examples: [{ title: 'Two coin flips', body: 'The first flip landing heads does not change the chance of heads on the second flip.', domain: 'games' }],
    spans: [{ chunkId: 'ch1', quote: 'Events A and B are independent if P(A ∩ B) = P(A)P(B).', page: 42, heading: 'Independence' }],
    script: {
      pretest: { prompt: 'Is drawing a red card and drawing a king from one deck independent?', isomorph: 'Is rolling a 6 and rolling an even number independent?', reference: PRETEST_REFERENCE },
      guidingQuestions: [
        { question: 'What does it mean for one event to give you information about another?', expected: 'that knowing one changes the probability of the other', probesMisconception: 'conflates-independent-and-disjoint' },
        { question: 'If A and B cannot both happen, what is P(A and B)?', expected: 'zero' },
      ],
      workedExample: { problem: 'Two fair dice: is "first die is 3" independent of "sum is 7"?', steps: ['P(first is 3) = 1/6', 'P(sum is 7) = 6/36 = 1/6', 'P(both) = 1/36 = (1/6)(1/6), so yes'] },
      transfer: { prompt: 'Can two disjoint events with nonzero probability be independent?', reference: TRANSFER_REFERENCE },
      hints: ['Think about what knowing one event does to the odds of the other.', 'Compare P(A and B) with the product P(A)P(B).', 'For the deck: P(red) = 1/2, P(king) = 4/52. Compute P(red king) and compare with the product; what do you notice?'],
    },
    items: [
      {
        id: 'i1', conceptId: 'c-indep', type: 'explain', bloom: 'understand',
        prompt: 'Explain what it means for two events to be independent.',
        reference: { answer: ITEM_REFERENCE, exact: undefined, notes: 'Accept the multiplication rule or the conditional form.' },
        rubric: [
          { id: 'c1', text: 'States that independence means one event does not change the probability of the other.' },
          { id: 'c2', text: 'Gives the multiplication rule or the conditional-probability form.' },
        ],
        spans: [], generatorVersion: 'hand-authored', hash: 'h1',
      },
    ],
    ...over,
  };
}

export function makeLesson(): Lesson {
  const second = makeConcept({
    id: 'c-cond', ordinal: 2, name: 'Conditional probability',
    definition: 'The probability of A given that B has occurred, P(A|B) = P(A and B) / P(B).',
    script: {
      pretest: { prompt: 'What is P(A|B)?', isomorph: 'What is P(B|A)?', reference: 'P(A|B) is P(A and B) divided by P(B), the share of B-outcomes that are also A-outcomes.' },
      guidingQuestions: [{ question: 'What happens to the sample space when we learn B occurred?', expected: 'it shrinks to B' }],
      workedExample: { problem: 'P(king | face card)', steps: ['P(king and face) = 4/52', 'P(face) = 12/52', 'ratio = 1/3'] },
      transfer: { prompt: 'Why is P(A|B) undefined when P(B) = 0?', reference: 'Because the definition divides by P(B) and division by zero is undefined; there is no restricted sample space to condition on.' },
      hints: ['Restrict the sample space.', 'Divide the joint by the marginal.', 'P(king and face) = 4/52 and P(face) = 12/52; take the ratio and simplify.'],
    },
    items: [],
  });
  return { id: 'L1', ordinal: 1, title: 'Independence and conditioning', summary: 'When does one event tell you about another?', concepts: [makeConcept(), second] };
}
