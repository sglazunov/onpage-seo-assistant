import { fileURLToPath } from 'node:url';
import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';

/**
 * Loads the built extension into a real browser profile and checks the parts a
 * page-level harness cannot reach: service worker registration, the popup and
 * options pages rendering under chrome-extension://, and chrome.storage.
 *
 * What this does NOT cover: clicking the toolbar action (no automation API for
 * it) and therefore the activeTab-gated audit path, and the runtime host
 * permission prompt, which is native browser UI.
 */

const DIST = fileURLToPath(new URL('../../dist', import.meta.url));

let context: BrowserContext;
let worker: Worker;
let extensionId: string;
const consoleErrors: string[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);

  // Playwright's bundled Chromium by default: Chrome 137+ ignores
  // --load-extension from the command line, so an installed-Chrome run cannot
  // load an unpacked extension at all (verified on Chrome 150). Set
  // SEO_BROWSER_PATH to point the same suite at another Chromium build.
  const executablePath = process.env.SEO_BROWSER_PATH;
  context = await chromium.launchPersistentContext('', {
    ...(executablePath ? { executablePath } : {}),
    headless: false,
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      // A fresh profile otherwise spends its first seconds on welcome UI, which
      // delays the service worker past a naive wait.
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate,DialMediaRouteProvider',
    ],
  });

  context.on('weberror', (error) => consoleErrors.push(error.error().message));

  // MV3 registers the worker asynchronously after the profile settles; poll
  // rather than race a single event.
  const deadline = Date.now() + 60_000;
  for (;;) {
    const [found] = context.serviceWorkers();
    if (found) {
      worker = found;
      break;
    }
    if (Date.now() > deadline) throw new Error('Extension service worker never registered');
    await new Promise((done) => setTimeout(done, 250));
  }

  extensionId = new URL(worker.url()).host;
});

test.afterAll(async () => {
  await context?.close();
});

test('the MV3 service worker registers and answers messages', async () => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
  expect(worker.url()).toContain('service-worker.js');

  // The round-trip is driven from an extension page, the way the popup does it:
  // a context never receives its own runtime messages, so pinging the worker
  // from inside the worker would prove nothing.
  const client = await context.newPage();
  await client.goto(`chrome-extension://${extensionId}/options.html`);

  const pong = await client.evaluate(
    () => chrome.runtime.sendMessage({ type: 'PING' }) as Promise<unknown>,
  );
  expect(pong).toEqual({ ok: true, data: 'pong' });

  // An unknown message must be answered with an error, not left hanging.
  const unknown = await client.evaluate(
    () => chrome.runtime.sendMessage({ type: 'NOPE' }) as Promise<{ ok: boolean }>,
  );
  expect(unknown.ok).toBe(false);

  await client.close();
});

test('the manifest the browser actually loaded is the one we ship', async () => {
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.version).toBe('0.2.0');
  expect(manifest.permissions?.sort()).toEqual([
    'activeTab',
    'downloads',
    'scripting',
    'storage',
  ]);
  // The install-time prompt must not ask for site access.
  expect((manifest as { host_permissions?: string[] }).host_permissions).toBeUndefined();
  expect((manifest as { optional_permissions?: string[] }).optional_permissions).toBeUndefined();
  expect((manifest as { optional_host_permissions?: string[] }).optional_host_permissions).toEqual([
    'http://*/*',
    'https://*/*',
  ]);
});

test('site access is not granted until the user asks for it', async () => {
  const granted = await worker.evaluate(() =>
    chrome.permissions.contains({ origins: ['https://example.com/*'] }),
  );
  expect(granted).toBe(false);
});

test('the popup renders and degrades gracefully on a page it cannot audit', async () => {
  const popup = await context.newPage();
  const errors: string[] = [];
  popup.on('pageerror', (error) => errors.push(error.message));

  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.waitForLoadState('domcontentloaded');

  // The active tab here is the popup's own chrome-extension:// page, which is
  // exactly the "page cannot be analysed" case. It must explain itself rather
  // than throw or hang on the spinner.
  const message = popup.locator('.state__error, .app');
  await expect(message).toBeVisible({ timeout: 15_000 });

  const text = await popup.locator('body').innerText();
  expect(text.length).toBeGreaterThan(0);
  expect(text).not.toContain('undefined');
  expect(errors).toEqual([]);

  // A retry button is offered so the user is never stuck.
  await expect(popup.locator('button')).toHaveCount(1);
  await popup.close();
});

test('the options page renders and persists settings through chrome.storage', async () => {
  const options = await context.newPage();
  const errors: string[] = [];
  options.on('pageerror', (error) => errors.push(error.message));

  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.locator('h1')).toBeVisible();
  expect(errors).toEqual([]);

  // Change a value, reload, and confirm it survived the round-trip.
  const limit = options.locator('input[type="number"]').first();
  await limit.fill('37');
  await limit.blur();
  await options.waitForTimeout(300);

  await options.reload();
  await expect(options.locator('input[type="number"]').first()).toHaveValue('37');

  const stored = await worker.evaluate(async () => {
    const all = await chrome.storage.local.get('settings');
    return all.settings as { historyLimit?: number };
  });
  expect(stored.historyLimit).toBe(37);

  await options.close();
});

test('switching the interface language changes the rendered strings', async () => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(options.locator('h1')).toContainText('Настройки');
  await options.locator('select').first().selectOption('en');
  await expect(options.locator('h1')).toContainText('settings');

  await options.locator('select').first().selectOption('ru');
  await expect(options.locator('h1')).toContainText('Настройки');
  await options.close();
});

test('no extension page produced a console error during the run', () => {
  expect(consoleErrors).toEqual([]);
});
