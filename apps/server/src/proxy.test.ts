import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildClientHeaders, buildUpstreamHeaders, createApp, ledgerKeyFor, parseTokens } from './app.ts';
import { BudgetLedger, dayOf } from './ledger.ts';
import { costUsd, priceFor } from './prices.ts';
import { SseUsageParser, usageFromJson, usageFromSse } from './usage.ts';

// A realistic Messages streaming transcript: message_start carries input/cache counts,
// message_delta carries the final output count.
const SSE_BODY = [
  'event: message_start',
  'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-5-20260401","content":[],"stop_reason":null,"usage":{"input_tokens":1000,"cache_creation_input_tokens":200,"cache_read_input_tokens":4000,"output_tokens":1}}}',
  '',
  'event: content_block_start',
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
  '',
  ': keep-alive',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
  '',
  'event: message_delta',
  'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":500}}',
  '',
  'event: message_stop',
  'data: {"type":"message_stop"}',
  '',
].join('\n');

// 1000*2 + 500*10 + 4000*0.2 + 200*2.5 = 2000 + 5000 + 800 + 500 = 8300 per MTok -> $0.0083
const SSE_COST = 0.0083;

describe('prices', () => {
  it('matches model families by prefix, longest wins, unknown falls back to opus', () => {
    expect(priceFor('claude-sonnet-5-20260401')).toBe(priceFor('claude-sonnet-5'));
    expect(priceFor('claude-haiku-4-5-20251001').output).toBe(5);
    expect(priceFor('gpt-oss')).toBe(priceFor('claude-opus-5'));
    expect(priceFor(undefined).input).toBe(5);
  });

  it('computes cost per MTok', () => {
    const usd = costUsd('claude-opus-5', {
      input_tokens: 1_000_000,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
    expect(usd).toBe(5);
  });
});

describe('SSE usage parser', () => {
  it('accumulates usage across message_start and message_delta', () => {
    const r = usageFromSse(SSE_BODY);
    expect(r.model).toBe('claude-sonnet-5-20260401');
    expect(r.complete).toBe(true);
    expect(r.usage).toEqual({
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_input_tokens: 4000,
      cache_creation_input_tokens: 200,
    });
    expect(costUsd(r.model, r.usage)).toBeCloseTo(SSE_COST, 10);
  });

  it('is insensitive to chunk boundaries and CRLF', () => {
    const crlf = SSE_BODY.replace(/\n/g, '\r\n');
    const p = new SseUsageParser();
    for (let i = 0; i < crlf.length; i += 7) p.feed(crlf.slice(i, i + 7));
    const r = p.end();
    expect(r.usage.output_tokens).toBe(500);
    expect(r.usage.input_tokens).toBe(1000);
  });

  it('prefers cumulative counts from message_delta when present', () => {
    const r = usageFromSse(
      [
        'data: {"type":"message_start","message":{"model":"claude-opus-5","usage":{"input_tokens":10,"output_tokens":1}}}',
        '',
        'data: {"type":"message_delta","delta":{},"usage":{"input_tokens":12,"output_tokens":99,"cache_read_input_tokens":3}}',
        '',
      ].join('\n'),
    );
    expect(r.usage).toEqual({ input_tokens: 12, output_tokens: 99, cache_read_input_tokens: 3, cache_creation_input_tokens: 0 });
  });

  it('ignores malformed data lines and reports incomplete streams', () => {
    const r = usageFromSse('data: {not json\n\ndata: {"type":"message_start","message":{"usage":{"input_tokens":5}}}\n');
    expect(r.complete).toBe(false);
    expect(r.usage.input_tokens).toBe(5);
  });

  it('reads usage from a non-streaming body and returns undefined without one', () => {
    expect(usageFromJson({ model: 'claude-haiku-4-5', usage: { input_tokens: 7, output_tokens: 3 } })?.usage.output_tokens).toBe(3);
    expect(usageFromJson({ input_tokens: 42 })).toBeUndefined();
    expect(usageFromJson(null)).toBeUndefined();
  });
});

describe('budget ledger', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('accumulates per key, gates at the budget, and resets at UTC midnight', () => {
    let now = new Date('2026-09-16T23:30:00Z');
    const ledger = new BudgetLedger({ budgetUsd: 1, now: () => now });
    expect(ledger.allows('a')).toBe(true);
    ledger.charge('a', 0.6);
    ledger.charge('b', 0.1);
    expect(ledger.spent('a')).toBeCloseTo(0.6);
    expect(ledger.allows('a')).toBe(true);
    ledger.charge('a', 0.5);
    expect(ledger.allows('a')).toBe(false);
    expect(ledger.allows('b')).toBe(true);
    expect(ledger.remaining('a')).toBe(0);
    expect(ledger.resetsAt().toISOString()).toBe('2026-09-17T00:00:00.000Z');

    now = new Date('2026-09-17T00:00:01Z');
    expect(ledger.spent('a')).toBe(0);
    expect(ledger.allows('a')).toBe(true);
    expect(ledger.snapshot().day).toBe(dayOf(now));
  });

  it('ignores non-positive charges', () => {
    const ledger = new BudgetLedger({ budgetUsd: 1 });
    ledger.charge('a', 0);
    ledger.charge('a', -1);
    ledger.charge('a', Number.NaN);
    expect(ledger.spent('a')).toBe(0);
  });

  it('persists to a JSON file and reloads the same day only', () => {
    dir = mkdtempSync(join(tmpdir(), 'ledger-'));
    const path = join(dir, 'nested', 'ledger.json');
    const now = new Date('2026-09-16T12:00:00Z');
    const a = new BudgetLedger({ budgetUsd: 5, path, now: () => now });
    a.charge('k', 1.25);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ day: '2026-09-16', spent: { k: 1.25 } });

    const b = new BudgetLedger({ budgetUsd: 5, path, now: () => now });
    expect(b.spent('k')).toBe(1.25);

    const c = new BudgetLedger({ budgetUsd: 5, path, now: () => new Date('2026-09-17T12:00:00Z') });
    expect(c.spent('k')).toBe(0);
  });
});

