import { expect, test } from '@playwright/test';
import { openPark, settleCamera, state } from './helpers';

/**
 * The tree's level 3, the high branch east (OP-160): three screens seen from the side, the trunk's
 * landing with its stair up to level 4, the stained-glass realm's common area, and its reach with the
 * doorway into the stained-glass street. On the local transport a gated room is open.
 */

const GROUND = 770;
const ON_ITS_SIDE = { width: 839, height: 412 };

test.describe('the tree, level 3 (OP-160)', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    if (isMobile) await page.setViewportSize(ON_ITS_SIDE);
  });

  test('opens on the landing on the ground line, its scrolling layers at their own rates', async ({ page }) => {
    await openPark(page, { room: 'l3' });
    const s = await state(page);
    expect(s.room).toBe('l3');
    expect(Math.abs(s.pos.y - GROUND)).toBeLessThanOrEqual(4);
    expect(Math.abs(s.pos.x - 300)).toBeLessThanOrEqual(4);
    expect(s.owlScale).toBeCloseTo(1.25);
    expect(s.layers.map((l) => [l.key, l.rate])).toEqual([
      ['tree-l3-e2-bg', 0.5],
      ['tree-l3-e1-bg', 0.5],
      ['tree-l3-0-bg', 0.5],
      ['tree-l3-0-mid', 0.75],
      ['tree-l3-e2-mid', 0.75],
      ['tree-l3-0-fg', 1.2],
      ['tree-l3-e1-fg', 1.2],
      ['tree-l3-e2-fg', 1.2],
    ]);
  });

  test('reads at a glance: the stairs up and down and the stained-glass doorway marked, the stairhead down and the rope across the reach drawn (OP-173, OP-220)', async ({ page }) => {
    await openPark(page, { room: 'l3' });
    expect((await state(page)).tree).toEqual({ fronts: 0, raised: 0, shades: 0, lips: 0, marks: 3, barriers: 1, landings: 1, behind: false });
  });

  for (const [spawn, screen] of [['default', 0], ['east', 2]] as const) {
    test(`the camera shows an owl at the ${spawn} spawn on the level's ${screen ? 'last' : 'first'} screen`, async ({ page }) => {
      await openPark(page, { room: 'l3', spawn });
      const at = (await state(page)).pos.x;
      expect(Math.floor(at / 1600)).toBe(screen);
      const view = await settleCamera(page);
      expect(view.viewX).toBeLessThanOrEqual(at);
      expect(view.viewX + view.viewW).toBeGreaterThanOrEqual(at);
    });
  }
});
