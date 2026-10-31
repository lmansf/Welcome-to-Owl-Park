/**
 * Going through a doorway keeps the owl's lane (OP-124): as far across the doorway as it walked in,
 * it comes out across the doorway back, so the turnstile at the gate's left end leads onto the hub's
 * path at its left, not to the middle of it. Only between doorways that run the same way: one in a
 * side wall (the room's left or right edge) runs up and down the floor, any other runs across it. A
 * doorway in the far wall that comes out in a side wall turns a corner, and the owl arrives at the
 * spawn as it always has.
 *
 * TODO-DOCS (OP-124): docs/ARCHITECTURE.md's rooms table ("Doors") says a door places you at a spawn;
 * it is the spawn shifted along the doorway back by the owl's lane, and the room server keeps that
 * point when it is on the floor, out of an exit and near the spawn.
 */
import { isWalkable, pointInRect, type Rect } from './geometry';
import { nestDoorIndex } from './homes';
import type { Vec2 } from './protocol';
import { findSpawn, type DoorDef, type RoomDef } from './room';

/** Which way a doorway runs: along y in a side wall, along x anywhere else. */
export type DoorAxis = 'x' | 'y';

/** Where across a doorway an owl went through: `t` is 0 at its left (or upper) end and 1 at its right (or lower) end. */
export interface Lane {
  axis: DoorAxis;
  t: number;
}

export function doorAxis(room: RoomDef, door: DoorDef): DoorAxis {
  return door.rect.x <= 0 || door.rect.x + door.rect.w >= room.size.w ? 'y' : 'x';
}

/**
 * Where a step from `from` to `to` came into `rect`: its first point inside it, or null when the step
 * never touches it. A page reads its owl's place once a frame, so on a slow device the first place
 * found in a doorway can be a frame's walk past where the owl crossed in, a turnstile further along at
 * the gate, and a narrow stretch of doorway can be crossed between two looks (OP-124). A step that
 * began inside comes in where it ends, `to`, or nowhere when it ends outside.
 *
 * TODO-DOCS (OP-124): docs/ARCHITECTURE.md's doorway paragraph ("A walk goes through a doorway only
 * when..."): the page takes a doorway from where the owl's step since its last look came into it, a
 * step right across it included, so a slow frame neither carries the owl a turnstile along nor past
 * a narrow doorway. Held keys against an edge of the floor slide along it (steerTarget).
 */
export function entryPoint(rect: Rect, from: Vec2, to: Vec2): Vec2 | null {
  if (pointInRect(from, rect)) return pointInRect(to, rect) ? to : null;
  // The step is inside while it is between both pairs of edges: from the later of the times it gets
  // between a pair to the earlier of the times it leaves one.
  let enter = 0;
  let leave = 1;
  for (const [a, b, lo, hi] of [
    [from.x, to.x, rect.x, rect.x + rect.w],
    [from.y, to.y, rect.y, rect.y + rect.h],
  ] as const) {
    if (a === b) {
      if (a < lo || a > hi) return null;
      continue;
    }
    const t0 = (lo - a) / (b - a);
    const t1 = (hi - a) / (b - a);
    enter = Math.max(enter, Math.min(t0, t1));
    leave = Math.min(leave, Math.max(t0, t1));
  }
  if (enter > leave) return null;
  return { x: from.x + enter * (to.x - from.x), y: from.y + enter * (to.y - from.y) };
}

/** The lane an owl standing at `p` takes through `door`. */
export function laneThrough(room: RoomDef, door: DoorDef, p: Vec2): Lane {
  const axis = doorAxis(room, door);
  const { x, y, w, h } = door.rect;
  const t = axis === 'x' ? (p.x - x) / w : (p.y - y) / h;
  return { axis, t: Math.min(1, Math.max(0, t)) };
}

/**
 * Inside a doorway that leads somewhere: arriving there would bounce the owl straight back out. A
 * nest door on the street leads into a nest though it has no `to` (each visitor's door goes to its own place).
 */
export function inExit(room: RoomDef, p: Vec2): boolean {
  return room.doors.some((d) => (d.to !== undefined || nestDoorIndex(d.id) !== null) && pointInRect(p, d.rect));
}

/**
 * Where an owl from room `from` arrives at spawn `spawnName`: the spawn, moved across the doorway back
 * to `from` by as much as `lane` was across the doorway it took. Without a lane, a doorway back, or a
 * doorway back that runs the same way, the spawn itself. A point off the floor or in an exit steps
 * back toward the spawn until it is neither.
 */
export function arrivalPoint(room: RoomDef, spawnName: string | undefined, from: string | undefined, lane: Lane | undefined): Vec2 {
  const spawn = findSpawn(room, spawnName);
  const back = from === undefined ? undefined : room.doors.find((d) => d.to?.room === from);
  if (!lane || !back || doorAxis(room, back) !== lane.axis) return { ...spawn };
  const shift = (lane.t - 0.5) * (lane.axis === 'x' ? back.rect.w : back.rect.h);
  for (const k of [1, 0.75, 0.5, 0.25]) {
    const p = lane.axis === 'x' ? { x: Math.round(spawn.x + shift * k), y: spawn.y } : { x: spawn.x, y: Math.round(spawn.y + shift * k) };
    if (isWalkable(p, room.walkable) && !inExit(room, p)) return p;
  }
  return { ...spawn };
}
