import type { Polygon, Rect } from './geometry';
import type { Perch, Raised } from './perches';
import type { Vec2 } from './protocol';

/**
 * Data-driven room definition. Art is swappable: point `background` and
 * `foreground` at new images, redraw `walkable`, and the room works unchanged.
 *
 * Room ids are neutral words so that nothing in this public repository leaks
 * unreleased realm names. Visitors see no names in the park (per canon).
 */
export interface RoomDef {
  id: string;
  /**
   * Logical size in room pixels: one screen is ROOM_W x ROOM_H, and a room may be wider or taller,
   * up to ROOM_MAX_W x ROOM_MAX_H. The camera follows the owl across anything bigger than the screen.
   */
  size: { w: number; h: number };
  /** Image drawn behind the owls, for a room of one tile. A bigger room lists `backgrounds`. */
  background: string;
  /** Optional image drawn in front of the owls (railings, lantern posts), for a room of one tile. */
  foreground?: string;
  /**
   * A room bigger than one screen is painted in tiles: each tile is ROOM_W x ROOM_H art placed at
   * its offset in room pixels. When present these replace `background` / `foreground`.
   */
  backgrounds?: RoomTile[];
  foregrounds?: RoomTile[];
  /** Union of polygons the owl may stand on. */
  walkable: Polygon[];
  /**
   * What an owl can land on above the floor (OP-084, perches.ts): each a top on the floor plan and its
   * height. Reached by jumping; a room without has only its floor.
   */
  perches?: Perch[];
  /**
   * In a room seen from the side (the tree, OP-173): shapes of its playfield (the 1x tile they lie in)
   * that are painted in front of where the owls walk, a lamp post on the path or a post in front of a
   * stall, drawn again over the owls so an owl passes behind them. Each hugs its thing's outline, as
   * whatever else it covers is drawn in front too.
   */
  fronts?: Array<{ id: string; poly: Polygon }>;
  /**
   * In a room seen from the side (OP-173): shapes of the playfield shaded darker by `alpha` (0 to 1),
   * painted glows that do nothing (a closed gate's lit doors, a lit window), so they do not read as
   * things to use.
   */
  shades?: Array<{ id: string; poly: Polygon; alpha: number }>;
  /** Named spawn points; `default` is required. */
  spawns: Record<string, Vec2>;
  /**
   * Doorways and interaction spots. Walking into a door with `to` changes room; a closed door
   * shows its sign; `shop` and `idol` are spots that offer the gift shop and the Realm Vote.
   * What a spot does is the client's `interactions` table in RoomScene: standing in one shows
   * its button, and E runs it.
   */
  doors: DoorDef[];
  /**
   * Named stretches of floor the client watches the owl walk into and out of (OP-172: the plaza in
   * front of the lobby's turnstiles, where the owl's ticket status shows). They lead nowhere and offer
   * nothing to press; the room server ignores them.
   */
  zones?: ZoneDef[];
  /**
   * Hiding spots where a visitor's collectible finds can appear (only the finder sees them).
   * Each is on the floor, at least 60 px from every doorway and spot, and reachable by a straight
   * walk from the default spawn that never crosses an exit; or up on a perch single jumps reach
   * (a tier 1 perch, routes.ts), with that perch's `top` (OP-084), so a quest never asks for more
   * than a jump (unit-tested in rooms.test.ts).
   */
  spots?: Array<Vec2 & Raised>;
  /** Ambient mood used by the scene for lighting and particles (`arcade`: neon indoors, no rain). */
  mood: 'hub' | 'dusk' | 'neon' | 'arcade';
  /**
   * A realm the keepers open with the `realms` setting (the stained-glass climb): closed until its id
   * is in that setting's `open`, whatever its doors say. Rooms without this never consult the setting.
   */
  gated?: boolean;
  /**
   * Which park the room belongs to (OP-128, OP-156): absent for today's park (map 1), 2 for the tree,
   * the side-scrolling world around the great trunk. A room of the tree is seen from the side: its
   * floor is a thin strip along the ground line, what an owl stands on above it are perches (their
   * areas strips of that floor, their tops the heights of the ledges), and jumping is the flight every
   * room has (OP-084), so the room server checks walks, perches and flight as in any room.
   *
   * TODO-DOCS (OP-155, OP-156): docs/MAP.md (new): the tree's grid of levels and screens and its style
   * sheet (the three layers and their rates, the owl at a sixth of the screen's height, magenta for
   * the keyed layers); docs/ARCHITECTURE.md's rooms table gains `map`, `owlScale` and a tile's `rate`,
   * and says a tree room's camera follows the owl as drawn, its height included.
   */
  map?: 2;
  /** How big owls are drawn here against today's park (the tree's owl stands a sixth of the screen's height: 1.25). */
  owlScale?: number;
}

