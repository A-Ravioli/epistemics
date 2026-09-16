/**
 * Observer: after each learner turn, a cheap structured call reports what happened
 * (attempt made? objective advanced? misconception? stuck?). The state machine, not the model, acts on it.
 */
import { ObserverResultSchema, type ObserverResult } from '@epistemics/core';
import type { LlmProvider, LlmRequest, Usage } from '../provider.js';
import { PROMPTS } from '../prompts.js';
import { encodeInput } from './shared.js';

export interface ObserverConcept {
  name: string;
  definition: string;
  objectives: { id: string; text: string; bloom?: string }[];
  misconceptions: { tag: string; description: string }[];
}

export interface ObserveInput {
  learnerTurn: string;
  tutorTurnBefore: string;
  concept: ObserverConcept;
  sourcesLoaded: boolean;
  /** Set when the previous learner turn also made no progress on the same question (feeds `stuck`). */
  previousTurnNoProgress?: boolean;
  model?: string;
  metadata?: LlmRequest['metadata'];
  signal?: AbortSignal;
}

export function buildObserverRequest(input: ObserveInput): LlmRequest {
  const payload: Record<string, unknown> = {
    tutorTurnBefore: input.tutorTurnBefore,
    learnerTurn: input.learnerTurn,
    concept: {
      name: input.concept.name,
      definition: input.concept.definition,
      objectives: input.concept.objectives.map((o) => ({ id: o.id, ...(o.bloom ? { bloom: o.bloom } : {}), text: o.text })),
      misconceptions: input.concept.misconceptions.map((m) => ({ tag: m.tag, description: m.description })),
    },
    sourcesLoaded: input.sourcesLoaded,
  };
  if (input.previousTurnNoProgress !== undefined) payload['previousTurnNoProgress'] = input.previousTurnNoProgress;
  const req: LlmRequest = {
    role: 'observer',
    system: [{ text: PROMPTS.observer, cache: true }],
    messages: [{ role: 'user', content: encodeInput(payload) }],
    effort: 'low',
    maxTokens: 1024,
  };
  if (input.model) req.model = input.model;
  if (input.metadata) req.metadata = input.metadata;
  if (input.signal) req.signal = input.signal;
  return req;
}

/** Normalise model output: keep only known objective ids / misconception tags, fill missing objectives with 'none'. */
export function sanitiseObserverResult(r: ObserverResult, concept: ObserverConcept): ObserverResult {
  const known = new Map(concept.objectives.map((o) => [o.id, o]));
  const seen = new Set<string>();
  const progress: ObserverResult['objectiveProgress'] = [];
  for (const p of r.objectiveProgress) {
    if (known.has(p.objectiveId) && !seen.has(p.objectiveId)) {
      seen.add(p.objectiveId);
      progress.push(p);
    }
  }
  for (const o of concept.objectives) if (!seen.has(o.id)) progress.push({ objectiveId: o.id, status: 'none' });
  const tags = new Set(concept.misconceptions.map((m) => m.tag));
  return {
    ...r,
    objectiveProgress: progress,
    misconceptionTags: [...new Set(r.misconceptionTags.filter((t) => tags.has(t)))],
    attemptMade: r.attemptMade && !r.offTopic,
  };
}

export async function observe(provider: LlmProvider, input: ObserveInput): Promise<ObserverResult> {
  const { value } = await observeWithUsage(provider, input);
  return value;
}

export async function observeWithUsage(provider: LlmProvider, input: ObserveInput): Promise<{ value: ObserverResult; usage: Usage }> {
  const req = buildObserverRequest(input);
  const { value, usage } = await provider.structured(req, ObserverResultSchema, 'ObserverResult');
  return { value: sanitiseObserverResult(value, input.concept), usage };
}
