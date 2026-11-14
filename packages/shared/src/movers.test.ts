import { describe, expect, it } from 'vitest';
import { AIRBORNE, GLIDING, JUMP_RISE, MAX_RISE, carryOn, checkAir, fall } from './flight';
import { MAX_FALL } from './jump';
import {
  DIVE_ARRIVAL,
  DIVE_SPEED,
  LANE_CATCH_ABOVE,
  LANE_CATCH_BELOW,
  dive,
  downdraftAt,
  downdraftFor,
  hiddenPieces,
  inDowndraft,
  laneAt,
  laneEnd,
  laneHolds,
  laneOff,
  laneTop,
  moverProblems,
  tunnelFor,
  type Downdraft,
  type GlideLane,
  type MoverRoom,
} from './movers';
import { HEART_THERMAL } from '../rooms/hollowHall';
import { ARCADE_LANE, ARCADE_TUNNEL, HALL_KNOT_HOLE, ROOMS } from '../rooms/index';
import { distance, distanceToRect, isWalkable, pointInRect } from './geometry';
import { highestTop } from './perches';
import { GLIDE_SLOPE } from './flight';
import { findSpawn } from './room';
import { INTERACTABLES } from './interactables';
import { WALK_SPEED } from './walk';

const hole: Downdraft = { id: 'hole', door: 'down', pos: { x: 500, y: 500 }, r: 120, top: 600 };
const lane: GlideLane = { id: 'row', a: { x: 100, y: 300 }, b: { x: 1100, y: 300 }, z: 150, r: 80 };

describe('a downdraft (OP-287)', () => {
  it('pulls down an owl in the air inside its column, and leaves one on the floor, over its top or outside it', () => {
    expect(downdraftAt([hole], { x: 560, y: 540 }, 200)?.id).toBe('hole');
    expect(downdraftAt([hole], { x: 560, y: 540 }, 600)?.id).toBe('hole');
    expect(downdraftAt([hole], { x: 560, y: 540 }, 0)).toBeUndefined();
    expect(downdraftAt([hole], { x: 560, y: 540 }, 601)).toBeUndefined();
    expect(downdraftAt([hole], { x: 630, y: 500 }, 200)).toBeUndefined();
    expect(downdraftAt(undefined, { x: 500, y: 500 }, 200)).toBeUndefined();
    expect(inDowndraft(hole, { x: 630, y: 500 })).toBe(false);
    expect(inDowndraft(hole, { x: 630, y: 500 }, 40)).toBe(true);
  });

  it('takes it down as a dive: falling at the dive’s pace, no glide, its flap as it was', () => {
    expect(dive({ z: 420, vz: -80, s: GLIDING, f: 1 })).toEqual({ z: 420, vz: -DIVE_SPEED, s: AIRBORNE, f: 1 });
  });

  it('is a fall the room server takes as any fall, and every other page carries on to the floor', () => {
    expect(DIVE_SPEED).toBeLessThan(MAX_FALL);
    const told = dive({ z: 420, vz: -80, s: GLIDING, f: 0 });
    // The room's own check of an air state (flight.ts): taken as it is.
    expect(checkAir(told, 1200)).toEqual(told);
    // Carried on by a page that was only told the dive began: down on the floor well inside a second.
    const later = fall(told, 600);
    expect(later.z).toBe(0);
    expect(later.s).toBe(0);
  });

  it('an owl that dived into a room comes in under any room’s ceiling for an owl in the air', () => {
    expect(DIVE_ARRIVAL.z).toBeLessThan(MAX_RISE);
    expect(DIVE_ARRIVAL.vz).toBeLessThanOrEqual(0);
    expect(-DIVE_ARRIVAL.vz).toBeLessThan(MAX_FALL);
    // Seen, and no wait: from rest it is down in about half a second.
    const arriving = { z: DIVE_ARRIVAL.z, vz: DIVE_ARRIVAL.vz, s: AIRBORNE, f: 0 as const };
    expect(carryOn(arriving, 600).s).toBe(0);
    expect(carryOn(arriving, 400).z).toBeGreaterThan(100);
  });
});

