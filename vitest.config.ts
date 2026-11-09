import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'packages/*/test/**/*.test.{ts,tsx}', 'apps/*/src/**/*.test.{ts,tsx}'],
    benchmark: { include: ['packages/*/src/**/*.bench.ts', 'packages/*/bench/**/*.bench.ts'] },
    passWithNoTests: false,
  },
});
