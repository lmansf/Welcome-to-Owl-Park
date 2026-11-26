import type Phaser from 'phaser';
import { edgeArt, edgeDraws, type EdgeDraw, type RoomDef } from '@owl-park/shared';
import { rasterNames } from './artNames';
import { PUBLISHED_ART } from './publishedArt';

/**
 * Draws the pieces that shape a room's edges, seen from above (edges.ts): leaf litter over the floor's
 * seams and each plaza's worn ring, then the pillars, the rim and the roots and ferns along the floor's edges, each at its key's
 * size, all behind the owls and under the floor's edge line (walkFloor.ts), so the line the owl stops at
 * runs along each bump and is never covered. A key with no art is drawn from its placeholder (art.ts),
 * but for two kinds that read as unfinished in their placeholders (edgeShown).
 */
export const EDGE_DEPTH = { litter: -0.9, piece: -0.8 } as const;

/** Whether an edge piece's own art is published (an artist's file under its key), not its placeholder. */
export function edgeDelivered(key: string, published: ReadonlyMap<string, string> = PUBLISHED_ART): boolean {
  return published.has(`${key}.svg`) || rasterNames(key, 1, published).length > 0;
}

/**
 * Whether a piece is drawn. Two kinds wait for their artist's file and are not drawn from placeholders
 * (the Nov 25 cleanup walk):
 * - a plaza's worn ring: its placeholder, a pale translucent disc ringed with stones, read as a debug
 *   overlay (OP-456). The Great Hollow's own ring (`edge-hall-`, the moonbeam's pool of light, OP-348)
 *   is drawn to be seen, and stays.
 * - a bump along the floor's front: its placeholder, a dark band of fronds, read as an unfinished fence
 *   strip along the foot of most rooms (OP-453), and on the neon street as mushrooms (OP-482). The floor
 *   is still cut by its profile, so where the owl stops does not change; the room's foot fades out
 *   instead (frontFadeBands).
 * Every other piece is drawn as before.
 */
export function edgeShown(d: Pick<EdgeDraw, 'key' | 'kind'>, delivered: (key: string) => boolean = edgeDelivered): boolean {
  if (delivered(d.key)) return true;
  if (d.kind === 'ring') return d.key.startsWith('edge-hall-');
  if (d.kind === 'bump') return edgeArt(d.key).side !== 'front';
  return true;
}

/** Where the floor's front runs in a room whose front pieces wait for their art (the line their boxes stand on), or null where none waits. */
export function waitingFront(room: Pick<RoomDef, 'edges'>, delivered: (key: string) => boolean = edgeDelivered): number | null {
  let front: number | null = null;
  for (const d of edgeDraws(room.edges ?? [])) {
    if (d.kind !== 'bump' || edgeShown(d, delivered)) continue;
    front = Math.min(front ?? Infinity, d.y + (edgeArt(d.key).base ?? 0));
  }
  return front;
}

/** How many pieces were drawn. */
export function drawEdges(scene: Phaser.Scene, room: Pick<RoomDef, 'edges' | 'size'>, delivered: (key: string) => boolean = edgeDelivered): number {
  let n = 0;
  for (const d of edgeDraws(room.edges ?? [])) {
    if (!edgeShown(d, delivered) || !scene.textures.exists(d.key)) continue;
    const img = scene.add
      .image(d.x, d.y, d.key)
      .setOrigin(0)
      .setDisplaySize(d.w, d.h)
      .setDepth(d.kind === 'litter' || d.kind === 'ring' ? EDGE_DEPTH.litter : EDGE_DEPTH.piece);
    if (d.flip) img.setFlipX(true);
    n++;
  }
  const front = waitingFront(room, delivered);
  if (front !== null) {
    const g = scene.add.graphics().setDepth(EDGE_DEPTH.piece);
    for (const b of frontFadeBands(room.size, front)) g.fillStyle(FRONT_FADE.color, b.alpha).fillRect(0, b.y, room.size.w, b.h);
  }
  return n;
}

/** The fade along a room's foot where its front pieces wait for their art: from this far above the front line, darkening to the room's foot. */
export const FRONT_FADE = { above: 70, color: 0x060c1c, steps: [0.1, 0.12, 0.14, 0.16, 0.18] } as const;

/**
 * The fade's bands, top to bottom (room px), each from its top to the room's foot: laid one over
 * another, so the dark builds up toward the foot and the floor eases out of the screen. A plain shape,
 * under the owls and the floor's edge line, until the front's own art comes.
 */
export function frontFadeBands(size: { w: number; h: number }, front: number): Array<{ y: number; h: number; alpha: number }> {
  const top = Math.max(0, front - FRONT_FADE.above);
  const band = (size.h - top) / FRONT_FADE.steps.length;
  if (band <= 0) return [];
  return FRONT_FADE.steps.map((alpha, i) => {
    const y = Math.round(top + i * band);
    return { y, h: size.h - y, alpha };
  });
}
