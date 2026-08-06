import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/**/*.test.ts'],
      include: ['src/lib/**/*.ts'],
      provider: 'v8',
      thresholds: {
        // Keep a small margin below the current 99.82% Node 20/22 baseline.
        branches: 99.8,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
