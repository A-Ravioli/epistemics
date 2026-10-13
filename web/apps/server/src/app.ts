import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { ANONYMOUS_KEY, BudgetLedger } from './ledger.ts';
import { costUsd } from './prices.ts';
import { SseUsageParser, usageFromJson } from './usage.ts';

export interface AppEnv {
  /** Anthropic API key, injected as `x-api-key`. Required for the proxy to work. */
  ANTHROPIC_API_KEY?: string;
  /** Upstream base, default `https://api.anthropic.com`. */
  ANTHROPIC_BASE_URL?: string;
  /** Comma-separated static app tokens. Unset: anonymous access with one shared budget. */
  APP_TOKENS?: string;
  /** Per-token daily budget in USD (UTC day). Default 5. */
  DAILY_BUDGET_USD?: string;
  /** JSON file for ledger persistence. Unset: memory only. */
  LEDGER_PATH?: string;
  /** "1" to serve the web build from WEB_DIST. */
  SERVE_WEB?: string;
  /** Directory of the web build. Default `../web/dist` relative to the server package. */
  WEB_DIST?: string;
}

export interface CreateAppOptions {
  /** fetch used for the upstream call. Tests inject a fake; production uses the global. */
  fetch?: typeof fetch;
  env?: AppEnv;
  ledger?: BudgetLedger;
  /** Called when a request's usage has been settled. Tests await this. */
  onCharge?: (info: { key: string; model: string | undefined; usd: number; total: number }) => void;
  /** Static-file middleware for `SERVE_WEB=1`; injected so `createApp` has no filesystem dependency. */
  serveStatic?: (webDist: string) => { assets: Handler; index: Handler };
}

type Handler = (c: import('hono').Context, next: () => Promise<void>) => Promise<Response | void>;

export const DEFAULT_UPSTREAM = 'https://api.anthropic.com';

/** Request headers copied to the upstream. Everything else (auth, cookies, host, lengths) is dropped. */
export const FORWARDED_REQUEST_HEADERS = ['anthropic-version', 'anthropic-beta', 'content-type', 'accept'] as const;

/** Hop-by-hop and encoding headers that must not be echoed: fetch already decoded the body. */
const DROPPED_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'set-cookie',
]);

/** Ledger key for a bearer token: short hash so the persisted ledger never contains a token. */
export function ledgerKeyFor(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

export function parseTokens(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0),
  );
}

export function buildUpstreamHeaders(incoming: Headers, apiKey: string): Headers {
  const out = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const v = incoming.get(name);
    if (v !== null) out.set(name, v);
  }
  out.set('x-api-key', apiKey);
  return out;
}

export function buildClientHeaders(upstream: Headers): Headers {
  const out = new Headers();
  upstream.forEach((v, k) => {
    if (!DROPPED_RESPONSE_HEADERS.has(k.toLowerCase())) out.set(k, v);
  });
  return out;
}

function modelFromBody(bytes: ArrayBuffer, contentType: string | null): string | undefined {
  if (bytes.byteLength === 0 || !contentType?.includes('json')) return undefined;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { model?: unknown };
    return typeof parsed.model === 'string' ? parsed.model : undefined;
  } catch {
    return undefined;
  }
}

