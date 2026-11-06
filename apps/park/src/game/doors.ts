import { isStreetRoom, distanceToRect, doorTarget, nestDoorIndex, pointInRect, type DoorDef, type Rect, type RoomDef, type Vec2, type WalkMap } from '@owl-park/shared';
import { NEST_ROOM, roomFor } from '../rooms';

/**
 * How near a walk's end must be to a doorway to mean "through it": a tap on the painted arch stops
 * at the floor's edge, just short of the doorway.
 */
export const DOOR_AIM_PX = 48;

/**
 * Whether an owl standing in a doorway goes through it. Walking up to do something (talk, flop,
 * browse) never does, and nor does a walk that only passes the doorway on its way across a wide
 * room. A walk that ends in or at the doorway does, and so do the held keys and an owl standing
 * still in it.
 *
 * In a room seen from the side (the tree, map 2: `sideView`), walking along a level passes its
 * doorways and stairs by (OP-212): neither the held keys nor an owl standing in one takes it, only a
 * tap aimed at the doorway itself. The up key (or the Go in action) takes the rest (`upTakes`).
 */
export function takesDoorway(rect: Rect, walkTo: Vec2 | null, fromKeys: boolean, onErrand: boolean, sideView = false): boolean {
  if (onErrand) return false;
  const aimed = walkTo !== null && distanceToRect(walkTo, rect) <= DOOR_AIM_PX;
  if (sideView) return !fromKeys && aimed;
  return fromKeys || walkTo === null || aimed;
}

/**
 * How long a press of the up key (or the Go in action) waits for the owl to stand in a doorway
 * (OP-212): pressed a moment before it lands in one, or before the frame that finds it there, it
 * still goes through.
 */
export const UP_GRACE_MS = 250;

/** Whether an up press at `pressedAt` (ms, 0 for none) still counts `now`. */
export function upCounts(pressedAt: number, now: number): boolean {
  return pressedAt > 0 && now - pressedAt >= 0 && now - pressedAt <= UP_GRACE_MS;
}

/**
 * The doorway an owl at `pos` stands in that the up key would take it through in a side view (OP-212):
 * the first whose rect holds it, at the height it is taken at (`atLevel`), that leads somewhere now
 * (`leads`: an open doorway to another room, or a nest's door on the street). Null for none.
 */
export function doorwayUnder(doors: readonly DoorDef[], pos: Vec2, atLevel: (door: DoorDef) => boolean, leads: (door: DoorDef) => boolean): DoorDef | null {
  return doors.find((d) => pointInRect(pos, d.rect) && atLevel(d) && leads(d)) ?? null;
}

/** How much wider than drawn a doorway is kept out of a tap's way around a bend (OP-148). */
export const WAY_DOOR_PX = 8;

/**
 * The doorways a tap's way around a bend in the floor keeps out of (OP-148), as floor shut for that
 * way: each one that takes an owl through (an open doorway to another room, or a nest's door on the
 * street) but the one the tap is aimed at, a little wider than drawn, and none the owl at `pos`
 * already stands in. A leg that ended by one on its way would go through it.
 */
export function doorwaysOff(room: RoomDef, pos: Vec2, aim: Vec2, closed: (roomId: string) => boolean, map: WalkMap = 1): Rect[] {
  const m = WAY_DOOR_PX;
  return room.doors
    .filter((d) => {
      const to = doorTarget(d, map);
      return to ? !closed(to.room) : isStreetRoom(room.id) && nestDoorIndex(d.id) !== null;
    })
    .filter((d) => distanceToRect(aim, d.rect) > DOOR_AIM_PX)
    .map((d) => ({ x: d.rect.x - m, y: d.rect.y - m, w: d.rect.w + 2 * m, h: d.rect.h + 2 * m }))
    .filter((r) => !pointInRect(pos, r));
}

/** An owl walking on the held keys this near a doorway may be going through it (the keys have no other sign). */
export const AHEAD_PX = 100;

/**
 * The rooms an owl looks to be heading into, whose art is worth fetching ahead (OP-129): through a
 * doorway its walk ends at, or, walking on the held keys or the thumbstick (`fromKeys`, which go
 * through any doorway they walk into), one it comes within AHEAD_PX of. A tapped walk goes through
 * only the doorway it ends at, so the ones it passes on the way are not fetched: a phone tapped
 * across the hub to the market would otherwise fetch the realm whose arch it walks by. An owl
 * standing still is going nowhere, except in a side view (`sideView`, OP-212), where one standing in
 * a doorway may be about to press up: the room behind it is fetched. Behind the street's nest doors
 * is a nest (every nest has the same art); a doorway into a room that is `closed` (a realm not open
 * yet) or back into this room leads nowhere new.
 */
export function roomsAhead(
  room: RoomDef,
  pos: Vec2,
  walkTo: Vec2 | null,
  fromKeys: boolean,
  closed: (roomId: string) => boolean,
  map: WalkMap = 1,
  sideView = false,
): RoomDef[] {
  const out: RoomDef[] = [];
  if (!walkTo && !sideView) return out;
  for (const door of room.doors) {
    const aimed = walkTo !== null && distanceToRect(walkTo, door.rect) <= 2 * DOOR_AIM_PX;
    const near = walkTo !== null && fromKeys && distanceToRect(pos, door.rect) <= AHEAD_PX;
    const standing = sideView && walkTo === null && pointInRect(pos, door.rect);
    if (!aimed && !near && !standing) continue;
    const way = doorTarget(door, map);
    const to = way ? (closed(way.room) ? undefined : roomFor(way.room)) : isStreetRoom(room.id) && nestDoorIndex(door.id) !== null ? NEST_ROOM : undefined;
    if (to && to.id !== room.id && !out.includes(to)) out.push(to);
  }
  return out;
}
