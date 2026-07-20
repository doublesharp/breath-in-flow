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
        lines: 95,
        branches: 85,
        functions: 90,
        'src/hrv/**/*.ts': {
          lines: 95,
          branches: 85,
        },
        'src/hrv/eligibility.ts': {
          statements: 95,
          lines: 95,
          branches: 85,
          functions: 100,
        },
        'src/hrv/finalizeMeasurement.ts': {
          lines: 100,
          functions: 100,
        },
      },
    },
  },
});
