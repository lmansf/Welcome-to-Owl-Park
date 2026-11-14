/**
 * Art loading. Every piece of art has a key, a logical size in room pixels, and a kind.
 * For each key the loader takes, in order: `<key>.svg` (rasterized at the device's scale),
 * then `<key>@2x.webp` and `<key>@2x.png` when a sharper copy is wanted, then `<key>.webp` and
 * `<key>.png` (painted rooms and the nests' furniture ship as WebP, the rest as PNG), asking only for the files the
 * build ships (PUBLISHED_ART), so each key is one request, with its content's hash. Whatever resolution the file has, the
 * game draws it at the logical size, so artists can hand in SVG, WebP or PNG. Missing or broken
 * files fall back to generated placeholders and never stop the park.
 */
import Phaser from 'phaser';
import { EDGE_ART, FURNITURE, KIT_ART, edgePlaceholder, kitDrawPlan, kitFrames, isArcadeRoom, kitFilesOf, ROOM_H, ROOM_W, backgroundTiles, foregroundTiles, idolRealms, interactablesIn, isNestRoom, kitArtKeys, kitPlaceholder, seenFromSide, type RoomDef, type SpeciesId } from '@owl-park/shared';
import { GAME_ART } from '../arcade/paint';
import type { ParkConfig } from '../config';
import { COURSES, ROOMS, TREE_GROUND, roomFor } from '../rooms';
import { DENSE_SCALE, FLIGHT_LAYERS, OWL_LAYERS, SPECIES_FLIGHT_LAYERS, SPECIES_LAYERS, isFlightLayer, isSpeciesLayer, rasterCandidates, rasterNames, roomScaleCap } from './artFiles';
import { ART_BYTES, PUBLISHED_ART, versioned } from './publishedArt';
import { drawKitOps } from './kitView';
import { loadSvgTexture } from './svgLoader';
import { boxable, paintSizeBox } from './sizeBoxes';
import { fitTrialArt, setTrialBackdropVeil, trialFilesOf, updraftBitsKey } from './skinTrial';
import { allLookKeys } from './artLooks';

export const ART_PATH = 'art/';
export const OWL_W = 200;
export const OWL_H = 240;
/** The wing's canvas (OP-084): one right wing, its root at Owl.ts's WING.root, in owl canvas units. */
export const WING_W = 200;
export const WING_H = 120;

let sizeBoxes = false;

/** Size boxes for this page (`?sizes=1`, sizeBoxes.ts): the map's art is drawn as boxes of its sizes in place of its files. */
export function useSizeBoxes(on: boolean): void {
  sizeBoxes = on;
}

let skin: string | null = null;

/** A skin trial for this page (`?skin=<name>`, skinTrial.ts): the realm slots it has files for draw from them. */
export function useSkinTrial(name: string | null): void {
  skin = name;
  setTrialBackdropVeil(!!name);
}

/** The key whose files a key's art loads from: a skin trial's when this page draws one for it, else kitFilesOf's. */
function filesOf(key: string, published: ReadonlyMap<string, string> = PUBLISHED_ART): string {
  return trialFilesOf(key, skin, published) ?? kitFilesOf(key);
}

/**
 * `arcade`: the arcade's own art, its title signs and its games' paintings. Drawn sharp (a game fills
 * the screen), and never given a placeholder: the arcade draws its neon stand-in for anything missing.
 * `climb`: the stained-glass climb's tower pieces, the same way; the climb draws glass of its own until they come.
 * `kit`: the art kit's textures, shape pieces and backdrops (OP-234, kitArt.ts), each standing in as its
 * placeholder in the tree's palette until its art ships.
 * `edge`: the pieces that shape a room's edges seen from above (edges.ts): roots, ferns, pillars, leaf
 * litter and the rim, each standing in as plain shapes until its art ships.
 */
export type ArtKind = 'room' | 'piece' | 'owl' | 'arcade' | 'climb' | 'texture' | 'layer' | 'kit' | 'edge';

export interface ArtSpec {
  w: number;
  h: number;
  kind: ArtKind;
}

