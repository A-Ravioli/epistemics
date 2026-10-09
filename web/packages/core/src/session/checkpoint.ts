/**
 * Unit checkpoint (DESIGN §3.5): composition, a minimal reducer, and the
 * remediation mini-lesson plan for concepts that fail it.
 */
import type { Bloom, Concept, Confidence, GradeResult, Item, ItemType, Lesson, Rating, Scaffolding, Unit } from '../types.js';
import { createLessonState, REMEDIATION_PHASE_PLAN, type LessonState } from './lesson.js';

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export const CHECKPOINT_DEFAULT_SIZE = 12;
export const CHECKPOINT_UNIT_SHARE = 0.7;
export const CHECKPOINT_PASS_THRESHOLD = 0.8;

/** Item types that are never used in a checkpoint (self-graded or multi-turn). */
export const CHECKPOINT_EXCLUDED_TYPES: readonly ItemType[] = ['recall', 'cloze', 'teachback'];

export interface ComposeCheckpointInput {
  unit: Unit;
  previousUnits: Unit[];
  conceptMastery: Map<string, number>;
  size?: number;
  /** Uniform random in [0, 1). Injected for determinism. */
  rng: () => number;
}

function unitItems(unit: Unit): Item[] {
  const out: Item[] = [];
  for (const lesson of unit.lessons) for (const concept of lesson.concepts) for (const item of concept.items) out.push(item);
  return out;
}

function eligible(item: Item): boolean {
  return !CHECKPOINT_EXCLUDED_TYPES.includes(item.type);
}

const UNIT_BLOOM_PREF: Record<Bloom, number> = { apply: 0, analyze: 0, understand: 1, remember: 2 };
const PREV_TYPE_PREF: Partial<Record<ItemType, number>> = { discriminate: 0, apply: 0 };

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i] as T;
    a[i] = a[j] as T;
    a[j] = t;
  }
  return a;
}

/** Group items by concept, each group sorted by a preference key (lower is better), ties shuffled. */
function groupByConcept(items: Item[], key: (i: Item) => number, rng: () => number): Map<string, Item[]> {
  const groups = new Map<string, Item[]>();
  for (const item of shuffle(items, rng)) {
    const g = groups.get(item.conceptId) ?? [];
    g.push(item);
    groups.set(item.conceptId, g);
  }
  for (const [id, g] of groups) groups.set(id, g.map((i, n) => ({ i, n })).sort((a, b) => key(a.i) - key(b.i) || a.n - b.n).map((x) => x.i));
  return groups;
}

/** Round-robin over concept groups (one item per concept first, then seconds, …) until `n` items. */
function roundRobin(groups: Map<string, Item[]>, conceptOrder: string[], n: number): Item[] {
  const out: Item[] = [];
  let depth = 0;
  let took = true;
  while (out.length < n && took) {
    took = false;
    for (const id of conceptOrder) {
      if (out.length >= n) break;
      const item = groups.get(id)?.[depth];
      if (item) {
        out.push(item);
        took = true;
      }
    }
    depth += 1;
  }
  return out;
}

/**
 * ~70% items from the unit just finished (apply/analyze preferred, one per concept where possible),
 * ~30% from earlier units (discriminate/apply preferred, lowest-mastery concepts first).
 */
