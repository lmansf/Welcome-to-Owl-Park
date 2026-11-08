import type Phaser from 'phaser';
import { ROOM_H, ROOM_W, backgroundTiles, type RoomDef } from '@owl-park/shared';

/** Drawn over the kit's back layer (-0.97), under the edge pieces (-0.9). */
export const SKIRT_DEPTH = -0.965;

/** Where each strip of a skirt goes: a painted screen's foot, mirrored down over the surface below it. */
export interface SkirtStrip {
  key: string;
  x: number;
  y: number;
  /** How many room px of the painting's foot are mirrored, and how far down they reach. */
  h: number;
}

/**
 * The strips: for each kit surface with a skirt (a plaza, plaza.ts), each painted screen of the room
 * whose foot is the surface's top gets its foot mirrored down over the surface. Mirrored at the foot,
 * the painting and the strip meet pixel for pixel, so there is no seam; fading, the strip gives way to
 * the surface's texture.
 */
export function skirtStrips(room: Pick<RoomDef, 'backgrounds' | 'background' | 'kit'>): SkirtStrip[] {
  const out: SkirtStrip[] = [];
  for (const s of room.kit?.surfaces ?? []) {
    if (!s.skirt) continue;
    for (const t of backgroundTiles(room as RoomDef)) {
      if ((t.rate ?? 1) !== 1) continue;
      const foot = t.y + ROOM_H;
      if (foot < s.rect.y || foot > s.rect.y + s.rect.h) continue;
      if (t.x + ROOM_W <= s.rect.x || t.x >= s.rect.x + s.rect.w) continue;
      out.push({ key: t.key, x: t.x, y: foot, h: Math.min(s.skirt, ROOM_H) });
    }
  }
  return out;
}

/**
 * The faded, mirrored copy of a painting's foot, made once as a texture of its own: the same on WebGL
 * and on the Canvas renderer (which can fade an image only this way), and untouched when the painting
 * is later swapped for its sharper copy (the strip fades out, so the softer source never shows).
 */
export function skirtTexture(scene: Phaser.Scene, key: string, h: number): string | null {
  const out = `${key}:skirt-${h}`;
  if (scene.textures.exists(out)) return out;
  if (!scene.textures.exists(key)) return null;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  // The painting's file may be a sharper copy than its screen: the strip is in its own pixels.
  const fh = Math.max(1, Math.round((h / ROOM_H) * src.height));
  const canvas = scene.textures.createCanvas(out, src.width, fh);
  if (!canvas) return null;
  const ctx = canvas.context;
  ctx.save();
  ctx.translate(0, fh);
  ctx.scale(1, -1);
  ctx.drawImage(src, 0, src.height - fh, src.width, fh, 0, 0, src.width, fh);
  ctx.restore();
  // Whole at the painting's foot (the strip's top), gone at its bottom, easing out so the plaza's own
  // texture comes up gently rather than showing through just under the join.
  const fade = ctx.createLinearGradient(0, 0, 0, fh);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.25, 'rgba(0,0,0,0.92)');
  fade.addColorStop(0.6, 'rgba(0,0,0,0.45)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, src.width, fh);
  ctx.globalCompositeOperation = 'source-over';
  canvas.refresh();
  return out;
}

/** Draws the skirts; how many strips. */
export function drawSkirts(scene: Phaser.Scene, room: RoomDef): number {
  let n = 0;
  for (const s of skirtStrips(room)) {
    const key = skirtTexture(scene, s.key, s.h);
    if (!key) continue;
    scene.add.image(s.x, s.y, key).setOrigin(0).setDisplaySize(ROOM_W + 1, s.h).setDepth(SKIRT_DEPTH);
    n++;
  }
  return n;
}
