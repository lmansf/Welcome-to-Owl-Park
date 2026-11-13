import { expect, test } from './fixtures';
import { openPark, settleCamera, state } from './helpers';

/**
 * The tree's level 2, the high branch west (OP-161): three screens seen from the side, the diner's
 * reach out to the branch's tip, the grove's common area, and the trunk's landing with its stairs up to
 * level 3 and down to level 1. On the local transport a gated room is open.
 */

const GROUND = 770;
const ON_ITS_SIDE = { width: 839, height: 412 };

test.describe('the tree, level 2 (OP-161)', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    if (isMobile) await page.setViewportSize(ON_ITS_SIDE);
  });

  test('opens on the landing on the ground line, its scrolling layers at their own rates', async ({ page }) => {
    await openPark(page, { room: 'l2' });
    const s = await state(page);
    expect(s.room).toBe('l2');
    expect(Math.abs(s.pos.y - GROUND)).toBeLessThanOrEqual(4);
    expect(Math.abs(s.pos.x - 3500)).toBeLessThanOrEqual(4);
    expect(s.owlScale).toBeCloseTo(1.25);
    expect(s.layers.map((l) => [l.key, l.rate])).toEqual([
      ['tree-l2-w2-bg', 0.5],
      ['tree-l2-w1-bg', 0.5],
      ['tree-l2-0-bg', 0.5],
      ['tree-l2-w2-mid', 0.75],
      ['tree-l2-w1-mid', 0.75],
      ['tree-l2-0-mid', 0.75],
      ['tree-l2-w2-fg', 1.2],
      ['tree-l2-w1-fg', 1.2],
      ['tree-l2-0-fg', 1.2],
    ]);
  });

  test('reads at a glance: its painted ledges with no line drawn over them, the stairs up and down marked, the stairhead down and the rope east of the trunk drawn (OP-173, OP-220)', async ({ page }) => {
    await openPark(page, { room: 'l2' });
    expect((await state(page)).tree).toEqual({ fronts: 0, raised: 0, shades: 0, lips: 0, marks: 2, barriers: 1, landings: 1, behind: false });
  });

  for (const [spawn, screen] of [['west', 0], ['default', 2]] as const) {
    test(`the camera shows an owl at the ${spawn} spawn on the level's ${screen ? 'last' : 'first'} screen`, async ({ page }) => {
      await openPark(page, { room: 'l2', spawn });
      const at = (await state(page)).pos.x;
      expect(Math.floor(at / 1600)).toBe(screen);
      const view = await settleCamera(page);
      expect(view.viewX).toBeLessThanOrEqual(at);
      expect(view.viewX + view.viewW).toBeGreaterThanOrEqual(at);
    });
  }
});
