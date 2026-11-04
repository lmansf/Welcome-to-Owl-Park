import { describe, expect, it } from 'vitest';
import { ROOMS } from '../rooms';
import { AIRBORNE, FLIGHT_STEP_MS, GROUNDED, checkAir, newFlier, stepFlier, type Flier, type FlightInput } from './flight';
import type { Polygon } from './geometry';
import { kitHillProblems, kitHillProfile, kitHillStretch, kitPerches, KIT_HILL_STRETCH } from './kit';
import { SLOPE_GENTLE, SLOPE_STEEP, footing, groundAt, lowTop, profileProblems, slopeDoorProblems, slopeUnder, standingRanges, topAt, type Perch } from './perches';
import type { KitHill, KitHillStep, RoomKit } from './room';
import { WALK_SPEED } from './walk';

const rect = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

/** A hill on the floor from x 1000: up gently 80 over 320, level, then down steeply 80 over 160 (OP-238). */
const HILL: Perch = {
  id: 'hill',
  area: rect(1000, 700, 600, 200),
  top: 80,
  solid: true,
  profile: [
    { x: 1000, top: 0 },
    { x: 1320, top: 80 },
    { x: 1440, top: 80 },
    { x: 1600, top: 0 },
  ],
};
const ROOM = { walkable: [rect(0, 700, 2400, 200)], perches: [HILL] };
const NONE: FlightInput = { pressed: false, held: false };
const PRESS: FlightInput = { pressed: true, held: true };

/** Walks an owl along y 800 from x0 at the walk's pace, stepping its flight on the ground under it; every state on the way, with its x. */
function walk(x0: number, dir: 1 | -1, ms: number, jumpAt?: number): Array<{ x: number; fl: Flier }> {
  const out: Array<{ x: number; fl: Flier }> = [];
  let fl = newFlier();
  let x = x0;
  fl = { ...fl, air: { ...fl.air, z: groundAt(ROOM.perches, { x, y: 800 }, 0) } };
  const n = Math.round(ms / FLIGHT_STEP_MS);
  for (let i = 0; i < n; i++) {
    x += (dir * WALK_SPEED * FLIGHT_STEP_MS) / 1000;
    const input = i === jumpAt ? PRESS : NONE;
    fl = stepFlier(fl, input, groundAt(ROOM.perches, { x, y: 800 }, fl.air.z));
    out.push({ x, fl });
  }
  return out;
}

