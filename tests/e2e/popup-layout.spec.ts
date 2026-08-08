import { expect, test, type Page } from '@playwright/test';

/**
 * Regression guard for the popup tab strip. It used to scroll horizontally,
 * and on Windows the 15px scrollbar cut the bottom half off every label.
 * Measured at the real popup size, in both languages and both zoom levels the
 * acceptance checklist calls for.
 */

const FIXTURE = '/tests/e2e/fixture/tabs.html';
const POPUP = { width: 460, height: 600 };

async function strip(page: Page) {
  return page.evaluate(() => {
    const tabs = document.querySelector('.tabs') as HTMLElement;
    const buttons = [...tabs.querySelectorAll('.tabs__btn')] as HTMLElement[];
    const stripBox = tabs.getBoundingClientRect();
    return {
      scrollWidth: tabs.scrollWidth,
      clientWidth: tabs.clientWidth,
      scrollHeight: tabs.scrollHeight,
      clientHeight: tabs.clientHeight,
      rows: new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top))).size,
      buttons: buttons.map((b) => {
        const box = b.getBoundingClientRect();
        return {
          text: b.textContent ?? '',
          top: box.top - stripBox.top,
          bottom: box.bottom - stripBox.top,
          width: box.width,
          height: box.height,
          clipped: b.scrollWidth > b.clientWidth + 1,
        };
      }),
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
    };
  });
}

for (const lang of ['ru', 'en'] as const) {
  test(`tab strip fits the popup width without scrolling (${lang})`, async ({ page }) => {
    await page.setViewportSize(POPUP);
    await page.goto(`${FIXTURE}?lang=${lang}`);
    await page.locator('.tabs__btn').first().waitFor();

    const measured = await strip(page);

    // No horizontal scrolling anywhere: not in the strip, not in the document.
    expect(measured.scrollWidth).toBeLessThanOrEqual(measured.clientWidth);
    expect(measured.bodyScrollWidth).toBeLessThanOrEqual(measured.bodyClientWidth);

    // Every label is rendered in full, not ellipsised.
    for (const button of measured.buttons) {
      expect(button.clipped, `"${button.text}" is clipped`).toBe(false);
      expect(button.height).toBeGreaterThan(14);
      expect(button.bottom).toBeLessThanOrEqual(measured.clientHeight + 0.5);
    }

    // All nine tabs are present and laid out in at most two rows.
    expect(measured.buttons).toHaveLength(9);
    expect(measured.rows).toBeLessThanOrEqual(2);
  });
}

for (const zoom of [1.25, 1.5]) {
  test(`tab strip survives ${Math.round(zoom * 100)}% interface scaling`, async ({ page }) => {
    await page.setViewportSize(POPUP);
    await page.goto(FIXTURE);
    await page.locator('.tabs__btn').first().waitFor();

    await page.evaluate((factor) => {
      document.documentElement.style.fontSize = `${16 * factor}px`;
      (document.body.style as CSSStyleDeclaration & { zoom?: string }).zoom = String(factor);
    }, zoom);

    const measured = await strip(page);
    expect(measured.scrollWidth).toBeLessThanOrEqual(measured.clientWidth + 1);
    for (const button of measured.buttons) {
      expect(button.clipped, `"${button.text}" is clipped at ${zoom}x`).toBe(false);
    }
  });
}

test('the tab strip does not scroll the popup body sideways', async ({ page }) => {
  await page.setViewportSize(POPUP);
  await page.goto(FIXTURE);
  await page.locator('.tabs__btn').first().waitFor();

  const overflowing = await page.evaluate(() => {
    return [...document.querySelectorAll('*')]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.className || el.tagName);
  });
  expect(overflowing).toEqual([]);
});
