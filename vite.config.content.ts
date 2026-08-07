import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Content script must be a single self-contained classic script: MV3 injects it
// with chrome.scripting.executeScript({files:[...]}) which cannot resolve imports.
export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'OnPageSeoContent',
      fileName: () => 'content.js',
    },
    rollupOptions: { output: { extend: true } },
  },
});
