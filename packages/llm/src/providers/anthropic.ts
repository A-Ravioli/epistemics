/**
 * Anthropic provider on the official SDK.
 *
 * - The network hop is injected via `fetch` (Tauri command on desktop, proxy base URL on the web);
 *   the package never reads secrets itself.
 * - Cache breakpoints: system blocks and messages flagged `cache: true` get `cache_control` (1h TTL, max 4).
 * - Mid-conversation control messages (`role: 'system'` inside `messages`) are sent as-is on models that
 *   support them and folded into the preceding user message elsewhere.
 * - Thinking is left at the model default (adaptive); `output_config.effort` is the cost knob. No temperature.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import type { LlmRole } from '@epistemics/core';
import {
  DEFAULT_MODELS, LlmError, defaultMaxTokens, makeUsage,
  type ChatMessage, type LlmProvider, type LlmRequest, type ModelConfig, type StreamEvent, type Usage, type UsageSink,
} from '../provider.js';

export interface AnthropicProviderOptions {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof fetch;
  /** Browser-origin direct access (BYOK mode): sets dangerouslyAllowBrowser and the direct-browser-access header. */
  browser?: boolean;
  models?: Partial<ModelConfig>;
  onUsage?: UsageSink;
  /** Delay before the single retry on rate limit / connection errors. Default 1500ms. */
  retryDelayMs?: number;
  /** SDK-level retries (we do our own single retry, so this defaults to 0). */
  maxRetries?: number;
  /** Cache TTL for flagged blocks. Default '1h' (a study session). */
  cacheTtl?: '5m' | '1h';
  /** Request timeout in ms (SDK default 10 min). */
  timeoutMs?: number;
}

/** Models that accept `role: 'system'` entries inside `messages`. */
export function supportsMidSystem(model: string): boolean {
  return model.startsWith('claude-opus-5') || model.startsWith('claude-fable');
}

export const MAX_CACHE_BREAKPOINTS = 4;

type CacheControl = { type: 'ephemeral'; ttl: '5m' | '1h' };

/**
 * Convert our ChatMessage[] to SDK MessageParam[].
 * - `cache: true` messages become a text block carrying cache_control.
 * - 'system' messages: sent as `{ role: 'system' }` when the model supports it and the previous entry is a
 *   user message (API rule); otherwise folded into the preceding user message as a trailing "[control] ..." paragraph
 *   (or a new user message when there is no preceding user message).
 */
