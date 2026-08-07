import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    environmentMatchGlobs: [['tests/unit/dom/**', 'jsdom']],
    // The collector reads location.*; jsdom cannot change origin at runtime,
    // so the document URL has to be fixed when the environment is created.
    environmentOptions: { jsdom: { url: 'https://example.com/page' } },
  },
});
