import Phaser from 'phaser';
import { updraftEnding, updraftOn, type Updraft } from '@owl-park/shared';

/**
 * The leaves in a room's updrafts (OP-226, updraft.ts), drawn: each column a stream of small leaves
 * rising from the ground line to its top while it is on, thinning out in its last moments, and none
 * while it is off. The leaves are the only thing that shows a column, so a gust that drops is seen
 * before it lets an owl fall. No art: the leaf is drawn once into a small texture.
 */

const LEAF = 'fx-updraft-leaf';
const LEAF_TINTS = [0x8fbf5a, 0xb7d36b, 0xd9b45a, 0x6f9f4a];
/** A column's leaves a second while it blows, and while it thins out. */
const RATE_ON = 26;
const RATE_ENDING = 7;

function leafTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(LEAF)) return LEAF;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(8, 5, 14, 7);
  g.lineStyle(1, 0xdddddd, 1).lineBetween(2, 5, 14, 5);
  g.generateTexture(LEAF, 16, 10);
  g.destroy();
  return LEAF;
}

export class UpdraftLeaves {
  private readonly streams: Array<{ u: Updraft; e: Phaser.GameObjects.Particles.ParticleEmitter; rate: number }> = [];

  /** `ground` is the room's ground line (screen y of height 0); `depth` draws the leaves behind the owls. */
  constructor(scene: Phaser.Scene, columns: readonly Updraft[], ground: number, depth: number, calm: () => boolean) {
    const key = leafTexture(scene);
    for (const u of columns) {
      const life = (u.top / 300) * 1000;
      const e = scene.add.particles(0, 0, key, {
        x: { min: u.x, max: u.x + u.w },
        y: ground,
        speedY: { min: -330, max: -270 },
        speedX: { min: -25, max: 25 },
        lifespan: life,
        rotate: { start: 0, end: 360 },
        scale: { min: 0.7, max: 1.2 },
        alpha: { start: 0.95, end: 0 },
        tint: LEAF_TINTS,
        frequency: 1000 / RATE_ON,
        emitting: false,
      });
      e.setDepth(depth);
      this.streams.push({ u, e, rate: 0 });
    }
    this.calm = calm;
  }

  private readonly calm: () => boolean;

  /** Each frame, by the room server's clock: each column's leaves on, thinning, or off. */
  update(serverNow: number): void {
    for (const s of this.streams) {
      const rate = !updraftOn(s.u, serverNow) ? 0 : updraftEnding(s.u, serverNow) ? RATE_ENDING : this.calm() ? RATE_ON / 2 : RATE_ON;
      if (rate === s.rate) continue;
      s.rate = rate;
      if (rate === 0) s.e.stop();
      else {
        s.e.frequency = 1000 / rate;
        if (!s.e.emitting) s.e.start();
      }
    }
  }

  destroy(): void {
    for (const s of this.streams) s.e.destroy();
    this.streams.length = 0;
  }
}
