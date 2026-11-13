import { expect, test } from '@playwright/test';
import { openPark, state } from './helpers';

/**
 * The tree drawn from the art kit (OP-234), as every visitor sees it: each room of the tree opens with
 * the kit's backdrops in place of its paintings, its owl on the ground line, and the signs of the ways
 * not open yet still up. `?kit=0` brings the paintings back. On the local transport a gated room is
 * open, so a page walks it with no keeper's token.
 */

const GROUND = 770;
const TREE = ['l0', 'l0-arcade', 'l1', 'l2', 'l3', 'l4', 'l5-street', 'l5'];

test.describe('the tree drawn from the art kit (OP-234)', () => {
  for (const room of TREE) {
    test(`${room} opens drawn from the kit, its owl on the ground line${room === 'l1' ? ' @smoke' : ''}`, async ({ page }) => {
      await openPark(page, { room, kit: '1' });
      const s = await state(page);
      expect(s.room).toBe(room);
      expect(Math.abs(s.pos.y - GROUND)).toBeLessThanOrEqual(4);
      expect(s.layers.length).toBeGreaterThan(0);
      for (const l of s.layers) expect(l.key, l.key).toMatch(/^kit-/);
    });
  }

  test('shows the paintings again when the page asks for them', async ({ page }) => {
    await openPark(page, { room: 'l1', kit: '0' });
    const s = await state(page);
    expect(s.layers.some((l) => l.key.startsWith('tree-l1-'))).toBe(true);
    expect(s.layers.some((l) => l.key.startsWith('kit-'))).toBe(false);
  });
});
