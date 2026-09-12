import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Real requests to the live API. Kept out of `npm test` and out of the same job in
    // CI, so a red run here reads as "the API changed", not "this repo regressed". It
    // is still blocking: nothing else proves the addon and the API agree.
    include: ['test/**/*.live.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Serial, because the anonymous tier is rate limited per IP and a parallel suite
    // spends that budget on itself.
    fileParallelism: false,
  },
});
