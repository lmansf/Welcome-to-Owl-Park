/**
 * The room's tall standing art, each piece fading while the visitor's own owl is behind it (OP-346):
 * the rule is seeThrough.ts.
 */
import Phaser from 'phaser';
import type { Rect, Vec2 } from '@owl-park/shared';
import { SEE_THROUGH, hiddenBehind } from './seeThrough';

/**
 * Where in the room a picture's own drawing is (room px): its tap area where it has one hugging the
 * drawing (ambience.ts), else its frame with a tenth off each side, since a standing thing seldom fills
 * its frame's corners.
 */
export function artBox(img: Phaser.GameObjects.Image): Rect {
  const left = img.x - img.originX * img.displayWidth;
  const top = img.y - img.originY * img.displayHeight;
  const hit = img.input?.hitArea as Phaser.Geom.Rectangle | undefined;
  if (hit instanceof Phaser.Geom.Rectangle && img.frame.width > 0 && img.frame.height > 0) {
    const kx = img.displayWidth / img.frame.width;
    const ky = img.displayHeight / img.frame.height;
    const x = img.flipX ? img.frame.width - hit.x - hit.width : hit.x;
    return { x: left + x * kx, y: top + hit.y * ky, w: hit.width * kx, h: hit.height * ky };
  }
  return { x: left + img.displayWidth * 0.1, y: top, w: img.displayWidth * 0.8, h: img.displayHeight };
}

/**
 * Every box a picture's own drawing fills (room px): the ones it was given, for a piece that is not one
 * shape (`artBoxes` in its data: the guardian's head and its body, guardianView.ts), else its one box.
 */
export function artBoxes(img: Phaser.GameObjects.Image): Rect[] {
  const given = img.data ? (img.getData('artBoxes') as Rect[] | undefined) : undefined;
  return Array.isArray(given) && given.length > 0 ? given : [artBox(img)];
}

interface Tall {
  img: Phaser.GameObjects.Image;
  /** Its own alpha, when nothing is behind it. */
  full: number;
  faded: boolean;
  tween: Phaser.Tweens.Tween | null;
}

/** The tall standing art of one room, each fading while the visitor's own owl is behind it. */
export class SeeThrough {
  private readonly tall: Tall[] = [];

  /** `standing`: the room's art that stands among the owls, each with its foot as its depth (ambience.ts). */
  constructor(
    private readonly scene: Phaser.Scene,
    standing: readonly Phaser.GameObjects.Image[],
  ) {
    for (const img of standing) if (img.displayHeight >= SEE_THROUGH.tall) this.tall.push({ img, full: img.alpha, faded: false, tween: null });
  }

  /** One frame: where the visitor's own owl stands, and how high it is in the air. */
  frame(feet: Vec2, z: number): void {
    for (const t of this.tall) {
      if (!t.img.active) continue;
      const hidden = artBoxes(t.img).some((box) => hiddenBehind(feet, z, box, t.img.depth));
      if (hidden === t.faded) continue;
      t.faded = hidden;
      t.tween?.stop();
      t.tween = this.scene.tweens.add({ targets: t.img, alpha: hidden ? t.full * SEE_THROUGH.alpha : t.full, duration: SEE_THROUGH.ms, ease: 'Sine.easeOut' });
    }
  }

  /** The art gone see-through now, by its texture's key (for the tests). */
  faded(): string[] {
    return this.tall.filter((t) => t.faded).map((t) => t.img.texture.key);
  }
}
