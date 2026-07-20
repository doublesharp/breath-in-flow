import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './tests/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{ts,vue}'],
      exclude: [
        'node_modules/',
        'src/**/*.d.ts',
        'src/main.ts',
        'dist/',
        'dist-electron/',
        'android/',
        'ios/',
        'electron/',
        'build/',
      ],
      thresholds: {
        statements: 80,
        lines: 80,
        branches: 70,
        functions: 75,
        'src/services/{measurementSession,permissionService,ppgService,scgService,sensorFusion}.ts':
          {
            statements: 80,
            lines: 80,
            branches: 70,
            functions: 85,
            perFile: true,
          },
        'src/components/{LabTab,ResonanceAssessment}.vue': {
          statements: 40,
          lines: 45,
          branches: 40,
          functions: 35,
          perFile: true,
        },
        'src/utils/measurementTrends.ts': {
          lines: 100,
          functions: 100,
          perFile: true,
        },
      },
    },
  },
});
