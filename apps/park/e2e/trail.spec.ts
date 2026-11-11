import { expect, test } from './fixtures';
import { frames, openPark, state, walkToDoor } from './helpers';

/**
 * The feather trail (OP-307): in a room seen from above, feathers lead from the owl toward the nearest
 * doorway it hasn't been through, and each such doorway glints. Going through one counts it as tried on
 * this device, and Settings can switch the trail off.
 */
test.describe('the feather trail (OP-307)', () => {
  test('feathers lead toward a doorway not tried yet, and a doorway gone through stops glinting', async ({ page }) => {
    await openPark(page, { room: 'hub' });
    await expect.poll(async () => (await state(page)).trail?.glints.length ?? 0, { timeout: 10_000 }).toBeGreaterThan(1);
    const first = (await state(page)).trail!;
    expect(first.on).toBe(true);
    // Through the Party Grove's doorway to the treehouses, and back the way it came.
    expect(first.glints).toContain('to-grove');
    await walkToDoor(page, 'to-grove');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('grove');
    await page.waitForFunction(() => window.owlPark.state()?.connected === true);
    await walkToDoor(page, 'to-hub');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('hub');
    await expect.poll(async () => (await state(page)).trail?.glints ?? ['none yet'], { timeout: 10_000 }).not.toContain('to-grove');
    // The trail is laid toward one of the doorways still glinting.
    await expect.poll(async () => (await state(page)).trail?.feathers.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  });

  test('through the turnstiles the feathers lead across the Great Hollow to the arcade’s hatch, a place to play, and no sign names the way back until the owl has stepped away (OP-337)', async ({ page }) => {
    await openPark(page, { room: 'lobby', keeper: '1', newmap: '1' });
    await page.evaluate(() => window.owlPark.walkTo(2595, 800));
    await expect.poll(async () => (await state(page)).walking, { timeout: 15_000 }).toBe(false);
    await page.keyboard.down('ArrowUp');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('m3-hall');
    await page.keyboard.up('ArrowUp');
    await page.waitForFunction(() => window.owlPark.state()?.connected === true);

    // No doorway for the two ways with nothing behind them, and no closed sign in the room.
    const hall = await state(page);
    expect(hall.doors.map((d) => d.id)).not.toContain('to-ink');
    expect(hall.doors.map((d) => d.id)).not.toContain('course-glass');

    // The feathers come out toward the hatch at the front, past the realms' doorways either side of the knothole.
    await expect.poll(async () => (await state(page)).trail?.feathers.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(3);
    const { trail, pos, doors } = await state(page);
    const hatch = doors.find((d) => d.id === 'down')!;
    const along = Math.hypot(hatch.x - pos.x, hatch.y - pos.y);
    for (const f of trail!.feathers) {
      // On the straight way from the owl to the hatch: no further off it than a feather's drift.
      const off = Math.abs((hatch.x - pos.x) * (f.y - pos.y) - (hatch.y - pos.y) * (f.x - pos.x)) / along;
      expect(off, `feather at ${f.x},${f.y}`).toBeLessThan(40);
      expect(f.y).toBeGreaterThan(pos.y);
    }
    expect(trail!.glints).toContain('to-glass');
    expect(trail!.glints).toContain('down');

    // Where it arrived, by the knothole it came in by: no sign for the way back.
    await frames(page, 40);
    expect((await state(page)).signShown).toBeNull();
    // Out onto the floor, clear of every doorway, and back: now the knothole is named.
    await page.evaluate(() => window.owlPark.walkTo(3200, 900));
    await expect.poll(async () => (await state(page)).pos.y, { timeout: 15_000 }).toBeGreaterThan(880);
    expect((await state(page)).signShown).toBeNull();
    await page.evaluate(() => window.owlPark.walkTo(3200, 500));
    await expect.poll(async () => (await state(page)).signShown, { timeout: 15_000 }).toBe('Up to the Treetop Commons');
  });
});
