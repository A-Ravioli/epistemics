/**
 * Browser-mode tests for the sqlite-wasm executor (real Chromium via Playwright, OPFS + Web Locks + Worker).
 * Run with `pnpm --filter @epistemics/db test:browser`. Kept separate from `test` because it needs a browser.
 */
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  test: {
    include: ['test/browser/**/*.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