/** Everything the park can draw, with logical sizes. */
export const ART: Record<string, ArtSpec> = {
  hub: { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'hub-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  grove: { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'grove-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  market: { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'market-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  // The street of nests (two screens: `homes-west` at x 0, `homes` at x 1600) and a nest's interior.
  'homes-west': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  homes: { w: ROOM_W, h: ROOM_H, kind: 'room' },
  nest: { w: ROOM_W, h: ROOM_H, kind: 'room' },
  // The arcade's three screens are tiles of its room data (below); these are its title signs over the
  // cabinets, and each game's painted field and pieces at the size the game draws them.
  'arcade-title-hoot-hop': { w: 364, h: 114, kind: 'arcade' },
  'arcade-title-moon-flap': { w: 251, h: 115, kind: 'arcade' },
  'arcade-title-talon-toss': { w: 280, h: 110, kind: 'arcade' },
  ...Object.fromEntries(Object.values(GAME_ART).flatMap((art) => Object.entries(art).map(([key, size]): [string, ArtSpec] => [key, { ...size, kind: 'arcade' }]))),
  // The climb's tower (designs/the-stained-glass-climb.md, Appendix A): a band's sky, its ledges, the balcony on each band line, the cloud cap.
  'climb-sky': { w: 480, h: 900, kind: 'climb' },
  'climb-column': { w: 240, h: 900, kind: 'climb' },
  'climb-ledge-a': { w: 160, h: 40, kind: 'climb' },
  'climb-ledge-b': { w: 240, h: 60, kind: 'climb' },
  'climb-balcony': { w: 480, h: 120, kind: 'climb' },
  'climb-cloud-cap': { w: 480, h: 220, kind: 'climb' },
  // The tree (map 2, OP-128): a screen's three layers, the sky plate, the playfield the owl stands on and
  // the overlay in front of it (OP-157's style frame, level 1's trunk screen). Placeholders until approved.
  'tree-l1-0-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l1-0-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l1-0-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  // Level 1's other screens (OP-162): the closed gate to the west, the market's square and its roof run
  // to the east. Placeholders until the owner picks.
  'tree-l1-w1-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l1-w1-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l1-w1-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l1-e1-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l1-e1-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l1-e1-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l1-e2-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l1-e2-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l1-e2-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  // The middle distance between each screen's sky and playfield, at half the room's size (drawn twice as
  // large): soft and far, and light to load and draw.
  'tree-l1-w1-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l1-0-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l1-e1-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l1-e2-mid': { w: 800, h: 450, kind: 'room' },
  // Level 4, the sky landing (OP-159), in six layers (OP-173): the sky, the middle distance (half size),
  // the back scenery, the platforms and the front props (all three cut from one painting of the screen)
  // and the overlay. Placeholders until the owner approves.
  'tree-l4-0-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l4-0-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l4-0-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l4-0-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l4-0-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l4-0-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l4-e1-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l4-e1-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l4-e1-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l4-e1-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l4-e1-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l4-e1-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  // Level 3, the high branch (OP-160), in the same six layers. Placeholders until the owner approves.
  'tree-l3-0-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l3-0-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l3-0-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l3-0-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l3-0-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l3-0-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l3-e1-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l3-e1-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l3-e1-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l3-e1-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l3-e1-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l3-e1-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l3-e2-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l3-e2-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l3-e2-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l3-e2-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l3-e2-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l3-e2-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  // Level 2, the high branch west (OP-161), in the same six layers. Placeholders until the owner approves.
  'tree-l2-0-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l2-0-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l2-0-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l2-0-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l2-0-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l2-0-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l2-w1-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l2-w1-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l2-w1-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l2-w1-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l2-w1-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l2-w1-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l2-w2-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l2-w2-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l2-w2-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l2-w2-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l2-w2-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l2-w2-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  // Level 5, the canopy (OP-158): the nests street (w2, w1) and the canopy (0 to e3), in the same six layers. Placeholders until the owner approves.
  'tree-l5-w2-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-w2-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l5-w2-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-w2-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-w2-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-w2-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-w1-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-w1-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l5-w1-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-w1-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-w1-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-w1-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-0-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-0-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l5-0-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-0-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-0-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-0-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-e1-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-e1-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l5-e1-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-e1-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-e1-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-e1-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-e2-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-e2-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l5-e2-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-e2-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-e2-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-e2-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-e3-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-e3-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l5-e3-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-e3-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-e3-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l5-e3-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  // Level 0, the cavern (OP-163): the realm challenge stair (w1) and the stair foot (0), in the same six layers. Placeholders until the owner approves.
  'tree-l0-w1-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-w1-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l0-w1-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-w1-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-w1-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-w1-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-0-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-0-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l0-0-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-0-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-0-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-0-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  // The arcade cave (OP-163), its own room l0c, three screens (c0 to c2), in the same six layers. Placeholders until the owner approves.
  'tree-l0-c0-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-c0-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l0-c0-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-c0-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-c0-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-c0-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-c1-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-c1-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l0-c1-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-c1-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-c1-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-c1-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-c2-bg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-c2-mid': { w: 800, h: 450, kind: 'room' },
  'tree-l0-c2-back': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-c2-play': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-c2-front': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'tree-l0-c2-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  guardian: { w: 720, h: 820, kind: 'piece' },
  'robot-owl': { w: 900, h: 900, kind: 'piece' },
  // The stained-glass realm's idol, on the plinth of its west screen.
  'glass-idol': { w: 520, h: 416, kind: 'piece' },
  // The ink garden's idol (OP-402), a snowy owl on the plinth of its first screen.
  'ink-idol': { w: 520, h: 416, kind: 'piece' },
  // Nest furniture (`decor-<id>`), drawn with its bottom centre on its spot in a nest. The wall
  // pieces are the clock, the framed leaf, the window box, the lanterns and the feather mobile.
  'decor-rug': { w: 240, h: 100, kind: 'piece' },
  'decor-armchair': { w: 150, h: 150, kind: 'piece' },
  'decor-bookshelf': { w: 150, h: 230, kind: 'piece' },
  'decor-lamp': { w: 120, h: 210, kind: 'piece' },
  'decor-potted-fern': { w: 130, h: 150, kind: 'piece' },
  'decor-mushroom-stool': { w: 120, h: 100, kind: 'piece' },
  'decor-quilt-bed': { w: 260, h: 170, kind: 'piece' },
  'decor-acorn-bowl': { w: 120, h: 90, kind: 'piece' },
  'decor-teapot-table': { w: 170, h: 140, kind: 'piece' },
  'decor-wall-clock': { w: 100, h: 140, kind: 'piece' },
  'decor-framed-leaf': { w: 110, h: 140, kind: 'piece' },
  'decor-window-box': { w: 180, h: 110, kind: 'piece' },
  'decor-lantern-string': { w: 180, h: 100, kind: 'piece' },
  'decor-moss-rug': { w: 220, h: 100, kind: 'piece' },
  'decor-stump-table': { w: 160, h: 120, kind: 'piece' },
  'decor-feather-mobile': { w: 110, h: 160, kind: 'piece' },
  // Construction blockades in the hub's two closed arches, each carrying its doorway's phrase.
  'blockade-not-yet-fledged': { w: 300, h: 300, kind: 'piece' },
  'blockade-hatching-soon': { w: 300, h: 300, kind: 'piece' },
  'owl-body': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-belly': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-accent': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-face': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-blink': { w: OWL_W, h: OWL_H, kind: 'owl' },
  // Species with their own painted layers (species.ts `art`), loaded when an owl of that kind shows up.
  'owl-barn-body': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-barn-belly': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-barn-accent': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-barn-face': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-barn-blink': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-burrowing-body': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-burrowing-belly': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-burrowing-accent': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-burrowing-face': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-burrowing-blink': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-snowy-body': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-snowy-belly': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-snowy-accent': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-snowy-face': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-snowy-blink': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-screech-body': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-screech-belly': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-screech-accent': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-screech-face': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-screech-blink': { w: OWL_W, h: OWL_H, kind: 'owl' },
  // Flight (OP-084): the owls' wing, one painted right wing in two tintable layers, its feathers in
  // the owl's body colour and its flight feathers in its accent colour. Every owl kind wears it, drawn
  // twice behind the body (the left one mirrored) and turned at the shoulder, so it loads at boot.
  'owl-wing-body': { w: WING_W, h: WING_H, kind: 'owl' },
  'owl-wing-accent': { w: WING_W, h: WING_H, kind: 'owl' },
  // In flight (OP-136) an owl wears its kind's flight body, belly and accent, its folded wings taken
  // away, so the wing above opens alone. Loaded once an owl may fly (loadFlightArt), never at boot.
  'owl-flight-body': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-flight-belly': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-flight-accent': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-barn-flight-body': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-barn-flight-belly': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-barn-flight-accent': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-burrowing-flight-body': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-burrowing-flight-belly': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-burrowing-flight-accent': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-snowy-flight-body': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-snowy-flight-belly': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-snowy-flight-accent': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-screech-flight-body': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-screech-flight-belly': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-screech-flight-accent': { w: OWL_W, h: OWL_H, kind: 'owl' },
  // The art kit (OP-229, tools/art/config/kit.json): seamless 512 x 512 textures the level assembler tiles, and the keyed props cut from its shape sheets.
  'kit-tex-bark': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-inner-wood': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-planks': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-moss': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-leaves': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-rope': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-stone': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-earth': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-roots': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-cloth': { w: 512, h: 512, kind: 'texture' },
  'kit-branch-cap-left': { w: 160, h: 120, kind: 'piece' },
  'kit-branch-mid': { w: 320, h: 120, kind: 'piece' },
  'kit-branch-cap-right': { w: 160, h: 120, kind: 'piece' },
  'kit-branch-thin-cap-left': { w: 160, h: 60, kind: 'piece' },
  'kit-branch-thin-mid': { w: 320, h: 60, kind: 'piece' },
  'kit-branch-thin-cap-right': { w: 160, h: 60, kind: 'piece' },
  'kit-branch-slope-up': { w: 320, h: 200, kind: 'piece' },
  'kit-branch-slope-down': { w: 320, h: 200, kind: 'piece' },
  'kit-branch-stub': { w: 160, h: 120, kind: 'piece' },
  'kit-branch-knob': { w: 160, h: 160, kind: 'piece' },
  'kit-branch-fork': { w: 320, h: 200, kind: 'piece' },
  'kit-branch-wide': { w: 320, h: 160, kind: 'piece' },
  'kit-plank-cap-left': { w: 160, h: 120, kind: 'piece' },
  'kit-plank-mid': { w: 320, h: 120, kind: 'piece' },
  'kit-plank-cap-right': { w: 160, h: 120, kind: 'piece' },
  'kit-plank-thin-cap-left': { w: 160, h: 60, kind: 'piece' },
  'kit-plank-thin-mid': { w: 320, h: 60, kind: 'piece' },
  'kit-plank-thin-cap-right': { w: 160, h: 60, kind: 'piece' },
  'kit-plank-slope-up': { w: 320, h: 200, kind: 'piece' },
  'kit-plank-slope-down': { w: 320, h: 200, kind: 'piece' },
  'kit-plank-single': { w: 160, h: 120, kind: 'piece' },
  'kit-plank-railed-mid': { w: 320, h: 200, kind: 'piece' },
  'kit-plank-bridge-mid': { w: 320, h: 200, kind: 'piece' },
  'kit-plank-end-post': { w: 160, h: 200, kind: 'piece' },
  'kit-stone-cap-left': { w: 160, h: 120, kind: 'piece' },
  'kit-stone-mid': { w: 320, h: 120, kind: 'piece' },
  'kit-stone-cap-right': { w: 160, h: 120, kind: 'piece' },
  'kit-stone-thin-cap-left': { w: 160, h: 60, kind: 'piece' },
  'kit-stone-thin-mid': { w: 320, h: 60, kind: 'piece' },
  'kit-stone-thin-cap-right': { w: 160, h: 60, kind: 'piece' },
  'kit-stone-slope-up': { w: 320, h: 200, kind: 'piece' },
  'kit-stone-slope-down': { w: 320, h: 200, kind: 'piece' },
  'kit-stone-single': { w: 160, h: 120, kind: 'piece' },
  'kit-stone-mossy-mid': { w: 320, h: 200, kind: 'piece' },
  'kit-stone-step': { w: 160, h: 120, kind: 'piece' },
  'kit-stone-ledge-end': { w: 160, h: 200, kind: 'piece' },
  'kit-trim-moss-a': { w: 320, h: 80, kind: 'piece' },
  'kit-trim-moss-b': { w: 320, h: 80, kind: 'piece' },
  'kit-trim-grass': { w: 320, h: 80, kind: 'piece' },
  'kit-trim-moss-hanging': { w: 320, h: 160, kind: 'piece' },
  'kit-trim-leaves': { w: 320, h: 160, kind: 'piece' },
  'kit-trim-roots': { w: 320, h: 160, kind: 'piece' },
  'kit-trim-plank-edge': { w: 320, h: 80, kind: 'piece' },
  'kit-trim-stone-edge': { w: 320, h: 80, kind: 'piece' },
  'kit-trim-bark-edge': { w: 320, h: 80, kind: 'piece' },
  'kit-trim-rope': { w: 320, h: 60, kind: 'piece' },
  'kit-lantern-string-3': { w: 320, h: 160, kind: 'piece' },
  'kit-lantern-string-5': { w: 320, h: 160, kind: 'piece' },
  'kit-stair-wood-right': { w: 400, h: 300, kind: 'piece' },
  'kit-stair-wood-left': { w: 400, h: 300, kind: 'piece' },
  'kit-stair-stone-right': { w: 400, h: 300, kind: 'piece' },
  'kit-stair-stone-left': { w: 400, h: 300, kind: 'piece' },
  'kit-step-wood': { w: 200, h: 100, kind: 'piece' },
  'kit-step-stone': { w: 200, h: 100, kind: 'piece' },
  'kit-stair-spiral': { w: 400, h: 300, kind: 'piece' },
  'kit-ladder-wood': { w: 160, h: 400, kind: 'piece' },
  'kit-ladder-rope': { w: 160, h: 400, kind: 'piece' },
  'kit-stair-rail-right': { w: 400, h: 300, kind: 'piece' },
  'kit-stair-rail-left': { w: 400, h: 300, kind: 'piece' },
  'kit-landing': { w: 400, h: 160, kind: 'piece' },
  'kit-door-round-closed': { w: 240, h: 320, kind: 'piece' },
  'kit-door-round-open': { w: 240, h: 320, kind: 'piece' },
  'kit-door-plank': { w: 240, h: 320, kind: 'piece' },
  'kit-doorway-stone': { w: 240, h: 320, kind: 'piece' },
  'kit-doorway-knothole': { w: 240, h: 320, kind: 'piece' },
  'kit-hatch-down': { w: 240, h: 120, kind: 'piece' },
  'kit-arch-portal-bare': { w: 360, h: 420, kind: 'piece' },
  'kit-arch-portal-boarded': { w: 360, h: 420, kind: 'piece' },
  'kit-arch-portal-open': { w: 360, h: 420, kind: 'piece' },
  'kit-arch-small': { w: 240, h: 280, kind: 'piece' },
  'kit-arch-top': { w: 360, h: 160, kind: 'piece' },
  'kit-arch-pillar': { w: 120, h: 420, kind: 'piece' },
  'kit-gate-locked': { w: 300, h: 240, kind: 'piece' },
  'kit-barrier-rope': { w: 300, h: 240, kind: 'piece' },
  'kit-barrier-branch': { w: 300, h: 240, kind: 'piece' },
  'kit-barrier-boards': { w: 300, h: 320, kind: 'piece' },
  'kit-post-lantern': { w: 120, h: 300, kind: 'piece' },
  'kit-rope-coil': { w: 160, h: 120, kind: 'piece' },
  'kit-fence-section': { w: 300, h: 240, kind: 'piece' },
  'kit-fence-post': { w: 80, h: 240, kind: 'piece' },
  'kit-wall-low-stone': { w: 300, h: 240, kind: 'piece' },
  'kit-hedge': { w: 300, h: 240, kind: 'piece' },
  'kit-log-pile': { w: 300, h: 240, kind: 'piece' },
  'kit-boulder': { w: 300, h: 240, kind: 'piece' },
  'kit-bench-wood': { w: 240, h: 160, kind: 'piece' },
  'kit-bench-stone': { w: 240, h: 160, kind: 'piece' },
  'kit-seat-log': { w: 240, h: 160, kind: 'piece' },
  'kit-stool': { w: 120, h: 120, kind: 'piece' },
  'kit-table-round': { w: 240, h: 160, kind: 'piece' },
  'kit-table-long': { w: 320, h: 160, kind: 'piece' },
  'kit-shelf-goods': { w: 240, h: 300, kind: 'piece' },
  'kit-shelf-empty': { w: 240, h: 300, kind: 'piece' },
  'kit-crate-stack': { w: 240, h: 300, kind: 'piece' },
  'kit-barrel': { w: 160, h: 200, kind: 'piece' },
  'kit-sack-pile': { w: 240, h: 160, kind: 'piece' },
  'kit-shelf-hanging': { w: 240, h: 160, kind: 'piece' },
  'kit-signpost': { w: 160, h: 300, kind: 'piece' },
  'kit-sign-hanging': { w: 240, h: 200, kind: 'piece' },
  'kit-sign-arrow': { w: 240, h: 200, kind: 'piece' },
  'kit-notice-board': { w: 240, h: 300, kind: 'piece' },
  'kit-lamp-post': { w: 160, h: 400, kind: 'piece' },
  'kit-lamp-hook': { w: 160, h: 160, kind: 'piece' },
  'kit-stall-awning': { w: 480, h: 400, kind: 'piece' },
  'kit-stall-counter': { w: 480, h: 240, kind: 'piece' },
  'kit-booth-ticket': { w: 480, h: 400, kind: 'piece' },
  'kit-turnstile': { w: 240, h: 300, kind: 'piece' },
  'kit-stall-roof': { w: 480, h: 200, kind: 'piece' },
  'kit-cart': { w: 480, h: 400, kind: 'piece' },
  // Top-up G2b (OP-240): slopes, crests and dips in four materials, one sheet each, joining the core caps and mids at their edge heights.
  'kit-branch-slope-gentle-up': { w: 320, h: 160, kind: 'piece' },
  'kit-branch-slope-gentle-down': { w: 320, h: 160, kind: 'piece' },
  'kit-branch-slope-steep-up': { w: 320, h: 240, kind: 'piece' },
  'kit-branch-slope-steep-down': { w: 320, h: 240, kind: 'piece' },
  'kit-branch-crest': { w: 320, h: 180, kind: 'piece' },
  'kit-branch-dip': { w: 320, h: 120, kind: 'piece' },
  'kit-earth-slope-gentle-up': { w: 320, h: 160, kind: 'piece' },
  'kit-earth-slope-gentle-down': { w: 320, h: 160, kind: 'piece' },
  'kit-earth-slope-steep-up': { w: 320, h: 240, kind: 'piece' },
  'kit-earth-slope-steep-down': { w: 320, h: 240, kind: 'piece' },
  'kit-earth-crest': { w: 320, h: 180, kind: 'piece' },
  'kit-earth-dip': { w: 320, h: 120, kind: 'piece' },
  'kit-stone-slope-gentle-up': { w: 320, h: 160, kind: 'piece' },
  'kit-stone-slope-gentle-down': { w: 320, h: 160, kind: 'piece' },
  'kit-stone-slope-steep-up': { w: 320, h: 240, kind: 'piece' },
  'kit-stone-slope-steep-down': { w: 320, h: 240, kind: 'piece' },
  'kit-stone-crest': { w: 320, h: 180, kind: 'piece' },
  'kit-stone-dip': { w: 320, h: 120, kind: 'piece' },
  'kit-roots-slope-gentle-up': { w: 320, h: 160, kind: 'piece' },
  'kit-roots-slope-gentle-down': { w: 320, h: 160, kind: 'piece' },
  'kit-roots-slope-steep-up': { w: 320, h: 240, kind: 'piece' },
  'kit-roots-slope-steep-down': { w: 320, h: 240, kind: 'piece' },
  'kit-roots-crest': { w: 320, h: 180, kind: 'piece' },
  'kit-roots-dip': { w: 320, h: 120, kind: 'piece' },
  // The kit's area sets (OP-229): accent textures, props cut from their sheets, and backdrop layers that repeat sideways.
  'kit-tex-entrance-shop-wood': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-entrance-plaza-stone': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-entrance-awning-cloth': { w: 512, h: 512, kind: 'texture' },
  'kit-entrance-shop-shelf-hats': { w: 240, h: 300, kind: 'piece' },
  'kit-entrance-shop-counter-glass': { w: 320, h: 200, kind: 'piece' },
  'kit-entrance-shop-stand': { w: 160, h: 300, kind: 'piece' },
  'kit-entrance-shop-gift-stack': { w: 160, h: 160, kind: 'piece' },
  'kit-entrance-shop-banner-bare': { w: 240, h: 160, kind: 'piece' },
  'kit-entrance-shop-lantern-cluster': { w: 160, h: 240, kind: 'piece' },
  'kit-entrance-ticket-window': { w: 320, h: 300, kind: 'piece' },
  'kit-entrance-turnstile-brass': { w: 240, h: 300, kind: 'piece' },
  'kit-entrance-queue-posts': { w: 320, h: 160, kind: 'piece' },
  'kit-entrance-welcome-mat': { w: 240, h: 80, kind: 'piece' },
  'kit-entrance-easel-blank': { w: 160, h: 300, kind: 'piece' },
  'kit-entrance-planter-tree': { w: 160, h: 300, kind: 'piece' },
  'kit-entrance-plaza-bench': { w: 320, h: 160, kind: 'piece' },
  'kit-entrance-bird-bath': { w: 200, h: 240, kind: 'piece' },
  'kit-entrance-pennant-pole': { w: 120, h: 420, kind: 'piece' },
  'kit-entrance-lantern-garland': { w: 480, h: 160, kind: 'piece' },
  'kit-entrance-map-board': { w: 240, h: 300, kind: 'piece' },
  'kit-entrance-stair-head': { w: 320, h: 240, kind: 'piece' },
  'kit-entrance-sky-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-entrance-sky-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-hero-plaza-far-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-hero-plaza-mid-a': { w: 800, h: 450, kind: 'layer' },
  'kit-hero-l4-far-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-entrance-far-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-entrance-far-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-entrance-mid-a': { w: 800, h: 450, kind: 'layer' },
  'kit-entrance-mid-b': { w: 800, h: 450, kind: 'layer' },
  'kit-entrance-mid-c': { w: 800, h: 450, kind: 'layer' },
  'kit-tex-clearing-fern-floor': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-clearing-hollow-wood': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-clearing-leaf-canopy': { w: 512, h: 512, kind: 'texture' },
  'kit-clearing-idol-pedestal': { w: 240, h: 200, kind: 'piece' },
  'kit-clearing-hammock': { w: 320, h: 160, kind: 'piece' },
  'kit-clearing-hut-small': { w: 320, h: 320, kind: 'piece' },
  'kit-clearing-rope-swing': { w: 160, h: 320, kind: 'piece' },
  'kit-clearing-mushroom-cluster': { w: 160, h: 120, kind: 'piece' },
  'kit-clearing-fern-clump': { w: 200, h: 140, kind: 'piece' },
  'kit-clearing-updraft-vent': { w: 240, h: 160, kind: 'piece' },
  'kit-clearing-trunk-entrance': { w: 320, h: 400, kind: 'piece' },
  'kit-clearing-fungus-shelf': { w: 240, h: 120, kind: 'piece' },
  'kit-clearing-log-bridge': { w: 400, h: 120, kind: 'piece' },
  'kit-clearing-vine-curtain': { w: 240, h: 320, kind: 'piece' },
  'kit-clearing-beehive-lantern': { w: 120, h: 200, kind: 'piece' },
  'kit-clearing-leaf-platform': { w: 320, h: 100, kind: 'piece' },
  'kit-clearing-acorn-cap': { w: 160, h: 160, kind: 'piece' },
  'kit-clearing-bough-end-perch': { w: 240, h: 200, kind: 'piece' },
  'kit-clearing-cocoon-bare': { w: 160, h: 240, kind: 'piece' },
  'kit-clearing-feather-lost': { w: 80, h: 120, kind: 'piece' },
  'kit-clearing-finish-shrine': { w: 320, h: 320, kind: 'piece' },
  'kit-clearing-sky-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-clearing-sky-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-clearing-far-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-clearing-far-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-clearing-mid-a': { w: 800, h: 450, kind: 'layer' },
  'kit-clearing-mid-b': { w: 800, h: 450, kind: 'layer' },
  'kit-clearing-mid-c': { w: 800, h: 450, kind: 'layer' },
  'kit-tex-glass-glass-panes': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-glass-pale-stone': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-glass-lead-lattice': { w: 512, h: 512, kind: 'texture' },
  'kit-glass-idol-pedestal': { w: 240, h: 200, kind: 'piece' },
  'kit-glass-glass-lantern': { w: 120, h: 200, kind: 'piece' },
  'kit-glass-stone-bench': { w: 320, h: 160, kind: 'piece' },
  'kit-glass-rose-window': { w: 240, h: 240, kind: 'piece' },
  'kit-glass-glass-planter': { w: 160, h: 200, kind: 'piece' },
  'kit-glass-kiosk': { w: 320, h: 320, kind: 'piece' },
  'kit-glass-lift-car': { w: 240, h: 320, kind: 'piece' },
  'kit-glass-lift-rail': { w: 80, h: 400, kind: 'piece' },
  'kit-glass-window-arch': { w: 240, h: 320, kind: 'piece' },
  'kit-glass-buttress': { w: 160, h: 400, kind: 'piece' },
  'kit-glass-glass-bridge': { w: 400, h: 120, kind: 'piece' },
  'kit-glass-finial': { w: 120, h: 240, kind: 'piece' },
  'kit-glass-door-glass-closed': { w: 240, h: 320, kind: 'piece' },
  'kit-glass-door-glass-open': { w: 240, h: 320, kind: 'piece' },
  'kit-glass-chandelier': { w: 240, h: 240, kind: 'piece' },
  'kit-glass-feather-lost': { w: 80, h: 120, kind: 'piece' },
  'kit-glass-finish-shrine': { w: 320, h: 320, kind: 'piece' },
  'kit-glass-weathervane': { w: 160, h: 240, kind: 'piece' },
  'kit-glass-sky-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-glass-sky-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-glass-far-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-glass-far-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-glass-mid-a': { w: 800, h: 450, kind: 'layer' },
  'kit-glass-mid-b': { w: 800, h: 450, kind: 'layer' },
  'kit-glass-mid-c': { w: 800, h: 450, kind: 'layer' },
  'kit-tex-neon-neon-brick': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-neon-wet-pavement': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-neon-corrugated-tin': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-neon-lit-wall': { w: 512, h: 512, kind: 'texture' },
  'kit-neon-idol-pedestal': { w: 240, h: 200, kind: 'piece' },
  'kit-neon-noodle-stall': { w: 320, h: 320, kind: 'piece' },
  'kit-neon-paper-lantern-string': { w: 400, h: 120, kind: 'piece' },
  'kit-neon-vending-machine': { w: 160, h: 280, kind: 'piece' },
  'kit-neon-neon-arrow-sign': { w: 240, h: 160, kind: 'piece' },
  'kit-neon-robot-plinth': { w: 320, h: 160, kind: 'piece' },
  'kit-neon-sign-platform': { w: 400, h: 120, kind: 'piece' },
  'kit-neon-water-tank': { w: 240, h: 320, kind: 'piece' },
  'kit-neon-air-unit': { w: 240, h: 160, kind: 'piece' },
  'kit-neon-antenna-mast': { w: 120, h: 400, kind: 'piece' },
  'kit-neon-fire-escape': { w: 240, h: 400, kind: 'piece' },
  'kit-neon-rooftop-ledge': { w: 400, h: 120, kind: 'piece' },
  'kit-neon-billboard-blank': { w: 400, h: 240, kind: 'piece' },
  'kit-neon-satellite-dish': { w: 160, h: 160, kind: 'piece' },
  'kit-neon-chimney-stack': { w: 160, h: 280, kind: 'piece' },
  'kit-neon-skylight': { w: 240, h: 120, kind: 'piece' },
  'kit-neon-feather-lost': { w: 80, h: 120, kind: 'piece' },
  'kit-neon-finish-shrine': { w: 320, h: 320, kind: 'piece' },
  'kit-neon-sky-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-neon-sky-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-neon-far-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-neon-far-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-neon-mid-a': { w: 800, h: 450, kind: 'layer' },
  'kit-neon-mid-b': { w: 800, h: 450, kind: 'layer' },
  'kit-neon-mid-c': { w: 800, h: 450, kind: 'layer' },
  'kit-tex-ink-paper-grain': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-ink-ink-stone': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-ink-woven-reed': { w: 512, h: 512, kind: 'texture' },
  'kit-ink-idol-pedestal': { w: 240, h: 200, kind: 'piece' },
  'kit-ink-paper-lantern': { w: 120, h: 200, kind: 'piece' },
  'kit-ink-tea-stall': { w: 320, h: 320, kind: 'piece' },
  'kit-ink-scroll-stand': { w: 160, h: 280, kind: 'piece' },
  'kit-ink-ink-bench': { w: 320, h: 160, kind: 'piece' },
  'kit-ink-stone-lantern': { w: 160, h: 240, kind: 'piece' },
  'kit-ink-brush-stone': { w: 160, h: 120, kind: 'piece' },
  'kit-ink-paper-cliff': { w: 320, h: 400, kind: 'piece' },
  'kit-ink-reed-tuft': { w: 120, h: 200, kind: 'piece' },
  'kit-ink-bamboo-span': { w: 400, h: 120, kind: 'piece' },
  'kit-ink-temple-eave': { w: 400, h: 200, kind: 'piece' },
  'kit-ink-rock-pillar': { w: 160, h: 320, kind: 'piece' },
  'kit-ink-moon-gate': { w: 320, h: 320, kind: 'piece' },
  'kit-ink-easel-blank': { w: 200, h: 280, kind: 'piece' },
  'kit-ink-ferry-raft': { w: 400, h: 160, kind: 'piece' },
  'kit-ink-pine-bough': { w: 240, h: 200, kind: 'piece' },
  'kit-ink-feather-lost': { w: 80, h: 120, kind: 'piece' },
  'kit-ink-finish-shrine': { w: 320, h: 320, kind: 'piece' },
  'kit-ink-sky-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-ink-sky-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-ink-far-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-ink-far-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-ink-mid-a': { w: 800, h: 450, kind: 'layer' },
  'kit-ink-mid-b': { w: 800, h: 450, kind: 'layer' },
  'kit-ink-mid-c': { w: 800, h: 450, kind: 'layer' },
  'kit-clearing-thorn-roots': { w: 400, h: 120, kind: 'piece' },
  'kit-clearing-bramble-patch': { w: 320, h: 160, kind: 'piece' },
  'kit-clearing-vine-shortcut': { w: 120, h: 400, kind: 'piece' },
  'kit-clearing-log-shortcut': { w: 400, h: 200, kind: 'piece' },
  'kit-clearing-bough-perch': { w: 320, h: 120, kind: 'piece' },
  'kit-clearing-gust-leaves': { w: 240, h: 320, kind: 'piece' },
  'kit-clearing-checkpoint-bench': { w: 320, h: 160, kind: 'piece' },
  'kit-clearing-hut-door-closed': { w: 240, h: 320, kind: 'piece' },
  'kit-clearing-hut-door-open': { w: 240, h: 320, kind: 'piece' },
  'kit-clearing-deck-rail': { w: 400, h: 120, kind: 'piece' },
  'kit-clearing-fern-tall': { w: 160, h: 240, kind: 'piece' },
  'kit-clearing-root-shelf': { w: 320, h: 120, kind: 'piece' },
  'kit-neon-neon-tube-hazard': { w: 80, h: 240, kind: 'piece' },
  'kit-neon-rooftop-door-closed': { w: 240, h: 320, kind: 'piece' },
  'kit-neon-rooftop-door-open': { w: 240, h: 320, kind: 'piece' },
  'kit-neon-checkpoint-bench': { w: 320, h: 160, kind: 'piece' },
  'kit-neon-cable-span': { w: 400, h: 80, kind: 'piece' },
  'kit-neon-rooftop-garden': { w: 320, h: 160, kind: 'piece' },
  'kit-neon-tank-ladder': { w: 120, h: 400, kind: 'piece' },
  'kit-neon-sign-hazard': { w: 240, h: 160, kind: 'piece' },
  'kit-neon-pigeon-coop': { w: 240, h: 200, kind: 'piece' },
  'kit-neon-rooftop-tent': { w: 320, h: 240, kind: 'piece' },
  'kit-neon-sky-bridge-mid': { w: 400, h: 120, kind: 'piece' },
  'kit-neon-rooftop-stair': { w: 240, h: 320, kind: 'piece' },
  'kit-glass-glass-rung': { w: 160, h: 80, kind: 'piece' },
  'kit-glass-frail-glass-mid': { w: 400, h: 80, kind: 'piece' },
  'kit-glass-thorn-bed': { w: 400, h: 120, kind: 'piece' },
  'kit-glass-moth-lantern': { w: 160, h: 240, kind: 'piece' },
  'kit-glass-band-ledge': { w: 400, h: 120, kind: 'piece' },
  'kit-glass-cloud-ledge': { w: 320, h: 120, kind: 'piece' },
  'kit-glass-door-pane-closed': { w: 240, h: 320, kind: 'piece' },
  'kit-glass-door-pane-open': { w: 240, h: 320, kind: 'piece' },
  'kit-glass-checkpoint-bench': { w: 320, h: 160, kind: 'piece' },
  'kit-glass-thorn-ceiling': { w: 400, h: 120, kind: 'piece' },
  'kit-glass-act-arch': { w: 320, h: 400, kind: 'piece' },
  'kit-glass-strand-rail': { w: 120, h: 400, kind: 'piece' },
  'kit-ink-bridge-stroke': { w: 400, h: 80, kind: 'piece' },
  'kit-ink-tread-stroke': { w: 160, h: 60, kind: 'piece' },
  'kit-ink-seal-red': { w: 120, h: 120, kind: 'piece' },
  'kit-ink-bamboo-tall': { w: 120, h: 400, kind: 'piece' },
  'kit-ink-eave-shelter': { w: 400, h: 160, kind: 'piece' },
  'kit-ink-waterfall-curtain': { w: 240, h: 400, kind: 'piece' },
  'kit-ink-door-paper-closed': { w: 240, h: 320, kind: 'piece' },
  'kit-ink-door-paper-open': { w: 240, h: 320, kind: 'piece' },
  'kit-ink-checkpoint-bench': { w: 320, h: 160, kind: 'piece' },
  'kit-ink-lotus-pads': { w: 320, h: 120, kind: 'piece' },
  'kit-ink-crane-perch': { w: 120, h: 400, kind: 'piece' },
  'kit-ink-pond-edge': { w: 400, h: 120, kind: 'piece' },
  'kit-landmark-idol-owl-wood': { w: 320, h: 400, kind: 'piece' },
  'kit-landmark-hut-lookout': { w: 400, h: 400, kind: 'piece' },
  'kit-landmark-door-root-tiny': { w: 160, h: 240, kind: 'piece' },
  'kit-landmark-cabinet-miniature': { w: 160, h: 240, kind: 'piece' },
  'kit-landmark-bell-hanging': { w: 120, h: 160, kind: 'piece' },
  'kit-landmark-telescope-brass': { w: 160, h: 200, kind: 'piece' },
  'kit-landmark-idol-owl-glass': { w: 320, h: 400, kind: 'piece' },
  'kit-landmark-lamp-moth': { w: 120, h: 120, kind: 'piece' },
  'kit-landmark-pane-cracked': { w: 240, h: 320, kind: 'piece' },
  'kit-landmark-lever-brass': { w: 120, h: 160, kind: 'piece' },
  'kit-landmark-switch-lift': { w: 120, h: 160, kind: 'piece' },
  'kit-landmark-idol-owl-neon': { w: 320, h: 400, kind: 'piece' },
  'kit-landmark-robot-owl': { w: 320, h: 400, kind: 'piece' },
  'kit-landmark-arcade-door': { w: 240, h: 320, kind: 'piece' },
  'kit-landmark-copy-stage': { w: 240, h: 120, kind: 'piece' },
  'kit-landmark-idol-owl-ink': { w: 320, h: 400, kind: 'piece' },
  'kit-landmark-crane-paper': { w: 240, h: 320, kind: 'piece' },
  'kit-landmark-heron-ink': { w: 200, h: 280, kind: 'piece' },
  'kit-landmark-scroll-tower': { w: 240, h: 400, kind: 'piece' },
  'kit-landmark-pavilion-summit': { w: 400, h: 400, kind: 'piece' },
  // The Great Hollow's way into the ink garden (OP-402).
  'kit-landmark-door-ink': { w: 240, h: 320, kind: 'piece' },
  'kit-cut-plank-cap-left': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-plank-cap-right': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-plank-mid-320': { w: 320, h: 120, kind: 'piece' },
  'kit-cut-plank-mid-480': { w: 480, h: 120, kind: 'piece' },
  'kit-cut-plank-mid-640': { w: 640, h: 120, kind: 'piece' },
  'kit-cut-plank-thin-cap-left': { w: 160, h: 60, kind: 'piece' },
  'kit-cut-plank-thin-cap-right': { w: 160, h: 60, kind: 'piece' },
  'kit-cut-plank-thin-mid-320': { w: 320, h: 60, kind: 'piece' },
  'kit-cut-plank-thin-mid-480': { w: 480, h: 60, kind: 'piece' },
  'kit-cut-plank-thin-mid-640': { w: 640, h: 60, kind: 'piece' },
  'kit-cut-plank-rail-cap-left': { w: 160, h: 200, kind: 'piece' },
  'kit-cut-plank-rail-cap-right': { w: 160, h: 200, kind: 'piece' },
  'kit-cut-plank-rail-mid-320': { w: 320, h: 200, kind: 'piece' },
  'kit-cut-plank-rail-mid-480': { w: 480, h: 200, kind: 'piece' },
  'kit-cut-plank-rail-mid-640': { w: 640, h: 200, kind: 'piece' },
  'kit-cut-branch-cap-left': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-branch-cap-right': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-branch-mid-320': { w: 320, h: 120, kind: 'piece' },
  'kit-cut-branch-mid-480': { w: 480, h: 120, kind: 'piece' },
  'kit-cut-branch-mid-640': { w: 640, h: 120, kind: 'piece' },
  'kit-cut-branch-thin-cap-left': { w: 160, h: 60, kind: 'piece' },
  'kit-cut-branch-thin-cap-right': { w: 160, h: 60, kind: 'piece' },
  'kit-cut-branch-thin-mid-320': { w: 320, h: 60, kind: 'piece' },
  'kit-cut-branch-thin-mid-480': { w: 480, h: 60, kind: 'piece' },
  'kit-cut-branch-thin-mid-640': { w: 640, h: 60, kind: 'piece' },
  'kit-cut-branch-mossy-cap-left': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-branch-mossy-cap-right': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-branch-mossy-mid-320': { w: 320, h: 120, kind: 'piece' },
  'kit-cut-branch-mossy-mid-480': { w: 480, h: 120, kind: 'piece' },
  'kit-cut-branch-mossy-mid-640': { w: 640, h: 120, kind: 'piece' },
  'kit-cut-stone-cap-left': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-stone-cap-right': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-stone-mid-320': { w: 320, h: 120, kind: 'piece' },
  'kit-cut-stone-mid-480': { w: 480, h: 120, kind: 'piece' },
  'kit-cut-stone-mid-640': { w: 640, h: 120, kind: 'piece' },
  'kit-cut-stone-thin-cap-left': { w: 160, h: 60, kind: 'piece' },
  'kit-cut-stone-thin-cap-right': { w: 160, h: 60, kind: 'piece' },
  'kit-cut-stone-thin-mid-320': { w: 320, h: 60, kind: 'piece' },
  'kit-cut-stone-thin-mid-480': { w: 480, h: 60, kind: 'piece' },
  'kit-cut-stone-thin-mid-640': { w: 640, h: 60, kind: 'piece' },
  'kit-cut-stone-mossy-cap-left': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-stone-mossy-cap-right': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-stone-mossy-mid-320': { w: 320, h: 120, kind: 'piece' },
  'kit-cut-stone-mossy-mid-480': { w: 480, h: 120, kind: 'piece' },
  'kit-cut-stone-mossy-mid-640': { w: 640, h: 120, kind: 'piece' },
  // The neon and ink realms' own rows (OP-348): a deck, its thin row and a pipe; a bank of washed rock, its thin row and a plank.
  'kit-cut-neon-deck-cap-left': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-neon-deck-cap-right': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-neon-deck-mid-320': { w: 320, h: 120, kind: 'piece' },
  'kit-cut-neon-deck-mid-480': { w: 480, h: 120, kind: 'piece' },
  'kit-cut-neon-deck-mid-640': { w: 640, h: 120, kind: 'piece' },
  'kit-cut-neon-deck-thin-cap-left': { w: 160, h: 60, kind: 'piece' },
  'kit-cut-neon-deck-thin-cap-right': { w: 160, h: 60, kind: 'piece' },
  'kit-cut-neon-deck-thin-mid-320': { w: 320, h: 60, kind: 'piece' },
  'kit-cut-neon-deck-thin-mid-480': { w: 480, h: 60, kind: 'piece' },
  'kit-cut-neon-deck-thin-mid-640': { w: 640, h: 60, kind: 'piece' },
  'kit-cut-neon-pipe-cap-left': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-neon-pipe-cap-right': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-neon-pipe-mid-320': { w: 320, h: 120, kind: 'piece' },
  'kit-cut-neon-pipe-mid-480': { w: 480, h: 120, kind: 'piece' },
  'kit-cut-neon-pipe-mid-640': { w: 640, h: 120, kind: 'piece' },
  'kit-cut-ink-bank-cap-left': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-ink-bank-cap-right': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-ink-bank-mid-320': { w: 320, h: 120, kind: 'piece' },
  'kit-cut-ink-bank-mid-480': { w: 480, h: 120, kind: 'piece' },
  'kit-cut-ink-bank-mid-640': { w: 640, h: 120, kind: 'piece' },
  'kit-cut-ink-bank-thin-cap-left': { w: 160, h: 60, kind: 'piece' },
  'kit-cut-ink-bank-thin-cap-right': { w: 160, h: 60, kind: 'piece' },
  'kit-cut-ink-bank-thin-mid-320': { w: 320, h: 60, kind: 'piece' },
  'kit-cut-ink-bank-thin-mid-480': { w: 480, h: 60, kind: 'piece' },
  'kit-cut-ink-bank-thin-mid-640': { w: 640, h: 60, kind: 'piece' },
  'kit-cut-ink-plank-cap-left': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-ink-plank-cap-right': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-ink-plank-mid-320': { w: 320, h: 120, kind: 'piece' },
  'kit-cut-ink-plank-mid-480': { w: 480, h: 120, kind: 'piece' },
  'kit-cut-ink-plank-mid-640': { w: 640, h: 120, kind: 'piece' },
  'kit-puzzle-lock-closed': { w: 64, h: 112, kind: 'piece' },
  'kit-puzzle-lock-open': { w: 64, h: 112, kind: 'piece' },
  'kit-puzzle-carving': { w: 64, h: 64, kind: 'piece' },
  'kit-puzzle-key': { w: 48, h: 48, kind: 'piece' },
  'kit-puzzle-symbol-moon': { w: 64, h: 64, kind: 'piece' },
  'kit-puzzle-symbol-leaf': { w: 64, h: 64, kind: 'piece' },
  'kit-puzzle-symbol-feather': { w: 64, h: 64, kind: 'piece' },
  'kit-puzzle-symbol-acorn': { w: 64, h: 64, kind: 'piece' },
  'kit-puzzle-symbol-star': { w: 64, h: 64, kind: 'piece' },
  'kit-puzzle-symbol-mushroom': { w: 64, h: 64, kind: 'piece' },
  'item-painted-egg': { w: 90, h: 90, kind: 'piece' },
  'item-painted-egg-crack-light': { w: 90, h: 90, kind: 'piece' },
  'item-painted-egg-crack-heavy': { w: 90, h: 90, kind: 'piece' },
  'item-painted-egg-hatch-1': { w: 90, h: 90, kind: 'piece' },
  'item-painted-egg-hatch-2': { w: 90, h: 90, kind: 'piece' },
  'item-painted-egg-hatch-3': { w: 90, h: 90, kind: 'piece' },
  'item-rainbow-bunny': { w: 90, h: 90, kind: 'piece' },
  'item-rainbow-bunny-hop': { w: 90, h: 90, kind: 'piece' },
  'kit-cut-earth-cap-left': { w: 160, h: 200, kind: 'piece' },
  'kit-cut-earth-cap-right': { w: 160, h: 200, kind: 'piece' },
  'kit-cut-earth-mid-320': { w: 320, h: 200, kind: 'piece' },
  'kit-cut-earth-mid-480': { w: 480, h: 200, kind: 'piece' },
  'kit-cut-earth-mid-640': { w: 640, h: 200, kind: 'piece' },
  'kit-cut-earth-thin-cap-left': { w: 160, h: 60, kind: 'piece' },
  'kit-cut-earth-thin-cap-right': { w: 160, h: 60, kind: 'piece' },
  'kit-cut-earth-thin-mid-320': { w: 320, h: 60, kind: 'piece' },
  'kit-cut-earth-thin-mid-480': { w: 480, h: 60, kind: 'piece' },
  'kit-cut-earth-thin-mid-640': { w: 640, h: 60, kind: 'piece' },
  'kit-cut-earth-path-cap-left': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-earth-path-cap-right': { w: 160, h: 120, kind: 'piece' },
  'kit-cut-earth-path-mid-320': { w: 320, h: 120, kind: 'piece' },
  'kit-cut-earth-path-mid-480': { w: 480, h: 120, kind: 'piece' },
  'kit-cut-earth-path-mid-640': { w: 640, h: 120, kind: 'piece' },
  'kit-cut-plank-corner-in': { w: 160, h: 160, kind: 'piece' },
  'kit-cut-plank-corner-out': { w: 160, h: 160, kind: 'piece' },
  'kit-cut-plank-to-earth': { w: 320, h: 120, kind: 'piece' },
  'kit-cut-plank-to-stone': { w: 320, h: 120, kind: 'piece' },
  'kit-cut-plank-slope-join-up': { w: 320, h: 200, kind: 'piece' },
  'kit-cut-plank-slope-join-down': { w: 320, h: 200, kind: 'piece' },
  'kit-cut-branch-corner-in': { w: 160, h: 160, kind: 'piece' },
  'kit-cut-branch-corner-out': { w: 160, h: 160, kind: 'piece' },
  'kit-cut-branch-to-plank': { w: 320, h: 120, kind: 'piece' },
  'kit-cut-branch-to-earth': { w: 320, h: 120, kind: 'piece' },
  'kit-cut-branch-slope-join-up': { w: 320, h: 200, kind: 'piece' },
  'kit-cut-branch-slope-join-down': { w: 320, h: 200, kind: 'piece' },
  'kit-cut-stone-corner-in': { w: 160, h: 160, kind: 'piece' },
  'kit-cut-stone-corner-out': { w: 160, h: 160, kind: 'piece' },
  'kit-cut-stone-to-earth': { w: 320, h: 120, kind: 'piece' },
  'kit-cut-earth-corner-in': { w: 160, h: 160, kind: 'piece' },
  'kit-cut-earth-corner-out': { w: 160, h: 160, kind: 'piece' },
  'kit-cut-earth-slope-join': { w: 320, h: 200, kind: 'piece' },
  'kit-cut-trunk-edge-left': { w: 160, h: 400, kind: 'piece' },
  'kit-cut-trunk-edge-right': { w: 160, h: 400, kind: 'piece' },
  'kit-cut-trunk-mid': { w: 320, h: 400, kind: 'piece' },
  'kit-cut-trunk-taper': { w: 320, h: 320, kind: 'piece' },
  'kit-cut-trunk-flare': { w: 400, h: 240, kind: 'piece' },
  'kit-cut-trunk-knothole-frame': { w: 240, h: 320, kind: 'piece' },
  'kit-cut-bough-edge-left': { w: 240, h: 160, kind: 'piece' },
  'kit-cut-bough-edge-right': { w: 240, h: 160, kind: 'piece' },
  'kit-cut-bough-mid': { w: 320, h: 160, kind: 'piece' },
  'kit-cut-bough-taper': { w: 320, h: 160, kind: 'piece' },
  'kit-cut-bough-flare': { w: 320, h: 200, kind: 'piece' },
  'kit-cut-bough-fork': { w: 320, h: 240, kind: 'piece' },
  'kit-tex-under-packed-earth': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-under-root-mat': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-under-cave-stone': { w: 512, h: 512, kind: 'texture' },
  'kit-under-lantern-post': { w: 120, h: 320, kind: 'piece' },
  'kit-under-root-arch': { w: 320, h: 320, kind: 'piece' },
  'kit-under-stair-root-right': { w: 240, h: 240, kind: 'piece' },
  'kit-under-stair-root-left': { w: 240, h: 240, kind: 'piece' },
  'kit-under-root-ledge-mid': { w: 400, h: 120, kind: 'piece' },
  'kit-under-boulder-flat': { w: 240, h: 160, kind: 'piece' },
  'kit-under-root-hang': { w: 160, h: 400, kind: 'piece' },
  'kit-under-stone-pile': { w: 240, h: 160, kind: 'piece' },
  'kit-under-root-knot': { w: 200, h: 200, kind: 'piece' },
  'kit-under-sign-root': { w: 240, h: 200, kind: 'piece' },
  'kit-under-barrier-roots': { w: 320, h: 320, kind: 'piece' },
  'kit-under-lantern-hang': { w: 120, h: 200, kind: 'piece' },
  'kit-under-root-buttress-left': { w: 320, h: 400, kind: 'piece' },
  'kit-under-root-buttress-right': { w: 320, h: 400, kind: 'piece' },
  'kit-under-mushroom-cluster': { w: 160, h: 120, kind: 'piece' },
  'kit-under-stone-pillar': { w: 120, h: 400, kind: 'piece' },
  'kit-under-stalactites': { w: 240, h: 200, kind: 'piece' },
  'kit-under-earth-mound': { w: 320, h: 160, kind: 'piece' },
  'kit-under-sky-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-under-sky-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-under-far-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-under-far-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-under-mid-a': { w: 800, h: 450, kind: 'layer' },
  'kit-under-mid-b': { w: 800, h: 450, kind: 'layer' },
  'kit-under-mid-c': { w: 800, h: 450, kind: 'layer' },
  'kit-tex-ground-forest-floor': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-ground-cobble-path': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-ground-fern-fronds': { w: 512, h: 512, kind: 'texture' },
  'kit-ground-gate-post': { w: 160, h: 400, kind: 'piece' },
  'kit-ground-lantern-post': { w: 120, h: 400, kind: 'piece' },
  'kit-ground-gate-arch': { w: 400, h: 320, kind: 'piece' },
  'kit-ground-stone-step': { w: 240, h: 120, kind: 'piece' },
  'kit-ground-bench': { w: 320, h: 160, kind: 'piece' },
  'kit-ground-rope-barrier': { w: 320, h: 200, kind: 'piece' },
  'kit-ground-market-stall': { w: 400, h: 320, kind: 'piece' },
  'kit-ground-sign-board': { w: 160, h: 240, kind: 'piece' },
  'kit-ground-lantern-garland': { w: 400, h: 120, kind: 'piece' },
  'kit-ground-crate-stack': { w: 160, h: 200, kind: 'piece' },
  'kit-ground-hand-cart': { w: 240, h: 200, kind: 'piece' },
  'kit-ground-water-barrel': { w: 120, h: 160, kind: 'piece' },
  'kit-ground-fallen-branch': { w: 400, h: 160, kind: 'piece' },
  'kit-ground-fern-clump': { w: 160, h: 120, kind: 'piece' },
  'kit-ground-mossy-boulder': { w: 240, h: 160, kind: 'piece' },
  'kit-ground-stepping-stones': { w: 400, h: 80, kind: 'piece' },
  'kit-ground-tree-stump': { w: 200, h: 160, kind: 'piece' },
  'kit-ground-roof-ridge': { w: 400, h: 120, kind: 'piece' },
  'kit-ground-sky-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-ground-sky-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-ground-far-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-ground-far-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-ground-mid-a': { w: 800, h: 450, kind: 'layer' },
  'kit-ground-mid-b': { w: 800, h: 450, kind: 'layer' },
  'kit-ground-mid-c': { w: 800, h: 450, kind: 'layer' },
  'kit-tex-low-bough-bark': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-low-walkway-planks': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-low-lichen-moss': { w: 512, h: 512, kind: 'texture' },
  'kit-low-walkway-mid': { w: 400, h: 120, kind: 'piece' },
  'kit-low-walkway-cap-left': { w: 240, h: 120, kind: 'piece' },
  'kit-low-walkway-cap-right': { w: 240, h: 120, kind: 'piece' },
  'kit-low-rope-rail-mid': { w: 400, h: 120, kind: 'piece' },
  'kit-low-rope-rail-post': { w: 80, h: 160, kind: 'piece' },
  'kit-low-branch-lantern': { w: 160, h: 240, kind: 'piece' },
  'kit-low-bark-ledge-mid': { w: 400, h: 120, kind: 'piece' },
  'kit-low-bark-ledge-end': { w: 240, h: 120, kind: 'piece' },
  'kit-low-knothole-door-closed': { w: 240, h: 320, kind: 'piece' },
  'kit-low-knothole-door-open': { w: 240, h: 320, kind: 'piece' },
  'kit-low-bough-stub': { w: 160, h: 200, kind: 'piece' },
  'kit-low-leaf-clump': { w: 240, h: 200, kind: 'piece' },
  'kit-low-rope-ladder': { w: 120, h: 400, kind: 'piece' },
  'kit-low-rope-barrier': { w: 240, h: 160, kind: 'piece' },
  'kit-low-log-bench': { w: 240, h: 160, kind: 'piece' },
  'kit-low-signpost-blank': { w: 160, h: 240, kind: 'piece' },
  'kit-low-pulley-bucket': { w: 160, h: 280, kind: 'piece' },
  'kit-low-hanging-basket': { w: 120, h: 200, kind: 'piece' },
  'kit-low-sky-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-low-sky-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-low-far-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-low-far-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-low-mid-a': { w: 800, h: 450, kind: 'layer' },
  'kit-low-mid-b': { w: 800, h: 450, kind: 'layer' },
  'kit-low-mid-c': { w: 800, h: 450, kind: 'layer' },
  'kit-tex-high-lichen-bark': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-high-cloud-bank': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-high-silvered-planks': { w: 512, h: 512, kind: 'texture' },
  'kit-high-bough-mid': { w: 400, h: 160, kind: 'piece' },
  'kit-high-bough-end': { w: 240, h: 160, kind: 'piece' },
  'kit-high-rope-rail-mid': { w: 400, h: 120, kind: 'piece' },
  'kit-high-rope-rail-post': { w: 80, h: 160, kind: 'piece' },
  'kit-high-hook-lantern': { w: 120, h: 200, kind: 'piece' },
  'kit-high-mist-platform': { w: 400, h: 160, kind: 'piece' },
  'kit-high-knothole-door-closed': { w: 240, h: 320, kind: 'piece' },
  'kit-high-knothole-door-open': { w: 240, h: 320, kind: 'piece' },
  'kit-high-sign-board': { w: 160, h: 240, kind: 'piece' },
  'kit-high-rope-barrier': { w: 320, h: 200, kind: 'piece' },
  'kit-high-lantern-pole': { w: 120, h: 400, kind: 'piece' },
  'kit-high-cloud-bench': { w: 320, h: 160, kind: 'piece' },
  'kit-high-rope-ladder': { w: 120, h: 400, kind: 'piece' },
  'kit-high-lantern-string': { w: 400, h: 120, kind: 'piece' },
  'kit-high-hanging-moss': { w: 160, h: 240, kind: 'piece' },
  'kit-high-leaf-cluster': { w: 240, h: 240, kind: 'piece' },
  'kit-high-wind-chime': { w: 120, h: 240, kind: 'piece' },
  'kit-high-cloud-tuft': { w: 240, h: 120, kind: 'piece' },
  'kit-high-sky-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-high-sky-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-high-far-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-high-far-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-high-mid-a': { w: 800, h: 450, kind: 'layer' },
  'kit-high-mid-b': { w: 800, h: 450, kind: 'layer' },
  'kit-high-mid-c': { w: 800, h: 450, kind: 'layer' },
  'kit-tex-canopy-woven-wicker': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-canopy-leaf-tops': { w: 512, h: 512, kind: 'texture' },
  'kit-tex-canopy-twig-thatch': { w: 512, h: 512, kind: 'texture' },
  'kit-canopy-door-nest-closed': { w: 240, h: 320, kind: 'piece' },
  'kit-canopy-door-nest-open': { w: 240, h: 320, kind: 'piece' },
  'kit-canopy-nest-lantern': { w: 120, h: 200, kind: 'piece' },
  'kit-canopy-nest-window': { w: 160, h: 160, kind: 'piece' },
  'kit-canopy-woven-rail-mid': { w: 400, h: 120, kind: 'piece' },
  'kit-canopy-sign-board': { w: 240, h: 200, kind: 'piece' },
  'kit-canopy-twig-bench': { w: 320, h: 160, kind: 'piece' },
  'kit-canopy-leaf-perch': { w: 320, h: 160, kind: 'piece' },
  'kit-canopy-leaf-cluster': { w: 240, h: 240, kind: 'piece' },
  'kit-canopy-barrier-nest': { w: 320, h: 280, kind: 'piece' },
  'kit-canopy-nest-roof': { w: 320, h: 200, kind: 'piece' },
  'kit-canopy-planter-wicker': { w: 160, h: 200, kind: 'piece' },
  'kit-canopy-rail-post': { w: 80, h: 160, kind: 'piece' },
  'kit-canopy-lantern-string': { w: 400, h: 120, kind: 'piece' },
  'kit-canopy-bough-tip': { w: 320, h: 200, kind: 'piece' },
  'kit-canopy-rope-coil': { w: 160, h: 120, kind: 'piece' },
  'kit-canopy-hanging-basket': { w: 160, h: 240, kind: 'piece' },
  'kit-canopy-woven-bridge-mid': { w: 400, h: 120, kind: 'piece' },
  'kit-canopy-sky-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-canopy-sky-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-canopy-far-a': { w: 1600, h: 900, kind: 'layer' },
  'kit-canopy-far-b': { w: 1600, h: 900, kind: 'layer' },
  'kit-canopy-mid-a': { w: 800, h: 450, kind: 'layer' },
  'kit-canopy-mid-b': { w: 800, h: 450, kind: 'layer' },
  'kit-canopy-mid-c': { w: 800, h: 450, kind: 'layer' },
  // The layered rooms' painted layers (artLooks.ts): four per screen, each a room tile.
  ...Object.fromEntries(allLookKeys().map((key) => [key, { w: ROOM_W, h: ROOM_H, kind: 'room' as const }])),
};

export { FLIGHT_LAYERS, OWL_LAYERS, SPECIES_FLIGHT_LAYERS, SPECIES_LAYERS };

/** The climb's pieces, loaded by its scene when a climb opens and released when it closes. */
export const CLIMB_ART_KEYS = Object.keys(ART).filter((k) => ART[k]!.kind === 'climb');
/** The puzzle quests' pieces (OP-256): the lock post, the clue carving, the key and the six code symbols, drawn by the room's markers and the code pad. */
export const PUZZLE_ART_KEYS = Object.keys(ART).filter((k) => k.startsWith('kit-puzzle-'));

/** The address of a published piece's 1x raster for an element outside the game canvas (the code pad's symbols), or null when this build does not ship it. */
export function publishedArtUrl(key: string): string | null {
  const name = `${key}.webp`;
  return PUBLISHED_ART.has(name) ? `${baseUrl()}${versioned(name)}` : null;
}

// The art kit's pieces (OP-234), at their logical sizes.
for (const [key, { w, h }] of Object.entries(KIT_ART)) ART[key] ??= { w, h, kind: 'kit' };
// The pieces that shape a room's edges seen from above (edges.ts), at their logical sizes.
for (const [key, { w, h }] of Object.entries(EDGE_ART)) ART[key] ??= { w, h, kind: 'edge' };

// The tiles of a room bigger than one screen are room art of one screen each, like `hub`.
// A room the page draws in plain shapes (`drawn`: the test course, OP-224) has no art files.
for (const room of Object.values(ROOMS)) {
  if (room.drawn) continue;
  for (const t of [...backgroundTiles(room), ...foregroundTiles(room)]) ART[t.key] ??= { w: ROOM_W, h: ROOM_H, kind: 'room' };
}

/** Art needed in every room (loaded once at boot). Species layers wait until an owl of that kind shows up, flight layers until one may fly. */
export const GLOBAL_ART = Object.keys(ART).filter((k) => ART[k]!.kind === 'owl' && !isSpeciesLayer(k) && !isFlightLayer(k));

/** The blockade standing in a closed doorway that shows `phrase` ("Not Yet Fledged" -> blockade-not-yet-fledged). */
export function blockadeKey(phrase: string): string {
  return `blockade-${phrase.toLowerCase().replace(/\s+/g, '-')}`;
}

/** Whether a realm kit slot's own art (OP-275) is published: delivered by its artist, not a piece standing in for it. */
export function slotDelivered(key: string, published: ReadonlyMap<string, string> = PUBLISHED_ART): boolean {
  const spec = KIT_ART[key];
  return !!spec?.slot && !spec.standIn && (published.has(`${key}.svg`) || rasterNames(key, 1, published).length > 0);
}

/** Art that belongs to one room (released when it closes; roomOpeningArt is what loads as it opens). */
export function roomArtKeys(roomId: string, room: RoomDef | undefined = roomFor(roomId)): string[] {
  const keys = room ? [...backgroundTiles(room), ...foregroundTiles(room)].map((t) => t.key) : [roomId, `${roomId}-fg`];
  // A room built from the art kit (OP-234) loads its pieces too.
  if (room?.kit) keys.push(...kitArtKeys(room));
  // And the strips that frame its platforms' sides and feet (kitFrames in edges.ts), where it has any.
  if (room?.kit) {
    const plan = kitDrawPlan(room);
    for (const d of plan) for (const s of kitFrames(d, room.size, plan)) keys.push(s.key);
  }
  // A course's pieces drawn from the kit (its benches, bells, lost feathers and shrine).
  const course = room?.course && Object.hasOwn(COURSES, room.course.id) ? COURSES[room.course.id] : undefined;
  for (const a of Object.values(course?.art ?? {})) if (a) keys.push(a.key);
  // A realm's updraft and wind-current art (OP-275), once its artist's is published: until then the leaves and streaks are all.
  for (const a of [...(room?.updrafts ?? []), ...(room?.winds ?? [])].map((x) => x.art)) if (a && (slotDelivered(a) || trialFilesOf(a, skin, PUBLISHED_ART)) && !keys.includes(a)) keys.push(a);
  // A skin trial's updraft bits (skinTrial.ts), which rise in the realm's updrafts in place of the leaf.
  const column = room?.updrafts?.find((u) => u.art)?.art;
  const bits = column ? updraftBitsKey(column) : undefined;
  if (bits && trialFilesOf(bits, skin, PUBLISHED_ART)) {
    ART[bits] ??= { w: 80, h: 80, kind: 'kit' };
    keys.push(bits);
  }
  // The ink a room's brush stones paint (OP-235): a bridge across and a tread up.
  if (room?.brushStones?.length) keys.push('kit-ink-bridge-stroke', 'kit-ink-tread-stroke');
  // A room's neon signs on their circuits: the kit's sign, lit or dark.
  if (room?.neonSigns?.length) keys.push('kit-neon-sign-platform');
  // The tree draws its barriers (OP-220): only today's park's closed arches load the blockade art.
  if (room && !seenFromSide(room)) for (const door of room.doors) if (door.closedSign) keys.push(blockadeKey(door.closedSign));
  // A realm's idol, in the realm or in its Commons (`votesFor`), or each of several (the Great Hollow's, RoomDef.idols).
  const realms = room ? idolRealms(room) : [roomId];
  if (realms.includes('grove')) keys.push('guardian');
  if (realms.includes('market')) keys.push('robot-owl');
  if (realms.includes('glass')) keys.push('kit-glass-idol-owl');
  // A realm start's set pieces (OP-276).
  for (const p of room?.pieces ?? []) keys.push(p.key);
  // The art of the things to use out on a plaza's floor (plazaFloor.ts): a bird bath, mushrooms, a telescope.
  for (const t of interactablesIn(roomId)) if (t.piece) keys.push(t.piece);
  // The pieces that shape its edges, seen from above (edges.ts).
  for (const e of room?.edges ?? []) keys.push(e.key);
  if (isArcadeRoom(roomId)) keys.push(...Object.keys(ART).filter((k) => ART[k]!.kind === 'arcade'));
  // A nest can show any piece of furniture: the owner may put out whatever they own.
  if (isNestRoom(roomId)) keys.push(...FURNITURE.map((f) => f.art));
  // Once each: a kit backdrop is one picture drawn on several screens.
  return [...new Set(keys)].filter((k) => k in ART);
}

const FURNITURE_ART = new Set(FURNITURE.map((f) => f.art));

/**
 * The art a room waits for before it opens: all of its own but a nest's furniture, each piece of
 * which loads as the nest puts it out or its owner decorates (OP-129: the sixteen pieces were over
 * a megabyte on a phone before the owl could move, most of them in nobody's nest).
 */
export function roomOpeningArt(roomId: string, room: RoomDef | undefined = roomFor(roomId)): string[] {
  return roomArtKeys(roomId, room).filter((k) => !FURNITURE_ART.has(k));
}

/** How sharp a room's art loads (texture pixels per room pixel at most): a room of several screens keeps to one screen's memory budget, at 1x if need be. */
export function roomArtCap(room: RoomDef, cfg: Pick<ParkConfig, 'pixelRatio' | 'artScaleMax' | 'roomArtBudget'>): number {
  const textures = backgroundTiles(room).length + foregroundTiles(room).length;
  return roomScaleCap(textures, cfg.pixelRatio, cfg.artScaleMax, cfg.roomArtBudget);
}

const prefetched = new Set<string>();

/** Fetch one art file into the browser's cache, once a page, at low priority; resolves when it has come (or failed). */
function fetchAhead(name: string): Promise<void> {
  if (prefetched.has(name)) return Promise.resolve();
  prefetched.add(name);
  return fetch(`${baseUrl()}${versioned(name)}`, { priority: 'low' })
    .then((res) => res.arrayBuffer())
    .then(
      () => undefined,
      () => void prefetched.delete(name),
    );
}

/**
 * Fetch a room's opening art ahead (OP-129), as an owl nears a doorway into it or the home screen
 * waits on Play: the very files its opening will ask for, at the same sharpness, into the browser's
 * cache (where the art keeps a year), not drawn. A painting that may open soft (softTiles) has its 1x
 * copy fetched with the rest, unless the browser has its 2x copy already, and its 2x copy after the
 * rest, so a room entered quickly finds what it opens on. Each file once a page; art already drawn is
 * left out.
 */
export function prefetchRoomArt(scene: Phaser.Scene, room: RoomDef, cfg: Pick<ParkConfig, 'pixelRatio' | 'artScaleMax' | 'roomArtBudget'>): void {
  // Size boxes are drawn, not fetched.
  if (typeof fetch !== 'function' || sizeBoxes) return;
  const cap = roomArtCap(room, cfg);
  const could = new Set(softTiles(room, cfg));
  const rest: string[] = [];
  const soft: Array<{ one: string; two: string }> = [];
  for (const key of roomOpeningArt(room.id, room)) {
    const spec = ART[key];
    if (!spec || scene.textures.exists(key)) continue;
    const name = firstFile(key, artScale(spec.kind, cfg.pixelRatio, cap));
    if (!name || prefetched.has(name)) continue;
    if (could.has(key)) soft.push({ one: firstFile(key, 1)!, two: name });
    else rest.push(name);
  }
  const ones = soft.map(async ({ one, two }) => {
    if (!(await inCache(`${baseUrl()}${versioned(two)}`))) await fetchAhead(one);
  });
  void Promise.all([...rest.map(fetchAhead), ...ones]).then(() => Promise.all(soft.map(({ two }) => fetchAhead(two))));
}

/**
 * A room's paintings that may open soft on this screen (OP-129). On a dense screen a room wants its
 * 2x copies, about three times the bytes of the 1x ones, so a painting whose 2x copy the browser does
 * not have yet opens at 1x and sharpens once the 2x comes (sharpenArt). These are the tiles that can:
 * the room wants them at 2x, and the build ships both copies.
 */
export function softTiles(room: RoomDef, cfg: Pick<ParkConfig, 'pixelRatio' | 'artScaleMax' | 'roomArtBudget'>, published: ReadonlyMap<string, string> = PUBLISHED_ART): string[] {
  if (sizeBoxes) return [];
  const scale = artScale('room', cfg.pixelRatio, roomArtCap(room, cfg));
  if (scale <= DENSE_SCALE) return [];
  return [...backgroundTiles(room), ...foregroundTiles(room)]
    .map((t) => t.key)
    .filter((key) => !published.has(`${filesOf(key, published)}.svg`) && (rasterNames(filesOf(key, published), scale, published)[0]?.includes('@2x') ?? false) && rasterNames(filesOf(key, published), 1, published).length > 0);
}

/** How long the browser's cache gets to say whether it has a file (an answer from it takes a few ms). */
const CACHE_ASK_MS = 150;

/**
 * Whether the browser has this file already, asking its cache and not the server. A browser that
 * would go to the server instead (or anything else slow) counts as not having it: the room opens soft.
 */
async function inCache(url: string): Promise<boolean> {
  if (typeof fetch !== 'function' || typeof AbortController !== 'function') return false;
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), CACHE_ASK_MS);
  try {
    const res = await fetch(url, { cache: 'only-if-cached', mode: 'same-origin', signal: stop.signal });
    void res.body?.cancel().catch(() => undefined);
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Of a room's soft tiles, those that open at 1x now: the ones whose 2x copies the browser does not have (fetched ahead, or kept from a visit before). */
export async function opensSoft(room: RoomDef, cfg: Pick<ParkConfig, 'pixelRatio' | 'artScaleMax' | 'roomArtBudget'>): Promise<Set<string>> {
  const keys = softTiles(room, cfg);
  const scale = artScale('room', cfg.pixelRatio, roomArtCap(room, cfg));
  const have = await Promise.all(keys.map((key) => inCache(`${baseUrl()}${versioned(rasterNames(filesOf(key), scale, PUBLISHED_ART)[0]!)}`)));
  return new Set(keys.filter((_, i) => !have[i]));
}

/** How often a sharp painting that has come asks whether the owl stands still yet. */
const STILL_POLL_MS = 200;

/** The images in this display list (and the containers in it) that show texture `key`. */
function imagesShowing(list: Phaser.GameObjects.GameObject[], key: string, out: Phaser.GameObjects.Image[] = []): Phaser.GameObjects.Image[] {
  for (const o of list) {
    if (o instanceof Phaser.GameObjects.Container) imagesShowing(o.list, key, out);
    else if (o instanceof Phaser.GameObjects.Image && o.texture.key === key) out.push(o);
  }
  return out;
}

/** A painting's 2x copy, for sharpenArt (OP-129): null when the build has none or it fails to load. */
export function sharpCopy(key: string, scale: number): Promise<HTMLImageElement | null> {
  // A size box stays a box: no sharper copy of the art replaces it.
  if (drawnAsSizeBox(key)) return Promise.resolve(null);
  const name = rasterNames(filesOf(key), scale, PUBLISHED_ART)[0];
  return name?.includes('@2x') ? loadImage(`${baseUrl()}${versioned(name)}`) : Promise.resolve(null);
}

/**
 * Sharpen a painting that opened soft (OP-129): replace its texture with the 2x copy (sharpCopy)
 * under the same key, every image showing it keeping its size on screen. The swap holds up a frame
 * or two while the browser decodes the picture for the GPU (a tenth of a second or more on a phone),
 * so it waits for a moment the owl stands still, where nobody feels it. Nothing changes when `live`
 * says the room has gone meanwhile, or its texture was released.
 */
export async function sharpenArt(scene: Phaser.Scene, key: string, img: HTMLImageElement | null, live: () => boolean, still: () => boolean = () => true): Promise<boolean> {
  if (!img) return false;
  while (live() && !still()) await new Promise((r) => setTimeout(r, STILL_POLL_MS));
  if (!live() || !scene.textures.exists(key)) return false;
  const shown = imagesShowing(scene.children.list, key);
  const sizes = shown.map((o) => [o.displayWidth, o.displayHeight] as const);
  scene.textures.remove(key);
  scene.textures.addImage(key, img);
  shown.forEach((o, i) => o.setTexture(key).setDisplaySize(sizes[i]![0], sizes[i]![1]));
  return true;
}

/**
 * How many texture pixels per room pixel to rasterize at. Owls are small, and the arcade's games
 * fill the screen, so they get the full device ratio (up to 2); rooms and big set pieces are capped
 * to keep GPU memory bounded
 * (a 1600 x 900 room tile costs about 5.8 MB per unit of scale squared; see roomScaleCap for rooms
 * of several tiles).
 */
export function artScale(kind: ArtKind, pixelRatio: number, roomMax: number): number {
  const target = kind === 'owl' || kind === 'arcade' || kind === 'climb' ? Math.min(pixelRatio, 2) : Math.min(pixelRatio, roomMax);
  return Math.max(1, Math.round(target * 4) / 4);
}

function baseUrl(): string {
  const b = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${b}${ART_PATH}`;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** The page's own download of this address, begun before the script came (index.html; artNames.ts's earlyArtScript), taken once. */
function earlyArt(url: string): Promise<Response | null> | undefined {
  const early = (globalThis as { __owlParkArt?: Record<string, Promise<Response | null>> }).__owlParkArt;
  const res = early?.[url];
  if (res) delete early![url];
  return res;
}

/**
 * Load an image reading it as it comes, each piece's bytes told to `onBytes` (the load screen's
 * progress, OP-129), or the rest of it when the page began the download itself; a browser that
 * cannot read a download as it comes loads it whole.
 */
async function streamImage(url: string, onBytes: (n: number) => void): Promise<HTMLImageElement | null> {
  if (typeof fetch !== 'function' || typeof URL.createObjectURL !== 'function') return loadImage(url);
  try {
    const res = (await earlyArt(url)) ?? (await fetch(url));
    if (!res.ok) return null;
    if (!res.body) return loadImage(url);
    const reader = res.body.getReader();
    const parts: BlobPart[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      onBytes(value.byteLength);
    }
    const src = URL.createObjectURL(new Blob(parts, { type: res.headers.get('content-type') ?? '' }));
    const img = await loadImage(src);
    URL.revokeObjectURL(src);
    return img;
  } catch {
    return null;
  }
}

/** Whether this page draws `key` as its size box. */
export function drawnAsSizeBox(key: string): boolean {
  const spec = ART[key];
  return sizeBoxes && !!spec && boxable(spec.kind);
}

/** A key's size box (sizeBoxes.ts) as its texture, at its logical size: true when it was made. */
function makeSizeBox(scene: Phaser.Scene, key: string, spec: ArtSpec): boolean {
  const tex = scene.textures.createCanvas(key, spec.w, spec.h);
  if (!tex) return false;
  paintSizeBox(tex.getContext(), key, spec);
  tex.refresh();
  return true;
}

/** Load one key. Returns true when a texture now exists for it (fresh or already present). With `onBytes`, its download is counted as it comes. */
export async function loadArtKey(scene: Phaser.Scene, key: string, scale: number, onBytes?: (n: number) => void): Promise<boolean> {
  if (scene.textures.exists(key)) return true;
  const spec = ART[key];
  if (!spec) return false;
  if (drawnAsSizeBox(key)) return makeSizeBox(scene, key, spec);
  const url = baseUrl();
  if (PUBLISHED_ART.has(`${filesOf(key)}.svg`) && (await loadSvgTexture(scene, key, `${url}${versioned(`${filesOf(key)}.svg`)}`, Math.round(spec.w * scale), Math.round(spec.h * scale)))) return true;
  // A skin trial's piece is redrawn to the outline of the stand-in it replaces (skinTrial.ts), so its top is the walk line.
  const trial = !!trialFilesOf(key, skin, PUBLISHED_ART);
  for (const c of rasterCandidates(url, filesOf(key), scale, PUBLISHED_ART)) {
    const img = await (onBytes ? streamImage(c, onBytes) : loadImage(c));
    if (img) {
      if (!scene.textures.exists(key)) {
        const fitted = trial ? fitTrialArt(img, key) : null;
        if (fitted) scene.textures.addCanvas(key, fitted);
        else scene.textures.addImage(key, img);
      }
      return true;
    }
  }
  return false;
}

/** Load the home backdrop under its own texture key so it is freed with the home scene. */
export async function loadArtCopy(scene: Phaser.Scene, url: string, as: string): Promise<boolean> {
  if (scene.textures.exists(as)) return true;
  const img = await loadImage(url);
  if (!img) return false;
  if (!scene.textures.exists(as)) scene.textures.addImage(as, img);
  return true;
}

const speciesLoads = new Map<SpeciesId, Promise<boolean>>();

/**
 * Load a species' own layers, once per page; resolves true when all five are there. Nothing is
 * drawn in their place while they load or if they are missing: the owl keeps the great horned
 * owl's layers at the species' size.
 */
export function loadSpeciesArt(scene: Phaser.Scene, species: SpeciesId): Promise<boolean> {
  const keys = SPECIES_LAYERS[species];
  if (keys.every((k) => scene.textures.exists(k))) return Promise.resolve(true);
  let load = speciesLoads.get(species);
  if (!load) {
    const cfg = scene.registry.get('config') as ParkConfig | undefined;
    const scale = artScale('owl', cfg?.pixelRatio ?? 1, cfg?.artScaleMax ?? 1);
    load = Promise.all(keys.map((k) => loadArtKey(scene, k, scale))).then((ok) => ok.every(Boolean));
    speciesLoads.set(species, load);
  }
  return load;
}

const flightLoads = new Map<SpeciesId, Promise<boolean>>();

/**
 * Load a kind's flight layers (OP-136), once per page; resolves true when all three are there. An
 * owl keeps its wings folded until they are, so it never shows four. A load that fails is tried
 * again the next time it is asked for.
 */
export function loadFlightArt(scene: Phaser.Scene, species: SpeciesId): Promise<boolean> {
  const keys = SPECIES_FLIGHT_LAYERS[species];
  if (keys.every((k) => scene.textures.exists(k))) return Promise.resolve(true);
  let load = flightLoads.get(species);
  if (!load) {
    const cfg = scene.registry.get('config') as ParkConfig | undefined;
    const scale = artScale('owl', cfg?.pixelRatio ?? 1, cfg?.artScaleMax ?? 1);
    load = Promise.all(keys.map((k) => loadArtKey(scene, k, scale))).then((ok) => {
      if (!ok.every(Boolean)) flightLoads.delete(species);
      return ok.every(Boolean);
    });
    flightLoads.set(species, load);
  }
  return load;
}

export interface LoadReport {
  missing: string[];
}

/** The file loading `key` at `scale` asks for first: its SVG when the build ships one, else its best picture. */
function firstFile(key: string, scale: number): string | undefined {
  return PUBLISHED_ART.has(`${filesOf(key)}.svg`) ? `${filesOf(key)}.svg` : rasterNames(filesOf(key), scale, PUBLISHED_ART)[0];
}

/** The bytes loading `key` at `scale` downloads: its first file's size (none when its texture is here already). */
function artBytes(scene: Phaser.Scene, key: string, scale: number): number {
  if (scene.textures.exists(key) || drawnAsSizeBox(key)) return 0;
  const name = firstFile(key, scale);
  return name ? (ART_BYTES.get(name) ?? 0) : 0;
}

/**
 * Load several keys concurrently; whatever is missing gets a placeholder so the scene can build.
 * `onProgress` hears the bytes downloaded of the bytes expected, as they come (the load screen's
 * progress, OP-129). The keys in `soft` load at 1x, to be sharpened later (sharpenArt).
 */
export async function loadArt(scene: Phaser.Scene, keys: string[], pixelRatio: number, roomMax: number, onProgress?: (done: number, total: number) => void, soft?: ReadonlySet<string>): Promise<LoadReport> {
  const missing: string[] = [];
  const plan = keys.map((key) => {
    const spec = ART[key];
    const scale = spec && !soft?.has(key) ? artScale(spec.kind, pixelRatio, roomMax) : 1;
    return { key, spec, scale, bytes: spec ? artBytes(scene, key, scale) : 0 };
  });
  const total = plan.reduce((sum, p) => sum + p.bytes, 0);
  let done = 0;
  const tell = () => onProgress?.(Math.min(done, total), total);
  await Promise.all(
    plan.map(async ({ key, spec, scale, bytes }) => {
      let got = 0;
      const count = (n: number) => {
        got += n;
        done += n;
        tell();
      };
      const ok = spec ? await loadArtKey(scene, key, scale, onProgress ? count : undefined) : false;
      if (!ok) missing.push(key);
      // A piece that came some other way (an SVG, the browser's cache whole) or not at all counts as come.
      if (got < bytes) count(bytes - got);
    }),
  );
  tell();
  for (const key of missing) ensurePlaceholder(scene, key);
  if (missing.length) console.info(`[owl-park] placeholder art for: ${missing.join(', ')}`);
  return { missing };
}

/** Drop textures a room no longer needs (the next room loads its own). */
export function releaseArt(scene: Phaser.Scene, keys: string[]): void {
  for (const key of keys) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    // Tinted copies made for the Canvas renderer share the key prefix.
    for (const k of scene.textures.getTextureKeys()) if (k.startsWith(`${key}:`)) scene.textures.remove(k);
  }
}

/** A flat stand-in texture for a missing piece of art, so the park is always playable. */
export function ensurePlaceholder(scene: Phaser.Scene, key: string): void {
  if (scene.textures.exists(key)) return;
  const spec = ART[key];
  if (!spec || spec.kind === 'arcade' || spec.kind === 'climb') return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const { w, h } = spec;
  switch (spec.kind) {
    case 'room': {
      if (key.endsWith('-fg') || key.endsWith('-mid')) break; // a transparent overlay or middle distance (OP-162)
      if (key.startsWith('tree-')) {
        // The tree's layers (map 2): the playfield is its ground under the ground line, the sky left to
        // the plate behind it; the plate is the night.
        g.fillStyle(key.endsWith('-play') ? 0x4a3322 : 0x0c1e36, 1);
        if (key.endsWith('-play')) g.fillRect(0, TREE_GROUND, w, h - TREE_GROUND);
        else g.fillRect(0, 0, w, h);
        break;
      }
      const fill: Record<string, number> = { hub: 0x163157, grove: 0x3b2a4a, market: 0x0b0b16 };
      g.fillStyle(fill[key] ?? 0x0c1e36, 1);
      g.fillRect(0, 0, w, h);
      g.fillStyle(0x2f4f3a, 1);
      g.fillRect(0, 460, w, h - 460);
      break;
    }
    case 'kit':
      drawKitOps(g, kitPlaceholder(key) ?? []);
      break;
    case 'edge':
      drawKitOps(g, edgePlaceholder(key) ?? []);
      break;
    case 'piece':
      g.fillStyle(0xc9a227, 0.18);
      g.fillEllipse(w / 2, h / 2, w * 0.6, h * 0.8);
      break;
    case 'owl':
      drawOwlPlaceholder(g, key);
      break;
  }
  g.generateTexture(key, w, h);
  g.destroy();
}

function drawOwlPlaceholder(g: Phaser.GameObjects.Graphics, key: string): void {
  switch (key) {
    case 'owl-body':
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(100, 150, 120, 150);
      g.fillCircle(100, 80, 60);
      g.fillTriangle(55, 40, 70, 10, 85, 45);
      g.fillTriangle(145, 40, 130, 10, 115, 45);
      break;
    case 'owl-belly':
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(100, 165, 70, 100);
      break;
    case 'owl-accent':
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(80, 226, 30, 12);
      g.fillEllipse(120, 226, 30, 12);
      break;
    case 'owl-face':
      g.fillStyle(0xf6f1e3, 1);
      g.fillCircle(78, 78, 20);
      g.fillCircle(122, 78, 20);
      g.fillStyle(0x0c1e36, 1);
      g.fillCircle(80, 80, 9);
      g.fillCircle(124, 80, 9);
      g.fillStyle(0xc9a227, 1);
      g.fillTriangle(92, 96, 108, 96, 100, 112);
      break;
    case 'owl-wing-body':
      // A broad rounded wing from its root (12, 72) out to the right, a little raised.
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(96, 60, 168, 64);
      break;
    case 'owl-wing-accent':
      // Its flight feathers along the trailing edge.
      g.fillStyle(0xffffff, 1);
      for (let i = 0; i < 5; i++) g.fillEllipse(118 + i * 14, 70 + i * 5, 64, 16);
      break;
    case 'owl-blink':
      g.lineStyle(4, 0x0c1e36, 1);
      g.beginPath();
      g.arc(78, 80, 16, Math.PI * 0.15, Math.PI * 0.85);
      g.strokePath();
      g.beginPath();
      g.arc(122, 80, 16, Math.PI * 0.15, Math.PI * 0.85);
      g.strokePath();
      g.fillStyle(0xc9a227, 1);
      g.fillTriangle(92, 96, 108, 96, 100, 112);
      break;
  }
}

/** Whether this page draws a skin trial in this room: it has a trial on and the room draws a slot the trial has files for. */
export function drawsSkinTrial(roomId: string, room?: RoomDef): boolean {
  return !!skin && roomArtKeys(roomId, room).some((k) => trialFilesOf(k, skin, PUBLISHED_ART) !== null);
}
