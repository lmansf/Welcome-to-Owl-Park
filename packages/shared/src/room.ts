import type { RoomCourse } from './course';
import type { Polygon, Rect } from './geometry';
import type { Perch, Raised } from './perches';
import type { Vec2 } from './protocol';
import type { Updraft } from './updraft';
import type { WindCurrent } from './wind';
import type { BrushStone } from './brush';
import type { NeonSign } from './circuit';
import type { EdgePlacement } from './edges';

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
   * whatever else it covers is drawn in front too. A `raised` one is drawn only over owls standing on
   * a ledge (or in the air off one): the floor passes in front of it, as it does a stair's banister,
   * which a climbing owl is behind and an owl walking by on the floor is in front of.
   */
  fronts?: Array<{ id: string; poly: Polygon; raised?: boolean }>;
  /**
   * In a room seen from the side (OP-173): shapes of the playfield shaded darker by `alpha` (0 to 1),
   * painted glows that do nothing (a closed gate's lit doors, a lit window), so they do not read as
   * things to use.
   */
  shades?: Array<{ id: string; poly: Polygon; alpha: number }>;
  /**
   * In a level of the tree (OP-156): its placed spots, each of its level's named spots (TREE_SPOTS,
   * treeSpots.ts) at the point of the playfield where its thing stands, in whole room pixels: a door's
   * or a stair's threshold middle on the walking surface, an idol's, a booth's or a guardian's base
   * centre. A keeper places them with the ledge painter and `pnpm masks:pull` prints them to paste
   * here. The game does not read them yet: each level's own ticket wires its doors, booth, idols and
   * the rest from them. (Not `spots`, the finds' hiding spots.)
   *
   * TODO-DOCS (OP-156): docs/ARCHITECTURE.md's rooms table gains `places` (docs/MAP.md sections 4 and
   * 9 describe the named spots and the painter's Spot tool).
   */
  places?: Array<{ id: string; at: Vec2 }>;
  /** Named spawn points; `default` is required. */
  spawns: Record<string, Vec2>;
  /**
   * In a room seen from the side, the height a spawn stands at when it is up on a perch (a landing of
   * the hollow hall, by its doorway): an owl that comes in there stands on that perch. Absent, the floor.
   */
  spawnTops?: Record<string, number>;
  /**
   * Doorways and interaction spots. Walking into a door with `to` changes room; a closed door
   * shows its sign; `shop` and `idol` are spots that offer the gift shop and the Realm Vote.
   * What a spot does is the client's `interactions` table in RoomScene: standing in one shows
   * its button, and E runs it.
   */
  doors: DoorDef[];
  /**
   * Hiding spots where a visitor's collectible finds can appear (only the finder sees them).
   * Each is on the floor, at least 60 px from every doorway and spot, and reachable by a straight
   * walk from the default spawn that never crosses an exit; or up on a perch single jumps reach
   * (a tier 1 perch, routes.ts), with that perch's `top` (OP-084), so a quest never asks for more
   * than a jump (unit-tested in rooms.test.ts).
   */
  spots?: Array<Vec2 & Raised>;
  /**
   * In a room seen from above (OP-276): set pieces the game draws over the painting, each from the art
   * kit by its key (a realm slot such as kit-glass-quest-post), standing with its foot at (x, y) and
   * sorted with the owls by that foot; `flip` mirrors it. A realm's start screen draws its quest post,
   * trading nest and decor this way, so an artist's delivery replaces each without touching the room.
   */
  pieces?: RoomPiece[];
  /**
   * In a room seen from above (edges.ts, Nov 8): pieces that break up its rectangles of texture, each art
   * under its own key: roots and ferns that eat into the floor's edges (cut out of `walkable` by the
   * room's own definition, from the same profile, so what shows is where an owl stops), bark pillars over
   * the seams between two walls, leaf litter over the seams between two floors and a ragged rim along
   * the top. Drawn under the owls and under the floor's edge line.
   */
  edges?: EdgePlacement[];
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
  /**
   * How the room is seen (OP-284): 'side', a 2D platformer (a floor strip, perches, doorways that open
   * on up, both flaps, the camera climbing with the owl), or 'top', walked across from above (floor
   * polygons, doorways walked into). Absent, it follows the park (viewOf): the tree's rooms side, today's
   * park top. Set it where a room is seen otherwise than its park, as Logan's rule asks: communal rooms
   * (the inside of the tree, the entrance, each realm's start, the arcade) top-down, the rest side.
   * Which park a room belongs to (tree share, the walking map, the minimap, stats) stays `map`.
   */
  view?: RoomView;
  /** How big owls are drawn here against today's park (the tree's owl stands a sixth of the screen's height: 1.25). */
  owlScale?: number;
  /**
   * In a room seen from the side (the tree, OP-220): what shuts a way that is not open yet, drawn by the
   * game over the playfield, never painted. Each stands on the floor from `x` to `x + w` with its sign
   * (one of `CLOSED_SIGNS`): one in every closed doorway, under that doorway's own id, and one at the foot
   * of every way that looks like it leads on and does not (a bough's parkour, a roof run): there the
   * floor ends at the barrier or runs on past it, and no ledge stands over it or beyond it. A warm glow
   * behind each says it is shut for now, not for good.
   */
  barriers?: Barrier[];
  /**
   * In a room seen from the side (OP-220): a stairhead the game draws where a stair's doorway stands and
   * the painting shows no stair (a flight going down through the boardwalk), under that doorway's id,
   * on the floor from `x` to `x + w`.
   */
  landings?: Array<{ id: string; x: number; w: number }>;
  /**
   * A room built from the art kit (OP-234) instead of painted screens: seamless textures over its
   * surfaces, shape pieces along its ledges, stairs, doorways and barriers, decals, and backdrop layers
   * per stretch of screens (RoomKit). The kit's backdrops are the room's `backgrounds` and `foregrounds`
   * (kitRoom fills them in), so the tiles' parallax and fades are drawn as for a painted room; the rest
   * is drawn from kitDrawPlan (kit.ts). Without it the room is painted, as before, so rooms move over
   * one at a time.
   *
   * TODO-DOCS (OP-234): docs/ARCHITECTURE.md's rooms table gains `kit`; docs/MAP.md gains the kit's
   * catalogue (KIT_ART, `kit-<group>-<name>`), how a kit room is laid out and the barrier rule.
   */
  kit?: RoomKit;
  /**
   * An act of a parkour course (OP-224, course.ts): which course and which act, and its course pieces
   * (benches, the objective's parts, the lost feathers, shortcuts, the pits an owl falls through and,
   * in the last act, the finish shrine). An owl in such a room holds the dash (dash.ts).
   */
  course?: RoomCourse;
  /** In a room seen from the side: columns of rising air that lift a gliding owl (updraft.ts, OP-226). */
  updrafts?: Updraft[];
  /** In a room seen from the side: sideways currents that carry a gliding owl across a gap (wind.ts, OP-275). */
  winds?: WindCurrent[];
  /**
   * In a room seen from the side: brush stones (brush.ts, OP-235), ledges that paint fading bridges and
   * treads of ink when an owl lands on one. Every stroke they can paint is also one of the room's perches.
   */
  brushStones?: BrushStone[];
  /**
   * In a room seen from the side: neon signs on circuits (circuit.ts), ledges that stand only while they
   * are lit, the two circuits taking turns by park time. Every sign is also one of the room's perches.
   */
  neonSigns?: NeonSign[];
  /** Rain falls across the room (the ink-wash course's act 2): drawn by the page, and why its brush stones' ink fades sooner. */
  weather?: 'rain';
  /**
   * Only a keeper's owl comes in (OP-224: the test course): the room server turns any other owl away at
   * its hello, and a page without a keeper's token (or the local mode in development) goes to the hub.
   * No door of a room visitors walk leads into one.
   */
  keeperOnly?: true;
  /**
   * The realm its idol (the `idol` doorway) takes the Realm Vote for, where that is not the room's own
   * id.
   */
  votesFor?: string;
  /**
   * A room with more than one Realm Vote idol (the Great Hollow, its four Commons in one room): each
   * realm's idol and the doorway in front of it where an owl votes for that realm. A room with one idol
   * has its `idol` doorway instead.
   */
  idols?: Array<{ realm: string; door: string }>;
  /**
   * Drawn by the page in plain shapes, with no painting of its own (OP-224's placeholder rooms): its
   * tiles name no art, nothing is loaded for them, and the scene paints the floor plan instead.
   */
  drawn?: true;
}

