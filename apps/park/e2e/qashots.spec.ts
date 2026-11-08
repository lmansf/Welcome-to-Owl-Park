import { test } from '@playwright/test';
import { openPark, settleCamera } from './helpers';

// Temporary QA pictures for the map's edges (this branch only, never merged): the merge gate's sizes.
const SHOTS: Array<[string, string?]> = [
  ['m3-hall', 'from-glass'],
  ['m3-hall', 'default'],
  ['m3-hall', 'from-under'],
  ['hub'],
  ['canopy-3'],
  ['circuit-2'],
  ['brush-2'],
];
const SIZES: Array<[string, number, number]> = [
  ['1440x900', 1440, 900],
  ['1024x768', 1024, 768],
];
for (const [room, spawn] of SHOTS)
  for (const [name, width, height] of SIZES) {
    test(`qa ${room} ${spawn ?? 'default'} ${name}`, async ({ page }) => {
      test.skip(test.info().project.name !== 'desktop');
      await page.setViewportSize({ width, height });
      await openPark(page, { room, kit: '1', ...(spawn ? { spawn } : {}) });
      await settleCamera(page);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `qa-shots/${name}-${room}-${spawn ?? 'default'}.jpg`, type: 'jpeg', quality: 70 });
    });
  }
