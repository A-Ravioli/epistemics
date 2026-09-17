/**
 * Ollama provider: POST {baseURL}/api/chat with NDJSON streaming and JSON-schema constrained output
 * (`format`). Reached through the same injected `fetch` as Anthropic (Tauri `llm_fetch` on desktop).
 * Cost is always 0; token counts come from `prompt_eval_count` / `eval_count`.
 */
import { z } from 'zod';
import type { LlmRole } from '@epistemics/core';
import { LlmError, defaultMaxTokens, makeUsage, type LlmProvider, type LlmRequest, type StreamEvent, type Usage, type UsageSink } from '../provider.js';

export interface OllamaProviderOptions {
  baseURL?: string;
  /** Model used for every role unless `models` overrides one. */
  model: string;
  models?: Partial<Record<LlmRole, string>>;
  fetch?: typeof fetch;
  onUsage?: UsageSink;
  /** Delay before the single retry on connection / 5xx errors. Default 1000ms. */
  retryDelayMs?: number;
  /** Ollama keeps the model loaded for this long after a request. Default '10m'. */
  keepAlive?: string;
}

interface OllamaChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

interface OllamaChunk {
  message?: { role: string; content: string };
  done: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

export interface OllamaChatBody {
  model: string;
  messages: OllamaChatMessage[];
  stream: boolean;
  format?: Record<string, unknown>;
  keep_alive?: string;
  options: { num_predict: number; temperature?: number };
}

const EFFORT_TEMPERATURE: Record<string, number> = { low: 0.2, medium: 0.5, high: 0.7 };

/** Build the /api/chat body. Ollama accepts `system` role anywhere in `messages`, so control messages pass through. */
export function buildOllamaBody(req: LlmRequest, model: string, structured: boolean, format?: Record<string, unknown>): OllamaChatBody {
  const messages: OllamaChatMessage[] = [];
  const system = req.system.map((b) => b.text).filter((t) => t.length > 0).join('\n\n');
  if (system) messages.push({ role: 'system', content: system });
  for (const m of req.messages) messages.push({ role: m.role, content: m.content });
  const options: OllamaChatBody['options'] = { num_predict: req.maxTokens ?? defaultMaxTokens(req.role, structured) };
  const temperature = req.temperature ?? (req.effort ? EFFORT_TEMPERATURE[req.effort] : undefined);
  if (temperature !== undefined) options.temperature = structured ? 0 : temperature;
  else if (structured) options.temperature = 0;
  const body: OllamaChatBody = { model, messages, stream: !structured, options };
  if (format) body.format = format;
  return body;
}

/** zod → JSON schema for Ollama's grammar-constrained decoding. */
export function toOllamaFormat(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'any' }) as Record<string, unknown>;
  delete json['$schema'];
  return json;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function* ndjson(body: ReadableStream<Uint8Array>): AsyncGenerator<OllamaChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line) as OllamaChunk;
    }
  }
  const rest = buf.trim();
  if (rest) yield JSON.parse(rest) as OllamaChunk;
}

