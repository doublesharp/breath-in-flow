import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const isElectron = process.env.BUILD_TARGET === 'electron';
const configDir = dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    // Only include Electron plugins when building for Electron
    ...(isElectron
      ? [
          electron([
            {
              // Main process entry point
              entry: 'electron/main.ts',
              onstart(options) {
                options.startup();
              },
              vite: {
                build: {
                  outDir: 'dist-electron/main',
                  lib: {
                    entry: 'electron/main.ts',
                    formats: ['cjs'],
                    fileName: () => 'main.js',
                  },
                  rollupOptions: {
                    external: ['electron'],
                  },
                },
              },
            },
            {
              // Preload script
              entry: 'electron/preload.ts',
              onstart(options) {
                // Reload the renderer process
                options.reload();
              },
              vite: {
                build: {
                  outDir: 'dist-electron/preload',
                  lib: {
                    entry: 'electron/preload.ts',
                    formats: ['cjs'],
                    fileName: () => 'preload.js',
                  },
                  rollupOptions: {
                    external: ['electron'],
                  },
                },
              },
            },
          ]),
          renderer(),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': resolve(configDir, 'src'),
    },
  },
  server: {
    port: 7080,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Electron-specific build settings
    ...(isElectron && {
      rollupOptions: {
        input: {
          main: resolve(configDir, 'index.html'),
        },
      },
    }),
  },
  // Base path for Electron (file:// protocol)
  base: isElectron ? './' : '/',
});
