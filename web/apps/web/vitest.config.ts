import { defineConfig } from 'vitest/config';

// Service tests run in Node against the node:sqlite executor; the browser is covered by Playwright (e2e/).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    execArgv: ['--no-warnings=ExperimentalWarning'],
  },
});
