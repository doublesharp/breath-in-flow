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

const guidedAudioThresholds = {
  lines: 95,
  branches: 80,
  functions: 85,
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
        statements: 89,
        lines: 91,
        branches: 81,
        functions: 86,
        'src/services/measurementSession.ts': sensorServiceThresholds,
        'src/services/permissionService.ts': sensorServiceThresholds,
        'src/services/ppgService.ts': sensorServiceThresholds,
        'src/services/scgService.ts': sensorServiceThresholds,
        'src/services/sensorFusion.ts': sensorServiceThresholds,
        'src/services/soundService.ts': guidedAudioThresholds,
        'src/services/ttsService.ts': guidedAudioThresholds,
        'src/components/LabTab.vue': labComponentThresholds,
        'src/components/ResonanceAssessment.vue': labComponentThresholds,
        'src/composables/useAppLifecycle.ts': completeLineAndFunctionThresholds,
        'src/composables/useModalIsolation.ts': completeLineAndFunctionThresholds,
        'src/composables/usePreferences.ts': completeLineAndFunctionThresholds,
        'src/services/adaptiveMotionGate.ts': completeLineAndFunctionThresholds,
        'src/services/recommendationService.ts': completeLineAndFunctionThresholds,
        'src/utils/hrvAnalysisValidation.ts': completeLineAndFunctionThresholds,
        'src/utils/measurementTrends.ts': completeLineAndFunctionThresholds,
        'src/utils/storedRecordValidation.ts': completeLineAndFunctionThresholds,
      },
    },
  },
});