/** One ROOM_W x ROOM_H piece of a room's art, at its top-left corner in room pixels. */
export interface RoomTile {
  key: string;
  x: number;
  y: number;
  /**
   * How fast the tile scrolls with the camera (OP-156, parallax): absent or 1 with the room, 0.5 a far
   * layer (the tree's sky plate), 0.75 its middle distance, 1.2 a near one (its foreground overlay).
   * See tilePlacement.
   */
  rate?: number;
  /**
   * Room pixels at the tile's left and right edges over which it fades in from clear (OP-162). Tiles
   * that scroll at their own rate do not meet their neighbours edge to edge: a slower one overlaps the
   * next screen's (the sky, the middle distance) and a faster one ends partway across the view (the
   * overlay), so their edges fade instead of showing a hard cut. The tile drawn on top of a neighbour
   * fades over it.
   *
   * TODO-DOCS (OP-162): docs/MAP.md: a tree level's four layers per screen (sky 0.5, middle distance
   * 0.75 painted at half size and drawn twice as big, playfield 1 with the owls, overlay 1.2), how a
   * slower tile is drawn bigger about its screen's centre (tilePlacement), each layer's edge fades
   * (sky 220 where it lies over a neighbour, middle distance 230, overlay 120) and the skies' order
   * (the lobby's on top); docs/ARCHITECTURE.md's rooms table gains a tile's `fade`.
   */
  fade?: { left?: number; right?: number };
}

/** The room pixels a tile fades over at each side edge, at most half the tile each (OP-162). */
export function tileFade(t: RoomTile): { left: number; right: number } {
  const clamp = (n: number | undefined): number => Math.max(0, Math.min(ROOM_W / 2, Math.round(n ?? 0)));
  return { left: clamp(t.fade?.left), right: clamp(t.fade?.right) };
}

/** A named stretch of floor (room px) the client watches the owl walk into and out of. */
export interface ZoneDef {
  id: string;
  rect: Rect;
}

export interface DoorDef {
  id: string;
  /** Trigger area in room pixels. */
  rect: Rect;
  /** Open doors lead somewhere. Closed doors show an under-construction sign. */
  to?: { room: string; spawn: string };
  /**
   * Where the doorway leads an owl walking the tree (map 2, OP-162) instead of `to`: a realm of today's
   * park that a level of the tree opens into (TREE_REALMS) sends a tree owl back out to that level.
   */
  toTree?: { room: string; spawn: string };
  /**
   * In a room seen from the side (the tree), the height over the ground line the doorway stands at:
   * an owl goes through it only standing at that height (within PERCH_SLACK), so one up on a ledge
   * over the doorway walks on past it (OP-162). Without it, height does not matter.
   */
  top?: number;
  /** In a room seen from the side (OP-173): where the doorway's mark (the bright, simple sign of a way through) stands, over its arch. */
  markAt?: Vec2;
  /** Public sign wording for closed realms (approved phrases only). */
  closedSign?: string;
  /** Where to place a visual hint (sign, glow) for the door. */
  marker?: Vec2;
}

export const ROOM_W = 1600;
export const ROOM_H = 900;
/** The biggest a room may be (four screens wide, two high): positions beyond it are refused. */
export const ROOM_MAX_W = 6400;
export const ROOM_MAX_H = 1800;

/** The tiles drawn behind the owls, in drawing order. */
export function backgroundTiles(room: RoomDef): RoomTile[] {
  return room.backgrounds ?? [{ key: room.background, x: 0, y: 0 }];
}

/** The tiles drawn in front of the owls, in drawing order (none for a room without overlays). */
export function foregroundTiles(room: RoomDef): RoomTile[] {
  return room.foregrounds ?? (room.foreground ? [{ key: room.foreground, x: 0, y: 0 }] : []);
}

/** The park a room belongs to: 1 for today's park, 2 for the tree (OP-128). */
export function mapOf(room: Pick<RoomDef, 'map'>): 1 | 2 {
  return room.map ?? 1;
}

/** How much bigger a tile that scrolls slower than the room is drawn, per unit of rate it lags by: its edge never shows. */
export const TILE_GROW = 0.2;

/**
 * Where a tile is drawn, in room pixels for its scroll rate (OP-156). A tile scrolling at `rate` lines
 * up with the room when the camera is centred on the tile's own screen and drifts from there by
 * (1 - rate) of the camera's move: a far layer lags and a near one leads. A far layer is drawn larger
 * about its screen's centre (TILE_GROW) so its edge never comes into view while it lags. `view` is the
 * camera's size in screen pixels: Phaser zooms about the view's middle, so a camera centred on a point
 * scrolls to that point less half the view, whatever its zoom.
 */
export function tilePlacement(t: RoomTile, view: { w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const rate = t.rate ?? 1;
  const grow = 1 + Math.max(0, 1 - rate) * TILE_GROW;
  const w = ROOM_W * grow;
  const h = ROOM_H * grow;
  const cx = t.x + ROOM_W / 2;
  const cy = t.y + ROOM_H / 2;
  return { x: cx - w / 2 - (1 - rate) * (cx - view.w / 2), y: cy - h / 2 - (1 - rate) * (cy - view.h / 2), w, h };
}

export function findSpawn(room: RoomDef, name: string | undefined): Vec2 {
  const key = name ?? 'default';
  return (Object.hasOwn(room.spawns, key) ? room.spawns[key] : undefined) ?? room.spawns['default'] ?? { x: room.size.w / 2, y: room.size.h / 2 };
}
