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
 * The hollow hall (rooms/hollowHall.ts): the new map's tall room up the inside of the trunk, the way up
 * and down the tree since the owner switched it on (Nov 6).
 */
export const NEW_MAP_HALL: readonly string[] = ['m3-hall'];

/** The Commons off the hall's landings: top-down rooms on the hub's floor plan, the new map's alone. */
export const NEW_MAP_COMMONS: readonly string[] = ['commons-glass', 'commons-ink', 'commons-grove', 'commons-market'];

/** Whether a room is one of the new map's own (NEW_MAP), its hollow hall (NEW_MAP_HALL) or a Commons off it. */
export function isNewMapRoom(id: string | undefined): boolean {
  return id !== undefined && (Object.hasOwn(NEW_MAP, id) || NEW_MAP_HALL.includes(id) || NEW_MAP_COMMONS.includes(id));
}
