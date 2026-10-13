/**
 * Warm-up grader: the learner free-recalls what they remember before new work; the model says which
 * listed concepts were recalled (fully / partially). Structured, cheap (grader-tier model, low effort).
 */
import { z } from 'zod';
import type { LlmProvider, LlmRequest, Usage } from '../provider.js';
import { PROMPTS } from '../prompts.js';
import { encodeInput } from './shared.js';

export interface WarmupConcept { id: string; name: string; definition: string }

export interface WarmupInput {
  dump: string;
  concepts: WarmupConcept[];
  model?: string;
  metadata?: LlmRequest['metadata'];
  signal?: AbortSignal;
}

export interface WarmupResult { recalledConceptIds: string[]; partial: string[] }

export const WarmupResultSchema = z.object({
  recalledConceptIds: z.array(z.string()),
  partial: z.array(z.string()),
});

export function buildWarmupRequest(input: WarmupInput): LlmRequest {
  const req: LlmRequest = {
    role: 'grader',
    system: [{ text: PROMPTS.warmup, cache: true }],
    messages: [{ role: 'user', content: encodeInput({ dump: input.dump, concepts: input.concepts.map((c) => ({ id: c.id, name: c.name, definition: c.definition })) }) }],
    effort: 'low',
    maxTokens: 1024,
  };
  if (input.model) req.model = input.model;
  if (input.metadata) req.metadata = input.metadata;
  if (input.signal) req.signal = input.signal;
  return req;
}

/** Drop unknown ids; a concept cannot be both recalled and partial (recalled wins). */
export function sanitiseWarmup(r: WarmupResult, concepts: WarmupConcept[]): WarmupResult {
  const known = new Set(concepts.map((c) => c.id));
  const recalled = [...new Set(r.recalledConceptIds.filter((id) => known.has(id)))];
  const rs = new Set(recalled);
  const partial = [...new Set(r.partial.filter((id) => known.has(id) && !rs.has(id)))];
  return { recalledConceptIds: recalled, partial };
}

export async function gradeWarmupWithUsage(provider: LlmProvider, input: WarmupInput): Promise<{ value: WarmupResult; usage: Usage }> {
  if (input.concepts.length === 0 || input.dump.trim().length === 0) {
    return { value: { recalledConceptIds: [], partial: [] }, usage: { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, latencyMs: 0, model: '' } };
  }
  const { value, usage } = await provider.structured(buildWarmupRequest(input), WarmupResultSchema, 'WarmupResult');
  return { value: sanitiseWarmup(value, input.concepts), usage };
}

export async function gradeWarmup(provider: LlmProvider, input: WarmupInput): Promise<WarmupResult> {
  return (await gradeWarmupWithUsage(provider, input)).value;
}
