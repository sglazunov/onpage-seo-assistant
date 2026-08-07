import { expect, test, type Page } from '@playwright/test';
import type { AuditResult, PageData } from '../../src/shared/types';

/**
 * Negative scenarios in a real browser: malformed markup, XSS payloads in every
 * page-controlled field, awkward URLs, mixed scripts and bulk content. Nothing
 * here may throw, and nothing from the page may become executable markup in a
 * report.
 */

const FIXTURE = '/tests/e2e/fixture/hostile.html';

let page: Page;
let data: PageData;
let result: AuditResult;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto(FIXTURE);
  await page.waitForFunction(() => Boolean(window.__seoHarness));
  await page.locator('#bulk').waitFor();
  data = await page.evaluate(() => window.__seoHarness.collect());
  result = await page.evaluate(() => window.__seoHarness.audit(window.__seoHarness.collect()));
});

test.afterAll(async () => {
  await page?.close();
});

test('collects and audits a malformed document without throwing', () => {
  expect(data).toBeTruthy();
  expect(result.score.overall).toBeGreaterThanOrEqual(0);
  expect(result.score.overall).toBeLessThanOrEqual(100);
  expect(result.issues.length).toBeGreaterThan(0);
});

test('records no unhandled page errors during the pass', async () => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => window.__seoHarness.audit(window.__seoHarness.collect()));
  expect(errors).toEqual([]);
});

test('handles duplicate titles and an XSS payload inside the title', () => {
  expect(data.titleCount).toBe(2);
  expect(data.title).toContain('alert(1)');
  expect(result.issues.map((i) => i.id)).toContain('META-016');
});

test('reports noindex and nofollow from a page that sets both', () => {
  const ids = result.issues.map((i) => i.id);
  expect(ids).toContain('META-012');
  expect(ids).toContain('META-013');
});

test('multiple H1 stay a warning and long / empty / skipped headings are found', () => {
  const bySeverity = new Map(result.issues.map((i) => [i.id, i.severity]));
  expect(bySeverity.get('HEAD-003')).toBe('warning');
  expect(bySeverity.get('HEAD-004')).toBe('warning');
  expect(bySeverity.get('HEAD-005')).toBe('warning');
  expect(bySeverity.get('HEAD-006')).toBe('warning');
  // The CSS-hidden heading is informational, never an error.
  expect(bySeverity.get('HEAD-008')).toBe('info');
});

test('classifies every awkward link form', () => {
  const byText = new Map(data.links.map((l) => [l.text, l]));
  expect(byText.get('Ссылка без href')?.type).toBe('empty');
  expect(byText.get('Пустой href')?.type).toBe('empty');
  expect(byText.get('Решётка')?.type).toBe('anchor');
  expect(byText.get('JavaScript')?.type).toBe('javascript');
  expect(byText.get('Почта')?.type).toBe('mail');
  expect(byText.get('Телефон')?.type).toBe('phone');
  expect(byText.get('IP-адрес')?.type).toBe('external');
  // Served from localhost:5177, so a link to localhost:8080 is a different
  // server and must not be counted as internal.
  expect(byText.get('localhost с портом')?.type).toBe('external');
  expect(byText.get('Basic Auth')?.type).toBe('external');
  expect(byText.get('Unicode URL')?.type).toBe('external');
  expect(byText.get('URL с пробелами')?.type).toBe('internal');
  expect(byText.get('Query и fragment')?.resolved).toContain('#frag');
});

test('never reads passwords, form values or storage', () => {
  const serialised = JSON.stringify(data);
  expect(serialised).not.toContain('СУПЕРСЕКРЕТНЫЙПАРОЛЬ');
  expect(serialised).not.toContain('ЗНАЧЕНИЕПОЛЯФОРМЫ');
  expect(serialised).not.toContain('ТЕКСТИЗТЕКСТАРЕА');
  expect(serialised).not.toContain('НЕДОЛЖНОПОПАСТЬВОТЧЁТ');
  expect(serialised).not.toContain('НЕДОЛЖНОПОПАСТЬВОТЧЁТLS');
});

