/**
 * Concept-graph validation and analysis (pure functions, no LLM).
 *
 * - `validateGraph`: drops self/unknown/duplicate edges, clamps encompassing
 *   weights to ≤ 0.5, breaks cycles by dropping the lowest-confidence edge of
 *   each cycle, and returns a topological order that follows the concept
 *   (source chapter) order wherever the graph allows.
 * - `findConfusablePairs`: pairs that share a parent (a common prerequisite or
 *   a common encompassing concept, or the same lesson) or have very similar
 *   names/definitions. Used to seed `discriminate` items.
 */
import type { ConceptEdge } from '@epistemics/core';
import type { Embedder } from '@epistemics/ingest';
import { cosine, tokenize } from '@epistemics/ingest';

export interface GraphValidation {
  edges: ConceptEdge[];
  dropped: ConceptEdge[];
  /** Concept ids in a prerequisite-respecting order; ties follow `conceptIds` order. */
  order: string[];
}

const MAX_ENCOMPASS_WEIGHT = 0.5;

/**
 * @param conceptIds all concept ids in curriculum (teaching) order; used for unknown-id filtering and as the topological tie-breaker.
 */
export function validateGraph(conceptIds: string[], edges: ConceptEdge[]): GraphValidation {
  const known = new Map<string, number>();
  conceptIds.forEach((id, i) => known.set(id, i));
  const dropped: ConceptEdge[] = [];
  const seen = new Map<string, ConceptEdge>();

  for (const raw of edges) {
    const e: ConceptEdge = { ...raw };
    if (e.from === e.to || !known.has(e.from) || !known.has(e.to)) {
      dropped.push(e);
      continue;
    }
    if (e.kind === 'encompasses') {
      e.weight = Math.max(0, Math.min(MAX_ENCOMPASS_WEIGHT, e.weight ?? MAX_ENCOMPASS_WEIGHT));
    } else {
      delete e.weight;
    }
    if (e.confidence !== undefined) e.confidence = Math.max(0, Math.min(1, e.confidence));
    const key = `${e.kind}|${e.from}|${e.to}`;
    const prev = seen.get(key);
    if (prev) {
      // Keep the more confident duplicate.
      if ((e.confidence ?? 0) > (prev.confidence ?? 0)) {
        dropped.push(prev);
        seen.set(key, e);
      } else {
        dropped.push(e);
      }
      continue;
    }
    seen.set(key, e);
  }

  let kept = [...seen.values()];
  for (const kind of ['prereq', 'encompasses'] as const) {
    const ofKind = kept.filter((e) => e.kind === kind);
    const { edges: acyclic, dropped: cyc } = breakCycles(ofKind);
    dropped.push(...cyc);
    const cycSet = new Set(cyc);
    kept = kept.filter((e) => e.kind !== kind || !cycSet.has(e)).filter((e) => e.kind !== kind || acyclic.includes(e));
  }

  const order = topoOrder(conceptIds, kept.filter((e) => e.kind === 'prereq'));
  return { edges: kept, dropped, order };
}

/** Repeatedly find a cycle and drop its lowest-confidence edge until the graph is acyclic. */
export function breakCycles(edges: ConceptEdge[]): { edges: ConceptEdge[]; dropped: ConceptEdge[] } {
  const live = [...edges];
  const dropped: ConceptEdge[] = [];
  for (;;) {
    const cycle = findCycle(live);
    if (!cycle) break;
    let victim = cycle[0]!;
    for (const e of cycle) {
      const c = e.confidence ?? 0.5;
      const v = victim.confidence ?? 0.5;
      if (c < v || (c === v && live.indexOf(e) > live.indexOf(victim))) victim = e;
    }
    live.splice(live.indexOf(victim), 1);
    dropped.push(victim);
  }
  return { edges: live, dropped };
}

/** Returns the edges of one cycle (in traversal order) or null when acyclic. */
function findCycle(edges: ConceptEdge[]): ConceptEdge[] | null {
  const out = new Map<string, ConceptEdge[]>();
  for (const e of edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from)!.push(e);
  }
  const state = new Map<string, 1 | 2>(); // 1 visiting, 2 done
  const path: ConceptEdge[] = [];
  const dfs = (node: string): ConceptEdge[] | null => {
    state.set(node, 1);
    for (const e of out.get(node) ?? []) {
      const s = state.get(e.to);
      if (s === 2) continue;
      path.push(e);
      if (s === 1) {
        const start = path.findIndex((p) => p.from === e.to);
        return path.slice(start);
      }
      const found = dfs(e.to);
      if (found) return found;
      path.pop();
    }
    state.set(node, 2);
    return null;
  };
  for (const node of out.keys()) {
    if (!state.has(node)) {
      const found = dfs(node);
      if (found) return found;
    }
  }
  return null;
}