/**
 * The art kit's layout of a room (OP-234), in room pixels. Heights (`top`) are over `ground`, as a
 * perch's are; every piece names its art by key (`kit-<group>-<name>`, KIT_ART), and a key with no
 * art yet is drawn as a placeholder in the tree's palette.
 */
/** A set piece of a room seen from above (RoomDef.pieces, OP-276). */
export interface RoomPiece {
  id: string;
  /** Its art: a key of the kit (KIT_ART). */
  key: string;
  /** Where its foot stands (room px): the middle of its bottom edge. */
  x: number;
  y: number;
  flip?: true;
}

export interface RoomKit {
  /** The ground line the kit's heights stand on (room px): the tree's TREE_GROUND. */
  ground: number;
  /** Surfaces filled with a seamless texture (bark, earth, planking), drawn behind everything else, in order. */
  surfaces?: KitSurface[];
  /** Columns drawn from a piece repeated down at the column's width (a trunk, OP-251), after the surfaces. */
  columns?: KitColumn[];
  /** Walkways drawn along a height: the floor's boardwalk is a path with top 0. */
  paths?: KitRun[];
  /** What an owl stands on over the floor: each is the room's perch of the same id (kitPerches), unless `perch: false`. */
  ledges?: KitLedge[];
  /** Rolling ground (OP-238): slopes, crests and dips laid on a profile, each the room's sloped perch of the same id (kitPerches). */
  hills?: KitHill[];
  /** Stairs: ledges drawn as treads on posts instead of as platforms. */
  stairs?: KitStair[];
  /** The piece drawn at each doorway of the room's `doors` (an arch, a stairwell, a portal). */
  doors?: KitDoor[];
  /** Barriers (railings, roots): what says "no way on" at the end of a path or the foot of a ledge an owl cannot reach. */
  barriers?: KitBarrier[];
  /** Placed pieces standing on a height: benches, shelves, signs, lanterns. */
  props?: KitProp[];
  /** Pieces laid over the surfaces where they are placed (moss, a knot, a lantern's glow). */
  decals?: KitDecal[];
  /** Backdrop layers, each one key drawn on a stretch of screens at its scroll rate (the sky, the middle distance, the overlay). */
  backdrops?: KitBackdrop[];
  /** The little scenes its props make (the owner's rule, docs/TREE_STYLE.md section 8): every prop belongs to one. */
  scenes?: KitScene[];
}

