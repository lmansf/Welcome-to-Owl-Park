import { test } from '@playwright/test';
import { openPark, settleCamera } from './helpers';

// Temporary QA pictures of the Great Hollow's door signs (this branch only, never merged).
for (const spawn of ['from-lobby', 'from-glass', 'from-market-course']) {
  test(`qa ${spawn}`, async ({ page }) => {
    await openPark(page, { room: 'm3-hall', kit: '1', spawn });
    await settleCamera(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `qa-shots/${test.info().project.name}-${spawn}.png` });
  });
}
