import Phaser from 'phaser';
import { NEST_SPOTS, getFurniture, type NestLayout, type NestSpot, type NestSpotId } from '@owl-park/shared';
import { ensurePlaceholder } from './art';
import { footOrigin } from './fit';
import { pieceDepth } from './nestPlan';

/** The rings that mark the spots while the owner decorates: above every piece and owl, below the HUD's own. */
const RING_DEPTH = 2000;
const GOLD = 0xc9a227;
const CREAM = 0xf6f1e3;
/** How big a spot's tap target is: room for the biggest piece of its place standing in it. */
const HIT = { floor: { w: 170, up: 190, down: 30 }, wall: { w: 160, up: 160, down: 10 } } as const;

/**
 * A nest's furniture: each piece drawn with its bottom centre on its spot, sorted in depth with the
 * owls (wall pieces and rugs behind them). In Decorate mode the twelve spots show as rings the
 * owner taps to choose one; the chosen one is gold.
 */
export class NestDecor {
  private readonly pieces = new Map<NestSpotId, { item: string; image: Phaser.GameObjects.Image }>();
  private readonly rings = new Map<NestSpotId, { ring: Phaser.GameObjects.Graphics; hit: Phaser.GameObjects.Zone; label: Phaser.GameObjects.Text }>();

  constructor(private readonly scene: Phaser.Scene) {}

  /** Show this layout: pieces that moved or arrived pop in, pieces taken away go. */
  apply(layout: NestLayout): void {
    for (const spot of NEST_SPOTS) {
      const item = layout[spot.id] ?? null;
      const had = this.pieces.get(spot.id);
      if (had?.item === item) continue;
      had?.image.destroy();
      this.pieces.delete(spot.id);
      const piece = item ? getFurniture(item) : null;
      if (!piece || piece.place !== spot.place) continue;
      ensurePlaceholder(this.scene, piece.art);
      // Stood on its spot by what it draws, not by its frame's padding (OP-127).
      const foot = footOrigin(piece.art);
      const image = this.scene.add.image(spot.x, spot.y, piece.art).setOrigin(foot.x, foot.y).setDisplaySize(piece.size.w, piece.size.h).setDepth(pieceDepth(spot, piece));
      // A piece arriving settles into place.
      const sx = image.scaleX;
      const sy = image.scaleY;
      image.setScale(sx * 0.86, sy * 0.86).setAlpha(0.4);
      this.scene.tweens.add({ targets: image, scaleX: sx, scaleY: sy, alpha: 1, duration: 260, ease: 'Back.easeOut' });
      this.pieces.set(spot.id, { item: piece.id, image });
    }
  }

  /** The pieces standing in the nest, by art key, for the fit overlay (OP-127). */
  fitSprites(): Array<{ key: string; image: Phaser.GameObjects.Image }> {
    return [...this.pieces.values()].map((p) => ({ key: getFurniture(p.item)?.art ?? p.item, image: p.image }));
  }

  /** Decorate mode: a ring on every spot, `selected` in gold; a tap on a spot (or on its piece) picks it. */
  showSpots(selected: NestSpotId, onPick: (id: NestSpotId) => void): void {
    this.hideSpots();
    NEST_SPOTS.forEach((spot, i) => {
      const box = HIT[spot.place];
      const ring = this.scene.add.graphics().setDepth(RING_DEPTH);
      const label = this.scene.add
        .text(spot.x, ringCentre(spot).y, String(i + 1), { fontSize: '22px', fontStyle: 'bold', color: '#0C1E36', fontFamily: 'system-ui, sans-serif' })
        .setOrigin(0.5)
        .setDepth(RING_DEPTH + 1);
      const hit = this.scene.add
        .zone(spot.x, spot.y - (box.up - box.down) / 2, box.w, box.up + box.down)
        .setDepth(RING_DEPTH)
        .setInteractive({ useHandCursor: true });
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        // Only a tap on the room itself: not one on the Decorate sheet above a spot's ring.
        if (p.downElement !== this.scene.game.canvas || p.upElement !== this.scene.game.canvas) return;
        event.stopPropagation();
        onPick(spot.id);
      });
      this.rings.set(spot.id, { ring, hit, label });
    });
    this.select(selected);
  }

  /** Mark the chosen spot. */
  select(id: NestSpotId): void {
    for (const spot of NEST_SPOTS) {
      const r = this.rings.get(spot.id);
      if (!r) continue;
      const on = spot.id === id;
      const c = ringCentre(spot);
      r.ring.clear();
      // A dark halo under the line keeps it readable on a pale floor or wall.
      for (const [width, colour, alpha] of [
        [on ? 9 : 7, 0x0c1e36, 0.45],
        [on ? 5 : 3, on ? GOLD : CREAM, on ? 1 : 0.75],
      ] as const) {
        r.ring.lineStyle(width, colour, alpha);
        if (spot.place === 'floor') r.ring.strokeEllipse(c.x, c.y, on ? 150 : 120, on ? 54 : 44);
        else r.ring.strokeRoundedRect(c.x - 55, c.y - 55, 110, 110, 18);
      }
      r.ring.fillStyle(on ? GOLD : CREAM, on ? 1 : 0.85);
      r.ring.fillCircle(c.x, c.y, 17);
    }
  }

  hideSpots(): void {
    for (const r of this.rings.values()) {
      r.ring.destroy();
      r.hit.destroy();
      r.label.destroy();
    }
    this.rings.clear();
  }

  /** Where the camera looks to show a spot and the piece in it. */
  focusOf(id: NestSpotId): { x: number; y: number } {
    const spot = NEST_SPOTS.find((s) => s.id === id) ?? NEST_SPOTS[0]!;
    return { x: spot.x, y: spot.place === 'wall' ? spot.y - 70 : spot.y - 90 };
  }

  destroy(): void {
    this.hideSpots();
    for (const p of this.pieces.values()) p.image.destroy();
    this.pieces.clear();
  }
}

/** The middle of a spot's ring: on the floor at the piece's feet, on the wall in the middle of where it hangs. */
function ringCentre(spot: NestSpot): { x: number; y: number } {
  return spot.place === 'floor' ? { x: spot.x, y: spot.y - 6 } : { x: spot.x, y: spot.y - 62 };
}

/**
 * A small picture of a piece for the Decorate sheet, drawn from its texture (whatever the art is:
 * the SVG placeholder or the painted piece), or null when it cannot be drawn.
 */
export function pieceThumb(scene: Phaser.Scene, key: string, w = 96, h = 80): string | null {
  try {
    if (!scene.textures.exists(key)) return null;
    const frame = scene.textures.getFrame(key);
    const src = frame.source.image as CanvasImageSource | undefined;
    if (!src) return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const scale = Math.min(w / frame.cutWidth, h / frame.cutHeight);
    const dw = frame.cutWidth * scale;
    const dh = frame.cutHeight * scale;
    ctx.drawImage(src, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, (w - dw) / 2, h - dh, dw, dh);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
