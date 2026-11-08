import { describe, expect, it } from 'vitest';
import { AIRBORNE, FLIGHT_STEP_MS, GROUNDED, MAX_AIR_Z, MAX_RISE, checkAir, newFlier, stepFlier, type Flier, type FlightInput } from './flight';
import { isWalkable, type Polygon } from './geometry';
import { PERCH_SLACK, footing, footingLevel, groundAt, highestTop, onSomeFooting, standingHeights, tapGoal, type Perch } from './perches';
import type { Vec2 } from './protocol';
import { resolveTarget, steerTarget } from './resolveTarget';
import { WALK_SPEED } from './walk';

const rect = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

/**
 * A room in miniature: a floor 600..1400 by 700..900, a solid bench along its back (its top 80 up,
 * its front face at y 730, so the floor's back strip is under it), a beam high above the bench (not
 * solid, 230 up), and a branch over the middle of the floor (not solid, 120 up).
 */
const BENCH: Perch = { id: 'bench', area: rect(700, 660, 300, 70), top: 80, solid: true };
const BEAM: Perch = { id: 'beam', area: rect(720, 670, 200, 40), top: 230 };
const BRANCH: Perch = { id: 'branch', area: rect(1100, 780, 160, 40), top: 120 };
const ROOM = { walkable: [rect(600, 700, 800, 200)], perches: [BENCH, BEAM, BRANCH] };

const NONE: FlightInput = { pressed: false, held: false };
const PRESS: FlightInput = { pressed: true, held: true };
const steps = (ms: number) => Math.round(ms / FLIGHT_STEP_MS);
const expectAt = (pos: Vec2, at: Vec2) => {
  expect(pos.x).toBeCloseTo(at.x, 6);
  expect(pos.y).toBeCloseTo(at.y, 6);
};

/**
 * An owl flown step by step while it walks from `from` towards `to` at the walk's pace on the
 * footing for its height (a walk the footing stops is held where it stops, and goes on when the
 * footing lets it), coming down on the ground under it: as the owl's own page flies it.
 */
function fly(from: Vec2, to: Vec2, plan: Array<[FlightInput, number]>, start: Flier = newFlier()): { fl: Flier; pos: Vec2; path: Array<{ pos: Vec2; z: number; s: number }> } {
  let fl = start;
  let pos = { ...from };
  const path: Array<{ pos: Vec2; z: number; s: number }> = [];
  for (const [input, n] of plan) {
    for (let i = 0; i < n; i++) {
      fl = stepFlier(fl, i === 0 ? input : { ...input, pressed: false }, groundAt(ROOM.perches, pos, fl.air.z));
      const f = footing(ROOM, fl.air.z);
      const goal = resolveTarget(pos, to, f.walkable, f.shut);
      const left = Math.hypot(goal.x - pos.x, goal.y - pos.y);
      const step = (WALK_SPEED * FLIGHT_STEP_MS) / 1000;
      if (left > 0.01) pos = left <= step ? goal : { x: pos.x + ((goal.x - pos.x) / left) * step, y: pos.y + ((goal.y - pos.y) / left) * step };
      path.push({ pos: { ...pos }, z: fl.air.z, s: fl.air.s });
    }
  }
  return { fl, pos, path };
}