/**
 * A little scene of a kit room (the owner's rule, 2026-11-03: "the placement of the items should always
 * tell a story. Otherwise they're just clutter."): props placed together for one reason, close together,
 * with room around the group, so a glance says what happens in that corner. `story` is that reason in
 * one line, which the side-by-side prints under the screen before it ships (OP-252).
 */
export interface KitScene {
  id: string;
  /** What this corner tells, in one line: "A lantern lights the stair down, by the map that shows every arch." */
  story: string;
  /** The ids of the props it groups. */
  props: string[];
  /** The doorways, barriers or ledges it is built around (a sign by the gate it talks about), by id. */
  about?: string[];
}

/** A rectangle of the room filled with a seamless texture, repeated from the room's origin so neighbours line up. */
export interface KitSurface {
  id: string;
  texture: string;
  rect: Rect;
  /** A colour its texture is drawn multiplied by (0xRRGGBB), to sit with a painting's light (a plaza under a dusk painting, plaza.ts). */
  tint?: number;
  /**
   * How far (room px) the painting above runs on over its top, mirrored at the painting's foot and
   * fading out, so the painted floor eases into the texture with no seam (a plaza, plaza.ts).
   */
  skirt?: number;
}

/**
 * A column of the recut kit (OP-251): its middle piece scaled so its art spans x0 to x1 and repeated
 * down, art to art, from y0 to y1 (room y), with a head piece over its top and a foot piece under it
 * at the same scale (a trunk's taper and flare). With edge pieces (OP-259), the left edge, the middle
 * and the right edge together span x0 to x1 at one scale, each repeated down in the same courses.
 */
