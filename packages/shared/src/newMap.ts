/**
 * The new map (map 3): the park laid out as one tree, the keepers' preview (rooms/index.ts builds its
 * rooms). Only a keeper's tab walks it (`?keeper=1&newmap=1`), so no visitor ever sees it.
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

/** Whether a room is one of the new map's own (NEW_MAP). */
export function isNewMapRoom(id: string | undefined): boolean {
  return id !== undefined && Object.hasOwn(NEW_MAP, id);
}
