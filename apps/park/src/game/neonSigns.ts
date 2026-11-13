import type Phaser from 'phaser';
import { KIT_ART, litPerches, signEnding, signLit, type NeonSign, type Perch } from '@owl-park/shared';

/**
 * A room's neon signs on their circuits (circuit.ts), on the page: each sign drawn from the kit, lit,
 * flickering over its last moments, or dark, by park time (the room server's clock), so every page
 * sees the same sign lit; and the room's perches less the signs that are dark, which an owl drops through.
 */

/** The kit's sign: a box of neon tubes, stood on along its top. */
export const SIGN_ART = 'kit-neon-sign-platform';
/** A dark sign: its tubes out, the box still there to be seen. */
const DARK = 0x3a3f55;
const DARK_ALPHA = 0.55;
/** How fast a sign flickers as it goes out (ms a beat). */
const FLICKER_MS = 90;

export class NeonSigns {
  private readonly signs: Array<{ sign: NeonSign; img: Phaser.GameObjects.Image | null }> = [];

  /** `ground` is the room's ground line (screen y of height 0). */
  constructor(
    scene: Phaser.Scene,
    private readonly all: readonly NeonSign[],
    ground: number,
  ) {
    const spec = KIT_ART[SIGN_ART];
    for (const sign of all) {
      let img: Phaser.GameObjects.Image | null = null;
      if (scene.textures.exists(SIGN_ART) && spec) {
        // The box spans the sign's width; its top edge is the sign's top, as a ledge's cap is.
        const left = spec.left ?? 0;
        const right = spec.right ?? spec.w;
        const k = (sign.x1 - sign.x0) / Math.max(1, right - left);
        img = scene.add
          .image(sign.x0 - left * k, ground - sign.top - (spec.top ?? 0) * k, SIGN_ART)
          .setOrigin(0, 0)
          .setDisplaySize(spec.w * k, spec.h * k)
          .setDepth(-0.9);
      }
      this.signs.push({ sign, img });
    }
  }

  /** Each frame, at park time `t`: every sign lit, flickering out or dark. */
  update(t: number): void {
    for (const { sign, img } of this.signs) {
      if (!img) continue;
      const lit = signLit(sign, t) && !(signEnding(sign, t) && Math.floor(t / FLICKER_MS) % 2 === 1);
      if (lit) img.setAlpha(1).clearTint();
      else img.setAlpha(DARK_ALPHA).setTint(DARK);
    }
  }

  /** The room's perches with the signs as they stand at park time `t`, and a key that changes only when they do. */
  perches(perches: readonly Perch[] | undefined, t: number): { key: string; perches: Perch[] } {
    const out = litPerches(perches, this.all, t);
    return { key: this.all.map((s) => (signLit(s, t) ? '1' : '0')).join(''), perches: out };
  }

  destroy(): void {
    for (const s of this.signs) s.img?.destroy();
    this.signs.length = 0;
  }
}
