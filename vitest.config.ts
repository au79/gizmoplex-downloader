import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/**/*.test.ts'],
      include: ['src/lib/**/*.ts'],
      provider: 'v8',
    },
  },
});