describe('a glide lane (OP-287)', () => {
  it('catches a glide beside its line within its catch of its height, as a wind current does', () => {
    expect(laneAt([lane], { x: 400, y: 340 }, 150)?.id).toBe('row');
    expect(laneAt([lane], { x: 400, y: 380 }, 150)?.id).toBe('row');
    expect(laneAt([lane], { x: 400, y: 381 }, 150)).toBeUndefined();
    expect(laneAt([lane], { x: 400, y: 300 }, 150 - LANE_CATCH_BELOW)?.id).toBe('row');
    expect(laneAt([lane], { x: 400, y: 300 }, 150 - LANE_CATCH_BELOW - 1)).toBeUndefined();
    expect(laneAt([lane], { x: 400, y: 300 }, 150 + LANE_CATCH_ABOVE)?.id).toBe('row');
    expect(laneAt([lane], { x: 400, y: 300 }, 150 + LANE_CATCH_ABOVE + 1)).toBeUndefined();
    // Past an end, it is the end's own round reach.
    expect(laneAt([lane], { x: 60, y: 300 }, 150)?.id).toBe('row');
    expect(laneAt([lane], { x: 10, y: 300 }, 150)).toBeUndefined();
    expect(laneOff(lane, { x: 400, y: 340 })).toBe(40);
  });

  it('a held jump from the floor is caught: its top is inside the catch', () => {
    expect(JUMP_RISE).toBeGreaterThanOrEqual(lane.z - LANE_CATCH_BELOW);
    expect(JUMP_RISE).toBeLessThanOrEqual(lane.z + LANE_CATCH_ABOVE);
  });

  it('carries an owl to the end it is heading for, and one heading nowhere to the farther end', () => {
    const at = { x: 400, y: 320 };
    expect(laneEnd(lane, at, { x: 1, y: 0 })).toEqual(lane.b);
    expect(laneEnd(lane, at, { x: -3, y: 1 })).toEqual(lane.a);
    expect(laneEnd(lane, at, null)).toEqual(lane.b);
    expect(laneEnd(lane, { x: 900, y: 320 }, null)).toEqual(lane.a);
    // Straight across the lane is heading for neither end: the farther one.
    expect(laneEnd(lane, at, { x: 0, y: 1 })).toEqual(lane.b);
  });

  it('holds a lifted owl for the room server only at its own height, beside its line, with the slack it is given', () => {
    expect(laneHolds([lane], { x: 400, y: 340 }, 150)).toBe(true);
    expect(laneHolds([lane], { x: 400, y: 340 }, 151)).toBe(false);
    expect(laneHolds([lane], { x: 400, y: 400 }, 150)).toBe(false);
    expect(laneHolds([lane], { x: 400, y: 400 }, 150, 40)).toBe(true);
    expect(laneHolds(undefined, { x: 400, y: 340 }, 150)).toBe(false);
    expect(laneTop({ movers: { lanes: [lane, { ...lane, id: 'high', z: 180 }] } })).toBe(180);
    expect(laneTop({})).toBe(0);
  });
});

