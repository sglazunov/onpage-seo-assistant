import { expect, test, type Page } from '@playwright/test';

/**
 * The overlap between the two risky subsystems: what happens to a highlight
 * when the SPA re-renders underneath it, and does a highlight land on the
 * element the report actually meant.
 */

const FIXTURE = '/tests/e2e/fixture/spa.html';
const HOST = '#__onpage_seo_highlight_host__';

async function boxCount(page: Page) {
  return page.evaluate((hostSelector) => {
    const host = document.querySelector(hostSelector);
    return host?.shadowRoot?.querySelectorAll('.box').length ?? 0;
  }, HOST);
}

/** Boxes that are actually painted, i.e. not display:none. */
async function visibleBoxes(page: Page) {
  return page.evaluate((hostSelector) => {
    const host = document.querySelector(hostSelector);
    const boxes = [...(host?.shadowRoot?.querySelectorAll('.box') ?? [])] as HTMLElement[];
    return boxes
      .filter((b) => b.style.display !== 'none')
      .map((b) => ({ left: parseFloat(b.style.left), top: parseFloat(b.style.top) }));
  }, HOST);
}

async function gotoRoute(page: Page, route: 'a' | 'b') {
  await page.locator(route === 'a' ? '#go-a' : '#go-b').click();
  await expect(page.locator('h1')).toHaveText(
    route === 'a' ? 'Ноутбуки в наличии' : 'Доставка и оплата',
  );
  await page.locator('#late').waitFor();
}

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
  await page.waitForFunction(() => Boolean(window.__seoHarness));
  await page.locator('#late').waitFor();
});

test('A → B → A keeps every pass correct, not just the first', async ({ page }) => {
  const a1 = await page.evaluate(() => window.__seoHarness.collect());
  await gotoRoute(page, 'b');
  const b = await page.evaluate(() => window.__seoHarness.collect());
  await gotoRoute(page, 'a');
  const a2 = await page.evaluate(() => window.__seoHarness.collect());

  expect(a1.title).toBe('Маршрут A — каталог ноутбуков');
  expect(b.title).toBe('Маршрут B — условия доставки');
  expect(a2.title).toBe(a1.title);

  expect(a2.headings.map((h) => h.text)).toEqual(a1.headings.map((h) => h.text));
  expect(a2.links.map((l) => l.href).sort()).toEqual(a1.links.map((l) => l.href).sort());

  // No trace of route B in the third pass.
  expect(JSON.stringify(a2)).not.toContain('external-b.test');
  expect(JSON.stringify(a2)).not.toContain('Способы оплаты');

  // And the selectors from the third pass resolve on the current DOM.
  const unresolved = await page.evaluate(
    (sels) => sels.filter((s) => !document.querySelector(s)),
    a2.headings.map((h) => h.selector),
  );
  expect(unresolved).toEqual([]);
});

test('a highlighted link is the one the report pointed at, not a neighbour', async ({ page }) => {
  const target = await page.evaluate(() => {
    const data = window.__seoHarness.collect();
    const link = data.links.find((l) => l.text === 'ASUS')!;
    window.__seoHarness.highlight({ selectors: [link.selector], category: 'links', label: 'a' });
    return link;
  });
  expect(target.text).toBe('ASUS');

  const [box] = await visibleBoxes(page);
  const rect = await page.evaluate((sel) => {
    const el = document.querySelector(sel)!.getBoundingClientRect();
    return { left: el.left + scrollX, top: el.top + scrollY };
  }, target.selector);

  expect(Math.abs(box.left - rect.left)).toBeLessThan(1.5);
  expect(Math.abs(box.top - rect.top)).toBeLessThan(1.5);

  // The neighbouring link must not be where the box is.
  const neighbour = await page.evaluate(() => {
    const el = document.querySelector('#app > main > ul > li:nth-of-type(1) > a')!;
    const r = el.getBoundingClientRect();
    return { left: r.left + scrollX, top: r.top + scrollY };
  });
  expect(Math.abs(box.top - neighbour.top)).toBeGreaterThan(1.5);
});

test('a highlighted image covers the img element itself', async ({ page }) => {
  const selector = await page.evaluate(() => {
    const data = window.__seoHarness.collect();
    const image = data.images.find((i) => i.selector === '#img-initial')!;
    window.__seoHarness.highlight({ selectors: [image.selector], category: 'images' });
    return image.selector;
  });

  const [box] = await visibleBoxes(page);
  const rect = await page.evaluate((sel) => {
    const r = document.querySelector(sel)!.getBoundingClientRect();
    return { left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height };
  }, selector);

  expect(Math.abs(box.left - rect.left)).toBeLessThan(1.5);
  expect(Math.abs(box.top - rect.top)).toBeLessThan(1.5);
  // The fixture image is 120x80, so a box of that size proves it is the <img>
  // and not a wrapping block.
  expect(rect.width).toBe(120);
  expect(rect.height).toBe(80);
});

test('an SPA re-render does not leave a stale highlight behind', async ({ page }) => {
  await page.evaluate(() => {
    const data = window.__seoHarness.collect();
    const h1 = data.headings.find((h) => h.level === 1)!;
    window.__seoHarness.highlight({ selectors: [h1.selector], category: 'headings', label: 'H1' });
  });
  expect(await boxCount(page)).toBe(1);

  await gotoRoute(page, 'b');

  // The highlighted element no longer exists; its overlay must not survive it.
  expect(await boxCount(page)).toBe(0);
});

test('a stale selector does not highlight whatever took its place', async ({ page }) => {
  const stale = await page.evaluate(() => {
    const data = window.__seoHarness.collect();
    const link = data.links.find((l) => l.text === 'ASUS')!;
    return { selector: link.selector, text: link.text };
  });

  await gotoRoute(page, 'b');

  // The positional selector still resolves on route B — to a different link.
  const stillResolves = await page.evaluate(
    (sel) => Boolean(document.querySelector(sel)),
    stale.selector,
  );
  expect(stillResolves).toBe(true);

  // Without the captured text the highlight would land on the neighbour.
  const matched = await page.evaluate(
    (s) => window.__seoHarness.highlight({ selectors: [s.selector], category: 'links', verify: s.text }),
    stale,
  );
  const found = await page.evaluate(
    (s) => window.__seoHarness.scrollTo(s.selector, 'links', 'a', s.text),
    stale,
  );

  expect(matched).toBe(0);
  expect(found).toBe(false);
  expect(await boxCount(page)).toBe(0);
});

test('a selector that resolves to the same element still highlights', async ({ page }) => {
  const target = await page.evaluate(() => {
    const data = window.__seoHarness.collect();
    const link = data.links.find((l) => l.text === 'ASUS')!;
    return { selector: link.selector, text: link.text };
  });

  const found = await page.evaluate(
    (s) => window.__seoHarness.scrollTo(s.selector, 'links', 'a', s.text),
    target,
  );
  expect(found).toBe(true);
  expect(await boxCount(page)).toBe(1);
});