export function toAnthropicMessages(messages: ChatMessage[], midSystem: boolean, ttl: '5m' | '1h' = '1h'): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  const cacheControl: CacheControl = { type: 'ephemeral', ttl };
  for (const m of messages) {
    const prev = out[out.length - 1];
    if (m.role === 'system') {
      if (midSystem && prev && prev.role === 'user') {
        out.push({ role: 'system', content: m.content });
        continue;
      }
      if (midSystem && prev && prev.role === 'system' && typeof prev.content === 'string') {
        prev.content = `${prev.content}\n\n${m.content}`;
        continue;
      }
      const para = `[control] ${m.content}`;
      if (prev && prev.role === 'user') {
        if (typeof prev.content === 'string') prev.content = `${prev.content}\n\n${para}`;
        else prev.content = [...prev.content, { type: 'text', text: para }];
      } else {
        out.push({ role: 'user', content: para });
      }
      continue;
    }
    if (m.cache) {
      out.push({ role: m.role, content: [{ type: 'text', text: m.content, cache_control: cacheControl }] });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

/** Keep at most MAX_CACHE_BREAKPOINTS cache_control markers, dropping the earliest ones (a later breakpoint still covers the prefix). */
export function capBreakpoints(system: Anthropic.TextBlockParam[], messages: Anthropic.MessageParam[]): void {
  const marked: { cache_control?: unknown }[] = [];
  for (const b of system) if (b.cache_control) marked.push(b);
  for (const m of messages) {
    if (typeof m.content === 'string') continue;
    for (const b of m.content) if ('cache_control' in b && b.cache_control) marked.push(b as { cache_control?: unknown });
  }
  const excess = marked.length - MAX_CACHE_BREAKPOINTS;
  for (let i = 0; i < excess; i++) delete marked[i]!.cache_control;
}

export function buildAnthropicParams(
  req: LlmRequest,
  models: ModelConfig,
  structured: boolean,
  ttl: '5m' | '1h' = '1h',
): Anthropic.MessageCreateParamsNonStreaming {
  const model = req.model ?? models[req.role];
  const system: Anthropic.TextBlockParam[] = req.system
    .filter((b) => b.text.length > 0)
    .map((b) => (b.cache ? { type: 'text', text: b.text, cache_control: { type: 'ephemeral', ttl } } : { type: 'text', text: b.text }));
  const messages = toAnthropicMessages(req.messages, supportsMidSystem(model), ttl);
  capBreakpoints(system, messages);
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: req.maxTokens ?? defaultMaxTokens(req.role, structured),
    messages,
  };
  if (system.length > 0) params.system = system;
  if (req.effort) params.output_config = { effort: req.effort };
  return params;
}

function usageFromMessage(model: string, msg: Anthropic.Message, latencyMs: number): Usage {
  const u = msg.usage;
  return makeUsage(model, {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  }, latencyMs);
}

function sumUsage(a: Usage, b: Usage): Usage {
  return {
    model: b.model,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    costUsd: a.costUsd + b.costUsd,
    latencyMs: a.latencyMs + b.latencyMs,
  };
}

function textOf(msg: Anthropic.Message): string {
  return msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
}

function refusalMessage(msg: Anthropic.Message): string {
  const d = msg.stop_details;
  const cat = d && 'category' in d && d.category ? ` (${d.category})` : '';
  const why = d && 'explanation' in d && d.explanation ? `: ${d.explanation}` : '';
  return `The model declined this request${cat}${why}`;
}

/** Map SDK errors onto LlmError kinds. */
export function classifyError(e: unknown): LlmError {
  if (e instanceof LlmError) return e;
  if (e instanceof Anthropic.APIUserAbortError) return new LlmError('aborted', 'Request aborted', { cause: e, retryable: false });
  if (e instanceof Anthropic.RateLimitError) return new LlmError('rate_limit', `Rate limited: ${e.message}`, { status: 429, cause: e, retryable: true });
  if (e instanceof Anthropic.APIConnectionError) return new LlmError('connection', `Connection error: ${e.message}`, { cause: e, retryable: true });
  if (e instanceof Anthropic.APIError) {
    const status = typeof e.status === 'number' ? e.status : undefined;
    const opts: { status?: number; cause: unknown; retryable: boolean } = { cause: e, retryable: status !== undefined && status >= 500 };
    if (status !== undefined) opts.status = status;
    return new LlmError('status', `API error${status ? ` ${status}` : ''}: ${e.message}`, opts);
  }
  if (e instanceof Anthropic.AnthropicError && /parse structured output/i.test(e.message)) {
    return new LlmError('parse', e.message, { cause: e, retryable: false });
  }
  if (e instanceof Error && e.name === 'AbortError') return new LlmError('aborted', 'Request aborted', { cause: e, retryable: false });
  return new LlmError('unknown', e instanceof Error ? e.message : String(e), { cause: e, retryable: false });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createAnthropicProvider(opts: AnthropicProviderOptions = {}): LlmProvider {
  const models: ModelConfig = { ...DEFAULT_MODELS, ...opts.models };
  const ttl = opts.cacheTtl ?? '1h';
  const retryDelayMs = opts.retryDelayMs ?? 1500;
  const proxied = opts.fetch !== undefined || opts.baseURL !== undefined;

  const defaultHeaders: Record<string, string | null> = {};
  if (opts.browser) defaultHeaders['anthropic-dangerous-direct-browser-access'] = 'true';
  // Key injected by the transport (Tauri command / proxy): send no x-api-key header at all.
  if (opts.apiKey === undefined && proxied) defaultHeaders['x-api-key'] = null;

  const clientOpts: ConstructorParameters<typeof Anthropic>[0] = {
    maxRetries: opts.maxRetries ?? 0,
    dangerouslyAllowBrowser: opts.browser ?? false,
    defaultHeaders,
  };
  if (opts.apiKey !== undefined) clientOpts.apiKey = opts.apiKey;
  else if (proxied) clientOpts.apiKey = null;
  if (opts.baseURL !== undefined) clientOpts.baseURL = opts.baseURL;
  if (opts.fetch !== undefined) clientOpts.fetch = opts.fetch;
  if (opts.timeoutMs !== undefined) clientOpts.timeout = opts.timeoutMs;
  const client = new Anthropic(clientOpts);

  const emit = (req: LlmRequest, usage: Usage) => {
    if (!opts.onUsage) return;
    const call: Parameters<UsageSink>[0] = { ...usage, role: req.role };
    if (req.metadata?.sessionId) call.sessionId = req.metadata.sessionId;
    if (req.metadata?.courseId) call.courseId = req.metadata.courseId;
    opts.onUsage(call);
  };

  /** Run `fn`, retrying once with backoff on rate-limit / connection / 5xx errors. */
  async function withRetry<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const err = classifyError(e);
      if (!err.retryable || signal?.aborted) throw err;
      await sleep(retryDelayMs);
      try {
        return await fn();
      } catch (e2) {
        throw classifyError(e2);
      }
    }
  }

  const requestOptions = (req: LlmRequest) => (req.signal ? { signal: req.signal } : {});

  const provider: LlmProvider = {
    name: 'anthropic',

    async *stream(req: LlmRequest): AsyncGenerator<StreamEvent> {
      const params = buildAnthropicParams(req, models, false, ttl);
      let attempt = 0;
      let yielded = false;
      for (;;) {
        const started = Date.now();
        try {
          const s = client.messages.stream(params, requestOptions(req));
          for await (const ev of s) {
            if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta' && ev.delta.text) {
              yielded = true;
              yield { type: 'delta', text: ev.delta.text };
            }
          }
          const msg = await s.finalMessage();
          const usage = usageFromMessage(params.model, msg, Date.now() - started);
          emit(req, usage);
          if (msg.stop_reason === 'refusal') {
            yield { type: 'error', error: refusalMessage(msg), usage };
            return;
          }
          yield { type: 'done', usage };
          return;
        } catch (e) {
          const err = classifyError(e);
          if (err.retryable && attempt === 0 && !yielded && !req.signal?.aborted) {
            attempt++;
            await sleep(retryDelayMs);
            continue;
          }
          yield { type: 'error', error: err.message };
          return;
        }
      }
    },

    async text(req: LlmRequest) {
      const params = buildAnthropicParams(req, models, false, ttl);
      const started = Date.now();
      const msg = await withRetry(() => client.messages.create(params, requestOptions(req)), req.signal);
      const usage = usageFromMessage(params.model, msg, Date.now() - started);
      emit(req, usage);
      if (msg.stop_reason === 'refusal') throw new LlmError('refusal', refusalMessage(msg), { retryable: false });
      return { text: textOf(msg), usage };
    },

    async structured<T>(req: LlmRequest, schema: z.ZodType<T>, _schemaName: string) {
      const base = buildAnthropicParams(req, models, true, ttl);
      // zodOutputFormat is typed against 'zod/v4'; zod 4's root export is the same classic API, so the
      // structural types line up. Cast only the return so a future minor drift in the helper's generic bound
      // does not break the build.
      const format = zodOutputFormat(schema as unknown as Parameters<typeof zodOutputFormat>[0]);
      const params: Anthropic.MessageCreateParamsNonStreaming = {
        ...base,
        output_config: { ...(base.output_config ?? {}), format },
      };

      const spent: Usage[] = [];
      const once = async (): Promise<T> => {
        const started = Date.now();
        let msg: Awaited<ReturnType<typeof client.messages.parse<typeof params>>>;
        try {
          msg = await withRetry(() => client.messages.parse(params, requestOptions(req)), req.signal);
        } catch (e) {
          // The SDK throws on schema mismatch before we can read usage; bill the call as unknown-size.
          throw classifyError(e);
        }
        const usage = usageFromMessage(params.model, msg, Date.now() - started);
        emit(req, usage);
        spent.push(usage);
        if (msg.stop_reason === 'refusal') throw new LlmError('refusal', refusalMessage(msg), { retryable: false });
        if (msg.parsed_output === null || msg.parsed_output === undefined) {
          throw new LlmError('parse', `Structured output did not match schema (stop_reason=${msg.stop_reason})`, { retryable: false });
        }
        return msg.parsed_output as T;
      };

      let value: T;
      try {
        value = await once();
      } catch (e) {
        const err = classifyError(e);
        if (err.kind !== 'parse' || req.signal?.aborted) throw err;
        value = await once(); // one retry on parse failure
      }
      const usage = spent.reduce(sumUsage, makeUsage(params.model, { inputTokens: 0, outputTokens: 0 }, 0));
      return { value, usage };
    },
  };
  return provider;
}

/** Per-role model lookup, exported for callers that need to know which model a role will use. */
export function modelForRole(role: LlmRole, models: Partial<ModelConfig> = {}): string {
  return models[role] ?? DEFAULT_MODELS[role];
}
