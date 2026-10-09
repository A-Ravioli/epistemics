/**
 * Deterministic provider for tests and the UI demo mode.
 * - queued responses per role (`script.queue`, `provider.push(role, ...)`),
 * - a default responder `(req) => string | object | undefined`,
 * - built-in heuristics that yield valid ObserverResult / GradeResult / LeakCheck / Warmup objects,
 * - records every request in `provider.calls`,
 * - simulates streaming by yielding word deltas.
 */
import type { z } from 'zod';
import type { GradeResult, LlmRole, ObserverResult } from '@epistemics/core';
import { LlmError, makeUsage, type LlmProvider, type LlmRequest, type StreamEvent, type Usage, type UsageSink } from '../provider.js';
import { contentWords, sharedContentWords, splitDeltas } from '../text.js';
import { decodeInput, lastUserText } from '../roles/shared.js';
import { heuristicLeak } from '../roles/leak.js';

export type MockResponse = string | object | ((req: LlmRequest) => string | object);

export interface MockScript {
  /** Responses consumed in order, per role. A string is text (or JSON text for structured); an object is a structured value. */
  queue?: Partial<Record<LlmRole, MockResponse[]>>;
  /** Default responder when the queue for the role is empty. Return undefined to fall back to the built-in heuristics. */
  respond?: (req: LlmRequest) => string | object | undefined;
  /** Model name reported in usage (default 'mock'; pick a priced model id to exercise cost accounting). */
  model?: string;
  onUsage?: UsageSink;
  /** Delay between streamed deltas in ms (demo mode). Default 0. */
  delayMs?: number;
  /** Fixed latency reported in usage. Default 0. */
  latencyMs?: number;
}

export interface MockProvider extends LlmProvider {
  readonly calls: LlmRequest[];
  push(role: LlmRole, ...responses: MockResponse[]): void;
  reset(): void;
}

