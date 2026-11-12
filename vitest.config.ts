import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { $lib: path.resolve('src/lib') },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/fixture/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 180_000,
    globalSetup: ['tests/harness/reset-outcomes.ts'],
  },
});
