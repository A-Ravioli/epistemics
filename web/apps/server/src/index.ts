import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp, type AppEnv } from './app.ts';

const env = process.env as AppEnv;
const port = Number(process.env.PORT ?? '8787');

const { app, ledger } = createApp({
  env,
  serveStatic: (root) => ({
    assets: serveStatic({ root }),
    // SPA fallback: every unmatched GET returns index.html so client-side routes survive a reload.
    index: serveStatic({ root, path: 'index.html' }),
  }),
});

if (!env.ANTHROPIC_API_KEY) console.warn('[server] ANTHROPIC_API_KEY is not set; /api/anthropic/* will return 500');

serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    `[server] listening on http://localhost:${info.port} (budget $${ledger.budgetUsd}/day, ` +
      `auth ${env.APP_TOKENS ? 'token' : 'anonymous'}, web ${env.SERVE_WEB === '1' ? 'served' : 'off'})`,
  );
});
