/**
 * The new map (map 3): the park laid out as one tree (rooms/index.ts builds its rooms). Every owl the
 * tree takes walks it, unless its tab asked for the tree as it was (`?newmap=0`).
 */

/** The new map's own rooms, all seen from the side, by id: the level of the tree each is a copy of. */
export const NEW_MAP: Readonly<Record<string, string>> = {
  'm3-stair-1': 'l3',
  'm3-stair-2': 'l4',
  'm3-stair-3': 'l2',
  'm3-ground': 'l1',
  'm3-under': 'l0',
  'm3-cave': 'l0-arcade',
};

/**
 * The Great Hollow (rooms/hollowHall.ts): the inside of the trunk as one room seen from above, its four
 * Commons side by side (Nov 7, the owner's "Build the big room").
 */
export const NEW_MAP_HALL: readonly string[] = ['m3-hall'];

/** Whether a room is one of the new map's own (NEW_MAP) or its Great Hollow (NEW_MAP_HALL). */
export function isNewMapRoom(id: string | undefined): boolean {
  return id !== undefined && (Object.hasOwn(NEW_MAP, id) || NEW_MAP_HALL.includes(id));
}

/**
 * Rooms folded into another (OP-306): an old link to one lands in the room it became part of. The root
 * stair's way down now leads straight into the arcade, so its links land there.
 */
export const FOLDED_ROOMS: Readonly<Record<string, string>> = { 'm3-under': 'arcade' };

/** The room a link to `id` lands in: the one it was folded into, else itself. */
export function roomForLink(id: string): string {
  return Object.hasOwn(FOLDED_ROOMS, id) ? FOLDED_ROOMS[id]! : id;
}
