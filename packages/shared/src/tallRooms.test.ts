import { describe, expect, it } from 'vitest';
import { groundOf, TREE_GROUND } from '../rooms/index';
import { MAX_AIR_Z, MAX_RISE, LIFTED, checkAir } from './flight';
import { kitPerches, kitProblems, kitRoom, kitTiles } from './kit';
import { MAX_PERCH_TOP, TALL_PERCH_TOP, groundAt, highestTop, perchTopLimit, profileProblems, type Perch } from './perches';
import { ROOM_H, ROOM_MAX_H, ROOM_W, spawnTop, tilePlacement, type RoomDef, type RoomKit } from './room';
import { perchTiers } from './routes';
import { UPDRAFT_RISE } from './updraft';
import { isVec2 } from './validate';

/** A hall five screens high, seen from the side: its ground near its own foot, as a screen's is near its foot. */
const H = 5 * ROOM_H;
const GROUND = H - (ROOM_H - TREE_GROUND);

/** A tall kit room: a floor, a shelf just over a jump up, a column of air up the middle and a landing at its top. */
function hall(): RoomDef {
  const kit: RoomKit = {
    ground: GROUND,
    paths: [{ id: 'floor', x0: 100, x1: 1500, top: 0, cap: 'kit-plank-mid' }],
    ledges: [
      { id: 'shelf', x0: 200, x1: 520, top: 120, cap: 'kit-plank-mid' },
      { id: 'landing', x0: 900, x1: 1400, top: 3200, cap: 'kit-plank-mid' },
    ],
    backdrops: [{ key: 'kit-under-sky-a', rate: 1, screens: [0, 0], rows: [0, 4] }],
  };
  return kitRoom({
    id: 'tall-case',
    size: { w: ROOM_W, h: H },
    mood: 'hub',
    walkable: [
      [
        { x: 100, y: GROUND - 4 },
        { x: 1500, y: GROUND - 4 },
        { x: 1500, y: GROUND + 4 },
        { x: 100, y: GROUND + 4 },
      ],
    ],
    perches: kitPerches(kit),
    updrafts: [{ id: 'up', x: 700, w: 140, top: 3260 }],
    spawns: { default: { x: 800, y: GROUND }, landing: { x: 1200, y: GROUND } },
    spawnTops: { landing: 3200 },
    doors: [],
    kit,
  });
}

describe('tall rooms seen from the side (the hollow hall)', () => {
  it('may be five screens high, and a place in one is inside the room', () => {
    expect(ROOM_MAX_H).toBe(5 * ROOM_H);
    expect(isVec2({ x: 800, y: GROUND })).toBe(true);
    expect(isVec2({ x: 800, y: ROOM_MAX_H + 1 })).toBe(false);
  });

  it('let a perch stand as much higher as the room is taller, and no higher than in the tallest room', () => {
    expect(perchTopLimit(ROOM_H)).toBe(MAX_PERCH_TOP);
    expect(perchTopLimit(600)).toBe(MAX_PERCH_TOP);
    expect(perchTopLimit(2 * ROOM_H)).toBe(MAX_PERCH_TOP + ROOM_H);
    expect(perchTopLimit(H)).toBe(MAX_PERCH_TOP + 4 * ROOM_H);
    expect(perchTopLimit(H + 900)).toBe(TALL_PERCH_TOP);
    expect(TALL_PERCH_TOP).toBe(perchTopLimit(ROOM_MAX_H));
    // The headroom over the highest ledge is a screen's, whatever the room's height.
    expect(GROUND - perchTopLimit(H)).toBe(TREE_GROUND - MAX_PERCH_TOP);
  });

  it("hold an owl to the tallest room's air on the wire, and each room to its own highest top", () => {
    expect(MAX_AIR_Z).toBe(TALL_PERCH_TOP + MAX_RISE);
    const r = hall();
    const airTop = highestTop(r) + MAX_RISE;
    expect(highestTop(r)).toBe(3200);
    expect(checkAir({ z: 3400, vz: 0, s: 1, f: 0 }, MAX_AIR_Z, null)).not.toBeNull();
    expect(checkAir({ z: 3400, vz: UPDRAFT_RISE, s: LIFTED, f: 0, h: 3260 }, airTop, null)).toBeNull();
    expect(checkAir({ z: 3000, vz: UPDRAFT_RISE, s: LIFTED, f: 0, h: 3260 }, airTop, null)).not.toBeNull();
    expect(checkAir({ z: airTop + 1, vz: 0, s: 1, f: 0 }, airTop, null)).toBeNull();
  });

  it('measure a sloped perch against the limit it is given', () => {
    const hill: Perch = { id: 'rise', top: 1200, area: [], profile: [{ x: 0, top: 1200 }, { x: 100, top: 1200 }] };
    expect(profileProblems(hill).join()).toMatch(/outside 0 to 540/);
    expect(profileProblems(hill, perchTopLimit(H))).toEqual([]);
  });

  it('draw a backdrop on each row of screens it is given, a row a screen high', () => {
    const tiles = kitTiles(hall().kit!).backgrounds;
    expect(tiles.map((t) => t.y)).toEqual([0, 1, 2, 3, 4].map((r) => r * ROOM_H));
    expect(new Set(tiles.map((t) => t.x))).toEqual(new Set([0]));
    // Without rows, the top row only, as before.
    expect(kitTiles({ ground: TREE_GROUND, backdrops: [{ key: 'kit-under-sky-a', rate: 1, screens: [0, 1] }] }).backgrounds.map((t) => [t.x, t.y])).toEqual([
      [0, 0],
      [ROOM_W, 0],
    ]);
    // A row lower down lines up with the room where it is drawn, and a slower one drifts up and down as it does across.
    const low = tiles[4]!;
    expect(tilePlacement(low, { w: ROOM_W, h: ROOM_H })).toMatchObject({ x: 0, y: 4 * ROOM_H, w: ROOM_W, h: ROOM_H });
    const far = tilePlacement({ ...low, rate: 0.5 }, { w: ROOM_W, h: ROOM_H });
    expect(far.y).toBeLessThan(4 * ROOM_H);
  });

  it('bring an owl in standing on a landing where its spawn is up there, else on the floor', () => {
    const r = hall();
    expect(spawnTop(r, 'landing')).toBe(3200);
    expect(groundAt(r.perches, r.spawns['landing']!, spawnTop(r, 'landing'))).toBe(3200);
    expect(spawnTop(r, undefined)).toBe(0);
    expect(spawnTop(r, 'default')).toBe(0);
    expect(spawnTop(r, 'toString')).toBe(0);
    expect(spawnTop({}, 'landing')).toBe(0);
  });

  it('stand on their own ground line, the tree ground in a room without a kit', () => {
    expect(groundOf(hall())).toBe(GROUND);
    expect(groundOf({})).toBe(TREE_GROUND);
  });

  it('reach a landing three screens up only through the column of air, and draw nothing wrong', () => {
    const r = hall();
    const tiers = perchTiers(r);
    expect(tiers['shelf']).not.toBeNull();
    expect(tiers['landing']).not.toBeNull();
    expect(perchTiers({ ...r, updrafts: [] })['landing']).toBeNull();
    for (const p of r.perches ?? []) expect(p.top).toBeLessThanOrEqual(perchTopLimit(r.size.h));
    expect(kitProblems(r)).toEqual([]);
  });
});
