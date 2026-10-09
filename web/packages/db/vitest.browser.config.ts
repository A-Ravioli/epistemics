/**
 * Browser-mode tests for the sqlite-wasm executor (real Chromium via Playwright, OPFS + Web Locks + Worker).
 * Run with `pnpm --filter @epistemics/db test:browser`. Kept separate from `test` because it needs a browser.
 *
 * Browser lookup: `PW_CHROMIUM_PATH` if set; otherwise the first `chromium-*\/chrome-linux/chrome` found under
 * `PLAYWRIGHT_BROWSERS_PATH` (so a preinstalled Chromium works even when its revision differs from the one
 * this Playwright version would download); otherwise Playwright's own default.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

function findChromium(): string | undefined {
  if (process.env.PW_CHROMIUM_PATH) return process.env.PW_CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) {
      const p = join(root, dir, rel);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

const executablePath = findChromium();

export default defineConfig({
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  test: {
    include: ['test/browser/**/*.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: { ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] },
      }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
