import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/**/*.test.ts'],
      include: ['src/lib/**/*.ts'],
      provider: 'v8',
      thresholds: {
        branches: 99.8,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