describe('perches (OP-084)', () => {
  it('the ground under an owl: the highest top at or a little above its height where it is, else the floor', () => {
    const onBench = { x: 760, y: 690 };
    expect(groundAt(ROOM.perches, { x: 800, y: 850 }, 300)).toBe(0); // over the floor, nothing under it but the floor
    expect(groundAt(ROOM.perches, onBench, 0)).toBe(0); // below the bench's top: not on it
    expect(groundAt(ROOM.perches, onBench, 80 - PERCH_SLACK)).toBe(80); // just under its top still comes down on it
    expect(groundAt(ROOM.perches, onBench, 80 - PERCH_SLACK - 1)).toBe(0);
    expect(groundAt(ROOM.perches, onBench, 200)).toBe(80); // over the bench, under the beam
    expect(groundAt(ROOM.perches, onBench, 230)).toBe(230); // the beam, above the bench
    expect(groundAt(undefined, onBench, 230)).toBe(0); // a room without perches has only its floor
  });

  it('the footing at a height: a solid perch is a wall below its top, a beam or a branch is not, and every top at or below the owl is floor', () => {
    const underBench = { x: 800, y: 715 }; // the floor's back strip, under the bench's front
    const underBranch = { x: 1150, y: 800 };
    const low = footing(ROOM, 0);
    expect(isWalkable(underBench, low.walkable, low.shut)).toBe(false);
    expect(isWalkable(underBranch, low.walkable, low.shut)).toBe(true);
    expect(isWalkable({ x: 800, y: 680 }, low.walkable, low.shut)).toBe(false); // the bench's top, from the floor
    const high = footing(ROOM, 80);
    expect(isWalkable(underBench, high.walkable, high.shut)).toBe(true);
    expect(isWalkable({ x: 800, y: 680 }, high.walkable, high.shut)).toBe(true);
    // The floor's own shut rects stay shut at every height.
    const shut = footing(ROOM, 500, [{ x: 600, y: 850, w: 100, h: 50 }]);
    expect(isWalkable({ x: 650, y: 870 }, shut.walkable, shut.shut)).toBe(false);
    expect([footingLevel(ROOM, 0), footingLevel(ROOM, 79), footingLevel(ROOM, 120), footingLevel(ROOM, 500)]).toEqual([0, 1, 2, 3]);
  });

  it('a walk at the bench stops at its face on the floor, and goes on over its top from a height', () => {
    const from = { x: 800, y: 800 };
    const onTop = { x: 800, y: 690 };
    const low = footing(ROOM, 0);
    const stopped = resolveTarget(from, onTop, low.walkable, low.shut);
    expect(stopped.y).toBeGreaterThanOrEqual(730);
    expect(stopped.y).toBeLessThan(740);
    const high = footing(ROOM, 90);
    expect(resolveTarget(from, onTop, high.walkable, high.shut)).toEqual(onTop);
    // Keyboard walking up into the face slides along it or stops; from a height it goes on.
    const upLow = steerTarget(from, { x: 0, y: -1 }, low.walkable, undefined, low.shut);
    expect(upLow === null || upLow.y >= 730).toBe(true);
    expect(steerTarget(from, { x: 0, y: -1 }, high.walkable, undefined, high.shut)!.y).toBeLessThan(670);
  });

  it('jumped onto from the floor: the owl walks into the face, rises over it, and lands on the bench', () => {
    const { fl, pos, path } = fly({ x: 800, y: 760 }, { x: 800, y: 690 }, [
      [NONE, steps(200)], // at the face, held there
      [PRESS, steps(300)],
      [NONE, steps(900)],
    ]);
    expect(path[steps(150)]!.pos.y).toBeGreaterThanOrEqual(730); // held at the face before the jump
    expectAt(pos, { x: 800, y: 690 });
    expect(fl.air).toEqual({ z: 80, vz: 0, s: GROUNDED, f: 0 });
  });

  it('a hop too small for the bench comes back down at its face', () => {
    const { fl, pos } = fly({ x: 800, y: 760 }, { x: 800, y: 690 }, [
      [PRESS, 1], // a tap: the cut jump rises far less than the bench's top
      [NONE, steps(900)],
    ]);
    expect(fl.air.s).toBe(GROUNDED);
    expect(fl.air.z).toBe(0);
    expect(pos.y).toBeGreaterThanOrEqual(730);
  });

  it('walked off its edge: the owl falls with its flap still to come, and lands on the floor', () => {
    const standing: Flier = { ...newFlier(), air: { z: 80, vz: 0, s: GROUNDED, f: 0 } };
    const { fl, pos, path } = fly({ x: 800, y: 690 }, { x: 800, y: 820 }, [[NONE, steps(1200)]], standing);
    const off = path.findIndex((p) => p.s === AIRBORNE);
    expect(off).toBeGreaterThan(0);
    expect(path[off]!.pos.y).toBeGreaterThan(730); // off the front of its top
    expectAt(pos, { x: 800, y: 820 });
    expect(fl.air.s).toBe(GROUNDED);
    expect(fl.air.z).toBe(0);
  });

  it('a branch is jumped up through from below, and stood on from above', () => {
    const under = { x: 1150, y: 800 };
    const { fl } = fly(under, under, [
      [PRESS, steps(300)],
      [NONE, steps(900)],
    ]);
    expect(fl.air).toEqual({ z: 120, vz: 0, s: GROUNDED, f: 0 });
  });

  it('a tap where a perch is drawn asks for its top; a tap anywhere else is the tap', () => {
    // The bench's top is drawn 80 up from its place on the plan.
    expect(tapGoal(ROOM, { x: 800, y: 690 - 80 })).toEqual({ x: 800, y: 690 });
    // The beam is drawn high above the bench: a tap on it is the beam.
    expect(tapGoal(ROOM, { x: 800, y: 690 - 230 })).toEqual({ x: 800, y: 690 });
    expect(tapGoal(ROOM, { x: 800, y: 850 })).toEqual({ x: 800, y: 850 });
    // Where two tops are drawn over each other, the one nearer the front.
    const stacked = { perches: [{ id: 'back', area: rect(0, 100, 100, 50), top: 100 }, { id: 'front', area: rect(0, 160, 100, 50), top: 150 }] };
    expect(tapGoal(stacked, { x: 50, y: 30 })).toEqual({ x: 50, y: 180 });
    expect(tapGoal({}, { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
  });

  it('what the room server believes of an owl on a perch', () => {
    expect(standingHeights(ROOM)).toEqual([0, 80, 230, 120]);
    expect(highestTop(ROOM)).toBe(230);
    expect(highestTop({})).toBe(0);
    expect(onSomeFooting(ROOM, { x: 800, y: 680 })).toBe(true); // the bench's top, outside the floor
    expect(onSomeFooting(ROOM, { x: 650, y: 650 })).toBe(false); // behind the wall
    const standing = standingHeights(ROOM);
    const maxZ = highestTop(ROOM) + MAX_RISE;
    expect(checkAir({ z: 80, vz: 0, s: GROUNDED, f: 0 }, maxZ, standing)).toEqual({ z: 80, vz: 0, s: GROUNDED, f: 0 });
    expect(checkAir({ z: 80.3, vz: 0, s: GROUNDED, f: 0 }, maxZ, standing)).toEqual({ z: 80, vz: 0, s: GROUNDED, f: 0 }); // put on the top exactly
    expect(checkAir({ z: 50, vz: 0, s: GROUNDED, f: 0 }, maxZ, standing)).toBeNull(); // standing on nothing
    expect(checkAir({ z: 230 + MAX_RISE, vz: -10, s: AIRBORNE, f: 0 }, maxZ, standing)).not.toBeNull(); // a jump and a flap from the beam
    expect(checkAir({ z: 230 + MAX_RISE + 1, vz: -10, s: AIRBORNE, f: 0 }, maxZ, standing)).toBeNull();
    // Between pages, with no room to know: any height an owl could stand at.
    expect(checkAir({ z: 333, vz: 0, s: GROUNDED, f: 0 }, MAX_AIR_Z, null)).not.toBeNull();
    expect(checkAir({ z: MAX_AIR_Z + 1, vz: 0, s: AIRBORNE, f: 0 }, MAX_AIR_Z, null)).toBeNull();
  });
});
