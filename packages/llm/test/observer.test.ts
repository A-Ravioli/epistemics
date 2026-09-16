import { describe, expect, it } from 'vitest';
import { ObserverResultSchema } from '@epistemics/core';
import { buildObserverRequest, createMockProvider, observe, observeWithUsage, decodeInput, sanitiseObserverResult, type ObserverConcept } from '../src/index.js';
import { makeConcept } from './fixtures.js';

const c = makeConcept();
const concept: ObserverConcept = { name: c.name, definition: c.definition, objectives: c.objectives, misconceptions: c.misconceptions };
const base = { tutorTurnBefore: 'What does it mean for one event to give you information about another?', concept, sourcesLoaded: false };

describe('observer', () => {
  it('builds a compact structured request at low effort for the observer role', () => {
    const req = buildObserverRequest({ ...base, learnerTurn: 'It means knowing one changes the probability of the other.' });
    expect(req.role).toBe('observer');
    expect(req.effort).toBe('low');
    expect(req.system[0]!.cache).toBe(true);
    const payload = decodeInput<{ concept: { objectives: { id: string }[] }; sourcesLoaded: boolean }>(req);
    expect(payload?.concept.objectives.map((o) => o.id)).toEqual(['O1', 'O2']);
    expect(payload?.sourcesLoaded).toBe(false);
  });

  it('mock heuristics: a real attempt is an attempt, "idk" is not', async () => {
    const mock = createMockProvider();
    const tried = await observe(mock, { ...base, learnerTurn: 'Knowing one event changes the probability of the other one, I think.' });
    expect(ObserverResultSchema.safeParse(tried).success).toBe(true);
    expect(tried.attemptMade).toBe(true);
    expect(tried.gaveUp).toBe(false);
    expect(tried.keyIdeaStated).toBe(true);
    expect(tried.objectiveProgress.map((o) => o.objectiveId)).toEqual(['O1', 'O2']);

    const idk = await observe(mock, { ...base, learnerTurn: 'idk' });
    expect(idk.attemptMade).toBe(false);
    expect(idk.gaveUp).toBe(true);
    expect(mock.calls).toHaveLength(2);
  });

  it('uses a queued response when present and reports usage', async () => {
    const mock = createMockProvider({
      queue: { observer: [{ attemptMade: true, gaveUp: false, offTopic: false, objectiveProgress: [{ objectiveId: 'O2', status: 'met' }, { objectiveId: 'ghost', status: 'met' }], misconceptionTags: ['conflates-independent-and-disjoint', 'made-up'], keyIdeaStated: false, priorKnowledgeElicited: true, stuck: false, unsourcedClaims: [] }] },
    });
    const { value, usage } = await observeWithUsage(mock, { ...base, learnerTurn: 'x' });
    expect(value.objectiveProgress).toEqual([{ objectiveId: 'O2', status: 'met' }, { objectiveId: 'O1', status: 'none' }]);
    expect(value.misconceptionTags).toEqual(['conflates-independent-and-disjoint']);
    expect(usage.inputTokens).toBeGreaterThan(0);
  });

  it('rejects an invalid queued response instead of returning garbage', async () => {
    const mock = createMockProvider({ queue: { observer: [{ attemptMade: 'yes' }] } });
    await expect(observe(mock, { ...base, learnerTurn: 'x' })).rejects.toThrow(/ObserverResult/);
  });

  it('sanitise marks off-topic replies as non-attempts', () => {
    const r = sanitiseObserverResult({ attemptMade: true, gaveUp: false, offTopic: true, objectiveProgress: [], misconceptionTags: [], keyIdeaStated: false, priorKnowledgeElicited: false, stuck: false, unsourcedClaims: [] }, concept);
    expect(r.attemptMade).toBe(false);
  });
});
