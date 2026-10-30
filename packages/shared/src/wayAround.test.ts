import { describe, expect, it } from 'vitest';
import { NEST_ROOM, ROOMS } from '../rooms';
import { distance, distanceToRect, isWalkable, pointInRect, type Polygon, type Rect, type Shut } from './geometry';
import { footing } from './perches';
import type { Vec2 } from './protocol';
import { resolveTarget } from './resolveTarget';
import { WAY_SHORT_PX, wayAround } from './wayAround';

const street = ROOMS['homes']!;
const middle = (r: Rect): Vec2 => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const doorAt = (id: string) => middle(street.doors.find((d) => d.id === id)!.rect);

/** The page's doorways a way keeps out of (apps/park doorwaysOff): each that takes an owl through but the one aimed at, 8 px wider. */
function doorwaysOff(room: typeof street, from: Vec2, aim: Vec2): Rect[] {
  return room.doors
    .filter((d) => d.to || (room.id === 'homes' && d.id.startsWith('nest-door-')))
    .filter((d) => distanceToRect(aim, d.rect) > 48)
    .map((d) => ({ x: d.rect.x - 8, y: d.rect.y - 8, w: d.rect.w + 16, h: d.rect.h + 16 }))
    .filter((r) => !pointInRect(from, r));
}

/** Each leg is a straight walk on from the one before, as the page and the room walk it, and the last one reaches `to`. */
function walksThrough(from: Vec2, legs: Vec2[], to: Vec2, walkable: Polygon[], shut: readonly Shut[] = []): void {
  let here = from;
  for (const leg of legs) {
    expect(distance(resolveTarget(here, leg, walkable, shut), leg)).toBeLessThanOrEqual(6);
    here = leg;
  }
  expect(distance(resolveTarget(here, to, walkable, shut), to)).toBeLessThanOrEqual(6);
}

/** mulberry32: the same points each run. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('the way around a bend in the floor (OP-148)', () => {
  it('takes the owl from the street’s west end round the mounds to its own nest door, each leg a straight walk', () => {
    const from = { x: 470, y: 870 };
    const to = doorAt('nest-door-0');
    expect(distance(resolveTarget(from, to, street.walkable), to)).toBeGreaterThan(WAY_SHORT_PX);
    const shut = doorwaysOff(street, from, to);
    const legs = wayAround(from, to, street.walkable, shut);
    expect(legs?.length).toBeGreaterThan(0);
    expect(legs!.length).toBeLessThanOrEqual(3);
    walksThrough(from, legs!, to, street.walkable, shut);
  });

  it('goes on from the mound where a straight walk stopped, where a second tap at the door did nothing', () => {
    const from = { x: 1431, y: 805 };
    const to = doorAt('nest-door-0');
    // A straight walk from here goes nowhere: the line leaves the floor at once.
    expect(distance(resolveTarget(from, to, street.walkable), from)).toBeLessThan(3);
    const legs = wayAround(from, to, street.walkable, doorwaysOff(street, from, to));
    expect(legs?.length).toBeGreaterThan(0);
    walksThrough(from, legs!, to, street.walkable);
  });

  it('keeps out of the doorways it is not aimed at: no leg ends by one, nor crosses one', () => {
    const from = { x: 470, y: 870 };
    const to = doorAt('nest-door-0');
    const shut = doorwaysOff(street, from, to);
    expect(shut).toHaveLength(6); // nest doors 1 to 5 and the way to the lobby
    let here = from;
    for (const leg of wayAround(from, to, street.walkable, shut)!) {
      for (let t = 0; t <= 1; t += 0.01) {
        const p = { x: here.x + (leg.x - here.x) * t, y: here.y + (leg.y - here.y) * t };
        expect(shut.some((r) => pointInRect(p, r))).toBe(false);
      }
      here = leg;
    }
  });

  it('leaves a straight way as it is: no legs', () => {
    expect(wayAround({ x: 2640, y: 790 }, doorAt('nest-door-0'), street.walkable)).toEqual([]);
    expect(wayAround({ x: 600, y: 800 }, { x: 900, y: 820 }, street.walkable)).toEqual([]);
  });

  it('finds no way to floor that is shut for now, or to a piece of floor of its own', () => {
    const square: Polygon = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 400 },
      { x: 0, y: 400 },
    ];
    const island: Polygon = [
      { x: 600, y: 0 },
      { x: 800, y: 0 },
      { x: 800, y: 400 },
      { x: 600, y: 400 },
    ];
    // A perch's face: its top asked for from the floor (the page keeps the goal for a jump).
    const perch: Rect = { x: 150, y: 150, w: 100, h: 100 };
    expect(wayAround({ x: 50, y: 50 }, { x: 200, y: 200 }, [square], [perch])).toBeNull();
    expect(wayAround({ x: 50, y: 50 }, { x: 700, y: 200 }, [square, island])).toBeNull();
  });

  it('walks round a wall in the middle of the floor, the way a thumb would tap', () => {
    const floor: Polygon = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 400 },
      { x: 0, y: 400 },
    ];
    const wall: Rect = { x: 480, y: 0, w: 40, h: 300 };
    const from = { x: 100, y: 100 };
    const to = { x: 900, y: 100 };
    const legs = wayAround(from, to, [floor], [wall])!;
    expect(legs.length).toBeGreaterThan(0);
    walksThrough(from, legs, to, [floor], [wall]);
    // Under the wall's end, not along the floor's edge.
    expect(legs.some((p) => p.y > 300 && p.y < 400)).toBe(true);
  });

  it('in every room, a far tap a straight walk stops short of is walked round, each leg a straight walk', () => {
    for (const room of [...Object.values(ROOMS), NEST_ROOM]) {
      const floor = footing(room, 0);
      const xs = floor.walkable.flat().map((p) => p.x);
      const ys = floor.walkable.flat().map((p) => p.y);
      const rnd = seeded(148);
      const pick = (): Vec2 => {
        for (;;) {
          const p = { x: Math.min(...xs) + rnd() * (Math.max(...xs) - Math.min(...xs)), y: Math.min(...ys) + rnd() * (Math.max(...ys) - Math.min(...ys)) };
          if (isWalkable(p, floor.walkable, floor.shut)) return p;
        }
      };
      let walkedRound = 0;
      for (let i = 0; i < 300; i++) {
        const from = pick();
        const to = pick();
        if (distance(resolveTarget(from, to, floor.walkable, floor.shut), to) <= WAY_SHORT_PX) continue;
        const doors = doorwaysOff(room, from, to);
        // Standing in a doorway's way in: the page would have taken the owl through it already.
        if (room.doors.some((d) => (d.to || d.id.startsWith('nest-door-')) && pointInRect(from, d.rect))) continue;
        const shut = [...floor.shut, ...doors];
        const legs = wayAround(from, to, floor.walkable, shut);
        // Squeezed between the floor's edge and a doorway the way keeps out of, the search has no point
        // to set off from: the straight walk, as before.
        if (legs === null && doors.some((r) => distanceToRect(from, r) < 16)) continue;
        expect(legs, `${room.id}: ${JSON.stringify(from)} to ${JSON.stringify(to)}`).not.toBeNull();
        walksThrough(from, legs!, to, floor.walkable, shut);
        walkedRound += 1;
      }
      // Each room's far taps that a straight walk stops short of, walked round (the nest is one round room).
      if (room.id !== NEST_ROOM.id) expect(walkedRound, room.id).toBeGreaterThan(0);
    }
  });
});
