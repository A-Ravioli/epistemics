import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ObserverResultSchema } from '@epistemics/core';
import { buildOllamaBody, createOllamaProvider, extractJson, toOllamaFormat, type LlmRequest, type OllamaChatBody } from '../src/index.js';

interface Captured { url: string; init: RequestInit; body: OllamaChatBody & { keep_alive?: string } }

function fakeFetch(respond: (c: Captured) => Response | Promise<Response>) {
  const captured: Captured[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const c: Captured = { url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body)) };
    captured.push(c);
    return respond(c);
  }) as unknown as typeof fetch;
  return { fetch: f, captured };
}

function ndjson(lines: object[]): Response {
  return new Response(lines.map((l) => JSON.stringify(l)).join('\n') + '\n', { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
}

const req: LlmRequest = {
  role: 'tutor',
  system: [{ text: 'charter', cache: true }, { text: 'context', cache: true }],
  messages: [
    { role: 'user', content: 'learner model', cache: true },
    { role: 'assistant', content: 'What do you think?' },
    { role: 'user', content: 'not sure' },
    { role: 'system', content: 'phase=DEVELOP hint_level=1' },
  ],
  effort: 'low',
};

describe('ollama provider', () => {
  it('posts a streaming /api/chat request with joined system prompt and pass-through control messages', async () => {
    const { fetch, captured } = fakeFetch(() => ndjson([
      { message: { role: 'assistant', content: 'Hel' }, done: false },
      { message: { role: 'assistant', content: 'lo?' }, done: false },
      { message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop', prompt_eval_count: 120, eval_count: 7 },
    ]));
    const seen: unknown[] = [];
    const p = createOllamaProvider({ model: 'llama3.2', fetch, onUsage: (u) => seen.push(u) });
    const chunks: string[] = [];
    let usage;
    for await (const ev of p.stream(req)) {
      if (ev.type === 'delta') chunks.push(ev.text!);
      if (ev.type === 'done') usage = ev.usage;
      if (ev.type === 'error') throw new Error(ev.error);
    }
    expect(chunks.join('')).toBe('Hello?');
    expect(usage).toMatchObject({ inputTokens: 120, outputTokens: 7, costUsd: 0, model: 'llama3.2' });
    expect(seen).toHaveLength(1);

    const c = captured[0]!;
    expect(c.url).toBe('http://localhost:11434/api/chat');
    expect(c.init.method).toBe('POST');
    expect(c.body.model).toBe('llama3.2');
    expect(c.body.stream).toBe(true);
    expect(c.body.format).toBeUndefined();
    expect(c.body.messages[0]).toEqual({ role: 'system', content: 'charter\n\ncontext' });
    expect(c.body.messages.at(-1)).toEqual({ role: 'system', content: 'phase=DEVELOP hint_level=1' });
    expect(c.body.options.num_predict).toBe(4096);
    expect(c.body.options.temperature).toBe(0.2);
    expect(c.body.keep_alive).toBe('10m');
  });

  it('strips a trailing slash from baseURL and lets per-role models override', () => {
    const body = buildOllamaBody({ ...req, role: 'grader', maxTokens: 300, temperature: 0.9 }, 'qwen', false);
    expect(body.options).toEqual({ num_predict: 300, temperature: 0.9 });
    const { fetch, captured } = fakeFetch(() => ndjson([{ message: { role: 'assistant', content: 'x' }, done: true, prompt_eval_count: 1, eval_count: 1 }]));
    const p = createOllamaProvider({ model: 'a', models: { grader: 'b' }, baseURL: 'http://box:11434/', fetch });
    return p.text({ ...req, role: 'grader' }).then(() => {
      expect(captured[0]!.url).toBe('http://box:11434/api/chat');
      expect(captured[0]!.body.model).toBe('b');
    });
  });

  it('structured: sends a JSON schema in `format`, non-streaming, temperature 0, and validates the reply', async () => {
    const value = { attemptMade: true, gaveUp: false, offTopic: false, objectiveProgress: [], misconceptionTags: [], keyIdeaStated: false, priorKnowledgeElicited: false, stuck: false, unsourcedClaims: [] };
    const { fetch, captured } = fakeFetch(() => new Response(JSON.stringify({ message: { role: 'assistant', content: JSON.stringify(value) }, done: true, prompt_eval_count: 50, eval_count: 20 }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const p = createOllamaProvider({ model: 'llama3.2', fetch });
    const r = await p.structured({ ...req, role: 'observer' }, ObserverResultSchema, 'ObserverResult');
    expect(r.value).toEqual(value);
    expect(r.usage).toMatchObject({ inputTokens: 50, outputTokens: 20, costUsd: 0 });
    const body = captured[0]!.body;
    expect(body.stream).toBe(false);
    expect(body.options.temperature).toBe(0);
    expect(body.options.num_predict).toBe(2048);
    expect(body.format).toMatchObject({ type: 'object' });
    expect((body.format as { required: string[] }).required).toContain('attemptMade');
    expect((body.format as { properties: Record<string, unknown> }).properties['objectiveProgress']).toBeDefined();
    expect(body.format).not.toHaveProperty('$schema');
  });

  it('structured: retries once on an invalid reply, then fails', async () => {
    let n = 0;
    const { fetch } = fakeFetch(() => {
      n++;
      const content = n === 1 ? '{"nope": true}' : '```json\n{"ok": true, "n": 3}\n```';
      return new Response(JSON.stringify({ message: { role: 'assistant', content }, done: true, prompt_eval_count: 5, eval_count: 5 }), { status: 200 });
    });
    const p = createOllamaProvider({ model: 'm', fetch });
    const r = await p.structured(req, z.object({ ok: z.boolean(), n: z.number() }), 'T');
    expect(r.value).toEqual({ ok: true, n: 3 });
    expect(n).toBe(2);
    expect(r.usage.inputTokens).toBe(10);

    const bad = fakeFetch(() => new Response(JSON.stringify({ message: { role: 'assistant', content: 'nonsense' }, done: true }), { status: 200 }));
    await expect(createOllamaProvider({ model: 'm', fetch: bad.fetch }).structured(req, z.object({ ok: z.boolean() }), 'T')).rejects.toThrow(/did not match schema T/);
    expect(bad.captured).toHaveLength(2);
  });

  it('retries once on a connection error and surfaces HTTP errors', async () => {
    let n = 0;
    const flaky = (async () => {
      n++;
      if (n === 1) throw new TypeError('fetch failed');
      return ndjson([{ message: { role: 'assistant', content: 'ok' }, done: true, prompt_eval_count: 1, eval_count: 1 }]);
    }) as unknown as typeof fetch;
    const p = createOllamaProvider({ model: 'm', fetch: flaky, retryDelayMs: 0 });
    expect((await p.text(req)).text).toBe('ok');
    expect(n).toBe(2);

    const notFound = fakeFetch(() => new Response('model not found', { status: 404 }));
    await expect(createOllamaProvider({ model: 'm', fetch: notFound.fetch }).text(req)).rejects.toThrow(/HTTP 404/);
    expect(notFound.captured).toHaveLength(1);
  });

  it('stream yields an error event instead of throwing', async () => {
    const { fetch } = fakeFetch(() => new Response('boom', { status: 500 }));
    const p = createOllamaProvider({ model: 'm', fetch, retryDelayMs: 0 });
    const events = [];
    for await (const ev of p.stream(req)) events.push(ev);
    expect(events.at(-1)?.type).toBe('error');
    expect(events.at(-1)?.error).toMatch(/500/);
  });

  it('toOllamaFormat / extractJson helpers', () => {
    const f = toOllamaFormat(z.object({ a: z.string().optional(), b: z.array(z.number()) }));
    expect(f['type']).toBe('object');
    expect(extractJson('Sure! ```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson('Here you go: {"a":1} hope that helps')).toBe('{"a":1}');
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });
});
