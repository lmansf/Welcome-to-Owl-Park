import { expect, test, type Page } from '@playwright/test';
import { jumpFlapGlide, openPark, settleCamera, state, walkAndStop } from './helpers';

/**
 * The tree (map 2, OP-156): its first room, the lobby at the trunk's foot, seen from the side. Its
 * floor is the ground line, its ledges are perches over that line, and its art comes in three layers
 * that scroll at their own rates. On the local transport a gated room is open, so a page walks it with
 * no keeper's token; the room server's door (a keeper's token, or the realms switch) is apps/edge's to test.
 */

const GROUND = 770;
/** A jump from where the owl stands, Jump held `ms` (in the page, so a slow runner holds it as long). */
const jump = (page: Page, ms = 400) => page.evaluate((ms) => window.owlPark.jump(ms), ms);
/** Standing still at `top` over the ground line. */
const standsAt = (page: Page, top: number) =>
  expect.poll(async () => { const s = await state(page); return [s.air.s, Math.round(s.air.z)]; }, { timeout: 5_000, intervals: [50] }).toEqual([0, top]);

test.describe('the tree, map 2 (OP-156)', () => {
  test('opens on the ground line, its sky and its leaves at their own rates, its owl a quarter bigger', async ({ page }) => {
    await openPark(page, { room: 'l1' });
    const s = await state(page);
    expect(s.room).toBe('l1');
    expect(Math.abs(s.pos.y - GROUND)).toBeLessThanOrEqual(4);
    expect(s.owlScale).toBeCloseTo(1.25);
    expect(s.layers.map((l) => [l.key, l.rate])).toEqual([
      ['tree-l1-0-bg', 0.5],
      ['tree-l1-0-fg', 1.2],
    ]);
    // The sky is drawn a tenth bigger than its screen, so its edge never shows while it lags.
    expect(s.layers[0]!.w).toBeGreaterThan(1600);
  });

  test('climbs the spiral stair to the balcony a jump a step, and comes down off the balcony’s end', async ({ page }) => {
    await openPark(page, { room: 'l1' });
    await walkAndStop(page, 1042, GROUND);
    for (const top of [82, 153, 286]) {
      await jump(page);
      await standsAt(page, top);
    }
    await walkAndStop(page, 1300, GROUND);
    await standsAt(page, 0);
  });

  test('a jump and a flap up onto the lintel over the way down, and a jump on up to the shelf fungus', async ({ page }) => {
    await openPark(page, { room: 'l1' });
    await walkAndStop(page, 650, GROUND);
    await jumpFlapGlide(page, 200, { jumpMs: 340, spare: 15 });
    await standsAt(page, 196);
    await walkAndStop(page, 600, GROUND);
    await standsAt(page, 196);
    await jump(page);
    await standsAt(page, 282);
  });

  test('the camera follows the owl along the ground line on a screen narrower than the room', async ({ page }) => {
    await openPark(page, { room: 'l1' });
    await walkAndStop(page, 60, GROUND);
    const west = await settleCamera(page);
    await walkAndStop(page, 1540, GROUND);
    const east = await settleCamera(page);
    expect(west.viewW).toBeLessThan(1600);
    expect(east.viewX).toBeGreaterThan(west.viewX + 40);
  });
});
