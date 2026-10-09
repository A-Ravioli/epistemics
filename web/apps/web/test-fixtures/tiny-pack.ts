/**
 * A tiny, deterministic curriculum used by unit tests and the Playwright e2e import flow. Reference
 * answers are worded so a learner who knows them can pass the mock grader (≥3 shared content words).
 */
import type { Curriculum } from '@epistemics/core';

export const TINY = {
  lessonId: 'tiny-l1',
  lesson2Id: 'tiny-l2',
  unitId: 'tiny-u1',
  concept1: 'tiny-c1',
  concept2: 'tiny-c2',
  explainItem: 'tiny-i1',
  recallItem: 'tiny-i2',
  applyItem: 'tiny-i3',
  recall2Item: 'tiny-i4',
  /** The concept definition the side panel must not show while the learner is being checked. */
  concept1Definition: 'The probability that an event does not happen equals one minus the probability that it happens',
  /** Answers a knowledgeable learner would give; each shares ≥3 content words with the reference. */
  answers: {
    pretest: 'The complement probability is one minus the probability of the event, so it is 0.7.',
    probe: 'I remember that the probabilities of all outcomes add up to one.',
    consolidate: 'An event and its complement are disjoint and together exhaust the sample space, so their probabilities sum to one.',
    transfer: 'The probability of at least one success is one minus the probability of no success at all, so subtract the all-fail probability from one.',
    check: 'One minus the probability of the event: the complement probability is 1 minus P(A), which gives 5/6.',
    summary: 'The complement rule says the probability that an event does not happen is one minus the probability that it does. It works because an event and its complement are disjoint and exhaust the sample space. It is useful for at-least-one problems.',
  },
} as const;