test('excludes CSS-hidden text and background images', () => {
  expect(data.content.visibleText).not.toContain('Скрытый текст');
  expect(data.content.hiddenTextBlocks).toBeGreaterThan(0);
  // The background-image div is not an <img>; only real images are listed.
  expect(data.images.every((i) => !i.src.includes('background'))).toBe(true);
});

test('handles mixed scripts, digits, hyphens and repeated whitespace', () => {
  const text = data.content.visibleText;
  expect(text).toContain('中文');
  expect(text).toContain('日本語');
  expect(text).toContain('12345');
  expect(text).not.toMatch(/ {2,}/);
  expect(data.content.unigrams.some((u) => u.term.includes('-'))).toBe(true);
});

test('caps a 1200-heading page at the collector limit and says so', async () => {
  const elapsed = await page.evaluate(() => {
    const started = performance.now();
    window.__seoHarness.collect();
    return performance.now() - started;
  });
  // LIMITS.headings is 500; the real count is reported through `truncated`
  // rather than silently dropped.
  expect(data.headings).toHaveLength(500);
  expect(data.truncated.headings).toBeGreaterThan(1200);
  expect(elapsed).toBeLessThan(3000);
});

test('broken JSON-LD is reported and valid blocks still parse', () => {
  const blocks = data.structuredData.filter((b) => b.format === 'json-ld');
  expect(blocks).toHaveLength(2);
  expect(blocks[0].error).toBeTruthy();
  expect(blocks[1].types).toEqual(['Article']);
  expect(result.issues.find((i) => i.id === 'SD-002')?.severity).toBe('error');
});

test('every export escapes page-controlled values', async () => {
  const exports = await page.evaluate(() => {
    const audited = window.__seoHarness.audit(window.__seoHarness.collect());
    return {
      html: window.__seoHarness.buildExport!(audited, 'html').content,
      markdown: window.__seoHarness.buildExport!(audited, 'markdown').content,
      csv: window.__seoHarness.buildExport!(audited, 'csv').content,
      summary: window.__seoHarness.summaryText!(audited),
    };
  });

  // No page-derived script or image tag survives into the HTML report.
  expect(exports.html).not.toContain('<script>alert(1)</script>');
  expect(exports.html).not.toContain('<img src=x onerror=');
  expect(exports.html).toContain('&lt;script&gt;');
  // The only <script>-looking text must be escaped, and the report has no
  // executable script tag of its own either.
  expect(exports.html).not.toMatch(/<script[\s>]/i);

  // Markdown tables stay rectangular despite the pipe in the title.
  let current: string[] = [];
  const tables: string[][] = [];
  for (const line of exports.markdown.split('\n')) {
    if (line.startsWith('|')) current.push(line);
    else if (current.length) {
      tables.push(current);
      current = [];
    }
  }
  if (current.length) tables.push(current);
  for (const table of tables) {
    const widths = new Set(table.map((r) => r.replace(/\\\|/g, '').split('|').length));
    expect(widths.size).toBe(1);
  }

  // CSV keeps the row count stable despite semicolons and quotes in values.
  const rows = exports.csv.split('\r\n').filter(Boolean);
  expect(rows.length).toBe(result.issues.length + 1);
});

test('the HTML report renders as inert text, not as live markup', async ({ browser }) => {
  const html = await page.evaluate(() => {
    const audited = window.__seoHarness.audit(window.__seoHarness.collect());
    return window.__seoHarness.buildExport!(audited, 'html').content;
  });

  const report = await browser.newPage();
  const errors: string[] = [];
  report.on('pageerror', (error) => errors.push(error.message));
  report.on('dialog', (dialog) => dialog.dismiss());

  await report.setContent(html);
  await report.waitForTimeout(300);

  // The payload from the audited page must appear as visible text only.
  const body = await report.evaluate(() => document.body.innerText);
  expect(body).toContain('<script>alert(1)</script>');
  expect(await report.locator('script').count()).toBe(0);
  expect(await report.locator('img').count()).toBe(0);
  expect(errors).toEqual([]);
  await report.close();
});
