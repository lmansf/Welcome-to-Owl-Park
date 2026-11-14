import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { dist, openPark, state, walkToDoor } from './helpers';

/**
 * The movers (OP-287), behind the `movers` flag, on this device: where the Great Hollow has a hatch in
 * its floor an owl dives down a knot hole to the arcade; the arcade's doorway back up is a knot-hole
 * tunnel; and a glide lane runs the length of the arcade past its three cabinets. Without the flag the
 * hatch, the doorway and the long walk are as they were.
 */
/** A keeper's tab on the new map, where the arcade's doorway leads up to the Great Hollow, with the movers on. */
const MOVERS = { keeper: '1', newmap: '1', movers: '1' };
const PLAIN = { keeper: '1', newmap: '1' };
/** Where an owl up from the arcade stands in the Great Hollow (the hall's `from-under`). */
const FROM_UNDER = { x: 2226, y: 1886 };
/** The arcade's glide lane (ARCADE_LANE): its ends and the height it holds a glide at. */
const LANE = { a: { x: 300, y: 880 }, b: { x: 4300, y: 880 }, z: 150 };

type Seen = { room: string; z: number; vz: number; s: number; diving: string | null };

/** From now on, what the owl's flight does frame by frame, room after room: a dive is over in under half a second. */
async function watchFlight(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { flightSeen: Seen[] };
    type Seen = { room: string; z: number; vz: number; s: number; diving: string | null };
    w.flightSeen = [];
    const look = () => {
      const s = window.owlPark?.state?.();
      if (s) w.flightSeen.push({ room: s.room, z: s.air.z, vz: (s.air as { vz?: number }).vz ?? 0, s: s.air.s, diving: s.movers?.diving ?? null });
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
}
const flightSeen = (page: Page) => page.evaluate(() => (window as unknown as { flightSeen: Seen[] }).flightSeen);

/** The art keys of everything the room scene draws now. */
const drawnKeys = (page: Page) =>
  page.evaluate(() => (window.owlPark.game.scene.getScene('room').children.list as unknown as Array<{ texture?: { key?: string }; visible?: boolean }>).filter((o) => o.visible !== false).map((o) => o.texture?.key ?? '').filter(Boolean));

test.describe('the movers, behind their flag (OP-287)', () => {
  test('without the flag the Great Hollow has its hatch and the arcade its doorway: nothing of the movers is drawn or played', async ({ page }) => {
    await openPark(page, { room: 'm3-hall', spawn: 'from-under', ...PLAIN });
    expect((await state(page)).movers).toBeNull();
    const drawn = await drawnKeys(page);
    expect(drawn).toContain('kit-hatch-down');
    expect(drawn.filter((k) => k.includes('mover-'))).toEqual([]);
    // Down the hatch as ever: the owl walks in and stands on the arcade's floor, never in the air.
    await watchFlight(page);
    await walkToDoor(page, 'down');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('arcade');
    await page.waitForFunction(() => window.owlPark.state()?.connected === true);
    const arcade = await state(page);
    expect(arcade.movers).toBeNull();
    expect((await flightSeen(page)).filter((f) => f.room === 'arcade').every((f) => f.z === 0 && f.s === 0)).toBe(true);
    // No word of a lane, and a held jump here is a jump and a glide down, carried nowhere.
    await expect(page.locator('[data-toasts]')).not.toContainText('glide lane');
    const stood = arcade.pos;
    await page.keyboard.down('Space');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 5_000, intervals: [50] }).not.toBe(0);
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
    await page.keyboard.up('Space');
    expect((await flightSeen(page)).some((f) => f.room === 'arcade' && f.s === 3)).toBe(false);
    expect(dist((await state(page)).pos, stood)).toBeLessThan(4);
  });

  test('a step onto the knot hole is a dive to the arcade: the hatch’s art is gone, the owl comes in falling and lands, and is told what the lane is for', async ({ page }) => {
    await openPark(page, { room: 'm3-hall', spawn: 'from-under', ...MOVERS });
    const hall = await state(page);
    // The knot hole's mouth and the air sinking over it, as boxes with their names until they are painted; no hatch.
    expect(hall.movers?.pieces.map((p) => p.key)).toEqual(['mover-knot-hole-mouth', 'mover-downdraft-column']);
    expect(hall.movers?.pieces.every((p) => !p.art)).toBe(true);
    const drawn = await drawnKeys(page);
    expect(drawn).not.toContain('kit-hatch-down');
    expect(drawn).toContain('box:mover-knot-hole-mouth');
    // The doorway is still the room's: its place, where it leads, and the mouth standing on it.
    const down = hall.doors.find((d) => d.id === 'down')!;
    expect(down.to).toBe('arcade');
    const mouth = hall.movers!.pieces[0]!;
    expect(down.x).toBeGreaterThan(mouth.x);
    expect(down.x).toBeLessThan(mouth.x + mouth.w);
    await page.screenshot({ path: 'e2e-screenshots/movers-knot-hole.png' });

    await watchFlight(page);
    await walkToDoor(page, 'down');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('arcade');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
    const arcade = await state(page);
    expect(arcade.movers?.cameBy).toBe('dive');
    // Down at the diver's own spot, the west end of the lane's line, not the doorway's.
    expect(dist(arcade.pos, LANE.a)).toBeLessThan(6);
    // It came in over where it stands, falling: seen in the air, high, before it was down.
    const fell = (await flightSeen(page)).filter((f) => f.room === 'arcade');
    expect(Math.max(...fell.map((f) => f.z))).toBeGreaterThan(200);
    expect(fell.some((f) => f.s === 1 && f.vz < 0)).toBe(true);
    // Where it lands is under the lane: the lane's one line of words, said once.
    await expect(page.locator('[data-toasts]')).toContainText('A glide lane runs here. Jump and keep holding to ride it along.', { timeout: 10_000 });
    // The tunnel's mouth at the doorway back up, and the lane's streamers end to end along it.
    const keys = arcade.movers!.pieces.map((p) => p.key);
    expect(keys.filter((k) => k === 'mover-knot-hole-mouth')).toHaveLength(1);
    expect(keys.filter((k) => k === 'mover-glide-lane-streamers')).toHaveLength(10);
    await page.screenshot({ path: 'e2e-screenshots/movers-arcade-lane.png' });
  });

  test('Jump held under the glide lane is caught and carried the length of the arcade, set down at the far end by the lane itself, and carried back from there', async ({ page }) => {
    test.slow(); // the whole lane at a walk's pace, a quarter of a minute, and a runner a third as fast
    await openPark(page, { room: 'arcade', spawn: 'from-dive', ...MOVERS });
    const start = (await state(page)).pos;
    await watchFlight(page);
    await page.keyboard.down('Space');
    // Caught: lifted (3), held at the lane's height, and heading for the far end with no walking key pressed.
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000, intervals: [50] }).toBe(3);
    await expect.poll(async () => (await state(page)).air.z, { timeout: 5_000 }).toBe(LANE.z);
    expect((await state(page)).movers).toMatchObject({ laneRides: 1, laneTo: LANE.b });
    await expect.poll(async () => (await state(page)).pos.x, { timeout: 20_000 }).toBeGreaterThan(start.x + 500);
    expect((await state(page)).air).toMatchObject({ s: 3, z: LANE.z });
    await page.screenshot({ path: 'e2e-screenshots/movers-lane-ride.png' });
    // All the way: at the far end the lane lets go by itself, Jump still held, and the owl glides down onto the floor there.
    await expect.poll(async () => (await state(page)).movers?.laneTo ?? 'set down', { timeout: 60_000 }).toBe('set down');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 15_000 }).toBe(0);
    await page.keyboard.up('Space');
    const far = await state(page);
    expect(dist(far.pos, LANE.b)).toBeLessThan(10);
    expect(far.movers?.laneRides).toBe(1);
    // It was held level the whole ride: lifted frames at the lane's height and no higher.
    const ride = (await flightSeen(page)).filter((f) => f.s === 3);
    expect(ride.length).toBeGreaterThan(20);
    expect(Math.max(...ride.map((f) => f.z))).toBeLessThanOrEqual(LANE.z + 0.5);
    // And back: a held jump at this end is carried for the other.
    await page.keyboard.down('Space');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000, intervals: [50] }).toBe(3);
    expect((await state(page)).movers).toMatchObject({ laneRides: 2, laneTo: LANE.a });
    await expect.poll(async () => (await state(page)).pos.x, { timeout: 20_000 }).toBeLessThan(LANE.b.x - 300);
    // Let go in the middle of the room: out of the air where it is, and no further.
    await page.keyboard.up('Space');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
    const off = (await state(page)).pos;
    await page.waitForTimeout(600);
    expect(dist((await state(page)).pos, off)).toBeLessThan(4);
  });

  test('the arcade’s way up is a tunnel: in at the mouth, and up out of the Great Hollow’s floor with a hop', async ({ page }) => {
    await openPark(page, { room: 'arcade', spawn: 'from-cavern', ...MOVERS });
    await watchFlight(page);
    await walkToDoor(page, 'to-market');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('m3-hall');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
    const hall = await state(page);
    expect(hall.movers?.cameBy).toBe('tunnel');
    expect(dist(hall.pos, FROM_UNDER)).toBeLessThan(80);
    // Out of the mouth with a hop: off the floor a moment, a third of a jump at most.
    const hop = (await flightSeen(page)).filter((f) => f.room === 'm3-hall');
    const top = Math.max(...hop.map((f) => f.z));
    expect(top).toBeGreaterThan(15);
    expect(top).toBeLessThan(60);
    // It stands clear of the knot hole it came up by: no dive back down until it steps in.
    await page.waitForTimeout(800);
    expect((await state(page)).room).toBe('m3-hall');
  });

  test('a glide from the heart’s thermal that comes over the knot hole is taken down by the air sinking there, and the owl dives through to the arcade', async ({ page }) => {
    test.slow(); // a rise of three seconds, a glide of five and two rooms, on a runner a third as fast
    await openPark(page, { room: 'm3-hall', ...MOVERS });
    const hall = await state(page);
    const heart = hall.objects.find((o) => o.id === 'm3-hall-moonbeam-heart')!;
    const down = hall.doors.find((d) => d.id === 'down')!;
    await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), { x: heart.x, y: heart.y });
    await expect.poll(async () => { const s = await state(page); return !s.walking && dist(s.pos, heart) < 30; }, { timeout: 30_000 }).toBe(true);
    await page.keyboard.down('Space');
    await expect.poll(async () => (await state(page)).air.z, { timeout: 30_000 }).toBeGreaterThan(700);
    await watchFlight(page);
    // A glide held for the knot hole: over it the owl is still far above the floor.
    await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), { x: down.x, y: down.y });
    await expect.poll(async () => (await state(page)).room, { timeout: 60_000 }).toBe('arcade');
    await page.keyboard.up('Space');
    const seen = await flightSeen(page);
    const dived = seen.filter((f) => f.room === 'm3-hall' && f.diving === 'knot-hole');
    // Taken down in the air, wings folded (in the air, not gliding), at a dive's pace: from well over a jump's height.
    expect(dived.length).toBeGreaterThan(2);
    expect(Math.max(...dived.map((f) => f.z))).toBeGreaterThan(250);
    expect(dived.every((f) => f.s === 1 || f.s === 0)).toBe(true);
    expect(Math.min(...dived.map((f) => f.vz))).toBeLessThanOrEqual(-800);
    await expect.poll(async () => (await state(page)).movers?.cameBy, { timeout: 10_000 }).toBe('dive');
  });
});

