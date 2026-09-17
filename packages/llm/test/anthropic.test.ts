import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ObserverResultSchema } from '@epistemics/core';
import {
  LlmError, buildAnthropicParams, capBreakpoints, createAnthropicProvider, supportsMidSystem, toAnthropicMessages, DEFAULT_MODELS,
  type LlmRequest, type StreamEvent,
} from '../src/index.js';

interface Body {
  model: string; max_tokens: number; stream?: boolean;
  system?: { type: string; text: string; cache_control?: { type: string; ttl?: string } }[];
  messages: { role: string; content: string | { type: string; text: string; cache_control?: unknown }[] }[];
  output_config?: { effort?: string; format?: { type: string; schema: Record<string, unknown> } };
  temperature?: number; thinking?: unknown;
}
interface Captured { url: string; headers: Record<string, string>; body: Body }

function fakeFetch(respond: (c: Captured, n: number) => Response | Promise<Response>) {
  const captured: Captured[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers as HeadersInit).forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const c: Captured = { url: String(url), headers, body: JSON.parse(String(init?.body)) };
    captured.push(c);
    return respond(c, captured.length);
  }) as unknown as typeof fetch;
  return { fetch: f, captured };
}

function messageResponse(text: string, over: Record<string, unknown> = {}): Response {
  const body = {
    id: 'msg_01', type: 'message', role: 'assistant', model: 'claude-opus-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn', stop_sequence: null,
    usage: { input_tokens: 40, output_tokens: 12, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200 },
    ...over,
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_1' } });
}

function sseResponse(deltas: string[], stopReason = 'end_turn'): Response {
  const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const parts = [
    ev('message_start', { message: { id: 'msg_01', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 30, output_tokens: 1, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 } } }),
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
    ...deltas.map((t) => ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: t } })),
    ev('content_block_stop', { index: 0 }),
    ev('message_delta', { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 9 } }),
    ev('message_stop', {}),
  ];
  return new Response(parts.join(''), { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_2' } });
}

const errorResponse = (status: number, type: string, message: string) =>
  new Response(JSON.stringify({ type: 'error', error: { type, message } }), { status, headers: { 'content-type': 'application/json' } });

const tutorReq: LlmRequest = {
  role: 'tutor',
  system: [{ text: 'charter text', cache: true }, { text: 'curriculum context', cache: true }],
  messages: [
    { role: 'user', content: 'learner model', cache: true },
    { role: 'assistant', content: 'What do you think?' },
    { role: 'user', content: 'not sure' },
    { role: 'system', content: 'phase=DEVELOP hint_level=1' },
  ],
  effort: 'medium',
  temperature: 0.7,
  metadata: { sessionId: 's1', courseId: 'c1' },
};

describe('anthropic provider: request shape', () => {
  it('text(): per-role model, cached system blocks (1h), cached first user message, mid-conversation system control, effort, no temperature/thinking', async () => {
    const { fetch, captured } = fakeFetch(() => messageResponse('Why do you say that?'));
    const seen: Parameters<NonNullable<Parameters<typeof createAnthropicProvider>[0]['onUsage']>>[0][] = [];
    const p = createAnthropicProvider({ apiKey: 'k', fetch, onUsage: (u) => seen.push(u) });
    const r = await p.text(tutorReq);
    expect(r.text).toBe('Why do you say that?');
    expect(r.usage).toMatchObject({ inputTokens: 40, outputTokens: 12, cacheRead: 1000, cacheWrite: 200, model: 'claude-opus-5' });
    expect(r.usage.costUsd).toBeCloseTo((40 * 5 + 12 * 25 + 1000 * 0.5 + 200 * 6.25) / 1e6, 12);
    expect(seen[0]).toMatchObject({ role: 'tutor', sessionId: 's1', courseId: 'c1' });

    const c = captured[0]!;
    expect(c.url).toBe('https://api.anthropic.com/v1/messages');
    expect(c.headers['x-api-key']).toBe('k');
    expect(c.headers['anthropic-dangerous-direct-browser-access']).toBeUndefined();
    const b = c.body;
    expect(b.model).toBe(DEFAULT_MODELS.tutor);
    expect(b.max_tokens).toBe(4096);
    expect(b.stream).toBeUndefined();
    expect(b.temperature).toBeUndefined();
    expect(b.thinking).toBeUndefined();
    expect(b.output_config).toEqual({ effort: 'medium' });
    expect(b.system).toEqual([
      { type: 'text', text: 'charter text', cache_control: { type: 'ephemeral', ttl: '1h' } },
      { type: 'text', text: 'curriculum context', cache_control: { type: 'ephemeral', ttl: '1h' } },
    ]);
    expect(b.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'learner model', cache_control: { type: 'ephemeral', ttl: '1h' } }] },
      { role: 'assistant', content: 'What do you think?' },
      { role: 'user', content: 'not sure' },
      { role: 'system', content: 'phase=DEVELOP hint_level=1' },
    ]);
  });

  it('folds control messages into the preceding user turn on models without mid-conversation system support', async () => {
    const { fetch, captured } = fakeFetch(() => messageResponse('ok'));
    const p = createAnthropicProvider({ apiKey: 'k', fetch, models: { tutor: 'claude-sonnet-5' } });
    await p.text(tutorReq);
    const msgs = captured[0]!.body.messages;
    expect(msgs).toHaveLength(3);
    expect(msgs[2]).toEqual({ role: 'user', content: 'not sure\n\n[control] phase=DEVELOP hint_level=1' });
    expect(msgs.some((m) => m.role === 'system')).toBe(false);
  });

  it('supportsMidSystem / toAnthropicMessages edge cases', () => {
    expect(supportsMidSystem('claude-opus-5')).toBe(true);
    expect(supportsMidSystem('claude-fable-5-1')).toBe(true);
    expect(supportsMidSystem('claude-sonnet-5')).toBe(false);
    expect(supportsMidSystem('claude-haiku-4-5')).toBe(false);
    // a control after an assistant turn cannot be a system message even on Opus: it becomes a user message
    const m = toAnthropicMessages([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'system', content: 'ctl' }], true);
    expect(m[2]).toEqual({ role: 'user', content: '[control] ctl' });
    // a control after a cached user message appends a text block after the breakpoint
    const m2 = toAnthropicMessages([{ role: 'user', content: 'a', cache: true }, { role: 'system', content: 'ctl' }], false);
    expect(m2).toEqual([{ role: 'user', content: [{ type: 'text', text: 'a', cache_control: { type: 'ephemeral', ttl: '1h' } }, { type: 'text', text: '[control] ctl' }] }]);
    // consecutive controls merge
    const m3 = toAnthropicMessages([{ role: 'user', content: 'a' }, { role: 'system', content: 'x' }, { role: 'system', content: 'y' }], true);
    expect(m3).toEqual([{ role: 'user', content: 'a' }, { role: 'system', content: 'x\n\ny' }]);
  });

  it('caps cache breakpoints at four, dropping the earliest', () => {
    const req: LlmRequest = {
      role: 'tutor',
      system: [{ text: 'a', cache: true }, { text: 'b', cache: true }, { text: 'c', cache: true }],
      messages: [{ role: 'user', content: 'd', cache: true }, { role: 'assistant', content: 'e' }, { role: 'user', content: 'f', cache: true }],
    };
    const params = buildAnthropicParams(req, DEFAULT_MODELS, false);
    const system = params.system as { cache_control?: unknown }[];
    expect(system[0]!.cache_control).toBeUndefined();
    expect(system[1]!.cache_control).toBeDefined();
    const marked = (params.messages as { content: unknown }[]).filter((m) => Array.isArray(m.content)).length;
    expect(marked).toBe(2);
    capBreakpoints([], []); // no-op
  });

  it('browser mode sets the direct-access header; proxied mode without a key sends no x-api-key', async () => {
    const a = fakeFetch(() => messageResponse('x'));
    await createAnthropicProvider({ apiKey: 'k', fetch: a.fetch, browser: true }).text(tutorReq);
    expect(a.captured[0]!.headers['anthropic-dangerous-direct-browser-access']).toBe('true');

    const b = fakeFetch(() => messageResponse('x'));
    await createAnthropicProvider({ baseURL: 'http://localhost:8787/api/anthropic', fetch: b.fetch }).text(tutorReq);
    expect(b.captured[0]!.url).toBe('http://localhost:8787/api/anthropic/v1/messages');
    expect(b.captured[0]!.headers['x-api-key']).toBeUndefined();
  });
});

