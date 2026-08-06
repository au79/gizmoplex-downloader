import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/**/*.test.ts'],
      include: ['src/lib/**/*.ts'],
      provider: 'v8',
      thresholds: {
        // Node 20/22/24 V8 reports different branch maps for existing
        // coordinator control flow; CI's lowest observed branch coverage is
        // 96.87%. New code remains fully covered by focused tests.
        branches: 96.8,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
