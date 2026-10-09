import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/browser/**', 'node_modules/**'],
    environment: 'node',
    // node:sqlite is stable in behaviour but still tagged experimental in Node 22; keep test output clean.
    execArgv: ['--no-warnings=ExperimentalWarning'],
  },
});
