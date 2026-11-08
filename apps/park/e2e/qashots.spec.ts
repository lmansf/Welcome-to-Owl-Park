import { test } from '@playwright/test';
import { openPark, settleCamera } from './helpers';

// Temporary QA pictures for the map's edges (this branch only, never merged).
const SHOTS: Array<[string, string?]> = [
  ['m3-hall', 'from-glass'],
  ['m3-hall', 'from-lobby'],
  ['m3-hall', 'from-market'],
  ['m3-hall', 'default'],
  ['m3-hall', 'from-under'],
  ['lobby'],
  ['homes'],
  ['hub'],
  ['glass'],
  ['grove'],
  ['market'],
  ['arcade'],
  ['canopy-1'],
  ['brush-1'],
  ['circuit-1'],
  ['circuit-2'],
  ['canopy-3'],
  ['l1'],
];
for (const [room, spawn] of SHOTS) {
  test(`qa ${room} ${spawn ?? 'default'}`, async ({ page }) => {
    await openPark(page, { room, kit: '1', ...(spawn ? { spawn } : {}) });
    await settleCamera(page);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `qa-shots/${test.info().project.name}-${room}-${spawn ?? 'default'}.jpg`, type: 'jpeg', quality: 70 });
  });
}