describe('header policy', () => {
  it('forwards only the allowlisted request headers and injects the key', () => {
    const incoming = new Headers({
      authorization: 'Bearer app-token',
      'x-api-key': 'client-supplied-should-be-dropped',
      cookie: 'session=1',
      host: 'example.com',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'files-api-2025-04-14',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    const out = buildUpstreamHeaders(incoming, 'sk-real');
    expect(out.get('x-api-key')).toBe('sk-real');
    expect(out.get('anthropic-version')).toBe('2023-06-01');
    expect(out.get('anthropic-beta')).toBe('files-api-2025-04-14');
    expect(out.get('content-type')).toBe('application/json');
    expect(out.has('authorization')).toBe(false);
    expect(out.has('cookie')).toBe(false);
    expect(out.has('host')).toBe(false);
    expect(out.has('anthropic-dangerous-direct-browser-access')).toBe(false);
  });

  it('strips hop-by-hop and encoding headers from the response', () => {
    const out = buildClientHeaders(
      new Headers({ 'content-type': 'text/event-stream', 'content-encoding': 'gzip', 'content-length': '5', 'request-id': 'req_1' }),
    );
    expect(out.get('content-type')).toBe('text/event-stream');
    expect(out.get('request-id')).toBe('req_1');
    expect(out.has('content-encoding')).toBe(false);
    expect(out.has('content-length')).toBe(false);
  });

  it('parses token lists and hashes ledger keys', () => {
    expect([...parseTokens(' a, b ,,c ')]).toEqual(['a', 'b', 'c']);
    expect(parseTokens(undefined).size).toBe(0);
    expect(ledgerKeyFor('tok1')).toMatch(/^[0-9a-f]{16}$/);
    expect(ledgerKeyFor('tok1')).not.toBe(ledgerKeyFor('tok2'));
  });
});

interface Recorded {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

function fakeFetch(respond: (r: Recorded) => Response) {
  const calls: Recorded[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body =
      init?.body instanceof ArrayBuffer
        ? new TextDecoder().decode(init.body)
        : typeof init?.body === 'string'
          ? init.body
          : '';
    const rec: Recorded = { url, method: init?.method ?? 'GET', headers: new Headers(init?.headers), body };
    calls.push(rec);
    return respond(rec);
  }) as typeof fetch;
  return { fetch: f, calls };
}

function sseResponse(body: string = SSE_BODY): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const bytes = new TextEncoder().encode(body);
      // Emit in small pieces so the metering branch sees realistic chunking.
      for (let i = 0; i < bytes.length; i += 64) controller.enqueue(bytes.slice(i, i + 64));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'request-id': 'req_abc', 'content-encoding': 'gzip' },
  });
}

const messagesRequest = (extra: Record<string, string> = {}) =>
  new Request('http://localhost/api/anthropic/v1/messages?beta=true', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': 'leaked-client-key',
      ...extra,
    },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 10, stream: true, messages: [{ role: 'user', content: 'hi' }] }),
  });

function nextCharge(register: (cb: (info: { usd: number; total: number; model?: string }) => void) => void) {
  return new Promise<{ usd: number; total: number; model?: string }>((resolve) => register(resolve));
}

