import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The live suite talks to api.thesubtitledb.org and runs from its own config, so
    // `npm test` stays offline and deterministic.
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.live.test.ts', 'node_modules/**'],
  },
});
