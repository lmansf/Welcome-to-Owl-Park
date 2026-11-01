import Phaser from 'phaser';
import type { DoorDef, Polygon, RoomDef } from '@owl-park/shared';

/**
 * What makes a room of the tree (map 2) read at a glance (OP-173): what an owl can stand on, what is in
 * front of it, and what it can use.
 *
 * - The playfield is drawn a step quieter (a multiply tint), so what the game draws over it stands out.
 * - Every ledge has the same bright, simple edge along its top, the one look for "an owl can stand here".
 * - Shapes of the playfield painted in front of the path (`fronts`, a lamp post, a post in front of a
 *   stall) are drawn again over the owls, so an owl passes behind them.
 * - Painted glows that do nothing yet (`shades`) are shaded darker, so they do not read as things to use:
 *   each shade follows the painted shape and fades in over its edge, so it reads as shadow, not a box.
 * - A doorway to another room has a mark over its arch (`markAt`): the bright, simple sign of a way
 *   through, in the colours of the '!' over an owl to talk to (OP-114).
 *
 * TODO-DOCS (OP-173): docs/MAP.md (the tree's style sheet): the one look for ledges (the bright edge,
 * drawn by the game), fronts and shades in the room data and what each is for, the doorway mark, and the
 * rule for painting the next levels in layers (back scenery, platforms, front props, overlay, with
 * interactive things as their own sprites); docs/ARCHITECTURE.md's rooms table gains `fronts`, `shades`
 * and a door's `markAt`.
 */

/** The quieter playfield: a multiply tint on the tree's 1x tiles and on their fronts alike. */
export const TREE_PLAY_TINT = 0xdedede;

/** How far a shade's edge fades in (room px, the canvas's shadow blur): soft enough that it reads as shadow. */
const SHADE_SOFT = 12;

/** A ledge's edge: a soft warm glow under a crisp cream line. */
const LIP = { glow: 0xffe9a8, glowAlpha: 0.28, glowWidth: 12, line: 0xfff4d2, lineAlpha: 0.95, lineWidth: 4 } as const;

/** The doorway mark: a dark pill with a cream outline, a cream arch and a gold dot (the '!''s colours). */
const MARK = { w: 40, h: 50, pill: 0x0c1e36, pillAlpha: 0.9, cream: 0xf6f1e3, gold: 0xffd36a, bob: 4, bobMs: 1000 } as const;

export interface TreeDepths {
  /** Over the playfield, under the owls. */
  shade: number;
  lip: number;
  /** Over the owls, under the overlay. */
  front: number;
  mark: number;
}

/** What was drawn, for the page's debug state and its tests. */
export interface TreeDress {
  fronts: number;
  shades: number;
  lips: number;
  marks: number;
}

/** The dressing of a room, and how to cut its fronts again when a tile's picture is swapped for a sharper one. */
export interface TreeDressing extends TreeDress {
  recut(key: string): void;
}

export interface TreeDressOptions {
  /** The ground line (room px): a ledge's top is drawn this far up from it. */
  ground: number;
  depths: TreeDepths;
  /** Whether a doorway leads anywhere for this owl now (one into a closed realm shows no mark). */
  open: (door: DoorDef) => boolean;
  /** Calm motion: the marks stand still. */
  calm: boolean;
  /** A tap on a doorway's mark. */
  onMarkTap?: (door: DoorDef) => void;
}

const xsOf = (poly: Polygon) => poly.map((p) => p.x);

/** The tile image (one of `tiles`, the room's 1x playfield) a shape lies in: the one holding the middle of its box. */
function tileFor(tiles: readonly Phaser.GameObjects.Image[], poly: Polygon): Phaser.GameObjects.Image | undefined {
  const xs = xsOf(poly);
  const ys = poly.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return tiles.find((img) => cx >= img.x && cx < img.x + img.displayWidth && cy >= img.y && cy < img.y + img.displayHeight);
}

