import { describe, expect, it } from 'vitest';
import {
  WAY_SHORT_PX,
  distance,
  doorRects,
  footing,
  inDoorway,
  isWalkable,
  parkwardDoor,
  resolveTarget,
  segmentTouchesRect,
  steerTarget,
  wayAround,
  type DoorDef,
  type RoomDef,
  type Vec2,
} from '@owl-park/shared';
import { roomFor } from '../rooms';
import { doorwaysOff } from './doors';
import { offSideEdges, sideEdges, walkAim } from './sideEdges';

/**
 * The nests' street's way to the park, at its east end (OP-499): walked right along the lower ground the
 * owl stood pinned at the screen's edge, and the "To the park" chip tapped from there stopped it at the log
 * by the bird bath every time. Walked as the page walks it (RoomScene's walkTo, walkOn and steer), with the
 * strips along the room's sides that keep the whole owl on screen.
 */
const street = roomFor('homes')!;
const door = street.doors.find((d) => d.id === parkwardDoor('homes'))!;
/** Half an owl of today's size (the Owl's OWL_W 200 at OWL_SCALE 0.5), as sideEdges.test.ts. */
const HALF = 50;
const edges = sideEdges(street, HALF);
const ground = footing(street, 0, edges);

/**
 * Where the chip's walk there takes the owl from `from`: each leg as walkTo sets it off, round what stands
 * between (wayAround) where a straight walk stops short, on until a step crosses into the doorway (true) or
 * the owl can go no further (false).
 */
function chipReaches(room: RoomDef, way: DoorDef, from: Vec2): boolean {
  const { walkable, shut } = ground;
  let target: Vec2 = { x: way.rect.x + way.rect.w / 2, y: way.rect.y + way.rect.h / 2 };
  let pos = from;
  for (let leg = 0; leg < 16; leg++) {
    const aim = walkAim(target, walkable, edges);
    let to = resolveTarget(pos, target, walkable, shut);
    if (distance(to, aim) > WAY_SHORT_PX) {
      const legs = wayAround(pos, aim, walkable, [...shut, ...doorwaysOff(room, pos, aim, () => false)]);
      if (legs?.[0]) to = resolveTarget(pos, legs[0], walkable, shut);
    }
    if (doorRects(way).some((r) => segmentTouchesRect(pos, to, r))) return true;
    if (distance(to, pos) < 3) return false;
    pos = to;
    // On round the bend: walkOn walks to the aim, not the doorway's middle.
    target = aim;
  }
  return false;
}

describe("the nests' street's way to the park (OP-499)", () => {
  it('takes an owl walked right on the held keys from anywhere along the street, the lower ground too', () => {
    let rows = 0;
    for (let y = 600; y <= street.size.h; y += 6) {
      const from = { x: 2990, y };
      // On the floor, or up on the mossy bank in the corner: walked along at its top.
      const level = isWalkable(from, ground.walkable, ground.shut) ? ground : isWalkable(from, footing(street, 36, edges).walkable) ? footing(street, 36, edges) : null;
      if (!level) continue;
      rows++;
      // Held: each walk on from where the last stopped (steer, at the end of a walk), till the doorway or no further.
      let at = from;
      for (let step = 0; step < 8 && !inDoorway(at, door); step++) {
        const to = steerTarget(at, { x: 1, y: 0 }, level.walkable, undefined, level.shut);
        if (!to || distance(to, at) < 1) break;
        at = to;
      }
      expect(inDoorway(at, door), `walked right from y ${y}, stopped at ${Math.round(at.x)}, ${Math.round(at.y)}`).toBe(true);
    }
    // The path and the bank, and the lower ground down to the plaza's front.
    expect(rows).toBeGreaterThan(90);
  });

  it("walks the chip's owl there from the lower ground by the bird bath and the log, round the log", () => {
    // Where an owl stands to splash in the bird bath, and about the log beside it.
    for (const from of [
      { x: 1620, y: 1092 },
      { x: 1500, y: 1200 },
      { x: 1700, y: 1180 },
      { x: 1690, y: 1150 },
      { x: 1900, y: 1160 },
      { x: 1640, y: 1300 },
    ]) {
      expect(isWalkable(from, ground.walkable, ground.shut), `${from.x}, ${from.y} on the floor`).toBe(true);
      expect(chipReaches(street, door, from), `from ${from.x}, ${from.y}`).toBe(true);
    }
  });

  // A sweep of a few hundred walks found round the street's floor: about 1.5 s here, about 8 s on a busy CI
  // runner beside the Worker's tests, past vitest's 5 s, so it has a budget of its own (red on main from Nov 27).
  it("walks the chip's owl there from anywhere on the street's floor", { timeout: 30_000 }, () => {
    const stuck: string[] = [];
    let tried = 0;
    for (let x = 340; x < street.size.w; x += 80) {
      for (let y = 660; y < street.size.h; y += 60) {
        const from = { x, y };
        if (!isWalkable(from, ground.walkable, ground.shut)) continue;
        tried++;
        if (!chipReaches(street, door, from)) stuck.push(`${x}, ${y}`);
      }
    }
    expect(tried).toBeGreaterThan(200);
    expect(stuck).toEqual([]);
  });

  it('aims a walk into a side strip at the strip’s edge, on the floor, and leaves any other aim as it was', () => {
    const middle = { x: door.rect.x + door.rect.w / 2, y: door.rect.y + door.rect.h / 2 };
    const right = edges.find((e) => e.x > 0)!;
    expect(middle.x).toBeGreaterThan(right.x);
    const aim = walkAim(middle, ground.walkable, edges);
    expect(aim).toEqual({ x: right.x - 1, y: middle.y });
    expect(inDoorway(aim, door)).toBe(true);
    expect(isWalkable(aim, ground.walkable, ground.shut)).toBe(true);
    const open = { x: 2000, y: 1000 };
    expect(walkAim(open, ground.walkable, edges)).toBe(open);
    // The left strip too, and off the floor nothing moves it.
    const left = edges.find((e) => e.x < 0)!;
    expect(offSideEdges({ x: 10, y: 5 }, edges)).toEqual({ x: left.x + left.w + 1, y: 5 });
    expect(walkAim({ x: 3190, y: 100 }, ground.walkable, edges).x).not.toBe(right.x - 1);
  });
});
