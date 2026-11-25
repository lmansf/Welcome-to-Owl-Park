import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { dist, openGround, openPark, settleCamera, state, tapRoomPoint, walkToDoor } from './helpers';

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
/** How far to either side of its line the lane catches a glide (ARCADE_LANE's `r`), in room px. */
const LANE_REACH = 70;
/** The pace a lane carries an owl at (LANE_SPEED, twice a walk's) and a walk's own (WALK_SPEED), in room px a second. */
const LANE_PACE = 520;
const WALK_PACE = 260;
/** The share of the way to the owl the camera's follow goes each frame: at a walk (FOLLOW_EASE), and on the lane (followEaseAt). */
const EASE = { walk: 0.12, lane: 3 / 14 };

type Seen = { room: string; z: number; vz: number; s: number; diving: string | null };

/**
 * From now on, what the owl's flight shows in each frame drawn, room after room. The frames hold what must
 * never be seen (an owl in the air where it walked in, a glide in a dive). What a flight did is read from
 * the flight's own records, `flown` and `movers.dove`, which its steps keep: a dive or a hop is over in
 * half a second, and a slow device draws two or three frames of it, or none.
 */
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
    const took = (await state(page)).flown.n;
    await watchFlight(page);
    await walkToDoor(page, 'down');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('arcade');
    await page.waitForFunction(() => window.owlPark.state()?.connected === true);
    const arcade = await state(page);
    expect(arcade.movers).toBeNull();
    // No flight by the flight's own count, and none in any frame drawn of the arcade.
    expect(arcade.flown.n).toBe(took);
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

    const took = (await state(page)).flown.n;
    await walkToDoor(page, 'down');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('arcade');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
    const arcade = await state(page);
    expect(arcade.movers?.cameBy).toBe('dive');
    // Down at the diver's own spot, the west end of the lane's line, not the doorway's.
    expect(dist(arcade.pos, LANE.a)).toBeLessThan(6);
    // It came in over where it stands and fell, wings folded: one flight by the flight's own count, from
    // high over the floor, and no glide in it.
    expect(arcade.flown).toMatchObject({ n: took + 1, glided: false, lifted: false });
    expect(arcade.flown.peak).toBeGreaterThan(200);
    // Where it lands is under the lane: the lane's one line of words, said once.
    await expect(page.locator('[data-toasts]')).toContainText('A glide lane runs here. Jump and keep holding to ride it along.', { timeout: 10_000 });
    // The tunnel's mouth at the doorway back up, and the lane's streamers end to end along it.
    const keys = arcade.movers!.pieces.map((p) => p.key);
    expect(keys.filter((k) => k === 'mover-knot-hole-mouth')).toHaveLength(1);
    expect(keys.filter((k) => k === 'mover-glide-lane-streamers')).toHaveLength(10);
    await page.screenshot({ path: 'e2e-screenshots/movers-arcade-lane.png' });
  });

  test('Jump held under the glide lane is caught and carried the length of the arcade in one walk at the lane’s own pace, twice a walk’s, set down at the far end by the lane itself, and carried back from there', async ({ page }) => {
    test.slow(); // two rides along the lane, on a runner that draws a third as fast
    await openPark(page, { room: 'arcade', spawn: 'from-dive', ...MOVERS });
    const { pos: start, flown: { n: took } } = await state(page);
    await page.keyboard.down('Space');
    // Caught: lifted (3), held at the lane's height, and heading for the far end with no walking key pressed.
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000, intervals: [50] }).toBe(3);
    await expect.poll(async () => (await state(page)).air.z, { timeout: 5_000 }).toBe(LANE.z);
    // Carried: one walk for the far end, at the lane's pace.
    await expect.poll(async () => (await state(page)).movers?.pace ?? 0, { timeout: 5_000, intervals: [50] }).toBe(LANE_PACE);
    expect((await state(page)).movers).toMatchObject({ laneRides: 1, laneTo: LANE.b, carries: 1 });
    await expect.poll(async () => (await state(page)).pos.x, { timeout: 20_000 }).toBeGreaterThan(start.x + 500);
    const riding = await state(page);
    expect(riding.air).toMatchObject({ s: 3, z: LANE.z });
    // Still the one walk, and the camera's follow given the share of the way a frame that keeps this pace in view.
    expect(riding.movers).toMatchObject({ pace: LANE_PACE, carries: 1 });
    expect(riding.movers?.ease).toBeCloseTo(EASE.lane, 6);
    await page.screenshot({ path: 'e2e-screenshots/movers-lane-ride.png' });
    // All the way: at the far end the lane lets go by itself, Jump still held, and the owl glides down onto the floor there.
    await expect.poll(async () => (await state(page)).movers?.laneTo ?? 'set down', { timeout: 30_000 }).toBe('set down');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 15_000 }).toBe(0);
    await page.keyboard.up('Space');
    const far = await state(page);
    expect(dist(far.pos, LANE.b)).toBeLessThan(10);
    expect(far.movers).toMatchObject({ laneRides: 1, carries: 1, pace: 0 });
    expect(far.movers?.ease).toBeCloseTo(EASE.walk, 6);
    // The ride by the flight's own record of it: the lane's whole length, at the lane's pace and not a walk's
    // (0.52 room px a millisecond against 0.26), however few frames of it this device drew.
    const rode = far.movers?.rode ?? { id: '', px: 0, ms: 1, fast: false };
    expect(rode).toMatchObject({ id: 'cabinet-row', fast: true });
    expect(rode.px).toBeGreaterThan(3900);
    expect(rode.px / rode.ms).toBeGreaterThan(0.45);
    // One flight from end to end by the flight's own count, lifted by the lane, and at no step of it over the lane's height.
    expect(far.flown).toMatchObject({ n: took + 1, lifted: true });
    expect(far.flown.peak).toBeLessThanOrEqual(LANE.z + 0.5);
    // And back: a held jump at this end is carried for the other, in one walk more.
    await page.keyboard.down('Space');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000, intervals: [50] }).toBe(3);
    await expect.poll(async () => (await state(page)).movers?.carries ?? 0, { timeout: 5_000, intervals: [50] }).toBe(2);
    expect((await state(page)).movers).toMatchObject({ laneRides: 2, laneTo: LANE.a, pace: LANE_PACE });
    await expect.poll(async () => (await state(page)).pos.x, { timeout: 20_000 }).toBeLessThan(LANE.b.x - 300);
    // Let go in the middle of the room: out of the air where it is, and no further.
    await page.keyboard.up('Space');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
    const off = (await state(page)).pos;
    await page.waitForTimeout(600);
    expect(dist((await state(page)).pos, off)).toBeLessThan(4);
  });

  test('a push back along the lane turns a ride round in one walk, a push the way it goes asks nothing more of it, and a push straight across is the owl’s own way out', async ({ page }) => {
    await openPark(page, { room: 'arcade', spawn: 'from-dive', ...MOVERS });
    await page.keyboard.down('Space');
    await expect.poll(async () => (await state(page)).movers?.pace ?? 0, { timeout: 15_000, intervals: [50] }).toBe(LANE_PACE);
    await expect.poll(async () => (await state(page)).pos.x, { timeout: 20_000, intervals: [50] }).toBeGreaterThan(1500);
    // Back along the lane: the same ride, turned for the other end in one walk more, still at the lane's pace.
    await page.keyboard.down('ArrowLeft');
    await expect.poll(async () => (await state(page)).movers?.laneTo ?? null, { timeout: 5_000, intervals: [50] }).toEqual(LANE.a);
    // Held on, the way the lane now goes: no walk more.
    await expect.poll(async () => (await state(page)).pos.x, { timeout: 10_000, intervals: [50] }).toBeLessThan(1200);
    expect((await state(page)).movers).toMatchObject({ laneRides: 1, carries: 2, pace: LANE_PACE, laneTo: LANE.a });
    await page.keyboard.up('ArrowLeft');
    // And round again.
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await state(page)).movers?.laneTo ?? null, { timeout: 5_000, intervals: [50] }).toEqual(LANE.b);
    expect((await state(page)).movers).toMatchObject({ laneRides: 1, carries: 3, pace: LANE_PACE });
    await page.keyboard.up('ArrowRight');
    // Straight across: the keys have the owl. It walks out from under the lane at a walk's pace, straight
    // south, and the lane does not take it back on the way.
    await page.keyboard.down('ArrowDown');
    await expect.poll(async () => (await state(page)).movers?.pace ?? 0, { timeout: 5_000, intervals: [50] }).toBe(WALK_PACE);
    const out = (await state(page)).pos;
    await expect.poll(async () => (await state(page)).pos.y, { timeout: 15_000 }).toBeGreaterThan(LANE.a.y + LANE_REACH + 40);
    const clear = await state(page);
    expect(Math.abs(clear.pos.x - out.x)).toBeLessThan(40);
    expect(clear.movers).toMatchObject({ laneRides: 1, carries: 3, laneTo: null });
    expect(clear.air.s).not.toBe(3);
    await page.keyboard.up('ArrowDown');
    await page.keyboard.up('Space');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
  });

  test('a tap on the floor during a ride starts no walk for the lane to take back, and a tap walks the owl again once Jump is let go', async ({ page }) => {
    await openPark(page, { room: 'arcade', spawn: 'from-dive', ...MOVERS });
    await page.keyboard.down('Space');
    await expect.poll(async () => (await state(page)).movers?.pace ?? 0, { timeout: 15_000, intervals: [50] }).toBe(LANE_PACE);
    await expect.poll(async () => (await state(page)).pos.x, { timeout: 20_000, intervals: [50] }).toBeGreaterThan(600);
    // Open floor south of the lane, ahead of the owl: a tap there is a walk at any other time.
    const at = (await state(page)).pos;
    const ahead = await openGround(page, [{ x: at.x + 200, y: at.y + 150 }, { x: at.x + 100, y: at.y + 150 }, { x: at.x + 200, y: at.y + 90 }]);
    await tapRoomPoint(page, ahead.x, ahead.y);
    await page.waitForTimeout(400);
    const riding = await state(page);
    expect(riding.air.s).toBe(3);
    expect(riding.movers).toMatchObject({ laneRides: 1, carries: 1, pace: LANE_PACE, laneTo: LANE.b });
    // Jump let go: down where it is, standing. Now the same tap walks it, at a walk's pace.
    await page.keyboard.up('Space');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
    await expect.poll(async () => (await state(page)).walking, { timeout: 5_000 }).toBe(false);
    await settleCamera(page);
    const down = (await state(page)).pos;
    const back = await openGround(page, [{ x: down.x - 200, y: down.y + 150 }, { x: down.x - 120, y: down.y + 150 }, { x: down.x - 200, y: down.y + 90 }]);
    await tapRoomPoint(page, back.x, back.y);
    await expect.poll(async () => (await state(page)).movers?.pace ?? 0, { timeout: 5_000, intervals: [50] }).toBe(WALK_PACE);
    await expect.poll(async () => (await state(page)).walking, { timeout: 15_000 }).toBe(false);
    const stood = await state(page);
    expect(dist(stood.pos, back)).toBeLessThan(12);
    expect(stood.movers).toMatchObject({ laneRides: 1, carries: 1 });
  });

  test('an owl come in by the arcade’s own way stands on the very rim of the lane’s catch: Jump held there is caught too, and the one walk for the far end goes clear of the first cabinet’s corner', async ({ page }) => {
    await openPark(page, { room: 'arcade', ...MOVERS });
    // The room's default spawn: as far north of the lane's line as its catch reaches, to the pixel.
    const start = (await state(page)).pos;
    expect(start.x).toBeGreaterThanOrEqual(LANE.a.x);
    expect(start.y).toBe(LANE.a.y - LANE_REACH);
    await page.keyboard.down('Space');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000, intervals: [50] }).toBe(3);
    await expect.poll(async () => (await state(page)).movers?.pace ?? 0, { timeout: 5_000, intervals: [50] }).toBe(LANE_PACE);
    // Aimed all the way to the far end: the floor's corner by the first cabinet, 72 px north of the lane's line, is no stop on the way.
    expect((await state(page)).movers).toMatchObject({ laneRides: 1, carries: 1, laneTo: LANE.b });
    await expect.poll(async () => (await state(page)).pos.x, { timeout: 20_000, intervals: [50] }).toBeGreaterThan(1000);
    const past = await state(page);
    expect(past.air).toMatchObject({ s: 3, z: LANE.z });
    expect(past.movers).toMatchObject({ laneRides: 1, carries: 1, pace: LANE_PACE, laneTo: LANE.b });
    await page.keyboard.up('Space');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
  });

  test('the arcade’s way up is a tunnel: in at the mouth, and up out of the Great Hollow’s floor with a hop', async ({ page }) => {
    await openPark(page, { room: 'arcade', spawn: 'from-cavern', ...MOVERS });
    const took = (await state(page)).flown.n;
    await walkToDoor(page, 'to-market');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('m3-hall');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
    const hall = await state(page);
    expect(hall.movers?.cameBy).toBe('tunnel');
    expect(dist(hall.pos, FROM_UNDER)).toBeLessThan(80);
    // Out of the mouth with a hop: one flight by the flight's own count, off the floor a third of a jump at most.
    expect(hall.flown).toMatchObject({ n: took + 1, glided: false });
    expect(hall.flown.peak).toBeGreaterThan(15);
    expect(hall.flown.peak).toBeLessThan(60);
    // It stands clear of the knot hole it came up by: no dive back down until it steps in.
    await page.waitForTimeout(800);
    expect((await state(page)).room).toBe('m3-hall');
  });

  test('a glide from the heart’s thermal that comes over the knot hole is taken down by the air sinking there, and the owl dives through to the arcade', async ({ page }) => {
    test.slow(); // a rise of three seconds, a glide of five and two rooms, on a runner a third as fast
    await openPark(page, { room: 'm3-hall', ...MOVERS });
    const hall = await state(page);
    const heart = hall.thermals.find((t) => t.id === 'heart')!;
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
    // Taken down in the air by the knot hole's downdraft, from well over a jump's height, at a dive's pace:
    // the flight's own record of it. Gliding on, the owl would sink 87 px a second; Jump held all the way,
    // the dive is many times that.
    const dove = (await state(page)).movers?.dove;
    expect(dove?.id).toBe('knot-hole');
    expect(dove!.z).toBeGreaterThan(250);
    expect(dove!.z / (dove!.ms / 1000)).toBeGreaterThan(600);
    // Wings folded all the way down: no frame drawn of the dive shows a glide, or the owl sinking slower than a dive.
    const dived = (await flightSeen(page)).filter((f) => f.room === 'm3-hall' && f.diving === 'knot-hole');
    expect(dived.every((f) => f.s === 0 || (f.s === 1 && f.vz <= -800))).toBe(true);
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
    const first = await state(page);
    expect(first.movers).toBeNull();
    await watchFlight(page);
    await walkToDoor(page, 'down');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('canopy-2a');
    await page.waitForFunction(() => window.owlPark.state()?.connected === true);
    const below = await state(page);
    expect(below.movers).toBeNull();
    // By its spawn, as far to a side of it as it stood in the doorway it took (an arrival's lane).
    expect(dist(below.pos, UNDER_HATCH)).toBeLessThan(40);
    // No flight by the flight's own count, and none in any frame drawn of the storey below.
    expect(below.flown.n).toBe(first.flown.n);
    expect((await flightSeen(page)).filter((f) => f.room === 'canopy-2a').every((f) => f.z === 0 && f.s === 0)).toBe(true);
  });

  test('a storey’s way down is dived into: the owl comes into the storey below falling, lands on its floor, and nothing new is drawn', async ({ page }) => {
    await openPark(page, { room: 'canopy-2b', spawn: 'from-below', ...MOVERS });
    // A room seen from the side draws no mover's box: its doorways' own art is the realm's knot-hole slot.
    const above = await state(page);
    expect(above.movers).toMatchObject({ pieces: [], cameBy: null });
    await walkToDoor(page, 'down');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('canopy-2a');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
    const below = await state(page);
    expect(below.movers?.cameBy).toBe('dive');
    expect(below.air.z).toBe(0);
    expect(dist(below.pos, UNDER_HATCH)).toBeLessThan(6);
    // It fell in from high over the floor, wings folded: one flight by the flight's own count, and no glide in it.
    expect(below.flown).toMatchObject({ n: above.flown.n + 1, glided: false, lifted: false });
    expect(below.flown.peak).toBeGreaterThan(200);
    await page.screenshot({ path: 'e2e-screenshots/movers-trunk-dive.png' });
  });

  test('the way into the trunk is a tunnel: in at the mouth, and out of the far mouth with a hop', async ({ page }) => {
    await openPark(page, { room: 'canopy-1', spawn: 'from-trunk', ...MOVERS });
    const took = (await state(page)).flown.n;
    await walkToDoor(page, 'to-trunk');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('canopy-2a');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
    const trunk = await state(page);
    expect(trunk.movers?.cameBy).toBe('tunnel');
    expect(dist(trunk.pos, TRUNK_FOOT)).toBeLessThan(40);
    // One flight by the flight's own count, off the floor a third of a jump at most.
    expect(trunk.flown).toMatchObject({ n: took + 1, glided: false });
    expect(trunk.flown.peak).toBeGreaterThan(15);
    expect(trunk.flown.peak).toBeLessThan(60);
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
    // The hop's top by the flight's own record: off the ledge, and under the water 60 px over it. And no
    // frame drawn of it shows the owl under the ledge.
    expect(river.flown.peak).toBeGreaterThan(FALLS_LEDGE.top);
    expect(river.flown.peak).toBeLessThan(FALLS_LEDGE.top + 60);
    expect((await flightSeen(page)).filter((f) => f.room === 'brush-2').every((f) => f.z >= FALLS_LEDGE.top)).toBe(true);
    await page.waitForTimeout(600);
    expect((await state(page)).air.z).toBe(FALLS_LEDGE.top);
  });

  test('a course’s way home is dived into: out of the lookout hut and down into the Great Hollow, falling in by the course’s arch', async ({ page }) => {
    await openPark(page, { room: 'canopy-hut', spawn: 'from-deck', ...MOVERS });
    const took = (await state(page)).flown.n;
    await walkToDoor(page, 'out');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('m3-hall');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
    const hall = await state(page);
    expect(hall.movers?.cameBy).toBe('dive');
    // It fell in from high over the floor, wings folded: one flight by the flight's own count, and no glide in it.
    expect(hall.flown).toMatchObject({ n: took + 1, glided: false, lifted: false });
    expect(hall.flown.peak).toBeGreaterThan(200);
    // Down by the Updraft Canopy's gate, and it stays in the Great Hollow.
    const gate = hall.doors.find((d) => d.id === 'course-grove')!;
    expect(dist(hall.pos, gate)).toBeLessThan(400);
    await page.waitForTimeout(800);
    expect((await state(page)).room).toBe('m3-hall');
    await page.screenshot({ path: 'e2e-screenshots/movers-home-dive.png' });
  });
});