describe('anthropic provider: structured()', () => {
  const value = { attemptMade: true, gaveUp: false, offTopic: false, objectiveProgress: [{ objectiveId: 'O1', status: 'partial' }], misconceptionTags: [], keyIdeaStated: false, priorKnowledgeElicited: false, stuck: false, unsourcedClaims: [] };
  const observerReq: LlmRequest = { role: 'observer', system: [{ text: 'observer prompt', cache: true }], messages: [{ role: 'user', content: '{}' }], effort: 'low', maxTokens: 1024 };

  it('uses messages.parse with output_config.format from zod and returns the parsed value', async () => {
    const { fetch, captured } = fakeFetch(() => messageResponse(JSON.stringify(value)));
    const p = createAnthropicProvider({ apiKey: 'k', fetch });
    const r = await p.structured(observerReq, ObserverResultSchema, 'ObserverResult');
    expect(r.value).toEqual(value);
    expect(r.usage.inputTokens).toBe(40);
    const b = captured[0]!.body;
    expect(b.model).toBe('claude-haiku-4-5');
    expect(b.max_tokens).toBe(1024);
    expect(b.output_config?.effort).toBe('low');
    expect(b.output_config?.format?.type).toBe('json_schema');
    expect(b.output_config?.format?.schema).toMatchObject({ type: 'object' });
    expect((b.output_config?.format?.schema as { required: string[] }).required).toContain('attemptMade');
    expect(b.stream).toBeUndefined();
    expect(b.thinking).toBeUndefined();
  });

  it('defaults structured max_tokens to 2048 (16000 for the architect)', async () => {
    const { fetch, captured } = fakeFetch(() => messageResponse('{"a":1}'));
    const p = createAnthropicProvider({ apiKey: 'k', fetch });
    const schema = z.object({ a: z.number() });
    await p.structured({ role: 'grader', system: [], messages: [{ role: 'user', content: 'x' }] }, schema, 'T');
    await p.structured({ role: 'architect', system: [], messages: [{ role: 'user', content: 'x' }] }, schema, 'T');
    expect(captured[0]!.body.max_tokens).toBe(2048);
    expect(captured[0]!.body.model).toBe('claude-sonnet-5');
    expect(captured[1]!.body.max_tokens).toBe(16000);
    expect(captured[1]!.body.system).toBeUndefined();
  });

  it('retries once when the output does not match the schema, and sums usage', async () => {
    const { fetch, captured } = fakeFetch((_c, n) => messageResponse(n === 1 ? '{"a":"wrong"}' : '{"a":2}'));
    const p = createAnthropicProvider({ apiKey: 'k', fetch });
    const r = await p.structured({ role: 'grader', system: [], messages: [{ role: 'user', content: 'x' }] }, z.object({ a: z.number() }), 'T');
    expect(r.value).toEqual({ a: 2 });
    expect(captured).toHaveLength(2);
    expect(r.usage.inputTokens).toBe(40); // the failed parse throws before usage is readable; the successful call is billed

    const bad = fakeFetch(() => messageResponse('not json'));
    await expect(createAnthropicProvider({ apiKey: 'k', fetch: bad.fetch }).structured({ role: 'grader', system: [], messages: [{ role: 'user', content: 'x' }] }, z.object({ a: z.number() }), 'T')).rejects.toMatchObject({ kind: 'parse' });
    expect(bad.captured).toHaveLength(2);
  });

  it('surfaces a refusal as an LlmError of kind refusal', async () => {
    const { fetch } = fakeFetch(() => messageResponse('', { content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: 'no' } }));
    const p = createAnthropicProvider({ apiKey: 'k', fetch });
    await expect(p.text(tutorReq)).rejects.toMatchObject({ kind: 'refusal' });
    await expect(p.structured(tutorReq, z.object({}), 'T')).rejects.toMatchObject({ kind: 'refusal' });
  });
});