describe('rolling ground (OP-238)', () => {
  it("reads a slope's height along its profile, and its lowest and highest", () => {
    expect(topAt(HILL, 900)).toBe(0);
    expect(topAt(HILL, 1160)).toBe(40);
    expect(topAt(HILL, 1400)).toBe(80);
    expect(topAt(HILL, 1520)).toBe(40);
    expect(topAt(HILL, 1700)).toBe(0);
    expect(lowTop(HILL)).toBe(0);
    expect(topAt({ top: 120 }, 5)).toBe(120);
    expect(profileProblems(HILL)).toEqual([]);
  });

  it('allows only flat, gentle (1 in 4) and steep (1 in 2) stretches, in order, with its top the highest', () => {
    expect(SLOPE_GENTLE).toBe(4);
    expect(SLOPE_STEEP).toBe(2);
    const cliff = { ...HILL, profile: [{ x: 0, top: 0 }, { x: 100, top: 80 }] };
    expect(profileProblems(cliff).join()).toMatch(/not flat, gentle/);
    expect(profileProblems({ ...HILL, profile: [{ x: 100, top: 0 }, { x: 50, top: 0 }] }).join()).toMatch(/goes back/);
    expect(profileProblems({ ...HILL, top: 90 }).join()).toMatch(/not its profile's highest/);
  });

  it('comes down on a slope where it is, and only from just above it or a step below while walking', () => {
    expect(groundAt(ROOM.perches, { x: 1160, y: 800 }, 40)).toBe(40);
    expect(groundAt(ROOM.perches, { x: 1160, y: 800 }, 32)).toBe(40); // a step up the slope
    expect(groundAt(ROOM.perches, { x: 1160, y: 800 }, 10)).toBe(0); // well under it: the floor
    expect(slopeUnder(ROOM.perches, { x: 1160, y: 800 }, 40)).toEqual({ top: 40, grade: 0.25 });
    expect(slopeUnder(ROOM.perches, { x: 1400, y: 800 }, 80)).toEqual({ top: 80, grade: 0 });
    expect(slopeUnder(ROOM.perches, { x: 800, y: 800 }, 0)).toBeNull();
    // Its footing is walked onto from its foot.
    expect(footing(ROOM, 0).walkable).toContain(HILL.area);
  });

  it('walks up and over the hill and down again at the walk’s pace, standing all the way and never sliding', () => {
    const path = walk(900, 1, 3000);
    // The whole way on its feet, at the slope's height where it is.
    for (const { x, fl } of path) {
      expect(fl.air.s, `at x ${x.toFixed(1)}`).toBe(GROUNDED);
      expect(fl.air.z).toBeCloseTo(topAt(HILL, x), 0);
    }
    // At the walk's pace: 3 s carries it 780 px, over the whole hill and off the far side.
    expect(path.at(-1)!.x).toBeCloseTo(900 + WALK_SPEED * 3, 0);
    expect(path.at(-1)!.fl.air.z).toBe(0);
    // And back the other way, down the gentle side.
    for (const { x, fl } of walk(1700, -1, 3000)) expect(fl.air.z, `at x ${x.toFixed(1)}`).toBeCloseTo(topAt(HILL, x), 0);
  });

  it('jumps from a slope and lands back on it', () => {
    // Up the gentle side, a jump half way up: it leaves the slope, rises, and comes down on the level top.
    const path = walk(1000, 1, 1600, Math.round(400 / FLIGHT_STEP_MS));
    const off = path.findIndex((p) => p.fl.air.s === AIRBORNE);
    expect(off).toBeGreaterThan(0);
    expect(path[off]!.fl.air.z).toBeGreaterThan(topAt(HILL, path[off]!.x));
    const landed = path.findIndex((p, i) => i > off && p.fl.air.s === GROUNDED);
    expect(landed).toBeGreaterThan(off);
    const at = path[landed]!;
    expect(at.fl.air.z).toBeCloseTo(topAt(HILL, at.x), 0);
    expect(at.fl.air.z).toBeGreaterThan(0);
  });

  it('lets the room believe an owl standing anywhere along a slope, and nowhere off it', () => {
    const standing = standingRanges(ROOM);
    expect(standing).toEqual([0, [0, 80]]);
    expect(checkAir({ z: 37.3, vz: 0, s: GROUNDED, f: 0 }, 400, standing)).toEqual({ z: 37.3, vz: 0, s: GROUNDED, f: 0 });
    expect(checkAir({ z: 80, vz: 0, s: GROUNDED, f: 0 }, 400, standing)).toEqual({ z: 80, vz: 0, s: GROUNDED, f: 0 });
    expect(checkAir({ z: 95, vz: 0, s: GROUNDED, f: 0 }, 400, standing)).toBeNull();
    // A flat perch's height is still exact.
    expect(checkAir({ z: 37.3, vz: 0, s: GROUNDED, f: 0 }, 400, [0, 80])).toBeNull();
  });

  it('has a doorway on a slope stand at the slope’s height there', () => {
    const door = { id: 'up', rect: { x: 1140, y: 760, w: 40, h: 40 }, to: { room: 'hub', spawn: 'default' } };
    expect(slopeDoorProblems({ doors: [{ ...door, top: 40 }], perches: [HILL] })).toEqual([]);
    expect(slopeDoorProblems({ doors: [{ ...door, top: 0 }], perches: [HILL] }).join()).toMatch(/40 high there/);
  });

  it('keeps every room’s slopes to the two angles and its doorways on them at their height', () => {
    for (const room of Object.values(ROOMS)) {
      for (const p of room.perches ?? []) expect(profileProblems(p), `${room.id} ${p.id}`).toEqual([]);
      expect(slopeDoorProblems(room), room.id).toEqual([]);
    }
  });
});

describe("the assembler's hills (OP-238)", () => {
  const G = 770;
  const hill = (material: string, steps: KitHillStep[], extra: Partial<KitHill> = {}): KitHill => ({ id: 'rise', material, x0: 400, top0: 0, steps, solid: true, ...extra });
  const kitWith = (h: KitHill, more: Partial<RoomKit> = {}): RoomKit => ({ ground: G, paths: [{ id: 'floor', x0: 0, x1: 3200, top: 0, cap: 'kit-plank-mid' }], hills: [h], ...more });

  it("lays a hill's profile from its pieces' widths at the two angles, a crest and a dip a gentle rise and fall", () => {
    const h = hill('earth', ['slope-steep-up', 'crest', 'slope-gentle-down', 'dip', 'slope-gentle-down']);
    const p = kitHillProfile(h);
    expect(p[0]).toEqual({ x: 400, top: 0 });
    expect(p.map((q) => [q.x, q.top])).toEqual([[400, 0], [720, 160], [880, 200], [1040, 160], [1360, 80], [1520, 40], [1680, 80], [2000, 0]]);
    const perch = kitPerches(kitWith(h)).find((q) => q.id === 'rise')!;
    expect(perch.profile).toEqual(p);
    expect(perch.solid).toBe(true);
    expect(profileProblems(perch)).toEqual([]);
    // Up steeply, over the crest, gently down, through a dip and down to the floor.
    expect((p[1]!.x - p[0]!.x) / (p[1]!.top - p[0]!.top)).toBe(SLOPE_STEEP);
    expect((p[4]!.x - p[3]!.x) / (p[3]!.top - p[4]!.top)).toBe(SLOPE_GENTLE);
  });

  it('fits every published slope, crest and dip piece to its angle within the stretch it allows', () => {
    const steps: KitHillStep[] = ['slope-gentle-up', 'slope-gentle-down', 'slope-steep-up', 'slope-steep-down', 'crest', 'dip'];
    for (const m of ['branch', 'earth', 'stone', 'roots']) {
      for (const step of steps) {
        const k = kitHillStretch(`kit-${m}-${step}`, step);
        expect(k, `kit-${m}-${step}`).not.toBeNull();
        expect(k!, `kit-${m}-${step}`).toBeGreaterThanOrEqual(KIT_HILL_STRETCH[0]);
        expect(k!, `kit-${m}-${step}`).toBeLessThanOrEqual(KIT_HILL_STRETCH[1]);
      }
      // A gentle piece laid as a steep one would be stretched too far: the wrong piece for the angle.
      const wrong = kitHillStretch(`kit-${m}-slope-gentle-up`, 'slope-steep-up')!;
      const right = kitHillStretch(`kit-${m}-slope-gentle-up`, 'slope-gentle-up')!;
      expect(wrong / right).toBeCloseTo(2, 5);
    }
  });

  it('holds a hill to its rules: stood on as its profile, its ends met, every piece fit', () => {
    const up = hill('stone', ['slope-gentle-up', 'slope-gentle-down']);
    const ok = kitWith(up);
    expect(kitHillProblems({ kit: ok, perches: kitPerches(ok) }, up)).toEqual([]);
    // No perch stands on it.
    expect(kitHillProblems({ kit: ok, perches: [] }, up).join()).toMatch(/no sloped perch/);
    // A hill that ends raised, with nothing there, ends in mid-air; a ledge at that height meets it.
    const raised = hill('stone', ['slope-gentle-up']);
    const bare = kitWith(raised);
    expect(kitHillProblems({ kit: bare, perches: kitPerches(bare) }, raised).join()).toMatch(/ends in mid-air/);
    const end = kitHillProfile(raised).at(-1)!;
    const met = kitWith(raised, { ledges: [{ id: 'shelf', x0: end.x, x1: end.x + 300, top: end.top, cap: 'kit-plank-mid' }] });
    expect(kitHillProblems({ kit: met, perches: kitPerches(met) }, raised)).toEqual([]);
  });
});