const GIVE_UP = /^\s*(idk|i don'?t know|dunno|no idea|not sure|pass|skip|just tell me|tell me the answer)\b/i;

/** Heuristic attempt detection shared with tests: length > 3 and not an "idk"-style message. */
export function mockAttemptMade(learnerText: string): boolean {
  const t = learnerText.trim();
  return t.length > 3 && !GIVE_UP.test(t);
}

interface ObserverPayload {
  learnerTurn?: string;
  tutorTurnBefore?: string;
  concept?: { name?: string; definition?: string; objectives?: { id: string; text: string }[]; misconceptions?: { tag: string; description: string }[] };
  previousTurnNoProgress?: boolean;
}

export function mockObserve(p: ObserverPayload): ObserverResult {
  const learner = p.learnerTurn ?? '';
  const attempt = mockAttemptMade(learner);
  const gaveUp = GIVE_UP.test(learner.trim());
  const objectives = p.concept?.objectives ?? [];
  const definition = p.concept?.definition ?? '';
  const objectiveProgress = objectives.map((o) => {
    const shared = sharedContentWords(learner, o.text);
    const status: 'none' | 'partial' | 'met' = shared >= 3 ? 'met' : shared >= 1 ? 'partial' : 'none';
    return { objectiveId: o.id, status };
  });
  const misconceptionTags = (p.concept?.misconceptions ?? [])
    .filter((m) => sharedContentWords(learner, m.description) >= 3)
    .map((m) => m.tag);
  const offTopic = attempt && contentWords(learner).length >= 3 && sharedContentWords(learner, `${definition} ${objectives.map((o) => o.text).join(' ')} ${p.tutorTurnBefore ?? ''}`) === 0;
  return {
    attemptMade: attempt && !offTopic,
    gaveUp,
    offTopic,
    objectiveProgress,
    misconceptionTags,
    keyIdeaStated: sharedContentWords(learner, definition) >= 3,
    priorKnowledgeElicited: /\b(remember|learned|learnt|know|earlier|before|last time|we did)\b/i.test(learner),
    stuck: p.previousTurnNoProgress === true && (!attempt || objectiveProgress.every((o) => o.status === 'none')),
    unsourcedClaims: [],
  };
}

interface GraderPayload { reference?: string; rubric?: { id: string; text: string }[]; answer?: string; misconceptions?: { tag: string; description: string }[] }

export function mockGrade(p: GraderPayload): GradeResult {
  const answer = p.answer ?? '';
  const shared = sharedContentWords(answer, p.reference ?? '');
  const good = shared >= 3;
  const score = good ? 0.9 : 0.3;
  const criteria = (p.rubric ?? []).map((c) => ({ id: c.id, met: good, evidence: good ? answer.trim().slice(0, 120) : '' }));
  return {
    criteria,
    score,
    misconceptionTags: (p.misconceptions ?? []).filter((m) => sharedContentWords(answer, m.description) >= 3).map((m) => m.tag),
    feedback: good
      ? 'Your answer covers the key ideas of the reference. One detail could be sharper: state the mechanism explicitly.'
      : 'Your answer misses the key ideas of the reference. Restate what the concept claims and why it holds.',
    confidence: 0.9,
  };
}

interface LeakPayload { tutorText?: string; reference?: { answer: string; exact?: string } }
interface WarmupPayload { dump?: string; concepts?: { id: string; name: string; definition: string }[] }

export function mockWarmup(p: WarmupPayload): { recalledConceptIds: string[]; partial: string[] } {
  const dump = p.dump ?? '';
  const recalled: string[] = [];
  const partial: string[] = [];
  for (const c of p.concepts ?? []) {
    const nameWords = contentWords(c.name);
    const named = nameWords.length > 0 && sharedContentWords(dump, c.name) === new Set(nameWords).size;
    const gloss = sharedContentWords(dump, c.definition);
    if (named && gloss >= 2) recalled.push(c.id);
    else if (named || gloss >= 2) partial.push(c.id);
  }
  return { recalledConceptIds: recalled, partial };
}

const DEFAULT_TEXT: Partial<Record<LlmRole, string>> = {
  tutor: 'Before we go further, try putting the key idea in your own words: what do you think is going on here, and why?',
  student: "Hmm, I'm not sure I follow yet. Could you walk me through one concrete example of that?",
};

function defaultResponse(req: LlmRequest): string | object {
  switch (req.role) {
    case 'observer': return mockObserve(decodeInput<ObserverPayload>(req) ?? { learnerTurn: lastUserText(req) });
    case 'grader': {
      const p = decodeInput<GraderPayload & WarmupPayload>(req);
      if (p && 'dump' in p) return mockWarmup(p);
      return mockGrade(p ?? { answer: lastUserText(req) });
    }
    case 'leakcheck': {
      const p = decodeInput<LeakPayload>(req);
      const v = heuristicLeak(p?.tutorText ?? '', p?.reference ?? { answer: '' });
      // the model path is only consulted on inconclusive heuristics; treat heavy overlap as a leak
      const leaked = v.leaked || v.reason === 'inconclusive';
      return { leaked, reason: leaked ? 'mock: the message restates the reference' : 'mock: no overlap with the reference' };
    }
    case 'tutor':
    case 'student':
      return DEFAULT_TEXT[req.role]!;
    default:
      throw new LlmError('parse', `mock provider: no scripted response for role "${req.role}"`, { retryable: false });
  }
}

const approxTokens = (s: string) => Math.ceil(s.length / 4);

export function createMockProvider(script: MockScript = {}): MockProvider {
  const queue: Partial<Record<LlmRole, MockResponse[]>> = {};
  for (const [role, rs] of Object.entries(script.queue ?? {})) queue[role as LlmRole] = [...(rs ?? [])];
  const calls: LlmRequest[] = [];
  const model = script.model ?? 'mock';

  function resolve(req: LlmRequest): string | object {
    const q = queue[req.role];
    const next = q?.shift();
    let r: string | object | undefined = typeof next === 'function' ? next(req) : next;
    if (r === undefined && script.respond) r = script.respond(req);
    if (r === undefined) r = defaultResponse(req);
    return r;
  }

  function usageFor(req: LlmRequest, output: string): Usage {
    const input = req.system.map((b) => b.text).join('\n') + req.messages.map((m) => m.content).join('\n');
    const cacheable = req.system.filter((b) => b.cache).map((b) => b.text).join('') + req.messages.filter((m) => m.cache).map((m) => m.content).join('');
    const cached = approxTokens(cacheable);
    const total = approxTokens(input);
    const u = makeUsage(req.model ?? model, { inputTokens: total - cached, outputTokens: approxTokens(output), cacheRead: cached }, script.latencyMs ?? 0);
    if (script.onUsage) {
      const call: Parameters<UsageSink>[0] = { ...u, role: req.role };
      if (req.metadata?.sessionId) call.sessionId = req.metadata.sessionId;
      if (req.metadata?.courseId) call.courseId = req.metadata.courseId;
      script.onUsage(call);
    }
    return u;
  }

  const provider: MockProvider = {
    name: 'mock',
    calls,
    push(role, ...responses) {
      (queue[role] ??= []).push(...responses);
    },
    reset() {
      calls.length = 0;
      for (const k of Object.keys(queue)) delete queue[k as LlmRole];
    },

    async *stream(req: LlmRequest): AsyncGenerator<StreamEvent> {
      calls.push(req);
      const r = resolve(req);
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      for (const d of splitDeltas(text)) {
        if (req.signal?.aborted) { yield { type: 'error', error: 'Request aborted' }; return; }
        if (script.delayMs) await new Promise((res) => setTimeout(res, script.delayMs));
        yield { type: 'delta', text: d };
      }
      yield { type: 'done', usage: usageFor(req, text) };
    },

    async text(req: LlmRequest) {
      calls.push(req);
      const r = resolve(req);
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      return { text, usage: usageFor(req, text) };
    },

    async structured<T>(req: LlmRequest, schema: z.ZodType<T>, schemaName: string) {
      calls.push(req);
      const r = resolve(req);
      const raw: unknown = typeof r === 'string' ? JSON.parse(r) : r;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        throw new LlmError('parse', `mock provider: response for ${req.role} does not match ${schemaName}: ${parsed.error.message}`, { retryable: false });
      }
      return { value: parsed.data, usage: usageFor(req, JSON.stringify(raw)) };
    },
  };
  return provider;
}