export interface KitColumn {
  id: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  mid: string;
  /** Its bark edges (OP-259): drawn down the column's sides at the middle's scale, the middle between them. */
  left?: string;
  right?: string;
  head?: string;
  foot?: string;
}

/**
 * Something drawn along a height from x0 to x1 (OP-241): the published kit's run pieces, its left end, its middle repeated across (whole
 * copies, fitted to the run) and its right end, each with its art's top edge at the height an owl stands at; a texture under it `depth`
 * deep; a trim along its front.
 */
export interface KitRun {
  id: string;
  x0: number;
  x1: number;
  top: number;
  /** The piece along the top: what says "stand here". A repeating `…-mid` piece is repeated between the ends; a single platform is drawn across the run, scaled. */
  cap?: string;
  /** End pieces, each at its own size inside the run's ends. */
  left?: string;
  right?: string;
  /** The texture under the top, `depth` deep (repeats both ways). */
  mid?: string;
  /** A piece drawn outside the run's left end and mirrored at its right. */
  slope?: string;
  /** A strip along the front at the foot of the cap's art (a rope, a vine, a stone edge). */
  trim?: string;
  /** How deep the mid is drawn (room px); a path's default runs down to the room's foot, a ledge's is KIT_LEDGE_DEPTH. */
  depth?: number;
  /**
   * A row of the recut kit (OP-251, `kit-cut-plank`): its caps stand for `left` and `right` and its
   * middles of every length for `mids`, where those are not given.
   */
  row?: string;
  /**
   * Middle pieces of several lengths laid art to art between the ends in place of `cap`: an order fixed
   * by the run's id, never the same piece twice running where another fits, stretched together to fill.
   */
  mids?: string[];
  /** Pieces set into the run (a transition, a corner), each with its art's left edge at x; the middles fill around them. */
  joins?: { x: number; piece: string }[];
}

export interface KitLedge extends KitRun {
  /** Drawn but not stood on (no perch): the barrier rule then asks for a barrier at its foot. */
  perch?: false;
  /** The perch is solid (a wall to an owl below its top). */
  solid?: boolean;
}

/** A piece of rolling ground (OP-238): `kit-<material>-<step>`, its art laid on the hill's profile. */
export type KitHillStep = 'slope-gentle-up' | 'slope-gentle-down' | 'slope-steep-up' | 'slope-steep-down' | 'crest' | 'dip';

/**
 * Rolling ground (OP-238): a hill of one material's slope, crest and dip pieces laid left to right
 * from x0 at height top0, each piece KIT_HILL_STEP (320) along, its rise the slope's (gentle 80, one
 * in four; steep 160, one in two; a crest or dip a gentle rise and fall of 40). Its ends meet the floor or a path or ledge
 * at their height. Stood on as the room's sloped perch of the same id (kitPerches).
 */
export interface KitHill {
  id: string;
  /** branch, earth, stone or roots: the published slope pieces' material (OP-240). */
  material: string;
  x0: number;
  top0: number;
  steps: KitHillStep[];
  /** A wall to an owl below it (a hill of earth); a bough's slope is jumped up through. */
  solid?: boolean;
  /** A texture drawn under the pieces, down to the room's foot (a hill's body of earth). */
  mid?: string;
}

export interface KitStair {
  id: string;
  /** The ledges that are its treads, by id. */
  treads: string[];
  /** The tread's strip (repeats across). */
  tread?: string;
  /** The post under each tread, down to the ground (repeats down). */
  post?: string;
}

export interface KitDoor {
  /** The doorway's id in the room's `doors`: the piece stands centred on its rect, its foot at the doorway's `top`. */
  door: string;
  piece: string;
  /** Drawn bigger or smaller than its logical size (1). */
  scale?: number;
}

