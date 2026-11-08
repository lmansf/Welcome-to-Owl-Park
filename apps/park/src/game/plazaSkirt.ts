import type Phaser from 'phaser';
import { ROOM_H, ROOM_W, backgroundTiles, type RoomDef } from '@owl-park/shared';
import { onCanvas } from './canvasTint';

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
      if ((t.rate ?? 1) !== 1 || t.plain) continue;
      const foot = t.y + ROOM_H;
      if (foot < s.rect.y || foot > s.rect.y + s.rect.h) continue;
      if (t.x + ROOM_W <= s.rect.x || t.x >= s.rect.x + s.rect.w) continue;
      out.push({ key: t.key, x: t.x, y: foot, h: Math.min(s.skirt, ROOM_H) });
    }
  }
  return out;
}

/** Draws the skirts; how many strips. None on the Canvas renderer, which can't fade an image across it. */
export function drawSkirts(scene: Phaser.Scene, room: RoomDef): number {
  if (onCanvas(scene)) return 0;
  let n = 0;
  for (const s of skirtStrips(room)) {
    if (!scene.textures.exists(s.key)) continue;
    const tex = scene.textures.get(s.key);
    const src = tex.getSourceImage() as { width: number; height: number };
    // The painting's file may be a sharper copy than its screen: the strip's frame is in its own pixels.
    const fh = Math.round((s.h / ROOM_H) * src.height);
    const name = `skirt-${fh}`;
    if (!tex.has(name)) tex.add(name, 0, 0, src.height - fh, src.width, fh);
    scene.add
      .image(s.x, s.y, s.key, name)
      .setOrigin(0)
      .setDisplaySize(ROOM_W + 1, s.h)
      .setFlipY(true)
      // Whole at the painting's foot (the quad's top), gone at its bottom.
      .setAlpha(1, 1, 0, 0)
      .setDepth(SKIRT_DEPTH);
    n++;
  }
  return n;
}
