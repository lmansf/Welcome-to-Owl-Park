import { test } from '@playwright/test';
import { openPark, settleCamera } from './helpers';

// Temporary QA pictures of the Great Hollow (this branch only, never merged).
for (const spawn of ['from-glass', 'from-ink', 'from-lobby', 'from-grove', 'from-market-course']) {
  for (const sizes of ['0', '1']) {
    test(`qa ${spawn} sizes ${sizes}`, async ({ page }) => {
      await openPark(page, { room: 'm3-hall', kit: '1', spawn, sizes });
      await settleCamera(page);
      await page.waitForTimeout(800);
      await page.screenshot({ path: `qa-shots/${test.info().project.name}-${spawn}-${sizes}.png` });
    });
  }
}
