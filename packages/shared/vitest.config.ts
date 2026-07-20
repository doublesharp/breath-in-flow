import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      thresholds: {
        statements: 90,
        lines: 90,
        branches: 80,
        functions: 90,
        'src/hrv/eligibility.ts': {
          statements: 90,
          lines: 90,
          branches: 80,
          functions: 90,
        },
      },
    },
  },
});