export function createOllamaProvider(opts: OllamaProviderOptions): LlmProvider {
  const baseURL = (opts.baseURL ?? 'http://localhost:11434').replace(/\/+$/, '');
  const doFetch = opts.fetch ?? globalThis.fetch;
  const retryDelayMs = opts.retryDelayMs ?? 1000;
  const keepAlive = opts.keepAlive ?? '10m';
  const modelFor = (req: LlmRequest) => req.model ?? opts.models?.[req.role] ?? opts.model;

  const emit = (req: LlmRequest, usage: Usage) => {
    if (!opts.onUsage) return;
    const call: Parameters<UsageSink>[0] = { ...usage, role: req.role };
    if (req.metadata?.sessionId) call.sessionId = req.metadata.sessionId;
    if (req.metadata?.courseId) call.courseId = req.metadata.courseId;
    opts.onUsage(call);
  };

  async function post(body: OllamaChatBody, signal?: AbortSignal): Promise<Response> {
    const attempt = async () => {
      let res: Response;
      try {
        res = await doFetch(`${baseURL}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, keep_alive: keepAlive }),
          ...(signal ? { signal } : {}),
        });
      } catch (e) {
        if (signal?.aborted || (e instanceof Error && e.name === 'AbortError')) throw new LlmError('aborted', 'Request aborted', { cause: e, retryable: false });
        throw new LlmError('connection', `Ollama unreachable at ${baseURL}: ${e instanceof Error ? e.message : String(e)}`, { cause: e, retryable: true });
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const kind = res.status === 429 ? 'rate_limit' : 'status';
        throw new LlmError(kind, `Ollama HTTP ${res.status}: ${text.slice(0, 300)}`, { status: res.status, retryable: res.status === 429 || res.status >= 500 });
      }
      return res;
    };
    try {
      return await attempt();
    } catch (e) {
      const err = e instanceof LlmError ? e : new LlmError('unknown', String(e), { cause: e });
      if (!err.retryable || signal?.aborted) throw err;
      await sleep(retryDelayMs);
      return attempt();
    }
  }

  function usageOf(model: string, chunk: OllamaChunk, latencyMs: number): Usage {
    return makeUsage(model, { inputTokens: chunk.prompt_eval_count ?? 0, outputTokens: chunk.eval_count ?? 0 }, latencyMs);
  }

  async function complete(req: LlmRequest, body: OllamaChatBody): Promise<{ text: string; usage: Usage }> {
    const started = Date.now();
    const res = await post(body, req.signal);
    let text = '';
    let last: OllamaChunk = { done: true };
    if (body.stream && res.body) {
      for await (const chunk of ndjson(res.body)) {
        if (chunk.error) throw new LlmError('status', `Ollama error: ${chunk.error}`, { retryable: false });
        text += chunk.message?.content ?? '';
        last = chunk;
      }
    } else {
      const chunk = (await res.json()) as OllamaChunk;
      if (chunk.error) throw new LlmError('status', `Ollama error: ${chunk.error}`, { retryable: false });
      text = chunk.message?.content ?? '';
      last = chunk;
    }
    const usage = usageOf(body.model, last, Date.now() - started);
    emit(req, usage);
    return { text, usage };
  }

  const provider: LlmProvider = {
    name: 'ollama',

    async *stream(req: LlmRequest): AsyncGenerator<StreamEvent> {
      const model = modelFor(req);
      const body = buildOllamaBody(req, model, false);
      const started = Date.now();
      try {
        const res = await post(body, req.signal);
        if (!res.body) throw new LlmError('connection', 'Ollama returned no body', { retryable: false });
        let last: OllamaChunk = { done: true };
        for await (const chunk of ndjson(res.body)) {
          if (chunk.error) throw new LlmError('status', `Ollama error: ${chunk.error}`, { retryable: false });
          const t = chunk.message?.content;
          if (t) yield { type: 'delta', text: t };
          last = chunk;
        }
        const usage = usageOf(model, last, Date.now() - started);
        emit(req, usage);
        yield { type: 'done', usage };
      } catch (e) {
        yield { type: 'error', error: e instanceof Error ? e.message : String(e) };
      }
    },

    async text(req: LlmRequest) {
      const model = modelFor(req);
      return complete(req, buildOllamaBody(req, model, false));
    },

    async structured<T>(req: LlmRequest, schema: z.ZodType<T>, schemaName: string) {
      const model = modelFor(req);
      const body = buildOllamaBody(req, model, true, toOllamaFormat(schema));
      let usage: Usage | undefined;
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await complete(req, body);
        usage = usage ? { ...r.usage, inputTokens: usage.inputTokens + r.usage.inputTokens, outputTokens: usage.outputTokens + r.usage.outputTokens, latencyMs: usage.latencyMs + r.usage.latencyMs } : r.usage;
        try {
          const parsed = schema.safeParse(JSON.parse(extractJson(r.text)));
          if (parsed.success) return { value: parsed.data, usage };
          lastError = parsed.error;
        } catch (e) {
          lastError = e;
        }
      }
      throw new LlmError('parse', `Ollama output did not match schema ${schemaName}: ${lastError instanceof Error ? lastError.message : String(lastError)}`, { retryable: false, cause: lastError });
    },
  };
  return provider;
}

/** Tolerate models that wrap JSON in a code fence or prose. */
export function extractJson(text: string): string {
  const t = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence?.[1]) return fence[1].trim();
  const start = t.search(/[[{]/);
  if (start > 0) {
    const endBrace = t.lastIndexOf('}');
    const endBracket = t.lastIndexOf(']');
    return t.slice(start, Math.max(endBrace, endBracket) + 1);
  }
  return t;
}
