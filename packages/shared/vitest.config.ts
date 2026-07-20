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
        statements: 97,
        lines: 98,
        branches: 92,
        functions: 98,
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
        'src/hrv/index.ts': {
          lines: 100,
          functions: 100,
        },
        'src/hrv/resonanceMetrics.ts': {
          lines: 100,
          branches: 90,
          functions: 100,
        },
        'src/schemas.ts': {
          lines: 100,
          functions: 100,
        },
      },
    },
  },
});
