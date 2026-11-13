import type Phaser from 'phaser';
import { edgeDraws, type RoomDef } from '@owl-park/shared';

/**
 * Draws the pieces that shape a room's edges, seen from above (edges.ts): leaf litter over the floor's
 * seams and each plaza's worn ring, then the pillars, the rim and the roots and ferns along the floor's edges, each at its key's
 * size, all behind the owls and under the floor's edge line (walkFloor.ts), so the line the owl stops at
 * runs along each bump and is never covered. A key with no art is drawn from its placeholder (art.ts).
 */
export const EDGE_DEPTH = { litter: -0.9, piece: -0.8 } as const;

/** How many pieces were drawn. */
export function drawEdges(scene: Phaser.Scene, room: Pick<RoomDef, 'edges'>): number {
  let n = 0;
  for (const d of edgeDraws(room.edges ?? [])) {
    if (!scene.textures.exists(d.key)) continue;
    const img = scene.add
      .image(d.x, d.y, d.key)
      .setOrigin(0)
      .setDisplaySize(d.w, d.h)
      .setDepth(d.kind === 'litter' || d.kind === 'ring' ? EDGE_DEPTH.litter : EDGE_DEPTH.piece);
    if (d.flip) img.setFlipX(true);
    n++;
  }
  return n;
}