describe('a room’s movers in its data (OP-287)', () => {
  const room: MoverRoom = {
    id: 'r',
    size: { w: 1600, h: 900 },
    walkable: [[{ x: 0, y: 200 }, { x: 1600, y: 200 }, { x: 1600, y: 900 }, { x: 0, y: 900 }]],
    doors: [
      { id: 'down', rect: { x: 440, y: 460, w: 120, h: 80 }, to: { room: 'below', spawn: 'default' } },
      { id: 'out', rect: { x: 0, y: 400, w: 80, h: 100 }, to: { room: 'next', spawn: 'default' } },
      { id: 'spot', rect: { x: 900, y: 400, w: 80, h: 100 } },
    ],
    pieces: [{ id: 'hatch' }],
    movers: { downdrafts: [{ ...hole, hides: ['hatch'] }], lanes: [lane], tunnels: [{ id: 'through', door: 'out', mouth: { x: 40, y: 450 } }] },
  };

  it('finds nothing wrong with a room laid as it should be', () => {
    expect(moverProblems(room)).toEqual([]);
    expect(moverProblems({ ...room, movers: undefined })).toEqual([]);
  });

  it('says what is wrong, in words', () => {
    const bad = (movers: MoverRoom['movers']) => moverProblems({ ...room, movers }).join(' | ');
    expect(bad({ downdrafts: [{ ...hole, door: 'spot' }] })).toContain('needs a doorway that leads somewhere');
    expect(bad({ downdrafts: [{ ...hole, pos: { x: 900, y: 700 } }] })).toContain('not on its doorway');
    expect(bad({ downdrafts: [{ ...hole, r: 30 }] })).toContain('narrower than an owl');
    expect(bad({ downdrafts: [{ ...hole, hides: ['stair'] }] })).toContain('hides a piece the room has not');
    expect(bad({ lanes: [{ ...lane, b: { x: 300, y: 300 } }] })).toContain('shorter than 300');
    expect(bad({ lanes: [{ ...lane, z: 260 }] })).toContain('too high for a held jump');
    expect(bad({ lanes: [{ ...lane, a: { x: 100, y: 100 } }] })).toContain('off the floor');
    expect(bad({ tunnels: [{ id: 'through', door: 'out', mouth: { x: 900, y: 800 } }] })).toContain('far from its doorway');
    expect(bad({ downdrafts: [hole], tunnels: [{ id: 'through', door: 'down', mouth: { x: 500, y: 500 } }] })).toContain('already has a mover');
    expect(bad({ downdrafts: [hole, hole] })).toContain('two movers called hole');
  });

  it('names the doorway each stands for, and the pieces they stand in place of', () => {
    expect(downdraftFor(room.movers, 'down')?.id).toBe('hole');
    expect(downdraftFor(room.movers, 'out')).toBeUndefined();
    expect(tunnelFor(room.movers, 'out')?.id).toBe('through');
    expect(tunnelFor(undefined, 'out')).toBeUndefined();
    expect(hiddenPieces(room.movers)).toEqual(['hatch']);
    expect(hiddenPieces(undefined)).toEqual([]);
  });
});