/** Dresses a room of the tree as above. `playTiles` are the images of its 1x playfield, already placed. */
export function dressTreeRoom(scene: Phaser.Scene, room: RoomDef, playTiles: readonly Phaser.GameObjects.Image[], opts: TreeDressOptions): TreeDressing {
  for (const img of playTiles) img.setTint(TREE_PLAY_TINT);

  let shades = 0;
  for (const s of room.shades ?? []) {
    const tile = tileFor(playTiles, s.poly);
    const tex = tile && shadeTexture(scene, `${tile.texture.key}:shade:${s.id}`, s.poly, s.alpha);
    if (!tex) continue;
    scene.add.image(tex.x, tex.y, tex.key).setOrigin(0).setDepth(opts.depths.shade);
    shades++;
  }

  const lips = scene.add.graphics().setDepth(opts.depths.lip);
  const perches = room.perches ?? [];
  for (const p of perches) {
    const xs = xsOf(p.area);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y = opts.ground - p.top;
    lips.lineStyle(LIP.glowWidth, LIP.glow, LIP.glowAlpha).lineBetween(x0, y + 2, x1, y + 2);
    lips.lineStyle(LIP.lineWidth, LIP.line, LIP.lineAlpha).lineBetween(x0 + 2, y, x1 - 2, y);
  }

  // Each front is cut from its tile's picture once (a small texture of just that shape), so drawing it
  // costs a small image, not the tile again through a mask.
  const cuts: Array<{ img: Phaser.GameObjects.Image; tile: Phaser.GameObjects.Image; id: string; poly: Polygon }> = [];
  for (const f of room.fronts ?? []) {
    const tile = tileFor(playTiles, f.poly);
    if (!tile) continue;
    const img = cutFront(scene, tile, f.id, f.poly);
    if (!img) continue;
    cuts.push({ img: img.setTint(TREE_PLAY_TINT).setDepth(opts.depths.front), tile, id: f.id, poly: f.poly });
  }

  let marks = 0;
  for (const door of room.doors) {
    if (!door.to || !door.markAt || !opts.open(door)) continue;
    const { w, h } = MARK;
    const pill = scene.add.graphics();
    pill.fillStyle(MARK.pill, MARK.pillAlpha).fillRoundedRect(-w / 2, -h / 2, w, h, w / 2);
    pill.lineStyle(2, MARK.cream, 0.6).strokeRoundedRect(-w / 2, -h / 2, w, h, w / 2);
    // An arch, the way through, and its gold dot.
    pill.lineStyle(3.2, MARK.cream, 1);
    pill.beginPath();
    pill.moveTo(-8, 13);
    pill.lineTo(-8, -3);
    pill.arc(0, -3, 8, Math.PI, 0, false);
    pill.lineTo(8, 13);
    pill.strokePath();
    pill.fillStyle(MARK.gold, 1).fillCircle(0, 4, 3.4);
    const mark = scene.add.container(door.markAt.x, door.markAt.y, [pill]).setDepth(opts.depths.mark);
    if (opts.onMarkTap) {
      const tap = opts.onMarkTap;
      mark.setInteractive({ hitArea: new Phaser.Geom.Rectangle(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
      mark.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => tap(door));
    }
    if (!opts.calm) scene.tweens.add({ targets: mark, y: door.markAt.y - MARK.bob, duration: MARK.bobMs / 2, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    marks++;
  }

  return {
    fronts: cuts.length,
    shades,
    lips: perches.length,
    marks,
    // A tile sharpened (sharpenArt swaps its texture): its fronts are cut again from the sharper picture.
    recut(key: string) {
      for (const c of cuts) {
        if (c.tile.texture.key !== key) continue;
        const fresh = cutTexture(scene, c.tile, c.id, c.poly);
        if (fresh) c.img.setTexture(fresh.key).setDisplaySize(fresh.w, fresh.h);
      }
    },
  };
}

/**
 * A shade as a texture of its own (named under its tile's key, so releasing the room's art lets it go):
 * `poly` filled at `alpha`, its edge fading in over SHADE_SOFT. The shape is drawn off the canvas and
 * only its blurred shadow lands on it, which softens an edge in every browser (a canvas filter does not).
 */
function shadeTexture(scene: Phaser.Scene, key: string, poly: Polygon, alpha: number): { key: string; x: number; y: number } | null {
  const pad = SHADE_SOFT * 2;
  const xs = xsOf(poly);
  const ys = poly.map((p) => p.y);
  const x0 = Math.floor(Math.min(...xs)) - pad;
  const y0 = Math.floor(Math.min(...ys)) - pad;
  const w = Math.ceil(Math.max(...xs)) + pad - x0;
  const h = Math.ceil(Math.max(...ys)) + pad - y0;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const off = w + pad;
  ctx.shadowColor = `rgba(0, 0, 0, ${alpha})`;
  ctx.shadowBlur = SHADE_SOFT;
  ctx.shadowOffsetX = off;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, p.x - x0 - off, p.y - y0));
  ctx.closePath();
  ctx.fill();
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
  return { key, x: x0, y: y0 };
}

/** The texture of front `id` cut from `tile`'s picture as it is now: the shape's box, clear outside the shape. */
function cutTexture(scene: Phaser.Scene, tile: Phaser.GameObjects.Image, id: string, poly: Polygon): { key: string; w: number; h: number } | null {
  const src = scene.textures.get(tile.texture.key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  if (!src?.width) return null;
  const xs = poly.map((p) => p.x - tile.x);
  const ys = poly.map((p) => p.y - tile.y);
  const x0 = Math.floor(Math.min(...xs));
  const y0 = Math.floor(Math.min(...ys));
  const w = Math.ceil(Math.max(...xs)) - x0;
  const h = Math.ceil(Math.max(...ys)) - y0;
  if (w <= 0 || h <= 0) return null;
  // Room px to the picture's own px: a sharper copy is bigger than the tile is drawn.
  const kx = src.width / tile.displayWidth;
  const ky = src.height / tile.displayHeight;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * kx));
  canvas.height = Math.max(1, Math.round(h * ky));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (p.x - tile.x - x0) * kx, (p.y - tile.y - y0) * ky));
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(src, x0 * kx, y0 * ky, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  // Named under the tile's key, so releasing the room's art (releaseArt) lets it go too.
  const key = `${tile.texture.key}:front:${id}`;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
  return { key, w, h };
}

/** Front `id` drawn where it lies over `tile`, from its own small texture. */
function cutFront(scene: Phaser.Scene, tile: Phaser.GameObjects.Image, id: string, poly: Polygon): Phaser.GameObjects.Image | null {
  const tex = cutTexture(scene, tile, id, poly);
  if (!tex) return null;
  const x0 = Math.floor(Math.min(...poly.map((p) => p.x)));
  const y0 = Math.floor(Math.min(...poly.map((p) => p.y)));
  return scene.add.image(x0, y0, tex.key).setOrigin(0).setDisplaySize(tex.w, tex.h);
}