export function composeCheckpoint(input: ComposeCheckpointInput): Item[] {
  const size = Math.max(1, Math.floor(input.size ?? CHECKPOINT_DEFAULT_SIZE));
  const rng = input.rng;
  const unitPool = unitItems(input.unit).filter(eligible);
  const prevPool = input.previousUnits.flatMap(unitItems).filter(eligible);

  let unitTarget = prevPool.length === 0 ? size : Math.round(size * CHECKPOINT_UNIT_SHARE);
  let prevTarget = size - unitTarget;

  const unitGroups = groupByConcept(unitPool, (i) => UNIT_BLOOM_PREF[i.bloom], rng);
  const unitOrder = shuffle([...unitGroups.keys()], rng);
  let fromUnit = roundRobin(unitGroups, unitOrder, unitTarget);

  const mastery = (id: string) => input.conceptMastery.get(id) ?? 0;
  const prevGroups = groupByConcept(prevPool, (i) => PREV_TYPE_PREF[i.type] ?? 1, rng);
  const prevOrder = shuffle([...prevGroups.keys()], rng).sort((a, b) => mastery(a) - mastery(b));
  let fromPrev = roundRobin(prevGroups, prevOrder, prevTarget);

  // Fill shortfalls from the other pool.
  if (fromUnit.length < unitTarget) {
    prevTarget += unitTarget - fromUnit.length;
    fromPrev = roundRobin(prevGroups, prevOrder, prevTarget);
  } else if (fromPrev.length < prevTarget) {
    unitTarget += prevTarget - fromPrev.length;
    fromUnit = roundRobin(unitGroups, unitOrder, unitTarget);
  }

  // Interleave so earlier-unit items are spread through the checkpoint.
  return shuffle([...fromUnit, ...fromPrev], rng);
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export interface CheckpointState {
  sessionId: string;
  courseId: string;
  unitId: string;
  items: { itemId: string; conceptId: string }[];
  index: number;
  answers: Record<string, { answer: string; confidence: Confidence }>;
  grades: Record<string, { score: number; rating: Rating }>;
  started: boolean;
  done: boolean;
}

export type CheckpointEvent =
  | { type: 'start' }
  | { type: 'answer_submitted'; itemId: string; answer: string; confidence: Confidence }
  | { type: 'grade'; itemId: string; grade: GradeResult; rating: Rating }
  | { type: 'finish' };

export interface CheckpointResult {
  perConcept: Record<string, { passed: boolean; score: number }>;
  reopen: string[];
}

export type CheckpointEffect =
  | { type: 'present_item'; itemId: string; conceptId: string; index: number; total: number }
  | { type: 'grade_item'; itemKind: 'checkpoint'; itemId: string; conceptId: string; answer: string; confidence: Confidence; assisted: false; rubricSource: 'item' }
  | { type: 'record_receipt'; itemKind: 'checkpoint'; itemId: string; conceptId: string; answer: string; confidence: Confidence; grade: GradeResult; rating: Rating; assisted: false }
  | ({ type: 'checkpoint_complete' } & CheckpointResult);

export interface CheckpointStep {
  state: CheckpointState;
  effects: CheckpointEffect[];
}

export function createCheckpointState(input: { sessionId: string; courseId: string; unitId: string; items: Item[] }): CheckpointState {
  return {
    sessionId: input.sessionId,
    courseId: input.courseId,
    unitId: input.unitId,
    items: input.items.map((i) => ({ itemId: i.id, conceptId: i.conceptId })),
    index: 0,
    answers: {},
    grades: {},
    started: false,
    done: false,
  };
}

/** Per-concept mean score over the checkpoint's items (ungraded items count as 0). */
export function scoreCheckpoint(state: CheckpointState): CheckpointResult {
  const sums = new Map<string, { total: number; n: number }>();
  for (const { itemId, conceptId } of state.items) {
    const acc = sums.get(conceptId) ?? { total: 0, n: 0 };
    acc.total += state.grades[itemId]?.score ?? 0;
    acc.n += 1;
    sums.set(conceptId, acc);
  }
  const perConcept: Record<string, { passed: boolean; score: number }> = {};
  const reopen: string[] = [];
  for (const [conceptId, { total, n }] of [...sums].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const score = n === 0 ? 0 : total / n;
    const passed = score >= CHECKPOINT_PASS_THRESHOLD;
    perConcept[conceptId] = { passed, score };
    if (!passed) reopen.push(conceptId);
  }
  return { perConcept, reopen };
}

function presentEffect(s: CheckpointState): CheckpointEffect | undefined {
  const cur = s.items[s.index];
  return cur ? { type: 'present_item', itemId: cur.itemId, conceptId: cur.conceptId, index: s.index, total: s.items.length } : undefined;
}

function complete(s: CheckpointState, effects: CheckpointEffect[]): void {
  s.done = true;
  effects.push({ type: 'checkpoint_complete', ...scoreCheckpoint(s) });
}

export function reduceCheckpoint(state: CheckpointState, event: CheckpointEvent): CheckpointStep {
  if (state.done) return { state, effects: [] };
  const s: CheckpointState = structuredClone(state);
  const effects: CheckpointEffect[] = [];

  switch (event.type) {
    case 'start': {
      if (s.started) return { state: s, effects: [] };
      s.started = true;
      const p = presentEffect(s);
      if (p) effects.push(p);
      else complete(s, effects);
      return { state: s, effects };
    }
    case 'answer_submitted': {
      const cur = s.items[s.index];
      if (!s.started || !cur || cur.itemId !== event.itemId || s.answers[event.itemId]) return { state: s, effects: [] };
      s.answers[event.itemId] = { answer: event.answer, confidence: event.confidence };
      effects.push({
        type: 'grade_item',
        itemKind: 'checkpoint',
        itemId: cur.itemId,
        conceptId: cur.conceptId,
        answer: event.answer,
        confidence: event.confidence,
        assisted: false,
        rubricSource: 'item',
      });
      return { state: s, effects };
    }
    case 'grade': {
      const entry = s.items.find((i) => i.itemId === event.itemId);
      const answer = s.answers[event.itemId];
      if (!entry || !answer || s.grades[event.itemId]) return { state: s, effects: [] };
      s.grades[event.itemId] = { score: event.grade.score, rating: event.rating };
      effects.push({
        type: 'record_receipt',
        itemKind: 'checkpoint',
        itemId: entry.itemId,
        conceptId: entry.conceptId,
        answer: answer.answer,
        confidence: answer.confidence,
        grade: event.grade,
        rating: event.rating,
        assisted: false,
      });
      if (s.items[s.index]?.itemId === event.itemId) s.index += 1;
      const p = presentEffect(s);
      if (p) effects.push(p);
      else if (Object.keys(s.grades).length >= s.items.length) complete(s, effects);
      return { state: s, effects };
    }
    case 'finish': {
      complete(s, effects);
      return { state: s, effects };
    }
  }
}

// ---------------------------------------------------------------------------
// Remediation mini-lesson
// ---------------------------------------------------------------------------

export interface RemediationPlan {
  /** Synthetic single-concept lesson to pass to `reduceLesson`. */
  lesson: Lesson;
  /** Lesson state restricted to DEVELOP → CONSOLIDATE → CHECK, no summary/JOL. */
  state: LessonState;
}

export function composeRemediation(
  concept: Concept,
  input: { sessionId: string; courseId: string; scaffolding?: Scaffolding; learnerMisconceptions?: string[] },
): RemediationPlan {
  const lesson: Lesson = { id: `remediation:${concept.id}`, ordinal: 0, title: `Remediation: ${concept.name}`, concepts: [concept] };
  const state = createLessonState({
    sessionId: input.sessionId,
    courseId: input.courseId,
    lesson,
    scaffolding: input.scaffolding ?? 'developing',
    learnerMisconceptions: input.learnerMisconceptions ? { [concept.id]: input.learnerMisconceptions } : undefined,
    phases: REMEDIATION_PHASE_PLAN,
    wrap: false,
  });
  return { lesson, state };
}
