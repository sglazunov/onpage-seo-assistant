import { expect, test, type Page } from '@playwright/test';

/**
 * TC-016 — element highlighting. Needs a real browser: the overlay is
 * positioned from getBoundingClientRect, lives in a shadow root and reacts to
 * scrolling, none of which jsdom can express.
 */

const FIXTURE = '/tests/e2e/fixture/spa.html';
const HOST = '#__onpage_seo_highlight_host__';

/** Reads the overlay boxes out of the highlighter's shadow root. */
async function boxes(page: Page) {
  return page.evaluate((hostSelector) => {
    const host = document.querySelector(hostSelector);
    if (!host?.shadowRoot) return [];
    return [...host.shadowRoot.querySelectorAll('.box')].map((box) => {
      const el = box as HTMLElement;
      return {
        color: el.style.getPropertyValue('--c'),
        left: parseFloat(el.style.left),
        top: parseFloat(el.style.top),
        width: parseFloat(el.style.width),
        height: parseFloat(el.style.height),
        label: el.querySelector('.label')?.textContent ?? null,
        display: el.style.display,
      };
    });
  }, HOST);
}

async function selectorFor(page: Page, kind: 'h1' | 'h2' | 'link' | 'image' | 'jsonld') {
  return page.evaluate((k) => {
    const data = window.__seoHarness.collect();
    switch (k) {
      case 'h1':
        return data.headings.find((h) => h.level === 1)!.selector;
      case 'h2':
        return data.headings.find((h) => h.level === 2)!.selector;
      case 'link':
        return data.links.find((l) => l.type === 'external')!.selector;
      case 'image':
        return data.images[0].selector;
      case 'jsonld':
        return data.structuredData[0].selector;
    }
  }, kind);
}

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
  await page.waitForFunction(() => Boolean(window.__seoHarness));
  await page.locator('#late').waitFor();
});

test('highlights one element of every category with the right colour', async ({ page }) => {
  const cases: { kind: Parameters<typeof selectorFor>[1]; category: string; color: string }[] = [
    { kind: 'h1', category: 'headings', color: '#2563eb' },
    { kind: 'h2', category: 'headings', color: '#2563eb' },
    { kind: 'link', category: 'links', color: '#0d9488' },
    { kind: 'image', category: 'images', color: '#d97706' },
    { kind: 'jsonld', category: 'schema', color: '#db2777' },
  ];

  for (const { kind, category, color } of cases) {
    const selector = await selectorFor(page, kind);
    const found = await page.evaluate(
      ([sel, cat]) => window.__seoHarness.scrollTo(sel, cat, cat),
      [selector, category] as const,
    );
    expect(found, `scrollTo failed for ${kind}`).toBe(true);

    const drawn = await boxes(page);
    expect(drawn, `no box drawn for ${kind}`).toHaveLength(1);
    expect(drawn[0].color).toBe(color);
    expect(drawn[0].label).toBe(category);
  }
});

test('highlights <title> and meta through the head selector', async ({ page }) => {
  // head/title have no box of their own; the highlighter must report honestly
  // instead of drawing a zero-sized overlay somewhere random.
  const found = await page.evaluate(() =>
    window.__seoHarness.scrollTo('title', 'meta', 'Title'),
  );
  expect(found).toBe(true);
  const drawn = await boxes(page);
  expect(drawn).toHaveLength(1);
  expect(drawn[0].display).toBe('none');
});

test('scrolls the page to an element that is below the fold', async ({ page }) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  const selector = await page.evaluate(() => {
    const data = window.__seoHarness.collect();
    return data.images.find((i) => i.selector === '#img-late')!.selector;
  });

  await page.evaluate((sel) => window.__seoHarness.scrollTo(sel, 'images', 'img'), selector);
  await page.waitForFunction(() => window.scrollY > 500);

  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
});

test('the overlay covers the element and follows it while scrolling', async ({ page }) => {
  const selector = await selectorFor(page, 'h1');
  await page.evaluate((sel) => window.__seoHarness.highlight({ selectors: [sel], category: 'headings' }), selector);

  const rect = await page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const r = el.getBoundingClientRect();
    return { left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height };
  }, selector);

  const before = (await boxes(page))[0];
  expect(Math.abs(before.left - rect.left)).toBeLessThan(1.5);
  expect(Math.abs(before.top - rect.top)).toBeLessThan(1.5);
  expect(Math.abs(before.width - rect.width)).toBeLessThan(1.5);

  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(120);

  // Boxes are positioned in document space, so scrolling must not move them.
  const after = (await boxes(page))[0];
  expect(Math.abs(after.top - before.top)).toBeLessThan(1.5);
});

test('a second highlight replaces the first instead of stacking', async ({ page }) => {
  const h1 = await selectorFor(page, 'h1');
  const link = await selectorFor(page, 'link');

  await page.evaluate((sel) => window.__seoHarness.highlight({ selectors: [sel], category: 'headings', label: 'H1' }), h1);
  expect(await boxes(page)).toHaveLength(1);

  await page.evaluate((sel) => window.__seoHarness.highlight({ selectors: [sel], category: 'links', label: 'a' }), link);
  const drawn = await boxes(page);
  expect(drawn).toHaveLength(1);
  expect(drawn[0].color).toBe('#0d9488');
  expect(drawn[0].label).toBe('a');
});

test('highlights a group of elements at once', async ({ page }) => {
  const matched = await page.evaluate(() => {
    const data = window.__seoHarness.collect();
    return window.__seoHarness.highlight({
      selectors: data.links.map((l) => l.selector),
      category: 'links',
      label: 'a',
    });
  });
  expect(matched).toBeGreaterThan(2);
  expect(await boxes(page)).toHaveLength(matched);
});

test('Esc removes every highlight', async ({ page }) => {
  await page.evaluate(() => {
    const data = window.__seoHarness.collect();
    window.__seoHarness.highlight({
      selectors: data.links.map((l) => l.selector),
      category: 'links',
    });
  });
  expect((await boxes(page)).length).toBeGreaterThan(0);

  await page.keyboard.press('Escape');
  expect(await boxes(page)).toHaveLength(0);
});

test('stale selectors are reported, not thrown', async ({ page }) => {
  const matched = await page.evaluate(() =>
    window.__seoHarness.highlight({
      selectors: ['#gone-after-rerender', 'h1', 'not a [valid selector'],
      category: 'headings',
    }),
  );
  // Only the one real element resolves; the invalid selector must not throw.
  expect(matched).toBe(1);
});

test('a page reload leaves no highlight residue or altered page styles', async ({ page }) => {
  const selector = await selectorFor(page, 'h1');
  const styleBefore = await page.evaluate(
    (sel) => document.querySelector(sel)!.getAttribute('style'),
    selector,
  );

  await page.evaluate((sel) => window.__seoHarness.highlight({ selectors: [sel], category: 'headings' }), selector);
  expect(await boxes(page)).toHaveLength(1);

  // The page's own element must never be restyled — the overlay is separate.
  const styleDuring = await page.evaluate(
    (sel) => document.querySelector(sel)!.getAttribute('style'),
    selector,
  );
  expect(styleDuring).toBe(styleBefore);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__seoHarness));
  expect(await page.locator(HOST).count()).toBe(0);
  expect(await boxes(page)).toHaveLength(0);
});