export interface KitBarrier {
  id: string;
  /** Its box across: a repeating piece is repeated over it, any other drawn across it, its height scaled with its width. */
  x0: number;
  x1: number;
  /** The height its foot (its art's, as measured) stands at. */
  top: number;
  piece: string;
}

export interface KitProp {
  id: string;
  piece: string;
  /** The middle of its foot, and the height that foot (the foot of its art, as measured) stands at. */
  x: number;
  top: number;
  /** Drawn bigger or smaller than its logical size (1). */
  scale?: number;
  flip?: boolean;
  /** Drawn in front of the owls (a lamp post on the path), under the overlay. */
  front?: boolean;
}

export interface KitDecal {
  piece: string;
  /** The decal's middle (room px). */
  x: number;
  y: number;
  /** Drawn bigger or smaller than its logical size (1). */
  scale?: number;
  flip?: boolean;
  alpha?: number;
  front?: boolean;
}

export interface KitBackdrop {
  key: string;
  /** Its scroll rate, as a tile's (0.5 the sky, 0.75 the middle distance, 1 back scenery, 1.2 the overlay). */
  rate: number;
  /** The screens it is drawn on, first and last (0 is the room's west screen). */
  screens: readonly [number, number];
  /**
   * The rows of screens it is drawn on, first and last (0 is the room's top row): a tall room seen
   * from the side has a row for each ROOM_H of its height. Absent, the top row only.
   */
  rows?: readonly [number, number];
  /** As a tile's `fade`, at each screen's edges. */
  fade?: { left?: number; right?: number };
  /** Drawn in front of the owls (the overlay). */
  front?: boolean;
}

/** What a barrier looks like (OP-220): a locked gate, a rope across, a fallen branch, or boards nailed over an arch. */
export type BarrierKind = 'gate' | 'rope' | 'branch' | 'boards';

/** A code-drawn barrier in a room seen from the side (`RoomDef.barriers`). */
export interface Barrier {
  /** The closed doorway's own id where it stands in one, else a name for the way it shuts. */
  id: string;
  kind: BarrierKind;
  /** Where it stands on the floor, from x to x + w (room px). */
  x: number;
  w: number;
  /** The words on its sign: one of the approved phrases (`CLOSED_SIGNS`). */
  sign: string;
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
  /**
   * Drawn as painted (OP-173's six layers): a level's platforms and front props are not quieted with
   * its back scenery, so what an owl stands on and what stands in front of it read at a glance. A
   * tree room's 1x tiles are otherwise drawn a step quieter.
   */
  plain?: boolean;
}

/** The room pixels a tile fades over at each side edge, at most half the tile each (OP-162). */
export function tileFade(t: RoomTile): { left: number; right: number } {
  const clamp = (n: number | undefined): number => Math.max(0, Math.min(ROOM_W / 2, Math.round(n ?? 0)));
  return { left: clamp(t.fade?.left), right: clamp(t.fade?.right) };
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
   * Where the doorway leads an owl walking the new map (map 3, the park laid out as one tree:
   * rooms/index.ts, NEW_MAP) instead of `to`.
   */
  toNew?: { room: string; spawn: string };
  /**
   * Shut to an owl walking the tree (map 2): the doorway leads nowhere there, though today's park
   * (map 1) still takes it. The market's arcade door is one: the tree's arcade is the cave on level 0,
   * reached by the lobby's stair down, so the market's door would drop a tree owl into another level
   * (OP-217).
   */
  closedInTree?: boolean;
  /**
   * In a room seen from the side (the tree), the height over the ground line the doorway stands at:
   * an owl goes through it only standing at that height (within PERCH_SLACK), so one up on a ledge
   * over the doorway walks on past it (OP-162). Without it, height does not matter.
   */
  top?: number;
  /** In a room seen from the side (OP-173): where the doorway's mark (the bright, simple sign of a way through) stands, over its arch. */
  markAt?: Vec2;
  /**
   * A stair of the tree (OP-220): whether it leads up a level or down one. Every level's stair down is
   * at its west (left) end and its stair up at its east (right) end, both taken from the floor, and the
   * doorway's mark shows the way.
   */
  way?: 'up' | 'down';
  /** Public sign wording for closed realms (approved phrases only). */
  closedSign?: string;
  /**
   * Where an open doorway leads, in words a ten year old reads at a glance ("Out to the Party Grove"):
   * written on a small sign at the doorway in a room seen from above, and on its chip at the screen's
   * edge while it is off screen (Logan, Nov 8: he couldn't find the Party Grove in the Great Hollow).
   */
  label?: string;
  /**
   * The sign's words on the new map (3), in place of `label`: for a room of today's park the new map
   * walks too, whose doorway leads elsewhere there (the Party Grove's way back into the Great Hollow).
   */
  labelNew?: string;
  /** Where the doorway's sign stands (room pixels, its top middle); the marker when not given. */
  labelAt?: Vec2;
  /** Where to place a visual hint (sign, glow) for the door. */
  marker?: Vec2;
}

