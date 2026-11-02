import { expect, test } from '@playwright/test';
import { openPark, settleCamera, state } from './helpers';

/**
 * The tree's level 5, the canopy (OP-158), in two rooms joined at the front gate: the nests street
 * (three screens, outside the gate: bough 6 at its far west end, the nest doors and the trunk) and the
 * canopy (three screens inside: the entrance arch with the stair down to level 4, the lounge and gift
 * shop, and bough 7). On the local transport a gated room is open.
 */

const GROUND = 770;
const ON_ITS_SIDE = { width: 839, height: 412 };

test.describe('the tree, level 5 (OP-158)', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    if (isMobile) await page.setViewportSize(ON_ITS_SIDE);
  });

  test('the nests street opens on the ground line, its scrolling layers at their own rates', async ({ page }) => {
    await openPark(page, { room: 'l5-street' });
    const s = await state(page);
    expect(s.room).toBe('l5-street');
    expect(Math.abs(s.pos.y - GROUND)).toBeLessThanOrEqual(4);
    expect(Math.abs(s.pos.x - 2400)).toBeLessThanOrEqual(4);
    expect(s.owlScale).toBeCloseTo(1.25);
    expect(s.layers.map((l) => [l.key, l.rate])).toEqual([
      ['tree-l5-w2-bg', 0.5],
      ['tree-l5-w1-bg', 0.5],
      ['tree-l5-0-bg', 0.5],
      ['tree-l5-w2-mid', 0.75],
      ['tree-l5-w1-mid', 0.75],
      ['tree-l5-0-mid', 0.75],
      ['tree-l5-w2-fg', 1.2],
      ['tree-l5-w1-fg', 1.2],
      ['tree-l5-0-fg', 1.2],
    ]);
    // Bough 6's six ledges, and the front gate marked (the far end's doorway is shut).
    expect(s.tree).toEqual({ fronts: 0, raised: 0, shades: 0, lips: 6, marks: 1, behind: false });
  });

  test('the canopy opens on the ground line, its scrolling layers at their own rates', async ({ page }) => {
    await openPark(page, { room: 'l5' });
    const s = await state(page);
    expect(s.room).toBe('l5');
    expect(Math.abs(s.pos.y - GROUND)).toBeLessThanOrEqual(4);
    expect(Math.abs(s.pos.x - 800)).toBeLessThanOrEqual(4);
    expect(s.layers.map((l) => [l.key, l.rate])).toEqual([
      ['tree-l5-e3-bg', 0.5],
      ['tree-l5-e2-bg', 0.5],
      ['tree-l5-e1-bg', 0.5],
      ['tree-l5-e1-mid', 0.75],
      ['tree-l5-e2-mid', 0.75],
      ['tree-l5-e3-mid', 0.75],
      ['tree-l5-e1-fg', 1.2],
      ['tree-l5-e2-fg', 1.2],
      ['tree-l5-e3-fg', 1.2],
    ]);
    // Bough 7's six ledges, the way back out to the street and the stair down marked.
    expect(s.tree).toEqual({ fronts: 0, raised: 0, shades: 0, lips: 6, marks: 2, behind: false });
  });

  for (const [room, spawn, screen] of [['l5-street', 'west', 0], ['l5', 'east', 2]] as const) {
    test(`the camera shows an owl at ${room}'s ${spawn} spawn on screen ${screen}`, async ({ page }) => {
      await openPark(page, { room, spawn });
      const at = (await state(page)).pos.x;
      expect(Math.floor(at / 1600)).toBe(screen);
      const view = await settleCamera(page);
      expect(view.viewX).toBeLessThanOrEqual(at);
      expect(view.viewX + view.viewW).toBeGreaterThanOrEqual(at);
    });
  }
});
