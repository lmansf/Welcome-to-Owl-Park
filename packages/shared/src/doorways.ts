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
import { isWalkable, pointInRect } from './geometry';
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
