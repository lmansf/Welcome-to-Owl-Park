import { expect, test } from './fixtures';
import { frames, openPark, state, walkAndStop, walkToDoor } from './helpers';

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

  test('through the turnstiles the feathers lead a new owl to the Great Hollow’s roots, then on to the arcade’s hatch, a place to play, and no sign names the way back until the owl has stepped away (OP-337, OP-347)', async ({ page }) => {
    // Two rooms, three walks across the hall and the trail laid twice: more than the suite's 45 s on a slow phone.
    test.setTimeout(100_000);
    await openPark(page, { room: 'lobby', keeper: '1', newmap: '1' });
    await page.evaluate(() => window.owlPark.walkTo(2595, 800));
    await expect.poll(async () => (await state(page)).walking, { timeout: 15_000 }).toBe(false);
    await page.keyboard.down('ArrowUp');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('m3-hall');
    await page.keyboard.up('ArrowUp');
    await page.waitForFunction(() => window.owlPark.state()?.connected === true);

    // No doorway for the one way with nothing behind it, and no closed sign in the room; the ink
    // Commons' way leads to the ink garden (OP-402).
    const hall = await state(page);
    expect(hall.doors.map((d) => d.id)).toContain('to-ink');
    expect(hall.doors.map((d) => d.id)).not.toContain('course-glass');

    // The feathers come out down the hall to its own roots, a thing to do before any doorway (OP-347):
    // the first root of the inner run on either side of the hall's middle (rooms/hollowHall.ts).
    await expect.poll(async () => (await state(page)).trail?.feathers.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(3);
    const { trail, pos, doors } = await state(page);
    const roots = [
      { x: 2300, y: 1238 },
      { x: 3140, y: 1238 },
    ];
    const end = trail!.feathers[trail!.feathers.length - 1]!;
    const root = roots.reduce((a, b) => (Math.hypot(end.x - a.x, end.y - a.y) < Math.hypot(end.x - b.x, end.y - b.y) ? a : b));
    expect(Math.hypot(end.x - root.x, end.y - root.y), `the trail ends at ${end.x},${end.y}`).toBeLessThan(260);
    for (const f of trail!.feathers) expect(f.y, `feather at ${f.x},${f.y}`).toBeGreaterThan(pos.y);
    expect(trail!.glints).toContain('play-roots');
    expect(trail!.glints).toContain('to-glass');
    expect(trail!.glints).toContain('down');

    // Where it arrived, by the knothole it came in by: no sign for the way back.
    await frames(page, 40);
    expect((await state(page)).signShown).toBeNull();

    // Stood at the roots, they are found: the feathers lead on to the hatch at the front, a place to
    // play, past the realms' doorways either side of the knothole.
    await walkAndStop(page, root.x, root.y + 90);
    await expect.poll(async () => (await state(page)).trail?.glints ?? ['play-roots'], { timeout: 10_000 }).not.toContain('play-roots');
    const hatch = doors.find((d) => d.id === 'down')!;
    await expect
      .poll(
        async () => {
          const s = await state(page);
          const feathers = s.trail?.feathers ?? [];
          const last = feathers[feathers.length - 1];
          return feathers.length > 3 && !!last && Math.hypot(last.x - hatch.x, last.y - hatch.y) < 260 && feathers.every((f) => f.y > s.pos.y);
        },
        { timeout: 20_000 },
      )
      .toBe(true);

    // Out onto the floor, clear of every doorway, and back: now the knothole is named.
    const up = doors.find((d) => d.id === 'up')!;
    await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), { x: up.x, y: up.y + 570 });
    await expect.poll(async () => (await state(page)).pos.y, { timeout: 15_000 }).toBeLessThan(up.y + 590);
    await expect.poll(async () => (await state(page)).walking, { timeout: 15_000 }).toBe(false);
    expect((await state(page)).signShown).toBeNull();
    await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), { x: up.x, y: up.y + 170 });
    await expect.poll(async () => (await state(page)).signShown, { timeout: 15_000 }).toBe('Up to the Treetop Commons');
  });

  test('in the Party Grove the feathers lead to the lantern beam first, then on to the quiz stage, the room’s own games before any arch (OP-338)', async ({ page }) => {
    await openPark(page, { room: 'hub' });
    // Both games glint, and the feathers set off west from where the owl lands, toward the beam.
    await expect.poll(async () => (await state(page)).trail?.glints ?? [], { timeout: 15_000 }).toContain('play-lanterns');
    expect((await state(page)).trail!.glints).toContain('play-quiz');
    await expect.poll(async () => (await state(page)).trail?.feathers.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(3);
    const landed = await state(page);
    for (const f of landed.trail!.feathers) expect(f.x, `feather at ${f.x},${f.y}`).toBeLessThan(landed.pos.x);

    // Under the beam: the lanterns are found (and there to light), and the feathers lead on east to the stage.
    await page.evaluate(() => window.owlPark.walkTo(1000, 765));
    await expect.poll(async () => (await state(page)).trail?.glints ?? ['play-lanterns'], { timeout: 30_000 }).not.toContain('play-lanterns');
    await expect.poll(async () => (await state(page)).walking, { timeout: 15_000 }).toBe(false);
    await expect
      .poll(
        async () => {
          const s = await state(page);
          const feathers = s.trail?.feathers ?? [];
          return feathers.length > 3 && feathers.every((f) => f.x > s.pos.x);
        },
        { timeout: 20_000 },
      )
      .toBe(true);
    expect((await state(page)).trail!.glints).toContain('play-quiz');
  });
});
