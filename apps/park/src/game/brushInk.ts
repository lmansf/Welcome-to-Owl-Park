import type Phaser from 'phaser';
import { BRUSH_FADE_MS, KIT_ART, brushStrokes, brushTouch, inkLeft, livePerches, paintsStone, type BrushStone, type BrushStroke, type BrushTouch, type Perch } from '@owl-park/shared';

/**
 * The ink a room's brush stones paint (OP-235, brush.ts), on the page: which stones are painted, from
 * this owl's landings and low passes over a stone (OP-360) and those of the other owls it sees, the
 * room's perches as they stand with that ink, and each bridge and tread drawn from the kit while it
 * lasts, greying out over its last second. The page's own clock times it: what the room server believes is every stroke, so the owl
 * that painted a bridge stands on it for as long as its own page draws it.
 */

/** The kit's strokes: a bridge across and a tread up. */
const ART: Record<BrushStroke['kind'], string> = { bridge: 'kit-ink-bridge-stroke', tread: 'kit-ink-tread-stroke' };
/** How thick a stroke is drawn (room px), whatever its length. */
const THICK: Record<BrushStroke['kind'], number> = { bridge: 70, tread: 52 };
/** The grey a stroke turns as it fades. */
const FADED = 0x9a9a9a;

export class BrushInk {
  private readonly painted = new Map<string, number>();
  /** What each owl touched of the stones last frame (brushTouch), so a landing or a pass paints once. */
  private readonly touched = new Map<string, BrushTouch>();
  private readonly strokes: Array<{ s: BrushStroke; stone: BrushStone; img: Phaser.GameObjects.Image | null }> = [];

  /** `ground` is the room's ground line (screen y of height 0). */
  constructor(
    scene: Phaser.Scene,
    private readonly stones: readonly BrushStone[],
    ground: number,
  ) {
    for (const stone of stones) {
      for (const s of brushStrokes(stone)) {
        const key = ART[s.kind];
        const spec = KIT_ART[key];
        let img: Phaser.GameObjects.Image | null = null;
        if (scene.textures.exists(key) && spec) {
          // The art's stroke spans the stroke's length; its top edge is the stroke's top, as a ledge's cap is.
          const left = spec.left ?? 0;
          const right = spec.right ?? spec.w;
          const kx = (s.x1 - s.x0) / Math.max(1, right - left);
          const ky = THICK[s.kind] / Math.max(1, (spec.foot ?? spec.h) - (spec.top ?? 0));
          img = scene.add
            .image(s.x0 - left * kx, ground - s.top - (spec.top ?? 0) * ky, key)
            .setOrigin(0, 0)
            .setDisplaySize(spec.w * kx, spec.h * ky)
            .setDepth(-0.9)
            .setVisible(false);
        }
        this.strokes.push({ s, stone, img });
      }
    }
  }

  /**
   * Each frame: a landing on a stone, or a pass low over it in the air (brushTouch), by this owl or
   * another the page sees, paints it afresh. `owls` is every owl in the room by id, where it stands
   * across the room, how high it is and whether it is in the air.
   */
  update(now: number, owls: Iterable<{ id: string; x: number; z: number; grounded: boolean }>): void {
    for (const o of owls) {
      const touch = brushTouch(this.stones, o.x, o.z, o.grounded);
      if (touch.stone !== null && paintsStone(this.touched.get(o.id), touch)) this.painted.set(touch.stone, now);
      this.touched.set(o.id, touch);
    }
    for (const { stone, img } of this.strokes) {
      if (!img) continue;
      const left = inkLeft(stone, this.painted.get(stone.id), now);
      img.setVisible(left > 0);
      if (left <= 0) continue;
      if (left >= BRUSH_FADE_MS) {
        img.setAlpha(1).clearTint();
      } else {
        img.setAlpha(0.25 + (0.75 * left) / BRUSH_FADE_MS).setTint(FADED);
      }
    }
  }

  /** The room's perches with the ink as it stands at `now`, and a key that changes only when they do. */
  perches(all: readonly Perch[] | undefined, now: number): { key: string; perches: Perch[] } {
    const perches = livePerches(all, this.stones, this.painted, now);
    return { key: perches.map((p) => p.id).join('|'), perches };
  }

  /** Forget an owl that left the room. */
  forget(id: string): void {
    this.touched.delete(id);
  }

  destroy(): void {
    for (const s of this.strokes) s.img?.destroy();
    this.strokes.length = 0;
  }
}
