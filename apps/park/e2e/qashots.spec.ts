import { test } from '@playwright/test';
import { mapCard, openPark, settleCamera } from './helpers';

// Temporary QA pictures of the Party Grove on the new map and the open Menu map (this branch only, never merged).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('owl-park-map', '3');
    } catch {
      // nothing kept
    }
  });
});

for (const [room, spawn] of [
  ['hub', 'default'],
  ['m3-hall', 'from-party'],
] as const) {
  test(`qa ${room} ${spawn}`, async ({ page }) => {
    await openPark(page, { room, kit: '1', spawn });
    await settleCamera(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `qa-shots/${test.info().project.name}-${room}-${spawn}.png` });
  });
}

test('qa map', async ({ page }) => {
  await openPark(page, { room: 'homes', kit: '1' });
  await settleCamera(page);
  await mapCard(page, 'hub');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `qa-shots/${test.info().project.name}-map.png` });
});
