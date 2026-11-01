/**
 * The tree's named spots (OP-155's list; OP-156, part 3): each thing a level of the tree (map 2) has
 * where an owl comes to use it (a door, a stair, a booth, an idol, a guardian, a game, a find, a
 * bench), by the id the room data gives it, with the levels and the screens it is on. A tree level `n`
 * is the room `l<n>`, 0 the lowest and 5 the highest; a screen counts from the trunk's (0), west
 * negative and east positive. A stair joins two levels, so it lists both, the upper first, and its
 * screen on each; the challenge stair (closed until OP-115) is on level 0 alone.
 *
 * The ledge painter (`?paint=1`) lists a level's names and lets a keeper place each where its thing
 * stands; `pnpm masks:pull` prints those placed as the room's `places` (room.ts), from which each
 * level's own ticket wires its doors, booth, idols and the rest. The game reads neither yet.
 *
 * Module by module and with no class of its own, so the pull script's Node reads it (type stripping).
 */

export type TreeSpotKind = 'bench' | 'booth' | 'cabinet' | 'door' | 'find' | 'game' | 'gate' | 'guardian' | 'idol' | 'mirror' | 'portal' | 'route' | 'shop' | 'stair' | 'wall';

export interface TreeSpot {
  /** Its id, in the room data's hyphenated style: an existing door's own where it is one (l1's `closed-west`, `to-market`). */
  id: string;
  kind: TreeSpotKind;
  /** The levels it is on: one, or a stair's two, the upper first. */
  levels: readonly number[];
  /** Its screen on each of `levels`, in the same order: 0 the trunk's, west negative, east positive. */
  screen: readonly number[];
  /** What it is, for the painter's list. */
  note: string;
}

/** The tree's highest level; the lowest is 0. */
export const TREE_LEVEL_MAX = 5;

const on = (level: number, screen: number, id: string, kind: TreeSpotKind, note: string): TreeSpot => ({ id, kind, levels: [level], screen: [screen], note });
const stair = (upper: number, lower: number, screenUpper: number, screenLower: number): TreeSpot => ({
  id: `stair-l${upper}-l${lower}`,
  kind: 'stair',
  levels: [upper, lower],
  screen: [screenUpper, screenLower],
  note: `The stair between level ${upper} and level ${lower}.`,
});

export const TREE_SPOTS: readonly TreeSpot[] = [
  // Level 5, the top of the tree.
  on(5, 0, 'booth-canopy', 'booth', 'The canopy’s booth, at the trunk.'),
  on(5, 1, 'gate-entrance', 'gate', 'The tree’s front gate (OP-130’s gate-crossed flag).'),
  on(5, 2, 'shop-gift', 'shop', 'The gift shop.'),
  ...[1, 2, 3, 4].map((n) => on(5, -1, `nest-door-${n}`, 'door', `Nest door ${n}, on the street.`)),
  ...[5, 6, 7, 8].map((n) => on(5, -2, `nest-door-${n}`, 'door', `Nest door ${n}, on the street.`)),
  on(5, -1, 'mirror-street', 'mirror', 'The mirror on the street.'),
  on(5, -2, 'parkour-bough-6', 'route', 'The parkour route on bough 6.'),
  on(5, 3, 'parkour-bough-7', 'route', 'The parkour route on bough 7.'),
  on(5, -2, 'bench-bough-6', 'bench', 'The bench on bough 6.'),
  on(5, 3, 'bench-bough-7', 'bench', 'The bench on bough 7.'),
  on(5, -2, 'find-bough-6', 'find', 'The find on bough 6.'),
  on(5, 3, 'find-bough-7', 'find', 'The find on bough 7.'),
  // The stairs down the trunk, each on both of its levels; the challenge stair, off level 0, is closed until OP-115.
  stair(5, 4, 1, 0),
  stair(4, 3, 0, 0),
  stair(3, 2, 0, 0),
  stair(2, 1, 0, 0),
  stair(1, 0, 0, 0),
  on(0, -1, 'stair-challenge', 'stair', 'The challenge stair, closed until OP-115.'),
  // Level 4.
  on(4, 1, 'find-overlook', 'find', 'The find at the overlook.'),
  // Level 3: the stained-glass realm.
  on(3, 1, 'idol-glass', 'idol', 'The stained-glass realm’s idol.'),
  on(3, 1, 'guardian-glass', 'guardian', 'The stained-glass realm’s guardian.'),
  on(3, 1, 'portal-climb', 'portal', 'The portal into the stained-glass climb.'),
  // Level 2: the grove.
  on(2, -1, 'idol-grove', 'idol', 'The grove’s idol.'),
  on(2, -1, 'guardian-grove', 'guardian', 'The grove’s guardian.'),
  on(2, -1, 'game-grove', 'game', 'The grove’s game.'),
  on(2, -2, 'diner-grove', 'game', 'A treetop diner (OP-165).'),
  // Level 1, the ground: the lobby at the trunk's foot, the market's square and its roof run.
  on(1, 0, 'booth-lobby', 'booth', 'The lobby’s booth.'),
  on(1, -1, 'closed-west', 'gate', 'The ink-wash realm’s closed gate (l1’s door of that id).'),
  on(1, 1, 'idol-market', 'idol', 'The market’s idol.'),
  on(1, 1, 'guardian-market', 'guardian', 'The market’s guardian.'),
  on(1, 1, 'game-market', 'game', 'The market’s game.'),
  on(1, 2, 'to-market', 'door', 'The archway into the market’s own screens (l1’s door of that id).'),
  // Level 0, below the ground: the cavern at the trunk, and the arcade cave a screen east.
  on(0, 0, 'find-cavern', 'find', 'The find in the cavern.'),
  on(0, 1, 'cabinet-hoot-hop', 'cabinet', 'Hoot & Hop’s cabinet, in the arcade cave.'),
  on(0, 1, 'cabinet-moon-flap', 'cabinet', 'Moon Flap’s cabinet, in the arcade cave.'),
  on(0, 1, 'cabinet-talon-toss', 'cabinet', 'Talon Toss’s cabinet, in the arcade cave.'),
  on(0, 1, 'score-wall', 'wall', 'The arcade cave’s score wall.'),
];

/** The level of the tree a room is (`l0` to `l5`: 0 to 5), or null for any other room. */
export function treeLevelOf(roomId: string): number | null {
  const m = /^l(\d)$/.exec(roomId);
  const n = m ? Number(m[1]) : -1;
  return n >= 0 && n <= TREE_LEVEL_MAX ? n : null;
}

/** A spot's screen on `level` (0 the trunk's), or null when it is not on that level. */
export function screenOn(spot: TreeSpot, level: number): number | null {
  const i = spot.levels.indexOf(level);
  return i < 0 ? null : (spot.screen[i] ?? null);
}

/**
 * The named spots on a room's level of the tree, west to east as they stand (by screen, then in the
 * list's order); none for a room that is not a level.
 */
export function treeSpotsFor(roomId: string): TreeSpot[] {
  const level = treeLevelOf(roomId);
  if (level === null) return [];
  return TREE_SPOTS.filter((s) => s.levels.includes(level)).sort((a, b) => (screenOn(a, level) ?? 0) - (screenOn(b, level) ?? 0));
}
