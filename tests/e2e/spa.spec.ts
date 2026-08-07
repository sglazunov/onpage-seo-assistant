import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { AuditResult, PageData } from '../../src/shared/types';

/**
 * TC-010 — SPA re-audit. Runs the real collector in a real browser against a
 * real React app, because the failure this guards against (stale data from the
 * previous route) only exists once a live layout engine and client-side
 * routing are involved.
 */

const FIXTURE = '/tests/e2e/fixture/spa.html';

async function collect(page: Page): Promise<PageData> {
  return page.evaluate(() => window.__seoHarness.collect());
}

async function audit(page: Page): Promise<AuditResult> {
  return page.evaluate(() => {
    const data = window.__seoHarness.collect();
    return window.__seoHarness.audit(data);
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
  await page.waitForFunction(() => Boolean(window.__seoHarness));
  // Wait for the deferred block so the "after first paint" content exists.
  await page.locator('#late').waitFor();
});

test('picks up a title set by JavaScript, not the served HTML', async ({ page }) => {
  // The fixture ships without a <title>; React sets it in an effect.
  const source = readFileSync(
    new URL('./fixture/spa.html', import.meta.url),
    'utf8',
  );
  expect(source).not.toContain('<title>');

  const data = await collect(page);
  expect(data.title).toBe('Маршрут A — каталог ноутбуков');
  expect(data.titleCount).toBe(1);
});

test('sees the dynamic H1 and headings of the current route', async ({ page }) => {
  const data = await collect(page);
  expect(data.headings.filter((h) => h.level === 1).map((h) => h.text)).toEqual([
    'Ноутбуки в наличии',
  ]);
  expect(data.headings.filter((h) => h.level === 2).map((h) => h.text)).toEqual([
    'Популярные модели',
    'Доставка',
  ]);
});

test('includes links and images added after the first paint', async ({ page }) => {
  const data = await collect(page);
  expect(data.links.map((l) => l.href)).toContain('/late-link');
  expect(data.images.map((i) => i.selector)).toContain('#img-late');
  // The late image carries an alt; the initial one does not — both must be seen.
  const late = data.images.find((i) => i.selector === '#img-late');
  const initial = data.images.find((i) => i.selector === '#img-initial');
  expect(late?.alt).toBe('Изображение после загрузки');
  expect(initial?.alt).toBeNull();
});

test('re-audit after a route change carries no data from the previous route', async ({ page }) => {
  const before = await collect(page);
  expect(before.title).toContain('Маршрут A');

  await page.locator('#go-b').click();
  await expect(page.locator('h1')).toHaveText('Доставка и оплата');
  await page.locator('#late').waitFor();

  const after = await collect(page);

  // Title, H1 and H2 all follow the new route.
  expect(after.title).toBe('Маршрут B — условия доставки');
  expect(after.headings.filter((h) => h.level === 1).map((h) => h.text)).toEqual([
    'Доставка и оплата',
  ]);
  expect(after.headings.filter((h) => h.level === 2).map((h) => h.text)).toEqual([
    'Сроки',
    'Способы оплаты',
    'Возврат',
  ]);

  // Nothing from route A survives anywhere in the snapshot.
  const serialised = JSON.stringify(after);
  expect(serialised).not.toContain('Ноутбуки в наличии');
  expect(serialised).not.toContain('Популярные модели');
  expect(serialised).not.toContain('external-a.test');
  expect(serialised).not.toContain('Маршрут A — каталог ноутбуков');
  expect(serialised).not.toContain('/catalog/lenovo');

  // And the new route's own data is present.
  expect(after.links.map((l) => l.resolved)).toContain('https://external-b.test/');
  expect(after.structuredData[0].types).toEqual(['Article']);
});

test('selectors stay valid after a route change', async ({ page }) => {
  await page.locator('#go-b').click();
  await expect(page.locator('h1')).toHaveText('Доставка и оплата');
  await page.locator('#late').waitFor();

  const data = await collect(page);
  // Every selector produced by the fresh pass must resolve on the current DOM.
  const unresolved = await page.evaluate(
    (selectors) => selectors.filter((s) => !document.querySelector(s)),
    data.headings.map((h) => h.selector).concat(data.links.map((l) => l.selector)),
  );
  expect(unresolved).toEqual([]);
});

test('the audit result reflects the new route, including the score', async ({ page }) => {
  const first = await audit(page);
  await page.locator('#go-b').click();
  await expect(page.locator('h1')).toHaveText('Доставка и оплата');
  // The deferred block is torn down and re-added on every route change; without
  // waiting for it the second pass would see fewer headings for timing reasons.
  await page.locator('#late').waitFor();
  const second = await audit(page);

  expect(second.pageTitle).not.toBe(first.pageTitle);
  expect(second.page.headings.length).not.toBe(first.page.headings.length);
  // Both routes lack an og: block, so SOC-007 must be reported on each pass.
  expect(second.issues.map((i) => i.id)).toContain('SOC-007');
  expect(second.score.overall).toBeGreaterThanOrEqual(0);
  expect(second.score.overall).toBeLessThanOrEqual(100);
});

test('collecting a large real page stays well inside the 3 second budget', async ({ page }) => {
  await page.evaluate(() => {
    const host = document.createElement('div');
    for (let i = 0; i < 1200; i += 1) {
      const a = document.createElement('a');
      a.href = `/bulk/${i}`;
      a.textContent = `Ссылка ${i}`;
      host.appendChild(a);
    }
    document.body.appendChild(host);
  });

  const elapsed = await page.evaluate(() => {
    const started = performance.now();
    window.__seoHarness.collect();
    return performance.now() - started;
  });

  const data = await collect(page);
  expect(data.links.length).toBeGreaterThan(1200);
  expect(elapsed).toBeLessThan(3000);
});