describe('anthropic provider: stream()', () => {
  it('yields text deltas then a done event with usage from the final message', async () => {
    const { fetch, captured } = fakeFetch(() => sseResponse(['Why ', 'do you ', 'say that?']));
    const seen: unknown[] = [];
    const p = createAnthropicProvider({ apiKey: 'k', fetch, onUsage: (u) => seen.push(u) });
    const events: StreamEvent[] = [];
    for await (const ev of p.stream(tutorReq)) events.push(ev);
    expect(events.filter((e) => e.type === 'delta').map((e) => e.text).join('')).toBe('Why do you say that?');
    const done = events.at(-1)!;
    expect(done.type).toBe('done');
    expect(done.usage).toMatchObject({ inputTokens: 30, outputTokens: 9, cacheRead: 500, model: 'claude-opus-5' });
    expect(captured[0]!.body.stream).toBe(true);
    expect(captured[0]!.body.system?.[0]?.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(seen).toHaveLength(1);
  });

  it('turns a refusal stop reason into an error event', async () => {
    const { fetch } = fakeFetch(() => sseResponse(['partial'], 'refusal'));
    const p = createAnthropicProvider({ apiKey: 'k', fetch });
    const events: StreamEvent[] = [];
    for await (const ev of p.stream(tutorReq)) events.push(ev);
    expect(events.at(-1)!.type).toBe('error');
    expect(events.at(-1)!.error).toMatch(/declined/);
  });

  it('retries once on a rate limit before any delta, and reports errors as events', async () => {
    const { fetch, captured } = fakeFetch((_c, n) => (n === 1 ? errorResponse(429, 'rate_limit_error', 'slow down') : sseResponse(['ok'])));
    const p = createAnthropicProvider({ apiKey: 'k', fetch, retryDelayMs: 0 });
    const events: StreamEvent[] = [];
    for await (const ev of p.stream(tutorReq)) events.push(ev);
    expect(captured).toHaveLength(2);
    expect(events.map((e) => e.type)).toEqual(['delta', 'done']);

    const always = fakeFetch(() => errorResponse(429, 'rate_limit_error', 'slow down'));
    const p2 = createAnthropicProvider({ apiKey: 'k', fetch: always.fetch, retryDelayMs: 0 });
    const ev2: StreamEvent[] = [];
    for await (const ev of p2.stream(tutorReq)) ev2.push(ev);
    expect(always.captured).toHaveLength(2);
    expect(ev2).toEqual([{ type: 'error', error: expect.stringMatching(/Rate limited/) }]);
  });
});

describe('anthropic provider: errors and retries', () => {
  const req: LlmRequest = { role: 'grader', system: [], messages: [{ role: 'user', content: 'x' }] };

  it('text() retries once on 429 and on 5xx, not on 400', async () => {
    const a = fakeFetch((_c, n) => (n === 1 ? errorResponse(429, 'rate_limit_error', 'slow') : messageResponse('ok')));
    expect((await createAnthropicProvider({ apiKey: 'k', fetch: a.fetch, retryDelayMs: 0 }).text(req)).text).toBe('ok');
    expect(a.captured).toHaveLength(2);

    const b = fakeFetch((_c, n) => (n === 1 ? errorResponse(529, 'overloaded_error', 'busy') : messageResponse('ok')));
    expect((await createAnthropicProvider({ apiKey: 'k', fetch: b.fetch, retryDelayMs: 0 }).text(req)).text).toBe('ok');
    expect(b.captured).toHaveLength(2);

    const c = fakeFetch(() => errorResponse(400, 'invalid_request_error', 'bad'));
    const err = await createAnthropicProvider({ apiKey: 'k', fetch: c.fetch, retryDelayMs: 0 }).text(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err).toMatchObject({ kind: 'status', status: 400, retryable: false });
    expect(c.captured).toHaveLength(1);
  });

  it('text() retries once on a connection error then gives up', async () => {
    let n = 0;
    const flaky = (async () => { n++; throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    const err = await createAnthropicProvider({ apiKey: 'k', fetch: flaky, retryDelayMs: 0 }).text(req).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'connection' });
    expect(n).toBe(2);
  });
});
