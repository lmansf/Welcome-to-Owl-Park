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
 * The way back waits for a fresh push. An owl walks into a doorway with a key or the thumbstick held,
 * and is still holding it as the next room comes in. Where the two rooms' doorways lie the same way
 * (up into the turnstiles and up into the knothole they open on; a nest's door and the street's), the
 * same push walked it straight back out, and in again, for as long as it was held (the play log, Nov 8
 * to 10: five of the seven trips from the Great Hollow up to the Treetop Commons were back within five
 * seconds). So the doorway back where an owl just came from stays shut to it until it has let go once.
 *
 * `waiting` is true from the moment the owl comes in. It holds while a way is still `held`, and while a
 * screen that takes the keys covers the room (`covered`): held keys read as let go under one. `rested`
 * is the letting go itself, counted as it happens (Keys.rests) since the owl took the doorway: a key let
 * go and pressed again between two looks, as a quick thumb does on a slow phone, is a fresh push too.
 *
 * TODO-DOCS (OP-333): docs/ARCHITECTURE.md's client rules, where a walk takes a doorway: the doorway
 * back where an owl came from waits until the keys or the thumbstick held as it came in are let go
 * (seen from above the owl stops at its foot; seen from the side a held up does not take it, a new
 * press does). The check: apps/park/e2e/wayBack.spec.ts.
 */
export function backWaits(waiting: boolean, held: boolean, covered: boolean, rested = false): boolean {
  return waiting && !rested && (held || covered);
}

/**
 * A direction held across a change of view is not a walk (OP-346). A doorway seen from the side is
 * taken with up, and up is still held as the next room comes in: seen from above that is a walk north,
 * and an owl out of a course marched across the Great Hollow with nothing pressed afresh (1,000 px in
 * three seconds, measured). The other way round, the push that walked an owl into a course's doorway
 * walked it on toward the first pit before the room had been read. Between two rooms seen the same way
 * a held direction carries on as it always has: there it still points where the owl was going.
 *
 * The direction the owl came in with (`held`, as the room starts), or null when it is free to walk:
 * the room it left was seen the same way (`fromSide`, undefined for an owl that came by no doorway),
 * nothing is held, or the keys were let go on the way (`rested`, Keys.rests).
 *
 * TODO-DOCS (OP-346): docs/ARCHITECTURE.md's client rules, beside the way back (OP-333): a direction
 * held through a doorway between a side view and a view from above does not walk the owl until it is
 * let go or points elsewhere. The check: apps/park/e2e/wayBack.spec.ts.
 */
export function carriedIn(fromSide: boolean | undefined, side: boolean, held: Vec2 | null, rested: boolean): Vec2 | null {
  if (fromSide === undefined || fromSide === side || rested || !held) return null;
  return { x: held.x, y: held.y };
}

/**
 * How far a held direction may turn (the cosine of the angle) and still be the one the owl came in
 * with (carriedIn): a thumbstick wavers, a new push points elsewhere. Under the 45 degrees between two
 * neighbouring ways of the walking keys, so any key added or let go is a new push.
 */
export const CARRIED_COS = Math.cos((40 * Math.PI) / 180);

/** The direction the owl came in with, while it is still held (carriedIn): null once it is let go or points elsewhere. */
export function stillCarried(carried: Vec2 | null, held: Vec2 | null): Vec2 | null {
  if (!carried || !held) return null;
  return carried.x * held.x + carried.y * held.y >= CARRIED_COS ? carried : null;
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
