/**
 * Anthropic passthrough for signed-in Epistemics users (Supabase Edge Function, Deno).
 *
 *   - verifies the caller's Supabase JWT (`Authorization: Bearer <access token>`)
 *   - injects ANTHROPIC_API_KEY from the function's secrets; the browser never sees it
 *   - forwards the request to https://api.anthropic.com with only `anthropic-version`, `anthropic-beta`
 *     and `content-type` copied over; the response body (SSE or JSON) streams back unchanged
 *   - enforces a per-user daily USD budget in `llm_budget(user_id, day, spent_usd)` (UTC day),
 *     metering usage with the same SSE parser as apps/server
 *
 * Secrets: ANTHROPIC_API_KEY (required), DAILY_BUDGET_USD (default 5), ANTHROPIC_BASE_URL (optional).
 * SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Promise<Response> | Response): void };
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const UPSTREAM = Deno.env.get('ANTHROPIC_BASE_URL') ?? 'https://api.anthropic.com';
const FORWARDED_HEADERS = ['anthropic-version', 'anthropic-beta', 'content-type'];
const DROPPED_RESPONSE_HEADERS = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'set-cookie']);
const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': 'x-budget-remaining-usd, request-id',
};

// ---------------- usage metering (mirrors apps/server/src/{prices,usage}.ts) ----------------

interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
const EMPTY_USAGE: Usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
/** USD per million tokens by model prefix; unknown models price as the most expensive so a typo cannot bypass the budget. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};
function costUsd(model: string | undefined, u: Usage): number {
  const m = (model ?? '').toLowerCase();
  let best: { key: string; price: (typeof PRICES)[string] } | undefined;
  for (const [key, price] of Object.entries(PRICES)) if (m.startsWith(key) && (!best || key.length > best.key.length)) best = { key, price };
  const p = best?.price ?? PRICES['claude-opus-5']!;
  return (u.input_tokens * p.input + u.output_tokens * p.output + u.cache_read_input_tokens * p.cacheRead + u.cache_creation_input_tokens * p.cacheWrite) / 1_000_000;
}
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
function mergeUsage(base: Usage, patch: unknown): Usage {
  if (!patch || typeof patch !== 'object') return base;
  const p = patch as Record<string, unknown>;
  return {
    input_tokens: num(p.input_tokens) ?? base.input_tokens,
    output_tokens: num(p.output_tokens) ?? base.output_tokens,
    cache_read_input_tokens: num(p.cache_read_input_tokens) ?? base.cache_read_input_tokens,
    cache_creation_input_tokens: num(p.cache_creation_input_tokens) ?? base.cache_creation_input_tokens,
  };
}
/** Incremental SSE parser: accumulates usage from `message_start` / `message_delta`, ignores everything else. */
class SseUsageParser {
  private buffer = '';
  private data: string[] = [];
  model: string | undefined;
  usage: Usage = { ...EMPTY_USAGE };
  feed(chunk: string): void {
    this.buffer += chunk;
    let nl: number;
    while ((nl = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, nl).replace(/\r$/, '');
      this.buffer = this.buffer.slice(nl + 1);
      if (line === '') this.dispatch();
      else if (line.startsWith('data:')) this.data.push(line.slice(5).replace(/^ /, ''));
    }
  }
  end(): void {
    if (this.buffer) { this.feed('\n'); this.buffer = ''; }
    this.dispatch();
  }
  private dispatch(): void {
    if (this.data.length === 0) return;
    const text = this.data.join('\n');
    this.data = [];
    let ev: Record<string, unknown>;
    try { ev = JSON.parse(text); } catch { return; }
    if (!ev || typeof ev !== 'object') return;
    if (ev.type === 'message_start') {
      const msg = ev.message as Record<string, unknown> | undefined;
      if (msg) { if (typeof msg.model === 'string') this.model = msg.model; this.usage = mergeUsage(this.usage, msg.usage); }
    } else if (ev.type === 'message_delta') {
      this.usage = mergeUsage(this.usage, ev.usage);
    }
  }
}

// ---------------- handler ----------------

function json(status: number, type: string, message: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), { status, headers: { 'content-type': 'application/json', ...CORS, ...extra } });
}