function jsonError(
  status: number,
  type: string,
  message: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type, message, ...extra } }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export function createApp(opts: CreateAppOptions = {}) {
  const env = opts.env ?? {};
  const upstreamFetch = opts.fetch ?? globalThis.fetch;
  const upstreamBase = (env.ANTHROPIC_BASE_URL ?? DEFAULT_UPSTREAM).replace(/\/+$/, '');
  const tokens = parseTokens(env.APP_TOKENS);
  const budgetUsd = Number(env.DAILY_BUDGET_USD ?? '5');
  const ledger =
    opts.ledger ??
    new BudgetLedger({
      budgetUsd: Number.isFinite(budgetUsd) && budgetUsd >= 0 ? budgetUsd : 5,
      path: env.LEDGER_PATH,
    });

  const app = new Hono();

  app.get('/healthz', (c) =>
    c.json({ ok: true, upstream: upstreamBase, auth: tokens.size > 0 ? 'token' : 'anonymous', budgetUsd: ledger.budgetUsd }),
  );

  app.all('/api/anthropic/*', async (c) => {
    // 1. Identify the caller.
    let key = ANONYMOUS_KEY;
    if (tokens.size > 0) {
      const auth = c.req.header('authorization') ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      if (!token || !tokens.has(token)) return jsonError(401, 'authentication_error', 'invalid or missing app token');
      key = ledgerKeyFor(token);
    }

    // 2. Budget gate. Requests are admitted while any budget remains; the request that crosses the line completes.
    if (!ledger.allows(key)) {
      const resetsAt = ledger.resetsAt();
      const retryAfter = Math.max(1, Math.ceil((resetsAt.getTime() - Date.now()) / 1000));
      return jsonError(
        429,
        'budget_exceeded',
        `daily budget of $${ledger.budgetUsd.toFixed(2)} exhausted`,
        { spent_usd: ledger.spent(key), budget_usd: ledger.budgetUsd, resets_at: resetsAt.toISOString() },
        { 'retry-after': String(retryAfter) },
      );
    }

    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) return jsonError(500, 'server_misconfigured', 'ANTHROPIC_API_KEY is not set');

    // 3. Build the upstream request.
    const incoming = c.req.raw;
    const url = new URL(incoming.url);
    const path = url.pathname.replace(/^\/api\/anthropic/, '') || '/';
    const upstreamUrl = `${upstreamBase}${path}${url.search}`;
    const method = incoming.method.toUpperCase();
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const bodyBytes = hasBody ? await incoming.arrayBuffer() : new ArrayBuffer(0);
    const requestedModel = modelFromBody(bodyBytes, incoming.headers.get('content-type'));

    let upstream: Response;
    try {
      upstream = await upstreamFetch(upstreamUrl, {
        method,
        headers: buildUpstreamHeaders(incoming.headers, apiKey),
        body: hasBody && bodyBytes.byteLength > 0 ? bodyBytes : undefined,
        redirect: 'manual',
      });
    } catch (err) {
      return jsonError(502, 'upstream_unreachable', err instanceof Error ? err.message : String(err));
    }

    const headers = buildClientHeaders(upstream.headers);
    headers.set('x-budget-remaining-usd', ledger.remaining(key).toFixed(4));
    const contentType = upstream.headers.get('content-type') ?? '';

    const settle = (model: string | undefined, usd: number) => {
      const total = ledger.charge(key, usd);
      opts.onCharge?.({ key, model, usd, total });
    };

    // 4a. Streaming: hand one branch of the body to the client and read usage from the other.
    if (upstream.body && contentType.includes('text/event-stream')) {
      const [toClient, toMeter] = upstream.body.tee();
      void (async () => {
        const parser = new SseUsageParser();
        const decoder = new TextDecoder();
        const reader = toMeter.getReader();
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            parser.feed(decoder.decode(value, { stream: true }));
          }
          parser.feed(decoder.decode());
        } catch (err) {
          console.error('[proxy] metering stream failed:', err);
        }
        const parsed = parser.end();
        settle(parsed.model ?? requestedModel, costUsd(parsed.model ?? requestedModel, parsed.usage));
      })();
      return new Response(toClient, { status: upstream.status, headers });
    }

    // 4b. JSON: buffer, meter, forward verbatim.
    if (contentType.includes('application/json')) {
      const text = await upstream.text();
      try {
        const parsed = usageFromJson(JSON.parse(text));
        if (parsed) settle(parsed.model ?? requestedModel, costUsd(parsed.model ?? requestedModel, parsed.usage));
      } catch {
        // Not JSON after all; nothing to meter.
      }
      return new Response(text, { status: upstream.status, headers });
    }

    // 4c. Anything else passes through untouched.
    return new Response(upstream.body, { status: upstream.status, headers });
  });

  if (env.SERVE_WEB === '1' && opts.serveStatic) {
    const webDist = env.WEB_DIST ?? new URL('../../web/dist', import.meta.url).pathname;
    const { assets, index } = opts.serveStatic(webDist);
    app.use('/*', assets);
    app.get('/*', index);
  }

  return { app, ledger };
}
