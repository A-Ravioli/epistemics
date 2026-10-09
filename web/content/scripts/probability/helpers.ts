/**
 * Small typed builders used by build-probability-pack.ts. Item hashes are left empty here and
 * filled in by content/scripts/hash-pack.ts, which is the single source of truth for hashing.
 */
import type { Bloom, Concept, ConceptScript, Example, Item, ItemType, Misconception } from '@epistemics/core';

export const r = String.raw;

export const GENERATOR_VERSION = 'hand-authored@1.0';

export type SelfGradedSpec = {
  type: 'recall' | 'cloze' | 'predict';
  prompt: string;
  answer: string;
  bloom?: Bloom;
  notes?: string;
  tags?: string[];
};

export type GradedSpec = {
  type: 'explain' | 'apply' | 'discriminate';
  prompt: string;
  answer: string;
  rubric: string[];
  exact?: string;
  bloom?: Bloom;
  notes?: string;
  tags?: string[];
};

export type ItemSpec = SelfGradedSpec | GradedSpec;

export interface ConceptSpec {
  id: string;
  name: string;
  definition: string;
  objectives: [Bloom, string][];
  misconceptions: Misconception[];
  examples: Example[];
  script: ConceptScript;
  /** Model answer + key idea for the per-concept teach-back item. */
  teach: { answer: string; keyIdea: string };
  items: ItemSpec[];
}

const DEFAULT_BLOOM: Record<ItemType, Bloom> = {
  recall: 'remember',
  cloze: 'remember',
  predict: 'understand',
  explain: 'understand',
  apply: 'apply',
  discriminate: 'analyze',
  map: 'analyze',
  teachback: 'understand',
};

function itemId(conceptId: string, n: number): string {
  return `${conceptId.replace(/^c-/, 'i-')}-${String(n).padStart(2, '0')}`;
}

function buildItem(conceptId: string, n: number, spec: ItemSpec): Item {
  const rubric = 'rubric' in spec ? spec.rubric.map((text, i) => ({ id: `c${i + 1}`, text })) : [];
  const reference: Item['reference'] = { answer: spec.answer };
  if ('exact' in spec && spec.exact !== undefined) reference.exact = spec.exact;
  if (spec.notes !== undefined) reference.notes = spec.notes;
  const item: Item = {
    id: itemId(conceptId, n),
    conceptId,
    type: spec.type,
    bloom: spec.bloom ?? DEFAULT_BLOOM[spec.type],
    prompt: spec.prompt,
    reference,
    rubric,
    spans: [],
    generatorVersion: GENERATOR_VERSION,
    hash: '',
  };
  if (spec.tags && spec.tags.length > 0) item.tags = spec.tags;
  return item;
}

function buildTeachback(spec: ConceptSpec, n: number): Item {
  const m = spec.misconceptions[0];
  const rubric = [
    { id: 'c1', text: `States the key idea correctly: ${spec.teach.keyIdea}` },
    { id: 'c2', text: 'Gives at least one correct, concrete example of their own (with numbers where the concept is quantitative).' },
    {
      id: 'c3',
      text: m
        ? `Anticipates or corrects the misconception '${m.tag}' (${m.description})`
        : 'Answers the student\'s follow-up question without introducing an error.',
    },
  ];
  return {
    id: itemId(spec.id, n),
    conceptId: spec.id,
    type: 'teachback',
    bloom: 'understand',
    prompt: `Teach this concept to a curious beginner: **${spec.name}**. Explain what it means in your own words, why it matters, and walk them through one example you invent yourself. Expect the student to ask questions and to voice a wrong belief at some point.`,
    reference: { answer: spec.teach.answer },
    rubric,
    spans: [],
    generatorVersion: GENERATOR_VERSION,
    hash: '',
  };
}

export function concept(ordinal: number, spec: ConceptSpec): Concept {
  const items = spec.items.map((s, i) => buildItem(spec.id, i + 1, s));
  items.push(buildTeachback(spec, spec.items.length + 1));
  return {
    id: spec.id,
    ordinal,
    name: spec.name,
    definition: spec.definition,
    objectives: spec.objectives.map(([bloom, text], i) => ({ id: `${spec.id}-o${i + 1}`, bloom, text })),
    misconceptions: spec.misconceptions,
    examples: spec.examples,
    spans: [],
    script: spec.script,
    items,
  };
}