describe('proxy handler', () => {
  it('reports health', async () => {
    const { app } = createApp({ env: { ANTHROPIC_API_KEY: 'k' } });
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, auth: 'anonymous', budgetUsd: 5 });
  });

  it('rewrites the path, injects the key, strips client auth, and streams SSE back while metering', async () => {
    const { fetch, calls } = fakeFetch(() => sseResponse());
    const charges: { usd: number; total: number; model?: string }[] = [];
    const { app, ledger } = createApp({
      fetch,
      env: { ANTHROPIC_API_KEY: 'sk-real', DAILY_BUDGET_USD: '1' },
      onCharge: (info) => charges.push(info),
    });

    const charged = nextCharge((cb) => {
      const orig = charges.push.bind(charges);
      charges.push = (info) => {
        cb(info);
        return orig(info);
      };
    });

    const res = await app.request(messagesRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('request-id')).toBe('req_abc');
    expect(res.headers.has('content-encoding')).toBe(false);
    expect(res.headers.get('x-budget-remaining-usd')).toBe('1.0000');

    const call = calls[0]!;
    expect(call.url).toBe('https://api.anthropic.com/v1/messages?beta=true');
    expect(call.method).toBe('POST');
    expect(call.headers.get('x-api-key')).toBe('sk-real');
    expect(call.headers.get('anthropic-version')).toBe('2023-06-01');
    expect(call.headers.has('authorization')).toBe(false);
    expect(JSON.parse(call.body).model).toBe('claude-sonnet-5');

    // The client receives the upstream body byte for byte.
    expect(await res.text()).toBe(SSE_BODY);

    const info = await charged;
    expect(info.model).toBe('claude-sonnet-5-20260401');
    expect(info.usd).toBeCloseTo(SSE_COST, 10);
    expect(ledger.spent('anonymous')).toBeCloseTo(SSE_COST, 10);
  });

  it('meters non-streaming JSON responses and forwards them verbatim', async () => {
    const json = JSON.stringify({
      id: 'msg_2',
      model: 'claude-haiku-4-5',
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
    });
    const { fetch } = fakeFetch(() => new Response(json, { status: 200, headers: { 'content-type': 'application/json' } }));
    const { app, ledger } = createApp({ fetch, env: { ANTHROPIC_API_KEY: 'k' } });
    const res = await app.request(messagesRequest());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(json);
    expect(ledger.spent('anonymous')).toBeCloseTo(1, 10); // 1M haiku input tokens = $1
  });

  it('does not charge for error responses or count_tokens', async () => {
    const { fetch } = fakeFetch((r) =>
      r.url.endsWith('/count_tokens')
        ? new Response(JSON.stringify({ input_tokens: 12 }), { headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error' } }), {
            status: 529,
            headers: { 'content-type': 'application/json' },
          }),
    );
    const { app, ledger } = createApp({ fetch, env: { ANTHROPIC_API_KEY: 'k' } });
    const err = await app.request(messagesRequest());
    expect(err.status).toBe(529);
    const count = await app.request(
      new Request('http://localhost/api/anthropic/v1/messages/count_tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"model":"claude-opus-5","messages":[]}',
      }),
    );
    expect(await count.json()).toEqual({ input_tokens: 12 });
    expect(ledger.spent('anonymous')).toBe(0);
  });

  it('accumulates per app token and returns 429 once the budget is exhausted', async () => {
    const { fetch, calls } = fakeFetch(() => sseResponse());
    let resolveCharge: (() => void) | undefined;
    const { app, ledger } = createApp({
      fetch,
      env: { ANTHROPIC_API_KEY: 'k', APP_TOKENS: 'tok1,tok2', DAILY_BUDGET_USD: '0.01' },
      onCharge: () => resolveCharge?.(),
    });

    // No / wrong token: rejected before anything is forwarded.
    expect((await app.request(messagesRequest())).status).toBe(401);
    expect((await app.request(messagesRequest({ authorization: 'Bearer nope' }))).status).toBe(401);
    expect(calls.length).toBe(0);

    // First call for tok1: $0.0083 of a $0.01 budget.
    let settled = new Promise<void>((r) => (resolveCharge = r));
    const first = await app.request(messagesRequest({ authorization: 'Bearer tok1' }));
    expect(first.status).toBe(200);
    await first.text();
    await settled;
    expect(ledger.spent(ledgerKeyFor('tok1'))).toBeCloseTo(SSE_COST, 10);

    // Second call still admitted (budget not yet crossed), which pushes tok1 over the line.
    settled = new Promise<void>((r) => (resolveCharge = r));
    const second = await app.request(messagesRequest({ authorization: 'Bearer tok1' }));
    expect(second.status).toBe(200);
    await second.text();
    await settled;
    expect(ledger.spent(ledgerKeyFor('tok1'))).toBeCloseTo(2 * SSE_COST, 10);

    // Third call: 429 with a JSON error and retry-after, nothing forwarded.
    const before = calls.length;
    const third = await app.request(messagesRequest({ authorization: 'Bearer tok1' }));
    expect(third.status).toBe(429);
    expect(third.headers.get('retry-after')).toMatch(/^\d+$/);
    const body = await third.json();
    expect(body.error.type).toBe('budget_exceeded');
    expect(body.error.budget_usd).toBe(0.01);
    expect(body.error.resets_at).toMatch(/T00:00:00\.000Z$/);
    expect(calls.length).toBe(before);

    // tok2 has its own budget and is unaffected.
    expect((await app.request(messagesRequest({ authorization: 'Bearer tok2' }))).status).toBe(200);
  });

  it('returns 502 when the upstream is unreachable and 500 without a key', async () => {
    const { app } = createApp({
      fetch: (async () => {
        throw new Error('ECONNREFUSED');
      }) as typeof fetch,
      env: { ANTHROPIC_API_KEY: 'k' },
    });
    const res = await app.request(messagesRequest());
    expect(res.status).toBe(502);
    expect((await res.json()).error.type).toBe('upstream_unreachable');

    const { app: noKey } = createApp({ env: {} });
    expect((await noKey.request(messagesRequest())).status).toBe(500);
  });
});
