import { expect, test } from '@playwright/test';
import { openPark, state } from './helpers';

/**
 * Size boxes (`?sizes=1`, game/sizeBoxes.ts): the new map's art drawn as boxes labelled with each
 * piece's size, so the map can be laid out before its art is made. Only the look changes: the owl
 * comes in where it does with the art, the doors are the same, and it walks the same floor.
 */

const ROOMS = ['m3-hall', 'commons-glass', 'm3-ground', 'hub'];
/** The rooms seen from above, whose walkable floor is drawn plainly. */
const TOP_DOWN = new Set(['commons-glass', 'hub']);

test.describe('size boxes in place of the map art', () => {
  for (const room of ROOMS) {
    test(`${room} draws its art as size boxes and plays as it does with its art${room === 'm3-hall' || room === 'commons-glass' ? ' @smoke' : ''}`, async ({
      page,
    }) => {
      await openPark(page, { room, kit: '1' });
      const plain = await state(page);
      await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-${room}-art.png` });
      expect(plain.sizeBoxes).toEqual([]);

      await openPark(page, { room, kit: '1', sizes: '1' });
      const boxed = await state(page);
      expect(boxed.room).toBe(room);
      expect(boxed.sizeBoxes.length).toBeGreaterThan(0);
      // Every painted layer of the room is a box.
      for (const l of boxed.layers) expect(boxed.sizeBoxes, l.key).toContain(l.key);
      // The same room to walk: the owl's arrival, the doors and what is there to do.
      expect(boxed.pos).toEqual(plain.pos);
      expect(boxed.doors).toEqual(plain.doors);
      expect(boxed.objects.map((o) => o.id)).toEqual(plain.objects.map((o) => o.id));
      // One small label per piece, never a piece labelled twice, and only boxed pieces.
      await expect.poll(async () => (await state(page)).sizeLabels.length).toBeGreaterThan(0);
      const labels = (await state(page)).sizeLabels;
      expect(new Set(labels).size).toBe(labels.length);
      for (const k of labels) expect(boxed.sizeBoxes, k).toContain(k);
      // Seen from above, the walkable floor is drawn plainly, with the boxes and without.
      expect(boxed.floorShown).toBe(TOP_DOWN.has(room));
      expect(plain.floorShown).toBe(TOP_DOWN.has(room));
      await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-${room}-sizes.png` });
    });
  }

  test('stay on for the tab until ?sizes=0', async ({ page }) => {
    await openPark(page, { room: 'm3-hall', kit: '1', sizes: '1' });
    await openPark(page, { room: 'm3-hall', kit: '1' });
    expect((await state(page)).sizeBoxes.length).toBeGreaterThan(0);
    await openPark(page, { room: 'm3-hall', kit: '1', sizes: '0' });
    expect((await state(page)).sizeBoxes).toEqual([]);
  });
});
