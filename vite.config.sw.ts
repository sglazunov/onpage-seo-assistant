import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Service worker: registered as a classic (non-module) worker, so it is bundled
// into one IIFE file with no import statements.
export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    lib: {
      entry: resolve(__dirname, 'src/background/service-worker.ts'),
      formats: ['iife'],
      name: 'OnPageSeoBackground',
      fileName: () => 'service-worker.js',
    },
  },
});