export function tinyPack(): Curriculum {
  return {
    manifest: {
      id: 'tiny-probability',
      version: 1,
      title: 'Tiny Probability (test pack)',
      subject: 'probability',
      description: 'Two concepts for tests: the complement rule and unions of disjoint events.',
      level: 'intro',
      contentHash: 'tiny-hash-1',
      generator: { name: 'hand-authored', version: '1.0' },
      createdAt: 1_750_000_000_000,
      licence: 'CC0',
    },
    units: [
      {
        id: TINY.unitId,
        ordinal: 1,
        title: 'Probability rules',
        summary: 'Complements and unions.',
        lessons: [
          {
            id: TINY.lessonId,
            ordinal: 1,
            title: 'The complement rule',
            summary: 'Why P(not A) = 1 − P(A).',
            concepts: [
              {
                id: TINY.concept1,
                ordinal: 1,
                name: 'Complement rule',
                definition: 'The probability that an event does not happen equals one minus the probability that it happens: P(not A) = 1 − P(A).',
                objectives: [
                  { id: 'o1', bloom: 'understand', text: 'State the complement rule and explain why the two probabilities sum to one.' },
                  { id: 'o2', bloom: 'apply', text: 'Use the complement to compute at-least-one probabilities.' },
                ],
                misconceptions: [
                  { tag: 'complement-is-half', description: 'Believes the complement of an event always has probability one half.', remedy: 'Ask for P(not six) on a fair die.' },
                ],
                examples: [{ title: 'Rain', body: 'If P(rain) = 0.3 then P(no rain) = 0.7.', domain: 'weather' }],
                spans: [],
                script: {
                  pretest: {
                    prompt: 'If the probability of rain tomorrow is 0.3, what is the probability that it does not rain? Say how you got it.',
                    isomorph: 'A fair die shows a six with probability 1/6. What is the probability that it does not show a six? Say how you got it.',
                    reference: 'One minus the probability of the event: the complement probability is 1 minus P(A), so 0.7 for rain and 5/6 for the die.',
                  },
                  guidingQuestions: [
                    { question: 'What must the probabilities of "rain" and "no rain" add up to, and why?', expected: 'They are the only two outcomes, so they sum to one.' },
                    { question: 'If they sum to one and one of them is 0.3, how do you get the other?', expected: 'Subtract from one: 1 − 0.3 = 0.7.' },
                  ],
                  workedExample: { problem: 'P(pass) = 0.8; find P(fail).', steps: ['Pass and fail are the only outcomes.', 'So P(pass) + P(fail) = 1.', 'P(fail) = 1 − 0.8 = 0.2.'] },
                  transfer: {
                    prompt: 'You roll a die three times. Explain how the complement helps you find the probability of at least one six, without computing the final number.',
                    reference: 'At least one success is the complement of no success at all, so subtract the probability of no six in all three rolls from one.',
                  },
                  hints: ['Think about all the possible outcomes together.', 'The two outcomes are the only ones, so their probabilities sum to one.', 'Write P(rain) + P(no rain) = 1 and fill in 0.3; solve for the missing term.'],
                },
                items: [
                  {
                    id: TINY.explainItem,
                    conceptId: TINY.concept1,
                    type: 'explain',
                    bloom: 'understand',
                    prompt: 'Explain why P(not A) = 1 − P(A) must hold for any event A.',
                    reference: { answer: 'The event and its complement are disjoint and together exhaust the sample space, so their probabilities sum to one; subtracting gives one minus P(A).' },
                    rubric: [
                      { id: 'c1', text: 'States that A and not-A are disjoint and exhaustive (cover the sample space).' },
                      { id: 'c2', text: 'Concludes that the probabilities sum to one and subtracts.' },
                    ],
                    spans: [],
                    generatorVersion: 'hand-authored',
                    hash: 'tiny-i1-hash',
                  },
                  {
                    id: TINY.recallItem,
                    conceptId: TINY.concept1,
                    type: 'recall',
                    bloom: 'remember',
                    prompt: 'Complete: P(not A) = ?',
                    reference: { answer: '1 − P(A)' },
                    rubric: [],
                    spans: [],
                    generatorVersion: 'hand-authored',
                    hash: 'tiny-i2-hash',
                  },
                ],
              },
            ],
          },
          {
            id: TINY.lesson2Id,
            ordinal: 2,
            title: 'Unions of disjoint events',
            concepts: [
              {
                id: TINY.concept2,
                ordinal: 1,
                name: 'Addition rule for disjoint events',
                definition: 'For disjoint events the probability of the union is the sum of the probabilities: P(A or B) = P(A) + P(B).',
                objectives: [{ id: 'o1', bloom: 'apply', text: 'Add probabilities of disjoint events to get the probability of their union.' }],
                misconceptions: [{ tag: 'adds-overlapping', description: 'Adds probabilities even when the events overlap.', remedy: 'Ask whether both events can happen at once.' }],
                examples: [],
                spans: [],
                script: {
                  pretest: { prompt: 'A die is rolled. What is P(1 or 2)?', isomorph: 'A die is rolled. What is P(5 or 6)?', reference: 'The events are disjoint, so add the probabilities: 1/6 + 1/6 = 1/3.' },
                  guidingQuestions: [{ question: 'Can the die show 1 and 2 at the same time?', expected: 'No, the events are disjoint.' }],
                  workedExample: { problem: 'P(red) = 0.2, P(blue) = 0.3, disjoint. Find P(red or blue).', steps: ['Disjoint, so add.', '0.2 + 0.3 = 0.5.'] },
                  transfer: { prompt: 'Two cards are drawn; why can you not simply add P(first is an ace) and P(second is an ace)?', reference: 'The events are not disjoint: both can be aces, so adding double-counts the overlap.' },
                  hints: ['Can both happen at once?', 'Disjoint events do not overlap, so their probabilities add.', 'Add 1/6 and 1/6 for the two faces.'],
                },
                items: [
                  {
                    id: TINY.applyItem,
                    conceptId: TINY.concept2,
                    type: 'apply',
                    bloom: 'apply',
                    prompt: 'P(A) = 0.25 and P(B) = 0.4 with A and B disjoint. Find P(A or B).',
                    reference: { answer: 'Disjoint events add: 0.25 + 0.4 = 0.65.', exact: '0.65' },
                    rubric: [{ id: 'c1', text: 'Adds the two probabilities because the events are disjoint.' }],
                    spans: [],
                    generatorVersion: 'hand-authored',
                    hash: 'tiny-i3-hash',
                  },
                  {
                    id: TINY.recall2Item,
                    conceptId: TINY.concept2,
                    type: 'recall',
                    bloom: 'remember',
                    prompt: 'For disjoint A and B, P(A or B) = ?',
                    reference: { answer: 'P(A) + P(B)' },
                    rubric: [],
                    spans: [],
                    generatorVersion: 'hand-authored',
                    hash: 'tiny-i4-hash',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    edges: [
      { from: TINY.concept1, to: TINY.concept2, kind: 'prereq', justification: 'Unions build on complements.', confidence: 0.9 },
      { from: TINY.concept2, to: TINY.concept1, kind: 'encompasses', weight: 0.3 },
    ],
    sources: [],
  };
}
