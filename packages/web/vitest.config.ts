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
    },
  },
});
