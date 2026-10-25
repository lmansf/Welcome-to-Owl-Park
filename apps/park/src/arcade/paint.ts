/**
 * The arcade's games in their paintings (OP-059): which painted pieces each game draws, and where,
 * kept free of Phaser so the placing can be unit-tested. A game is painted only once every piece it
 * draws has loaded; until then it is drawn in neon lines, as it was before its paintings.
 *
 * Each game's field is painted at the games' own geometry (the hop's lanes at rowY, the flight's
 * ground at its GROUND_Y, the rooftop's ledge at the sling's GROUND_Y), so the pieces need no more
 * than their places. Sizes here are field pixels; the art is drawn at these whatever its resolution.
 */
import type { ArcadeGame } from '@owl-park/shared';
import { FIELD_H, FIELD_W } from './field';

/** A painting's size on the field. */
export interface ArtSize {
  w: number;
  h: number;
}

/**
 * Each game's painted field and pieces (art keys), at the size each is drawn: all of them, or the game
 * stays in neon. A drone and a cart are as wide as the hop plays them, a crate is CRATE square.
 */
export const GAME_ART: Readonly<Record<ArcadeGame, Readonly<Record<string, ArtSize>>>> = {
  crossing: { 'arcade-hop-bg': { w: FIELD_W, h: FIELD_H }, 'arcade-hop-drone': { w: 44, h: 36 }, 'arcade-hop-cart': { w: 96, h: 84 } },
  flight: { 'arcade-flap-bg': { w: FIELD_W, h: FIELD_H }, 'arcade-flap-branch': { w: 128, h: 575 }, 'arcade-flap-ground': { w: 180, h: 40 } },
  sling: {
    'arcade-knock-bg': { w: FIELD_W, h: FIELD_H },
    'arcade-knock-sling': { w: 60, h: 120 },
    'arcade-knock-crate': { w: 36, h: 36 },
    'arcade-knock-stand': { w: 72, h: 72 },
  },
};

/** Whether every piece of a game's painting is there (`has`: whether one art key loaded). */
export function paintable(game: ArcadeGame, has: (key: string) => boolean): boolean {
  return Object.keys(GAME_ART[game]).every(has);
}

/**
 * The branch's painting: its knobbly end at the top and its trunk (BRANCH_W wide) with its middle
 * `trunkX` from the left, a twig off the trunk's right. It is drawn mirrored, the twig on the left, so
 * that nothing of it is left on the field when the game drops a branch past the field's west edge.
 */
export const BRANCH_ART = { ...GAME_ART.flight['arcade-flap-branch']!, trunkX: 39 } as const;

/**
 * Where a branch's two halves go: both mirrored side to side, starting `left`; the top half also
 * mirrored top to bottom, hanging down to the gap with its knobbly end at `topY + h`; the bottom half
 * rising from the gap at `bottomY` (the ground strip covers its foot).
 */
export function branchHalves(x: number, gapY: number, gap: number): { left: number; topY: number; bottomY: number } {
  return { left: x - (BRANCH_ART.w - BRANCH_ART.trunkX), topY: gapY - gap / 2 - BRANCH_ART.h, bottomY: gapY + gap / 2 };
}

/** The ground strip's painting is this wide; its ends do not meet, so every other tile is mirrored. */
export const GROUND_TILE_W = GAME_ART.flight['arcade-flap-ground']!.w;

/**
 * The ground's tiles across the field once the flight has gone `offset` field pixels: where each tile
 * starts and whether it is mirrored. A tile keeps its mirroring as it scrolls by.
 */
export function groundTiles(offset: number, fieldW = FIELD_W, tileW = GROUND_TILE_W): Array<{ x: number; flip: boolean }> {
  const first = Math.floor(offset / tileW);
  const tiles: Array<{ x: number; flip: boolean }> = [];
  for (let i = first; i * tileW - offset < fieldW; i++) tiles.push({ x: i * tileW - offset, flip: Math.abs(i) % 2 === 1 });
  return tiles;
}

/** A box, in field pixels (or in pixels of a painting). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The stand's painting (field pixels) and how far in from each edge its lid, base and sides run. */
export const STAND_ART = { ...GAME_ART.sling['arcade-knock-stand']!, left: 8, right: 8, top: 16, bottom: 9 } as const;

/**
 * A stand drawn from its painting cut in nine: the corners at their size, the lid and base stretched
 * along, the sides stretched down, and the middle both ways. For each piece, its part of the painting
 * (in the painting's field pixels) and its box on the field.
 */
export function standPieces(box: Box, art: typeof STAND_ART = STAND_ART): Array<{ src: Box; dst: Box }> {
  const sx = [0, art.left, art.w - art.right, art.w];
  const sy = [0, art.top, art.h - art.bottom, art.h];
  const dx = [box.x, box.x + art.left, box.x + box.w - art.right, box.x + box.w];
  const dy = [box.y, box.y + art.top, box.y + box.h - art.bottom, box.y + box.h];
  const pieces: Array<{ src: Box; dst: Box }> = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      pieces.push({
        src: { x: sx[c]!, y: sy[r]!, w: sx[c + 1]! - sx[c]!, h: sy[r + 1]! - sy[r]! },
        dst: { x: dx[c]!, y: dy[r]!, w: dx[c + 1]! - dx[c]!, h: dy[r + 1]! - dy[r]! },
      });
    }
  }
  return pieces;
}
