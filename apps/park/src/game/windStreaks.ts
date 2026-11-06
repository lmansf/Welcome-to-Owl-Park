import Phaser from 'phaser';
import type { WindCurrent } from '@owl-park/shared';

/**
 * The streaks in a room's wind currents (OP-275, wind.ts), drawn: each current a stream of thin pale
 * streaks running downwind along its band, so a visitor sees where the air will carry a glide and
 * which way. The streak is drawn once into a small texture. A realm's `wind-current` piece (its
 * `art`, a kit slot), once its artist delivers it and it has loaded, is drawn along the band under
 * the streaks, repeated across and mirrored for a current blowing west.
 */

const STREAK = 'fx-wind-streak';
/** How fast the streaks run (px/s): quicker than the owl it carries, so the air reads as moving. */
const STREAK_SPEED = 520;
/** Streaks a second per 100 px of current; half that with Calm on. */
const RATE_PER_100 = 2.2;

function streakTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(STREAK)) return STREAK;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  for (let i = 0; i < 6; i++) {
    g.fillStyle(0xffffff, (i + 1) / 6);
    g.fillRect(i * 10, 1, 10, 2);
  }
  g.generateTexture(STREAK, 60, 4);
  g.destroy();
  return STREAK;
}

export class WindStreaks {
  private readonly emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private readonly bands: Phaser.GameObjects.TileSprite[] = [];

  /** `ground` is the room's ground line (screen y of height 0); `depth` draws the streaks behind the owls. */
  constructor(scene: Phaser.Scene, currents: readonly WindCurrent[], ground: number, depth: number, calm: boolean) {
    const key = streakTexture(scene);
    for (const w of currents) {
      const len = w.x1 - w.x0;
      if (w.art && scene.textures.exists(w.art)) {
        const band = scene.add.tileSprite(w.x0, ground - w.z, len, scene.textures.get(w.art).getSourceImage().height, w.art).setOrigin(0, 0.5).setDepth(depth).setFlipX(w.dir < 0);
        this.bands.push(band);
      }
      const rate = ((len / 100) * RATE_PER_100) / (calm ? 2 : 1);
      const e = scene.add.particles(0, 0, key, {
        x: w.dir > 0 ? { min: w.x0 - 40, max: w.x0 + len * 0.3 } : { min: w.x1 - len * 0.3, max: w.x1 + 40 },
        y: { min: ground - w.z - 110, max: ground - w.z + 20 },
        speedX: w.dir * STREAK_SPEED,
        lifespan: (len / STREAK_SPEED) * 1000,
        scaleX: { min: 0.8, max: 2 },
        scaleY: 1,
        rotate: w.dir < 0 ? 180 : 0,
        alpha: { start: 0.55, end: 0 },
        tint: [0xf6f1e3, 0xd8e6f2, 0xbcd3e8],
        frequency: 1000 / Math.max(1, rate),
      });
      e.setDepth(depth);
      this.emitters.push(e);
    }
  }

  destroy(): void {
    for (const e of this.emitters) e.destroy();
    this.emitters.length = 0;
    for (const b of this.bands) b.destroy();
    this.bands.length = 0;
  }
}
