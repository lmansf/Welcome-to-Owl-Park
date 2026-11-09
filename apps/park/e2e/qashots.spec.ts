import { test } from '@playwright/test';
import { openPark, settleCamera } from './helpers';

// Temporary QA pictures of the oval Great Hollow (this branch only, never merged).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('owl-park-map', '3');
    } catch {
      // nothing kept
    }
  });
});

const SIZES: Record<string, Array<[string, number, number]>> = {
  phone: [
    ['portrait', 390, 844],
    ['landscape', 844, 390],
  ],
  desktop: [['desk', 1280, 800]],
};

for (const spawn of ['default', 'from-lobby', 'from-party', 'from-market', 'from-glass']) {
  test(`qa m3-hall ${spawn}`, async ({ page }) => {
    for (const [name, w, h] of SIZES[test.info().project.name] ?? []) {
      await page.setViewportSize({ width: w, height: h });
      await openPark(page, { room: 'm3-hall', spawn });
      await settleCamera(page);
      await page.waitForTimeout(900);
      await page.screenshot({ path: `qa-shots/${name}-${spawn}.png` });
    }
  });
}
