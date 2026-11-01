import { isNestRoom, mapOf, type RoomDef } from '@owl-park/shared';
import { TREE_REALMS } from '../rooms';

/**
 * Which park this tab's owl is walking (OP-162): the tree (2) from the moment it walks a level of the
 * tree, and still in a realm a level of the tree opens into (TREE_REALMS), whose way out then leads
 * back to the tree; today's park (1) again in any other room. Kept for the tab, so a reload inside
 * such a realm still knows its way back.
 *
 * TODO-DOCS (OP-162): docs/ARCHITECTURE.md's rooms table: a door's `toTree` (where it leads an owl
 * walking the tree) and `top` (a side view's doorway is taken only at its height); and that the page
 * keeps which park its owl walks for the tab (this module).
 */
const STORE = 'owl-park-map';

export function walkingMap(): 1 | 2 {
  try {
    return sessionStorage.getItem(STORE) === '2' ? 2 : 1;
  } catch {
    return 1;
  }
}

/**
 * The owl has come into `room`: the park it walks follows, unless the room is one both parks share: a
 * realm the tree opens into, or a nest (an owl of the tree comes out of its nest into the tree, OP-156).
 */
export function enteredRoom(room: Pick<RoomDef, 'id' | 'map'>): void {
  const map = mapOf(room) === 2 ? 2 : TREE_REALMS.has(room.id) || isNestRoom(room.id) ? null : 1;
  if (map !== null) keep(map);
}

/** The park an owl starts walking as Play brings it in (OP-156's entries setting): its pass says which. */
export function startWalking(map: 1 | 2): void {
  keep(map);
}

function keep(map: 1 | 2): void {
  try {
    sessionStorage.setItem(STORE, String(map));
  } catch {
    // Storage refused (a private window): the owl walks today's park's ways, as it did before the tree.
  }
}
