import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

const sensorServiceThresholds = {
  lines: 90,
  branches: 80,
  functions: 85,
};

const labComponentThresholds = {
  statements: 75,
  lines: 75,
  branches: 40,
  functions: 35,
};

const completeLineAndFunctionThresholds = {
  lines: 100,
  functions: 100,
};

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
        'src/services/measurementSession.ts': sensorServiceThresholds,
        'src/services/permissionService.ts': sensorServiceThresholds,
        'src/services/ppgService.ts': sensorServiceThresholds,
        'src/services/scgService.ts': sensorServiceThresholds,
        'src/services/sensorFusion.ts': sensorServiceThresholds,
        'src/components/LabTab.vue': labComponentThresholds,
        'src/components/ResonanceAssessment.vue': labComponentThresholds,
        'src/composables/useAppLifecycle.ts': completeLineAndFunctionThresholds,
        'src/composables/useModalIsolation.ts': completeLineAndFunctionThresholds,
        'src/services/adaptiveMotionGate.ts': completeLineAndFunctionThresholds,
        'src/utils/hrvAnalysisValidation.ts': completeLineAndFunctionThresholds,
        'src/utils/measurementTrends.ts': completeLineAndFunctionThresholds,
        'src/utils/storedRecordValidation.ts': completeLineAndFunctionThresholds,
      },
    },
  },
});
