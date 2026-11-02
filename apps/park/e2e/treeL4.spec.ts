import { expect, test } from '@playwright/test';
import { openPark, settleCamera, state } from './helpers';

/**
 * The tree's level 4, the sky landing (OP-159): two screens seen from the side, the stair landing round
 * the trunk and the overlook east of it, painted in OP-173's six layers. On the local transport a gated
 * room is open, so a page walks it with no keeper's token.
 */

const GROUND = 770;
const ON_ITS_SIDE = { width: 839, height: 412 };

test.describe('the tree, level 4 (OP-159)', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    if (isMobile) await page.setViewportSize(ON_ITS_SIDE);
  });

  test('opens on the landing on the ground line, its scrolling layers at their own rates', async ({ page }) => {
    await openPark(page, { room: 'l4' });
    const s = await state(page);
    expect(s.room).toBe('l4');
    expect(Math.abs(s.pos.y - GROUND)).toBeLessThanOrEqual(4);
    expect(Math.abs(s.pos.x - 800)).toBeLessThanOrEqual(4);
    expect(s.owlScale).toBeCloseTo(1.25);
    // The skies (the landing's on top), the landing's middle distance, then the overlays; the back
    // scenery, the platforms and the front props move with the room.
    expect(s.layers.map((l) => [l.key, l.rate])).toEqual([
      ['tree-l4-e1-bg', 0.5],
      ['tree-l4-0-bg', 0.5],
      ['tree-l4-0-mid', 0.75],
      ['tree-l4-0-fg', 1.2],
      ['tree-l4-e1-fg', 1.2],
    ]);
  });

  test('reads at a glance: an edge on each of its eleven ledges, and the way down to level 3 marked (OP-173)', async ({ page }) => {
    await openPark(page, { room: 'l4' });
    expect((await state(page)).tree).toEqual({ fronts: 0, raised: 0, shades: 0, lips: 11, marks: 1, behind: false });
  });

  for (const [spawn, screen] of [['west', 0], ['east', 1]] as const) {
    test(`the camera shows an owl at the ${spawn} spawn on the level's ${screen ? 'last' : 'first'} screen`, async ({ page }) => {
      await openPark(page, { room: 'l4', spawn });
      const at = (await state(page)).pos.x;
      expect(Math.floor(at / 1600)).toBe(screen);
      const view = await settleCamera(page);
      expect(view.viewX).toBeLessThanOrEqual(at);
      expect(view.viewX + view.viewW).toBeGreaterThanOrEqual(at);
    });
  }
});
