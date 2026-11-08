import type Phaser from 'phaser';
import { EDGE_ART, KIT_ART, kitCells, kitDrawPlan, kitFrames, seenFromSide, type EdgeStrip, type KitDraw, type KitLayer, type KitOp, type RoomDef } from '@owl-park/shared';
import { kitDemoFor } from '@owl-park/shared/rooms/kit';
import { TREE_PLAY_TINT } from './treeView';
import { artLookRoom } from './artLooks';

/**
 * The level assembler's drawing (OP-234): a room built from the art kit, drawn at runtime from its
 * kit (kitDrawPlan in packages/shared/src/kit.ts) instead of from painted screens. Its backdrops are
 * the room's tiles, drawn and scrolled by RoomScene as a painted room's are; this draws the rest:
 * the surfaces' textures, the paths, ledges and stairs, the doorway pieces, barriers, props and decals.
 *
 * - A repeating piece is drawn as one image per repeat (kitCells): a texture's cropped to the box and
 *   counted from the room's origin, so it continues across neighbouring surfaces; a run's middle piece
 *   as whole copies laid art to art along the run (OP-241). Images of one texture
 *   batch into one draw on WebGL, so a room costs a few draws, not one per image. Each image is drawn a
 *   pixel bigger along the axes it repeats on, so no hairline shows between repeats at any zoom: the
 *   texture is seamless, so the pixel it overlaps is the next repeat's own first one.
 * - Art comes by key like every other piece (art.ts): a key whose art the build does not ship is drawn
 *   from its placeholder (kitArt.ts) in the tree's palette, so a kit room works with no art at all.
 *
 * TODO-DOCS (OP-234): docs/MAP.md gains how a kit room is drawn (its layers and depths, the `?kit=1`
 * flag that stands the kit's l4 in for the painted one) and the greybox tool (`pnpm kit:greybox`).
 */

/**
 * The room drawn for `room`: a kit room as it is; a painted one, unless the page asks for the paintings
 * (`?kit=0`), as the kit room that stands in for it. A room with a layered look (artLooks.ts) is drawn
 * from the look's layers, unless the page asks for the earlier paintings (`?art=old`).
 */
export function drawnRoom(room: RoomDef, cfg: { kit: boolean; art?: string | null }): RoomDef {
  const layered = artLookRoom(room, cfg.art);
  if (layered !== room) return layered;
  if (room.kit || !cfg.kit) return room;
  return kitDemoFor(room.id) ?? room;
}

/** Where each of the kit's layers is drawn (depth): behind the owls but for `front`, under the overlay. */
export type KitDepths = Record<KitLayer, number>;

/** What was drawn, for the page's debug state and its tests. */
export interface KitDrawn {
  pieces: number;
  images: number;
  /** Shade, creeper and root strips over platform bodies' sides and feet (kitFrames). */
  frames: number;
}

/** Draws a kit room's pieces (not its backdrops). Nothing for a painted room. */
export function drawKit(scene: Phaser.Scene, room: RoomDef, depths: KitDepths): KitDrawn {
  const plan = kitDrawPlan(room);
  let images = 0;
  // In the tree, back scenery is drawn a step quieter than what an owl stands on (docs/TREE_STYLE.md), as its painted playfield is.
  const quiet = seenFromSide(room) ? TREE_PLAY_TINT : undefined;
  let frames = 0;
  for (const d of plan) {
    const tint = d.tint ?? (d.layer === 'back' ? quiet : undefined);
    images += drawPiece(scene, d, depths[d.layer], tint);
    // Drawn straight after the body they frame, at its depth, so the caps an owl lands on (drawn later) stay over them.
    for (const s of kitFrames(d, room.size, plan)) frames += drawStrip(scene, s, depths[d.layer], tint);
  }
  return { pieces: plan.length, images, frames };
}

/** One frame strip, repeated down or along its box at its piece's own size; 1 if drawn. */
function drawStrip(scene: Phaser.Scene, s: EdgeStrip, depth: number, tint: number | undefined): number {
  if (!scene.textures.exists(s.key)) return 0;
  const frame = scene.textures.getFrame(s.key);
  const spec = EDGE_ART[s.key];
  const sprite = scene.add.tileSprite(s.x, s.y, s.w, s.h, s.key).setOrigin(0).setDepth(depth);
  // A sharper copy than the piece's own size repeats at the piece's size, as a placeholder does.
  sprite.setTileScale((spec?.w ?? frame.width) / frame.width, (spec?.h ?? frame.height) / frame.height);
  if (s.flip) sprite.setFlipX(true);
  if (tint !== undefined) sprite.setTint(tint);
  return 1;
}

/** One piece's images; how many. */
function drawPiece(scene: Phaser.Scene, d: KitDraw, depth: number, tint: number | undefined): number {
  if (!scene.textures.exists(d.key)) return 0;
  const frame = scene.textures.getFrame(d.key);
  // Crops are in the piece's own pixels; its texture may be a sharper copy, bigger than the piece is drawn.
  const spec = KIT_ART[d.key];
  const sx = frame.width / (spec?.w ?? frame.width);
  const sy = frame.height / (spec?.h ?? frame.height);
  const across = d.tile === 'x' || d.tile === 'xy';
  const down = d.tile === 'y' || d.tile === 'xy';
  const cells = kitCells(d);
  for (const c of cells) {
    const img = scene.add
      .image(c.x, c.y, d.key)
      .setOrigin(0)
      .setDisplaySize(c.w + (across ? 1 : 0), c.h + (down ? 1 : 0))
      .setDepth(depth);
    if (d.tile !== 'none') img.setCrop(c.crop.x * sx, c.crop.y * sy, c.crop.w * sx, c.crop.h * sy);
    if (d.flip) img.setFlipX(true);
    if (d.alpha !== undefined) img.setAlpha(d.alpha);
    if (tint !== undefined) img.setTint(tint);
  }
  return cells.length;
}

/** Draws a placeholder's ops (kitArt.ts) with a graphics object, in the piece's own pixels. */
export function drawKitOps(g: Phaser.GameObjects.Graphics, ops: readonly KitOp[]): void {
  for (const o of ops) {
    const a = o.a ?? 1;
    switch (o.op) {
      case 'rect':
        g.fillStyle(o.c, a).fillRect(o.x, o.y, o.w, o.h);
        break;
      case 'ellipse':
        g.fillStyle(o.c, a).fillEllipse(o.x, o.y, o.rx * 2, o.ry * 2);
        break;
      case 'poly': {
        const pts: Phaser.Types.Math.Vector2Like[] = [];
        for (let i = 0; i + 1 < o.pts.length; i += 2) pts.push({ x: o.pts[i]!, y: o.pts[i + 1]! });
        g.fillStyle(o.c, a).fillPoints(pts, true);
        break;
      }
      case 'line':
        g.lineStyle(o.width, o.c, a).lineBetween(o.x0, o.y0, o.x1, o.y1);
        break;
    }
  }
}
