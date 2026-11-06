import type Phaser from 'phaser';
import { BRUSH_FADE_MS, KIT_ART, brushStrokes, inkLeft, livePerches, stoneUnder, type BrushStone, type BrushStroke, type Perch } from '@owl-park/shared';

/**
 * The ink a room's brush stones paint (OP-235, brush.ts), on the page: which stones are painted, from
 * this owl's landings and the landings of the other owls it sees, the room's perches as they stand
 * with that ink, and each bridge and tread drawn from the kit while it lasts, greying out over its last
 * second. The page's own clock times it: what the room server believes is every stroke, so the owl
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
  /** Where each owl stood last frame: on a stone (its id) or not, so a landing paints once. */
  private readonly onStone = new Map<string, string | null>();
  private readonly strokes: Array<{ s: BrushStroke; stone: BrushStone; img: Phaser.GameObjects.Image | null }> = [];
  private liveKey = '';

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
   * Each frame: a landing on a stone, by this owl or another the page sees, paints it afresh. `owls` is
   * every owl in the room by id, where it stands across the room, how high it is and whether it is in the air.
   */
  update(now: number, owls: Iterable<{ id: string; x: number; z: number; grounded: boolean }>): void {
    for (const o of owls) {
      const stone = o.grounded ? (stoneUnder(this.stones, o.x, o.z)?.id ?? null) : null;
      if (stone && this.onStone.get(o.id) !== stone) this.painted.set(stone, now);
      this.onStone.set(o.id, stone);
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

  /** Whether the perches changed since `key`, by the last call to perches. */
  changed(key: string): boolean {
    const was = this.liveKey;
    this.liveKey = key;
    return was !== key;
  }

  /** Forget an owl that left the room. */
  forget(id: string): void {
    this.onStone.delete(id);
  }

  destroy(): void {
    for (const s of this.strokes) s.img?.destroy();
    this.strokes.length = 0;
  }
}
