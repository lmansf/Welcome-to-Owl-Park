/**
 * The first snow (D6 of the Dec 1 plan, OP-074): where it falls. Logan, Oct 23: snow is "for
 * everyone, everywhere outdoors (the lobby, the Village street, Heartwood, every open realm and the
 * arcade)", and "inside places (a nest's inside, and any future indoor room) get no snow, not even
 * through the window". So it falls in every room open to the sky and in none inside: a nest, the arcade
 * hall off the neon street (its mood says indoors) and the Great Hollow inside the old tree (the one
 * room with a wall all round its floor). A room with its own rain keeps its rain.
 *
 * Drawn in code for now, behind the park's ?snow=1, with no painted snow and no spend: the painted
 * edits wait for Logan's yes to their cost.
 */
import { isNestRoom } from './homes';
import type { RoomDef } from './room';

/** Whether snow falls in a room. */
export function snowsIn(room: Pick<RoomDef, 'id' | 'mood' | 'bowl' | 'weather'>): boolean {
  if (isNestRoom(room.id)) return false;
  if (room.mood === 'arcade') return false;
  if (room.bowl) return false;
  return room.weather !== 'rain';
}

/** The snow's colours: white with a little blue, and in the neon street the realm's own lights through it. */
export function snowTints(mood: RoomDef['mood']): number[] {
  return mood === 'neon' ? [0xf4f8ff, 0xc9f4ff, 0xffd6ef] : [0xffffff, 0xf1f6ff, 0xe3ecf8];
}

/** A snowball every two seconds an owl at most (Logan's plan, Oct 23); the room drops the rest. */
export const SNOWBALL_EVERY_MS = 2000;

/** How far an owl throws a snowball, in room px: across a good part of one screen. */
export const SNOWBALL_REACH = 700;