describe('the park’s movers (OP-287)', () => {
  it('every room’s movers make sense', () => {
    for (const room of Object.values(ROOMS)) expect(moverProblems(room), room.id).toEqual([]);
  });

  it('only rooms seen from above have them, so far: the Great Hollow and the arcade', () => {
    expect(Object.values(ROOMS).filter((r) => r.movers).map((r) => r.id).sort()).toEqual(['arcade', 'm3-hall']);
  });

  it('the Great Hollow’s hatch is a knot hole: on the doorway down to the arcade, in place of the hatch’s art, within a glide of the heart’s thermal', () => {
    const hall = ROOMS['m3-hall']!;
    const down = hall.doors.find((d) => d.id === 'down')!;
    expect(hall.movers?.downdrafts).toEqual([HALL_KNOT_HOLE]);
    expect(HALL_KNOT_HOLE.door).toBe('down');
    expect(pointInRect(HALL_KNOT_HOLE.pos, down.rect)).toBe(true);
    expect(down.to).toEqual({ room: 'arcade', spawn: 'from-cavern' });
    expect(hall.pieces?.find((p) => p.id === 'root-hatch')?.key).toBe('kit-hatch-down');
    expect(hiddenPieces(hall.movers)).toEqual(['root-hatch']);
    // A glide held from the thermal's top comes over the hole still in the air and under the downdraft's top: it is taken down.
    const over = HEART_THERMAL.top - distance(HEART_THERMAL.pos, HALL_KNOT_HOLE.pos) / GLIDE_SLOPE;
    expect(over).toBeGreaterThan(100);
    expect(over).toBeLessThan(HALL_KNOT_HOLE.top);
    // And the hole is clear of the thermal's own column: rising air and sinking air do not share a spot.
    expect(distance(HEART_THERMAL.pos, HALL_KNOT_HOLE.pos)).toBeGreaterThan(HEART_THERMAL.r + HALL_KNOT_HOLE.r);
  });

  it('the arcade’s way up is a tunnel at its west doorway, and a lane runs past its three cabinets from where an owl comes in', () => {
    const arcade = ROOMS['arcade']!;
    expect(arcade.movers).toEqual({ tunnels: [ARCADE_TUNNEL], lanes: [ARCADE_LANE] });
    const up = arcade.doors.find((d) => d.id === ARCADE_TUNNEL.door)!;
    expect(up.toNew).toEqual({ room: 'm3-hall', spawn: 'from-under' });
    // Its mouth is at the doorway, and far enough in from the room's edge for the whole of its piece (240 across) to show.
    expect(distanceToRect(ARCADE_TUNNEL.mouth, up.rect)).toBeLessThanOrEqual(1);
    expect(ARCADE_TUNNEL.mouth.x).toBeGreaterThanOrEqual(120);
    // An owl that dived in comes down at a spot of its own, on the lane's line: the room server sets an
    // arrival down up to 60 px off its spawn, and from here that is still inside the lane's reach, so a
    // dive held on into a glide is carried on.
    expect(HALL_KNOT_HOLE.lands).toBe('from-dive');
    expect(Object.hasOwn(arcade.spawns, 'from-dive')).toBe(true);
    const landing = findSpawn(arcade, HALL_KNOT_HOLE.lands);
    expect(laneOff(ARCADE_LANE, landing) + 60).toBeLessThanOrEqual(ARCADE_LANE.r);
    expect(isWalkable(landing, arcade.walkable)).toBe(true);
    expect(DIVE_ARRIVAL.z).toBeGreaterThan(ARCADE_LANE.z + LANE_CATCH_ABOVE);
    // It passes in front of each cabinet's spot, within its reach of it, and through none of them.
    for (const id of ['cabinet-crossing', 'cabinet-flight', 'cabinet-sling']) {
      const spot = arcade.doors.find((d) => d.id === id)!.rect;
      const front = { x: spot.x + spot.w / 2, y: ARCADE_LANE.a.y };
      expect(pointInRect(front, spot), id).toBe(false);
      expect(front.y - (spot.y + spot.h), id).toBeLessThan(ARCADE_LANE.r);
      expect(front.x, id).toBeGreaterThan(ARCADE_LANE.a.x);
      expect(front.x, id).toBeLessThan(ARCADE_LANE.b.x);
    }
    // Both its ends are on the floor, and nothing an owl can stand on is under it: the carry is a walk at the lane's height.
    for (const end of [ARCADE_LANE.a, ARCADE_LANE.b]) expect(isWalkable(end, arcade.walkable)).toBe(true);
    for (const perch of arcade.perches ?? []) for (const corner of perch.area) expect(laneOff(ARCADE_LANE, corner), perch.id).toBeGreaterThan(ARCADE_LANE.r);
    // And what the room has to stand on is lower than the lane holds an owl, so a ride clears it wherever it is let go.
    expect(highestTop(arcade)).toBeLessThan(ARCADE_LANE.z);
  });

  it('each path has something to do along it: a leaf pile by the knot hole and by the tunnel’s mouth, three along the lane, and no point of the lane more than three seconds’ walk from one of the room’s things', () => {
    const things = (room: string) => INTERACTABLES.filter((i) => i.room === room && !i.top);
    const piles = (room: string) => things(room).filter((i) => i.kind === 'leaf-pile');
    const nearest = (from: { x: number; y: number }, list: ReturnType<typeof things>) => Math.min(...list.map((i) => distance(i.pos, from)));
    const threeSeconds = WALK_SPEED * 3;
    // The Great Hollow's knot hole: the leaf pile that lay by the hatch is by it.
    expect(nearest(HALL_KNOT_HOLE.pos, piles('m3-hall'))).toBeLessThan(threeSeconds / 2);
    // The tunnel's mouth: the pile by the arcade's doorway.
    expect(nearest(ARCADE_TUNNEL.mouth, piles('arcade'))).toBeLessThan(200);
    // The lane: piles beside its line, and one of the room's things near every stretch of it.
    expect(piles('arcade').filter((i) => laneOff(ARCADE_LANE, i.pos) <= 150).length).toBeGreaterThanOrEqual(3);
    for (let x = ARCADE_LANE.a.x; x <= ARCADE_LANE.b.x; x += 100) expect(nearest({ x, y: ARCADE_LANE.a.y }, things('arcade')), `x ${x}`).toBeLessThan(threeSeconds);
  });
});
