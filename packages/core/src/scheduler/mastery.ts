/**
 * Concept-level layer above per-item FSRS (DESIGN §5.5).
 *
 *   retention(c) = mean over items i∈c of R_i(now)
 *   mastery(c)   = retention(c) × min(1, successful_sessions(c)/3)
 *   available(c) = ∀ p ∈ prereq(c): mastery(p) ≥ 0.7
 *   mastered(c)  = mastery(c) ≥ 0.85 && unassisted_pass_rate(c) ≥ 0.8
 */
import type { Card, ConceptEdge, ConceptState, Curriculum, Lesson, Rating } from '../types.js';

export const AVAILABILITY_THRESHOLD = 0.7;
export const MASTERY_THRESHOLD = 0.85;
export const UNASSISTED_PASS_THRESHOLD = 0.8;
export const SESSIONS_FOR_FULL_MASTERY = 3;
export const MAX_RECENT_MISCONCEPTIONS = 5;

/** Mean retrievability over a concept's non-suspended cards. New cards count as 0. Empty → 0. */
export function conceptRetention(cards: Card[], now: number, retrievability: (card: Card, now: number) => number): number {
  const active = cards.filter((c) => !c.suspended);
  if (active.length === 0) return 0;
  let sum = 0;
  for (const c of active) sum += retrievability(c, now);
  return sum / active.length;
}

export function conceptMastery(retention: number, successfulSessions: number): number {
  const r = Math.min(1, Math.max(0, retention));
  return r * Math.min(1, Math.max(0, successfulSessions) / SESSIONS_FOR_FULL_MASTERY);
}

/** Ids of direct prerequisites of `conceptId` (edges `from → to` of kind prereq where `to` is the concept). */
export function prerequisitesOf(conceptId: string, edges: ConceptEdge[]): string[] {
  return edges.filter((e) => e.kind === 'prereq' && e.to === conceptId).map((e) => e.from);
}

export function isAvailable(
  conceptId: string,
  edges: ConceptEdge[],
  masteryById: Map<string, number>,
  threshold: number = AVAILABILITY_THRESHOLD,
): boolean {
  return prerequisitesOf(conceptId, edges).every((p) => (masteryById.get(p) ?? 0) >= threshold);
}

export function isMastered(mastery: number, unassistedPassRate: number): boolean {
  return mastery >= MASTERY_THRESHOLD && unassistedPassRate >= UNASSISTED_PASS_THRESHOLD;
}

export function unassistedPassRate(state: Pick<ConceptState, 'unassistedPass' | 'unassistedN'>): number {
  return state.unassistedN === 0 ? 0 : state.unassistedPass / state.unassistedN;
}

export function assistedPassRate(state: Pick<ConceptState, 'assistedPass' | 'assistedN'>): number {
  return state.assistedN === 0 ? 0 : state.assistedPass / state.assistedN;
}

export interface ConceptReceipt {
  rating: Rating;
  assisted: boolean;
  misconceptionTags: string[];
  /** Course-local study day "YYYY-MM-DD" (see time.ts `studyDay`). */
  day: string;
  /** Epoch ms of the receipt; sets `updatedAt` when given. */
  at?: number;
}

/**
 * Fold one receipt into a concept's state. Pure; returns a new object.
 *  - pass counters split by assisted/unassisted (DESIGN §6.5); success = rating ≥ Good.
 *  - `successfulSessions` increments at most once per distinct study day, unassisted successes only.
 *  - `misconceptions` keeps the 5 most recent tags, most recent first, de-duplicated.
 *  - `mastery` is NOT recomputed here (it needs retrievability); call `conceptMastery` afterwards.
 */
export function updateConceptStateAfterReceipt(state: ConceptState, receipt: ConceptReceipt): ConceptState {
  const success = receipt.rating >= 3;
  const next: ConceptState = { ...state, misconceptions: [...state.misconceptions] };

  if (receipt.assisted) {
    next.assistedN += 1;
    if (success) next.assistedPass += 1;
  } else {
    next.unassistedN += 1;
    if (success) next.unassistedPass += 1;
    if (success && receipt.day > (state.lastSuccessDay ?? '')) {
      next.successfulSessions += 1;
      next.lastSuccessDay = receipt.day;
    }
  }

  if (receipt.misconceptionTags.length > 0) {
    const fresh = [...new Set(receipt.misconceptionTags)];
    const kept = state.misconceptions.filter((t) => !fresh.includes(t));
    next.misconceptions = [...fresh, ...kept].slice(0, MAX_RECENT_MISCONCEPTIONS);
  }

  if (receipt.at !== undefined) next.updatedAt = Math.max(state.updatedAt, receipt.at);
  return next;
}

/**
 * Kahn topological order over prerequisite edges restricted to `concepts`. Deterministic: among the
 * concepts whose prerequisites are all placed, the earliest in input order goes next.
 * Throws when the prerequisite graph has a cycle, naming the concepts involved.
 */
export function topologicalOrder(concepts: string[], edges: ConceptEdge[]): string[] {
  const ids = new Set(concepts);
  const index = new Map<string, number>();
  const indeg = new Map<string, number>();
  const out = new Map<string, string[]>();
  concepts.forEach((c, i) => {
    if (!index.has(c)) index.set(c, i);
    indeg.set(c, 0);
    out.set(c, []);
  });
  for (const e of edges) {
    // A self-loop (from === to) is left in: its node never reaches in-degree 0 and is reported as a cycle.
    if (e.kind !== 'prereq' || !ids.has(e.from) || !ids.has(e.to)) continue;
    out.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const ready = new Set<string>([...indeg].filter(([, n]) => n === 0).map(([c]) => c));
  const order: string[] = [];
  const done = new Set<string>();
  while (ready.size > 0) {
    let c: string | undefined;
    for (const cand of ready) if (c === undefined || index.get(cand)! < index.get(c)!) c = cand;
    ready.delete(c!);
    done.add(c!);
    order.push(c!);
    for (const d of out.get(c!)!) {
      const n = indeg.get(d)! - 1;
      indeg.set(d, n);
      if (n === 0) ready.add(d);
    }
  }
  if (order.length !== ids.size) {
    const stuck = concepts.filter((c) => !done.has(c));
    throw new Error(`Prerequisite cycle detected among concepts: ${stuck.join(', ')}`);
  }
  return order;
}

/**
 * First lesson (units then lessons by ordinal) that is not completed and whose concepts are all
 * available. Prerequisites that live inside the same lesson are ignored, since a lesson teaches its
 * own concepts in order and they cannot have mastery before it is taught.
 */
export function nextAvailableLesson(
  curriculum: Curriculum,
  masteryById: Map<string, number>,
  completedLessonIds: Set<string>,
  threshold: number = AVAILABILITY_THRESHOLD,
): Lesson | null {
  const units = [...curriculum.units].sort((a, b) => a.ordinal - b.ordinal);
  for (const unit of units) {
    const lessons = [...unit.lessons].sort((a, b) => a.ordinal - b.ordinal);
    for (const lesson of lessons) {
      if (completedLessonIds.has(lesson.id)) continue;
      const own = new Set(lesson.concepts.map((c) => c.id));
      const external = curriculum.edges.filter((e) => !(own.has(e.from) && own.has(e.to)));
      const ok = lesson.concepts.every((c) => isAvailable(c.id, external, masteryById, threshold));
      if (ok) return lesson;
    }
  }
  return null;
}
