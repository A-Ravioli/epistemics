import type { Concept, ConceptScript, Curriculum, Item, CourseGoals, CourseSettings } from '@epistemics/core';

const script: ConceptScript = {
  pretest: { prompt: 'p', isomorph: 'i', reference: 'r' },
  guidingQuestions: [{ question: 'q', expected: 'e' }],
  workedExample: { problem: 'wp', steps: ['s1'] },
  transfer: { prompt: 'tp', reference: 'tr' },
  hints: ['h1', 'h2', 'h3'],
};

function item(id: string, conceptId: string, type: Item['type'] = 'recall'): Item {
  return {
    id, conceptId, type, bloom: 'remember', prompt: `prompt ${id}`,
    reference: { answer: `answer ${id}` }, rubric: [], spans: [{ chunkId: 'chunk-1', quote: 'q' }],
    generatorVersion: 'hand-authored', hash: `hash-${id}`,
  };
}

function concept(id: string, ordinal: number, itemIds: string[]): Concept {
  return {
    id, ordinal, name: `Concept ${id}`, definition: `def ${id}`,
    objectives: [{ id: `${id}-o1`, bloom: 'understand', text: 'obj' }],
    misconceptions: [{ tag: 'mc-1', description: 'd', remedy: 'r' }],
    examples: [{ title: 't', body: 'b' }], spans: [], script,
    items: itemIds.map((i) => item(i, id)),
  };
}

export function makeCurriculum(version = 1): Curriculum {
  return {
    manifest: {
      id: 'curr-1', version, title: 'Intro Probability', subject: 'math', description: 'd', level: 'intro',
      contentHash: `ch-${version}`, generator: { name: 'test', version: '1' }, createdAt: 1_700_000_000_000,
    },
    units: [{
      id: 'u1', ordinal: 1, title: 'Unit 1', summary: 's',
      lessons: [
        { id: 'l1', ordinal: 1, title: 'Lesson 1', concepts: [concept('c1', 1, ['i1', 'i2']), concept('c2', 2, ['i3'])] },
        { id: 'l2', ordinal: 2, title: 'Lesson 2', concepts: [concept('c3', 3, ['i4', 'i5', 'i6'])] },
      ],
    }],
    edges: [
      { from: 'c1', to: 'c2', kind: 'prereq', justification: 'j', confidence: 0.9 },
      { from: 'c3', to: 'c1', kind: 'encompasses', weight: 0.3 },
    ],
    sources: [{ id: 'src-1', title: 'Book', kind: 'pdf', hash: 'sh' }],
  };
}

export const goals: CourseGoals = { purpose: 'understand', weeklyMinutes: 120 };
export const settings: CourseSettings = { desiredRetention: 0.9, reviewsPerDay: 120, maxNewItemsPerDay: 40, easyDays: [], dayStartHour: 4, timezone: 'UTC' };