export const ROOM_W = 1600;
export const ROOM_H = 900;
/**
 * The biggest a room may be (four screens wide, five high): positions beyond it are refused. Five
 * high since the hollow hall, one room seen from the side that an owl climbs up the inside of the
 * tree (it was two).
 */
export const ROOM_MAX_W = 6400;
export const ROOM_MAX_H = 4500;

/** The tiles drawn behind the owls, in drawing order. */
export function backgroundTiles(room: RoomDef): RoomTile[] {
  return room.backgrounds ?? [{ key: room.background, x: 0, y: 0 }];
}

/** The tiles drawn in front of the owls, in drawing order (none for a room without overlays). */
export function foregroundTiles(room: RoomDef): RoomTile[] {
  return room.foregrounds ?? (room.foreground ? [{ key: room.foreground, x: 0, y: 0 }] : []);
}

/** The realms whose idols stand in a room: its several idols, else the one its `idol` doorway votes for. */
export function idolRealms(room: Pick<RoomDef, 'id' | 'votesFor' | 'idols'>): string[] {
  return room.idols?.map((i) => i.realm) ?? [room.votesFor ?? room.id];
}

/** The realm a Realm Vote spot (a doorway) votes for, or null for a doorway that is no vote spot. */
export function voteRealmAt(room: Pick<RoomDef, 'id' | 'votesFor' | 'idols'>, doorId: string): string | null {
  if (room.idols) return room.idols.find((i) => i.door === doorId)?.realm ?? null;
  return doorId === 'idol' ? (room.votesFor ?? room.id) : null;
}

/** The park a room belongs to: 1 for today's park, 2 for the tree (OP-128). */
export function mapOf(room: Pick<RoomDef, 'map'>): 1 | 2 {
  return room.map ?? 1;
}

/** How a room is seen (OP-284): from the side, a platformer, or from above. */
export type RoomView = 'side' | 'top';

/** How a room is seen (OP-284): its own `view`, or its park's: the tree's rooms from the side, today's park from above. */
export function viewOf(room: Pick<RoomDef, 'map' | 'view'>): RoomView {
  return room.view ?? (mapOf(room) === 2 ? 'side' : 'top');
}

/** Whether a room is seen from the side (OP-284): a platformer, not walked across from above. */
export function seenFromSide(room: Pick<RoomDef, 'map' | 'view'>): boolean {
  return viewOf(room) === 'side';
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

/** The height an owl comes in at by the spawn `name` (RoomDef.spawnTops): 0 on the floor. */
export function spawnTop(room: Pick<RoomDef, 'spawnTops'>, name: string | undefined): number {
  const key = name ?? 'default';
  return room.spawnTops && Object.hasOwn(room.spawnTops, key) ? room.spawnTops[key]! : 0;
}

export function findSpawn(room: RoomDef, name: string | undefined): Vec2 {
  const key = name ?? 'default';
  return (Object.hasOwn(room.spawns, key) ? room.spawns[key] : undefined) ?? room.spawns['default'] ?? { x: room.size.w / 2, y: room.size.h / 2 };
}
