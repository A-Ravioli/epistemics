/** Small curriculum fixture: 2 units, 3 lessons, 8 concepts with scripts and a few items. */
import type { Bloom, Concept, Curriculum, GradeResult, Item, ItemType, Lesson, ObserverResult, Unit } from '../../src/types.js';

function item(conceptId: string, n: number, type: ItemType, bloom: Bloom): Item {
  return {
    id: `${conceptId}-i${n}`,
    conceptId,
    type,
    bloom,
    prompt: `${type} prompt ${n} for ${conceptId}`,
    reference: { answer: `reference ${n} for ${conceptId}` },
    rubric: [
      { id: 'c1', text: 'states the key idea' },
      { id: 'c2', text: 'gives a correct justification' },
    ],
    spans: [],
    generatorVersion: 'hand-authored',
    hash: `hash-${conceptId}-${n}`,
  };
}

export function concept(id: string, ordinal: number, name: string, items: Item[] = []): Concept {
  return {
    id,
    ordinal,
    name,
    definition: `${name} is the fixture concept ${id}.`,
    objectives: [
      { id: `${id}-o1`, bloom: 'understand', text: `Explain ${name}` },
      { id: `${id}-o2`, bloom: 'apply', text: `Apply ${name}` },
    ],
    misconceptions: [
      { tag: `${id}-mc-a`, description: `Believes the wrong thing A about ${name}`, remedy: `Ask about the counterexample A for ${name}` },
      { tag: `${id}-mc-b`, description: `Believes the wrong thing B about ${name}`, remedy: `Ask about the counterexample B for ${name}` },
    ],
    examples: [{ title: `Example of ${name}`, body: `Body of the example of ${name}.` }],
    spans: [],
    script: {
      pretest: { prompt: `PRETEST(${id}): what is ${name}?`, isomorph: `ISOMORPH(${id}): restate ${name} in a new setting.`, reference: `REFERENCE(${id})` },
      guidingQuestions: [
        { question: `GQ1(${id})`, expected: `expected 1 for ${id}` },
        { question: `GQ2(${id})`, expected: `expected 2 for ${id}`, probesMisconception: `${id}-mc-a` },
        { question: `GQ3(${id})`, expected: `expected 3 for ${id}` },
      ],
      workedExample: { problem: `WORKED(${id})`, steps: [`step one of ${id}`, `step two of ${id}`, `step three of ${id}`] },
      transfer: { prompt: `TRANSFER(${id}): apply ${name} to a new domain.`, reference: `TRANSFER-REFERENCE(${id})` },
      hints: [`HINT1(${id})`, `HINT2(${id})`, `HINT3(${id}) partial worked example`],
    },
    items,
  };
}

// Unit 1: lessons L1 (c1, c2, c3) and L2 (c4, c5). Unit 2: lesson L3 (c6, c7, c8).
export const c1 = concept('c1', 0, 'Alpha', [item('c1', 1, 'explain', 'understand'), item('c1', 2, 'apply', 'apply'), item('c1', 3, 'recall', 'remember'), item('c1', 4, 'teachback', 'understand')]);
export const c2 = concept('c2', 1, 'Beta', [item('c2', 1, 'apply', 'apply'), item('c2', 2, 'cloze', 'remember'), item('c2', 3, 'discriminate', 'analyze')]);
export const c3 = concept('c3', 2, 'Gamma', [item('c3', 1, 'explain', 'understand'), item('c3', 2, 'discriminate', 'analyze')]);
export const c4 = concept('c4', 0, 'Delta', [item('c4', 1, 'apply', 'apply'), item('c4', 2, 'explain', 'understand')]);
export const c5 = concept('c5', 1, 'Epsilon', [item('c5', 1, 'discriminate', 'analyze'), item('c5', 2, 'recall', 'remember')]);
export const c6 = concept('c6', 0, 'Zeta', [item('c6', 1, 'apply', 'apply'), item('c6', 2, 'explain', 'understand'), item('c6', 3, 'map', 'analyze')]);
export const c7 = concept('c7', 1, 'Eta', [item('c7', 1, 'explain', 'understand'), item('c7', 2, 'apply', 'apply')]);
export const c8 = concept('c8', 2, 'Theta', [item('c8', 1, 'apply', 'apply'), item('c8', 2, 'discriminate', 'analyze'), item('c8', 3, 'predict', 'understand')]);

export const lesson1: Lesson = { id: 'L1', ordinal: 0, title: 'Lesson One', concepts: [c1, c2, c3] };
export const lesson2: Lesson = { id: 'L2', ordinal: 1, title: 'Lesson Two', concepts: [c4, c5] };
export const lesson3: Lesson = { id: 'L3', ordinal: 0, title: 'Lesson Three', concepts: [c6, c7, c8] };

export const unit1: Unit = { id: 'U1', ordinal: 0, title: 'Unit One', summary: 'First unit', lessons: [lesson1, lesson2] };
export const unit2: Unit = { id: 'U2', ordinal: 1, title: 'Unit Two', summary: 'Second unit', lessons: [lesson3] };

/**
 * Prerequisite DAG (depth in brackets):
 *   c1[0] → c2[1] → c3[2] → c4[3] → c6[4] → c7[5] → c8[6]
 *   c1[0] → c5[1]
 */
export const curriculum: Curriculum = {
  manifest: {
    id: 'fixture',
    version: 1,
    title: 'Fixture',
    subject: 'testing',
    description: 'fixture curriculum',
    level: 'intro',
    contentHash: 'fixture-hash',
    generator: { name: 'hand', version: '1' },
    createdAt: 0,
  },
  units: [unit1, unit2],
  edges: [
    { from: 'c1', to: 'c2', kind: 'prereq' },
    { from: 'c2', to: 'c3', kind: 'prereq' },
    { from: 'c3', to: 'c4', kind: 'prereq' },
    { from: 'c4', to: 'c6', kind: 'prereq' },
    { from: 'c6', to: 'c7', kind: 'prereq' },
    { from: 'c7', to: 'c8', kind: 'prereq' },
    { from: 'c1', to: 'c5', kind: 'prereq' },
    { from: 'c6', to: 'c1', kind: 'encompasses', weight: 0.3 },
  ],
  sources: [],
};

/** A two-concept lesson used by most lesson-reducer tests. */
export const shortLesson: Lesson = { id: 'LS', ordinal: 0, title: 'Short Lesson', concepts: [c1, c2] };

export function observer(overrides: Partial<ObserverResult> = {}): ObserverResult {
  return {
    attemptMade: true,
    gaveUp: false,
    offTopic: false,
    objectiveProgress: [],
    misconceptionTags: [],
    keyIdeaStated: false,
    priorKnowledgeElicited: false,
    stuck: false,
    unsourcedClaims: [],
    ...overrides,
  };
}

export function grade(score: number, overrides: Partial<GradeResult> = {}): GradeResult {
  return {
    criteria: [{ id: 'c1', met: score >= 0.5, evidence: 'quoted' }],
    score,
    misconceptionTags: [],
    feedback: `feedback for score ${score}`,
    confidence: 0.9,
    ...overrides,
  };
}

/** Deterministic LCG for tests. */
export function seededRng(seed = 42): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
