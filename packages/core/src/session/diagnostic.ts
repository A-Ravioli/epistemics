/**
 * Adaptive diagnostic placement over the prerequisite DAG (DESIGN §6.4).
 *
 * Depth of a concept = length of its longest prerequisite chain. Probing starts
 * at the median depth, moves deeper on a pass and shallower on a fail (binary
 * search over depth levels), and stops when the frontier is bracketed within
 * one level or after `DIAGNOSTIC_MAX_PROBES` probes.
 *
 * Pure functions over a serialisable state; the curriculum is only needed at
 * creation (the chosen probe item per concept is stored in the state).
 */
import type { Curriculum, Item } from '../types.js';

export const DIAGNOSTIC_MAX_PROBES = 25;

export interface DiagnosticState {
  /** Concept ids in curriculum order (unit → lesson → concept). */
  conceptIds: string[];
  depth: Record<string, number>;
  maxDepth: number;
  /** Chosen probe item per concept (prefers apply/explain). Concepts without items are absent. */
  probeItem: Record<string, string>;
  results: Record<string, boolean>;
  /** Highest depth with a pass so far; -1 before any pass. */
  lo: number;
  /** Lowest depth with a fail so far; maxDepth + 1 before any fail. */
  hi: number;
  probeDepth: number;
  probes: number;
  done: boolean;
}

export interface DiagnosticProbe {
  conceptId: string;
  itemId: string;
  depth: number;
}

export interface DiagnosticResult {
  knownConceptIds: string[];
  frontierDepth: number;
  probes: number;
}

/** Longest prerequisite chain per concept over `prereq` edges (cycles are broken by ignoring back-edges). */
export function conceptDepths(curriculum: Curriculum): Record<string, number> {
  const ids = allConceptIds(curriculum);
  const idSet = new Set(ids);
  const prereqs = new Map<string, string[]>();
  for (const id of ids) prereqs.set(id, []);
  for (const e of curriculum.edges) {
    if (e.kind !== 'prereq' || !idSet.has(e.from) || !idSet.has(e.to)) continue;
    prereqs.get(e.to)?.push(e.from);
  }
  const depth: Record<string, number> = {};
  const visiting = new Set<string>();
  const visit = (id: string): number => {
    const known = depth[id];
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);
    let d = 0;
    for (const p of prereqs.get(id) ?? []) d = Math.max(d, visit(p) + 1);
    visiting.delete(id);
    depth[id] = d;
    return d;
  };
  for (const id of ids) visit(id);
  return depth;
}

function allConceptIds(curriculum: Curriculum): string[] {
  const out: string[] = [];
  for (const u of curriculum.units) for (const l of u.lessons) for (const c of l.concepts) out.push(c.id);
  return out;
}

const PROBE_TYPE_PREF: Record<string, number> = { apply: 0, explain: 0, discriminate: 1, map: 1, predict: 2, recall: 3, cloze: 3, teachback: 4 };

function pickProbeItem(items: Item[]): Item | undefined {
  let best: Item | undefined;
  let bestKey = Infinity;
  for (const item of items) {
    const key = PROBE_TYPE_PREF[item.type] ?? 2;
    if (key < bestKey) {
      best = item;
      bestKey = key;
    }
  }
  return best;
}

export function createDiagnostic(curriculum: Curriculum): DiagnosticState {
  const depth = conceptDepths(curriculum);
  const conceptIds = allConceptIds(curriculum);
  const probeItem: Record<string, string> = {};
  for (const u of curriculum.units) {
    for (const l of u.lessons) {
      for (const c of l.concepts) {
        const item = pickProbeItem(c.items);
        if (item) probeItem[c.id] = item.id;
      }
    }
  }
  const depths = conceptIds.map((id) => depth[id] ?? 0).sort((a, b) => a - b);
  const maxDepth = depths.length ? (depths[depths.length - 1] as number) : 0;
  const median = depths.length ? (depths[Math.floor((depths.length - 1) / 2)] as number) : 0;
  return {
    conceptIds,
    depth,
    maxDepth,
    probeItem,
    results: {},
    lo: -1,
    hi: maxDepth + 1,
    probeDepth: median,
    probes: 0,
    done: conceptIds.length === 0 || Object.keys(probeItem).length === 0,
  };
}

function bracketed(s: DiagnosticState): boolean {
  return s.hi - s.lo <= 1;
}

function unprobedAt(s: DiagnosticState, d: number): string | undefined {
  return s.conceptIds.find((id) => s.depth[id] === d && s.results[id] === undefined && s.probeItem[id] !== undefined);
}

/** Next concept and item to probe, or null when the diagnostic is finished. */
export function nextProbe(state: DiagnosticState): DiagnosticProbe | null {
  if (state.done || state.probes >= DIAGNOSTIC_MAX_PROBES || bracketed(state)) return null;
  // Prefer the target depth, then the nearest depths strictly inside the open bracket (lo, hi).
  const candidates: number[] = [];
  const minD = Math.max(0, state.lo + 1);
  const maxD = Math.min(state.maxDepth, state.hi - 1);
  const target = Math.max(minD, Math.min(maxD, state.probeDepth));
  for (let delta = 0; delta <= state.maxDepth; delta++) {
    if (target + delta <= maxD) candidates.push(target + delta);
    if (delta > 0 && target - delta >= minD) candidates.push(target - delta);
  }
  for (const d of candidates) {
    const conceptId = unprobedAt(state, d);
    if (conceptId !== undefined) return { conceptId, itemId: state.probeItem[conceptId] as string, depth: d };
  }
  return null;
}

export function recordResult(state: DiagnosticState, conceptId: string, passed: boolean): DiagnosticState {
  if (state.done) return state;
  const d = state.depth[conceptId];
  if (d === undefined || state.results[conceptId] !== undefined) return state;
  const s: DiagnosticState = structuredClone(state);
  s.results[conceptId] = passed;
  s.probes += 1;
  if (passed) s.lo = Math.max(s.lo, d);
  else s.hi = Math.min(s.hi, d);
  if (s.hi <= s.lo) {
    // Inconsistent evidence (pass above a fail): trust the most recent probe.
    if (passed) s.hi = s.lo + 1;
    else s.lo = s.hi - 1;
  }
  s.probeDepth = Math.floor((s.lo + s.hi) / 2);
  s.done = s.probes >= DIAGNOSTIC_MAX_PROBES || bracketed(s) || nextProbe({ ...s, done: false }) === null;
  return s;
}

/** Concepts at depths below the frontier plus every concept that was directly passed. */
export function result(state: DiagnosticState): DiagnosticResult {
  const frontierDepth = state.lo + 1;
  const known = new Set<string>();
  for (const id of state.conceptIds) {
    const d = state.depth[id] ?? 0;
    if (state.results[id] === true || (d < frontierDepth && state.results[id] !== false)) known.add(id);
  }
  return { knownConceptIds: state.conceptIds.filter((id) => known.has(id)), frontierDepth, probes: state.probes };
}