function modelFromBody(bytes: ArrayBuffer): string | undefined {
  try { const m = (JSON.parse(new TextDecoder().decode(bytes)) as { model?: unknown }).model; return typeof m === 'string' ? m : undefined; } catch { return undefined; }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json(500, 'server_misconfigured', 'ANTHROPIC_API_KEY is not set');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const budget = Number(Deno.env.get('DAILY_BUDGET_USD') ?? '5');

  // 1. Who is calling? The platform already verified the JWT signature; resolve the user for the budget key.
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json(401, 'authentication_error', 'Missing bearer token');
  const asUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: { user }, error: userError } = await asUser.auth.getUser();
  if (userError || !user) return json(401, 'authentication_error', 'Invalid or expired session');

  // 2. Budget check (UTC day).
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const day = new Date().toISOString().slice(0, 10);
  const { data: row } = await admin.from('llm_budget').select('spent_usd').eq('user_id', user.id).eq('day', day).maybeSingle();
  const spent = Number(row?.spent_usd ?? 0);
  if (budget > 0 && spent >= budget) {
    return json(402, 'budget_exhausted', `Daily budget of $${budget.toFixed(2)} reached; resets at 00:00 UTC`, { 'x-budget-remaining-usd': '0.0000' });
  }

  // 3. Forward.
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/(functions\/v1\/)?anthropic-proxy/, '') || '/';
  const method = req.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const body = hasBody ? await req.arrayBuffer() : new ArrayBuffer(0);
  const requestedModel = hasBody ? modelFromBody(body) : undefined;
  const headers = new Headers({ 'x-api-key': apiKey, accept: req.headers.get('accept') ?? '*/*' });
  for (const h of FORWARDED_HEADERS) { const v = req.headers.get(h); if (v) headers.set(h, v); }

  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM}${path}${url.search}`, { method, headers, body: hasBody && body.byteLength > 0 ? body : undefined, redirect: 'manual' });
  } catch (e) {
    return json(502, 'upstream_unreachable', e instanceof Error ? e.message : String(e));
  }

  const out = new Headers(CORS);
  upstream.headers.forEach((v, k) => { if (!DROPPED_RESPONSE_HEADERS.has(k.toLowerCase())) out.set(k, v); });
  out.set('x-budget-remaining-usd', Math.max(0, budget - spent).toFixed(4));
  const contentType = upstream.headers.get('content-type') ?? '';

  const charge = async (model: string | undefined, usage: Usage) => {
    const usd = costUsd(model ?? requestedModel, usage);
    if (usd <= 0) return;
    const { error } = await admin.rpc('llm_budget_charge', { p_user: user.id, p_day: day, p_usd: usd });
    if (error) console.error('[anthropic-proxy] budget charge failed', error.message);
  };
  const background = (p: Promise<void>) => { if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime) EdgeRuntime.waitUntil(p); else void p; };

  // 4a. Streaming: tee the body, one branch to the client, one to the meter.
  if (upstream.body && contentType.includes('text/event-stream')) {
    const [toClient, toMeter] = upstream.body.tee();
    background((async () => {
      const parser = new SseUsageParser();
      const decoder = new TextDecoder();
      const reader = toMeter.getReader();
      try {
        for (;;) { const { value, done } = await reader.read(); if (done) break; parser.feed(decoder.decode(value, { stream: true })); }
        parser.feed(decoder.decode());
      } catch (e) { console.error('[anthropic-proxy] metering failed', e); }
      parser.end();
      await charge(parser.model, parser.usage);
    })());
    return new Response(toClient, { status: upstream.status, headers: out });
  }

  // 4b. JSON: buffer, meter, forward verbatim.
  if (contentType.includes('application/json')) {
    const text = await upstream.text();
    try {
      const parsed = JSON.parse(text) as { model?: unknown; usage?: unknown };
      if (parsed && typeof parsed === 'object' && parsed.usage) background(charge(typeof parsed.model === 'string' ? parsed.model : undefined, mergeUsage(EMPTY_USAGE, parsed.usage)));
    } catch { /* not JSON after all */ }
    return new Response(text, { status: upstream.status, headers: out });
  }

  return new Response(upstream.body, { status: upstream.status, headers: out });
});
