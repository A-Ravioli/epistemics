import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    execArgv: ['--no-warnings=ExperimentalWarning'],
  },
});