/**
 * The courses' doorways (OP-287, milestone 2), seen from the side: with the flag each is a knot-hole
 * tunnel, in at the mouth and out of the far mouth with a hop, and the ways straight down (the trunk's
 * hatches, each course's way home) are dived into. A doorway is still taken where the owl stands in it.
 */
test.describe('the courses’ doorways as movers, behind the flag (OP-287)', () => {
  /** Where an owl comes into each room (the rooms' spawns). */
  const TRUNK_FOOT = { x: 140, y: 770 }; // canopy-2a's from-below
  const UNDER_HATCH = { x: 1400, y: 770 }; // canopy-2a's from-above
  const FALLS_LEDGE = { x: 4300, top: 540 }; // brush-2's from-falls, between the water under it and over it

  test('without the flag a storey’s hatch is a doorway as ever: the owl stands on the floor below, never in the air', async ({ page }) => {
    await openPark(page, { room: 'canopy-2b', spawn: 'from-below', ...PLAIN });
    expect((await state(page)).movers).toBeNull();
    await watchFlight(page);
    await walkToDoor(page, 'down');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('canopy-2a');
    await page.waitForFunction(() => window.owlPark.state()?.connected === true);
    const below = await state(page);
    expect(below.movers).toBeNull();
    // By its spawn, as far to a side of it as it stood in the doorway it took (an arrival's lane).
    expect(dist(below.pos, UNDER_HATCH)).toBeLessThan(40);
    expect((await flightSeen(page)).filter((f) => f.room === 'canopy-2a').every((f) => f.z === 0 && f.s === 0)).toBe(true);
  });

  test('a storey’s way down is dived into: the owl comes into the storey below falling, lands on its floor, and nothing new is drawn', async ({ page }) => {
    await openPark(page, { room: 'canopy-2b', spawn: 'from-below', ...MOVERS });
    // A room seen from the side draws no mover's box: its doorways' own art is the realm's knot-hole slot.
    expect((await state(page)).movers).toMatchObject({ pieces: [], cameBy: null });
    await watchFlight(page);
    await walkToDoor(page, 'down');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('canopy-2a');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
    const below = await state(page);
    expect(below.movers?.cameBy).toBe('dive');
    expect(below.air.z).toBe(0);
    expect(dist(below.pos, UNDER_HATCH)).toBeLessThan(6);
    const fell = (await flightSeen(page)).filter((f) => f.room === 'canopy-2a');
    expect(Math.max(...fell.map((f) => f.z))).toBeGreaterThan(200);
    expect(fell.some((f) => f.s === 1 && f.vz < 0)).toBe(true);
    await page.screenshot({ path: 'e2e-screenshots/movers-trunk-dive.png' });
  });

  test('the way into the trunk is a tunnel: in at the mouth, and out of the far mouth with a hop', async ({ page }) => {
    await openPark(page, { room: 'canopy-1', spawn: 'from-trunk', ...MOVERS });
    await watchFlight(page);
    await walkToDoor(page, 'to-trunk');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('canopy-2a');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
    const trunk = await state(page);
    expect(trunk.movers?.cameBy).toBe('tunnel');
    expect(dist(trunk.pos, TRUNK_FOOT)).toBeLessThan(40);
    const hop = (await flightSeen(page)).filter((f) => f.room === 'canopy-2a');
    const top = Math.max(...hop.map((f) => f.z));
    expect(top).toBeGreaterThan(15);
    expect(top).toBeLessThan(60);
    // It does not go straight back out: the way back waits for a push of its own.
    await page.waitForTimeout(800);
    expect((await state(page)).room).toBe('canopy-2a');
  });

  test('the hop out of the tunnel behind the waterfall stays under the water over its ledge: the owl stands on the ledge, no fall', async ({ page }) => {
    await openPark(page, { room: 'brush-falls', spawn: 'from-falls', ...MOVERS });
    await watchFlight(page);
    await walkToDoor(page, 'out');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('brush-2');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
    const river = await state(page);
    expect(river.movers?.cameBy).toBe('tunnel');
    // On the ledge it came out on, where a fall would have put it back at a bench far to the west.
    expect(river.air.z).toBe(FALLS_LEDGE.top);
    expect(Math.abs(river.pos.x - FALLS_LEDGE.x)).toBeLessThan(40);
    const hop = (await flightSeen(page)).filter((f) => f.room === 'brush-2');
    expect(Math.max(...hop.map((f) => f.z))).toBeLessThan(FALLS_LEDGE.top + 60);
    expect(Math.min(...hop.map((f) => f.z))).toBeGreaterThanOrEqual(FALLS_LEDGE.top);
    await page.waitForTimeout(600);
    expect((await state(page)).air.z).toBe(FALLS_LEDGE.top);
  });

  test('a course’s way home is dived into: out of the lookout hut and down into the Great Hollow, falling in by the course’s arch', async ({ page }) => {
    await openPark(page, { room: 'canopy-hut', spawn: 'from-deck', ...MOVERS });
    await watchFlight(page);
    await walkToDoor(page, 'out');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('m3-hall');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
    const hall = await state(page);
    expect(hall.movers?.cameBy).toBe('dive');
    const fell = (await flightSeen(page)).filter((f) => f.room === 'm3-hall');
    expect(Math.max(...fell.map((f) => f.z))).toBeGreaterThan(200);
    // Down by the Updraft Canopy's gate, and it stays in the Great Hollow.
    const gate = hall.doors.find((d) => d.id === 'course-grove')!;
    expect(dist(hall.pos, gate)).toBeLessThan(400);
    await page.waitForTimeout(800);
    expect((await state(page)).room).toBe('m3-hall');
    await page.screenshot({ path: 'e2e-screenshots/movers-home-dive.png' });
  });
});
