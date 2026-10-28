import { STREET_ROOM, distanceToRect, nestDoorIndex, type Rect, type RoomDef, type Vec2 } from '@owl-park/shared';
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
 */
export function takesDoorway(rect: Rect, walkTo: Vec2 | null, fromKeys: boolean, onErrand: boolean): boolean {
  if (onErrand) return false;
  return fromKeys || walkTo === null || distanceToRect(walkTo, rect) <= DOOR_AIM_PX;
}

/** A walking owl this near a doorway may be going through it (the held keys have no other sign). */
export const AHEAD_PX = 100;

/**
 * The rooms an owl looks to be heading into, whose art is worth fetching ahead (OP-129): through a
 * doorway its walk ends at, or one it walks within AHEAD_PX of. An owl standing still is going
 * nowhere. Behind the street's nest doors is a nest (every nest has the same art); a doorway into a
 * room that is `closed` (a realm not open yet) or back into this room leads nowhere new.
 */
export function roomsAhead(room: RoomDef, pos: Vec2, walkTo: Vec2 | null, closed: (roomId: string) => boolean): RoomDef[] {
  const out: RoomDef[] = [];
  if (!walkTo) return out;
  for (const door of room.doors) {
    if (distanceToRect(walkTo, door.rect) > 2 * DOOR_AIM_PX && distanceToRect(pos, door.rect) > AHEAD_PX) continue;
    const to = door.to ? (closed(door.to.room) ? undefined : roomFor(door.to.room)) : room.id === STREET_ROOM && nestDoorIndex(door.id) !== null ? NEST_ROOM : undefined;
    if (to && to.id !== room.id && !out.includes(to)) out.push(to);
  }
  return out;
}
