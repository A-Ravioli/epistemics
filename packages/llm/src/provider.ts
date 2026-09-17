/**
 * Provider-agnostic LLM interface. First implementation: Anthropic (official SDK). Second: Ollama.
 * The key/network hop is injected via `fetch`; the package never reads secrets itself.
 */
import type { z } from 'zod';
import type { LlmRole } from '@epistemics/core';

export type Effort = 'low' | 'medium' | 'high';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';   // 'system' inside messages = mid-conversation control message
  content: string;
  /** Put a cache breakpoint after this message (used for the learner-model message that opens a tutor call). */
  cache?: boolean;
}

export interface CacheableBlock { text: string; cache?: boolean }

export interface LlmRequest {
  role: LlmRole;
  model?: string;                 // override; otherwise the provider's per-role default
  system: CacheableBlock[];       // ordered; blocks with cache:true get a cache breakpoint
  messages: ChatMessage[];
  maxTokens?: number;
  effort?: Effort;
  temperature?: number;
  metadata?: { sessionId?: string; courseId?: string };
  signal?: AbortSignal;
}

export interface Usage {
  inputTokens: number; cacheRead: number; cacheWrite: number; outputTokens: number; costUsd: number; latencyMs: number; model: string;
}

export interface StreamEvent {
  type: 'delta' | 'done' | 'error';
  text?: string;
  usage?: Usage;
  error?: string;
}

export interface LlmProvider {
  readonly name: string;
  /** Stream free text. The async iterable yields deltas and ends with a 'done' event carrying usage. */
  stream(req: LlmRequest): AsyncIterable<StreamEvent>;
  /** Non-streaming free text. */
  text(req: LlmRequest): Promise<{ text: string; usage: Usage }>;
  /** Structured output validated against a zod schema. Implementations must retry once on parse failure. */
  structured<T>(req: LlmRequest, schema: z.ZodType<T>, schemaName: string): Promise<{ value: T; usage: Usage }>;
}

export interface ModelConfig {
  tutor: string; observer: string; grader: string; architect: string; itemwriter: string; student: string; leakcheck: string;
}

export const DEFAULT_MODELS: ModelConfig = {
  tutor: 'claude-opus-5',
  observer: 'claude-haiku-4-5',
  grader: 'claude-sonnet-5',
  architect: 'claude-opus-5',
  itemwriter: 'claude-sonnet-5',
  student: 'claude-sonnet-5',
  leakcheck: 'claude-haiku-4-5',
};

/** USD per million tokens: [input, output, cacheRead, cacheWrite]. */
export const PRICES: Record<string, [number, number, number, number]> = {
  'claude-opus-5': [5, 25, 0.5, 6.25],
  'claude-sonnet-5': [2, 10, 0.2, 2.5],
  'claude-haiku-4-5': [1, 5, 0.1, 1.25],
  'claude-fable-5-1': [10, 50, 1, 12.5],
};

export function costUsd(model: string, u: { inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number }): number {
  const p = PRICES[model] ?? [0, 0, 0, 0];
  return (u.inputTokens * p[0] + u.outputTokens * p[1] + u.cacheRead * p[2] + u.cacheWrite * p[3]) / 1_000_000;
}

export type UsageSink = (call: Usage & { role: LlmRole; sessionId?: string; courseId?: string }) => void;

/** Default output caps per role. Architect and item writer emit whole curricula / item banks. */
export const DEFAULT_MAX_TOKENS: Record<LlmRole, number> = {
  tutor: 4096, student: 4096, observer: 2048, grader: 2048, leakcheck: 2048, itemwriter: 16000, architect: 16000,
};

export function defaultMaxTokens(role: LlmRole, structured: boolean): number {
  if (role === 'architect' || role === 'itemwriter') return 16000;
  return structured ? 2048 : (DEFAULT_MAX_TOKENS[role] ?? 4096);
}

export type LlmErrorKind = 'refusal' | 'rate_limit' | 'connection' | 'status' | 'parse' | 'aborted' | 'unknown';

/** Error raised by providers. `kind` lets callers decide between retry, degrade and surface. */
export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly status?: number;
  readonly retryable: boolean;
  constructor(kind: LlmErrorKind, message: string, opts: { status?: number; retryable?: boolean; cause?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'LlmError';
    this.kind = kind;
    if (opts.status !== undefined) this.status = opts.status;
    this.retryable = opts.retryable ?? (kind === 'rate_limit' || kind === 'connection');
  }
}

/** Build a Usage record from raw token counts. */
export function makeUsage(model: string, tokens: { inputTokens: number; outputTokens: number; cacheRead?: number; cacheWrite?: number }, latencyMs: number): Usage {
  const t = { inputTokens: tokens.inputTokens, outputTokens: tokens.outputTokens, cacheRead: tokens.cacheRead ?? 0, cacheWrite: tokens.cacheWrite ?? 0 };
  return { ...t, costUsd: costUsd(model, t), latencyMs, model };
}