/** Kahn's algorithm; among the ready nodes always pick the earliest in `conceptIds`. Assumes an acyclic edge set. */
export function topoOrder(conceptIds: string[], prereqEdges: ConceptEdge[]): string[] {
  const rank = new Map<string, number>();
  conceptIds.forEach((id, i) => rank.set(id, i));
  const indeg = new Map<string, number>(conceptIds.map((id) => [id, 0]));
  const out = new Map<string, string[]>();
  for (const e of prereqEdges) {
    if (!rank.has(e.from) || !rank.has(e.to)) continue;
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from)!.push(e.to);
  }
  const ready = conceptIds.filter((id) => (indeg.get(id) ?? 0) === 0);
  const order: string[] = [];
  const done = new Set<string>();
  while (ready.length) {
    ready.sort((a, b) => rank.get(a)! - rank.get(b)!);
    const id = ready.shift()!;
    if (done.has(id)) continue;
    done.add(id);
    order.push(id);
    for (const to of out.get(id) ?? []) {
      const d = (indeg.get(to) ?? 1) - 1;
      indeg.set(to, d);
      if (d === 0) ready.push(to);
    }
  }
  // Any leftovers (only possible if the input had a cycle) keep their original order.
  for (const id of conceptIds) if (!done.has(id)) order.push(id);
  return order;
}

// ---------------------------------------------------------------------------
// Confusable pairs
// ---------------------------------------------------------------------------

export interface ConfusableCandidate {
  id: string;
  name: string;
  definition: string;
  /** Lesson (or any grouping) id; two concepts in the same lesson count as sharing a parent. */
  lessonId?: string;
}

export interface ConfusablePair {
  a: string;
  b: string;
  reason: 'shared-parent' | 'similar';
  score: number;
}

export interface ConfusableOptions {
  /** Cosine threshold when an embedder is supplied (default 0.8). */
  similarity?: number;
  /** Token-Jaccard threshold on name+definition when no embedder is supplied (default 0.45). */
  lexical?: number;
  /** Maximum pairs to return (default: unlimited). */
  limit?: number;
}

export async function findConfusablePairs(
  concepts: ConfusableCandidate[],
  edges: ConceptEdge[] = [],
  embedder?: Embedder,
  opts: ConfusableOptions = {},
): Promise<ConfusablePair[]> {
  const pairs = new Map<string, ConfusablePair>();
  const add = (a: string, b: string, reason: ConfusablePair['reason'], score: number) => {
    const [x, y] = a < b ? [a, b] : [b, a];
    const key = `${x}|${y}`;
    const prev = pairs.get(key);
    if (!prev || prev.score < score) pairs.set(key, { a: x, b: y, reason, score });
  };
  const ids = new Set(concepts.map((c) => c.id));

  // Shared parent: same prerequisite, same encompassing source, or same lesson.
  const children = new Map<string, string[]>();
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    const key = `${e.kind}:${e.from}`;
    if (!children.has(key)) children.set(key, []);
    children.get(key)!.push(e.to);
  }
  for (const c of concepts) {
    if (!c.lessonId) continue;
    const key = `lesson:${c.lessonId}`;
    if (!children.has(key)) children.set(key, []);
    children.get(key)!.push(c.id);
  }
  for (const group of children.values()) {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) add(group[i]!, group[j]!, 'shared-parent', 0.5);
  }

  // Similarity: embeddings when available, else token Jaccard.
  const texts = concepts.map((c) => `${c.name}. ${c.definition}`);
  if (embedder) {
    const threshold = opts.similarity ?? 0.8;
    const vecs = await embedder.embed(texts);
    for (let i = 0; i < concepts.length; i++) {
      for (let j = i + 1; j < concepts.length; j++) {
        const s = cosine(vecs[i]!, vecs[j]!);
        if (s >= threshold) add(concepts[i]!.id, concepts[j]!.id, 'similar', s);
      }
    }
  } else {
    const threshold = opts.lexical ?? 0.45;
    const sets = texts.map((t) => new Set(tokenize(t)));
    for (let i = 0; i < concepts.length; i++) {
      for (let j = i + 1; j < concepts.length; j++) {
        const s = jaccard(sets[i]!, sets[j]!);
        if (s >= threshold) add(concepts[i]!.id, concepts[j]!.id, 'similar', s);
      }
    }
  }

  const out = [...pairs.values()].sort((p, q) => q.score - p.score || p.a.localeCompare(q.a) || p.b.localeCompare(q.b));
  return opts.limit !== undefined ? out.slice(0, opts.limit) : out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}
