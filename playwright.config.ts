import { defineConfig } from '@playwright/test';

/**
 * Acceptance run. Uses the browsers installed on the machine rather than a
 * downloaded Chromium, so the results describe what a user actually runs.
 * Opera is added by executablePath in the spec's project list below.
 */
const PORT = 5177;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/tests/e2e/fixture/spa.html`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chrome',
      testIgnore: /extension\.spec\.ts/,
      use: { channel: 'chrome' },
    },
    {
      name: 'opera',
      testIgnore: /extension\.spec\.ts/,
      use: {
        launchOptions: {
          executablePath: `${process.env.LOCALAPPDATA}\\Programs\\Opera\\opera.exe`,
        },
      },
    },
    {
      // Loads dist/ as an unpacked extension; drives its own browser context.
      name: 'extension',
      testMatch: /extension\.spec\.ts/,
    },
  ],
});
