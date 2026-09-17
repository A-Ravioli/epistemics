import { describe, expect, it } from 'vitest';
import { conceptDepths, createDiagnostic, nextProbe, recordResult, result, DIAGNOSTIC_MAX_PROBES } from '../../src/session/diagnostic.js';
import { curriculum } from './fixture.js';

describe('diagnostic placement', () => {
  it('computes depth as the longest prerequisite chain', () => {
    expect(conceptDepths(curriculum)).toEqual({ c1: 0, c2: 1, c3: 2, c4: 3, c5: 1, c6: 4, c7: 5, c8: 6 });
  });

  it('starts at median depth and prefers apply/explain items', () => {
    const s = createDiagnostic(curriculum);
    expect(s.probeDepth).toBe(2); // depths sorted: 0,1,1,2,3,4,5,6 → lower median
    const p = nextProbe(s);
    expect(p).toEqual({ conceptId: 'c3', itemId: 'c3-i1', depth: 2 });
    expect(s.probeItem.c2).toBe('c2-i1'); // apply preferred over cloze/discriminate
    expect(s.probeItem.c5).toBe('c5-i1'); // discriminate when no apply/explain
  });

  it('converges on a learner who knows depths ≤ 2 within 25 probes', () => {
    let s = createDiagnostic(curriculum);
    const knows = (id: string) => (s.depth[id] ?? 0) <= 2;
    const probed: string[] = [];
    let probe = nextProbe(s);
    while (probe) {
      probed.push(`${probe.conceptId}@${probe.depth}`);
      s = recordResult(s, probe.conceptId, knows(probe.conceptId));
      probe = nextProbe(s);
    }
    expect(s.done).toBe(true);
    expect(s.probes).toBeLessThanOrEqual(DIAGNOSTIC_MAX_PROBES);
    expect(s.probes).toBeLessThanOrEqual(4);
    const r = result(s);
    expect(r.frontierDepth).toBe(3);
    expect(r.knownConceptIds).toEqual(['c1', 'c2', 'c3', 'c5']);
    // moved deeper after the pass at depth 2, then shallower after the fail
    expect(probed[0]).toBe('c3@2');
    expect(probed[1]?.endsWith('@4') || probed[1]?.endsWith('@3')).toBe(true);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('places a complete novice at the bottom and an expert at the top', () => {
    let n = createDiagnostic(curriculum);
    for (let p = nextProbe(n); p; p = nextProbe(n)) n = recordResult(n, p.conceptId, false);
    expect(result(n)).toMatchObject({ knownConceptIds: [], frontierDepth: 0 });
    let e = createDiagnostic(curriculum);
    for (let p = nextProbe(e); p; p = nextProbe(e)) e = recordResult(e, p.conceptId, true);
    expect(result(e).frontierDepth).toBe(7);
    expect(result(e).knownConceptIds).toHaveLength(8);
  });

  it('ignores unknown concepts and repeated results', () => {
    const s = createDiagnostic(curriculum);
    expect(recordResult(s, 'zzz', true)).toBe(s);
    const s1 = recordResult(s, 'c3', true);
    expect(recordResult(s1, 'c3', false)).toBe(s1);
  });
});
