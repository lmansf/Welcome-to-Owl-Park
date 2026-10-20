import Phaser from 'phaser';
import { BITE_WINDOW_MS, BOBBER_AT, type Vec2 } from '@owl-park/shared';
import type { Owl } from './Owl';
import { symbolTexture } from './symbols';

/** What comes out of the pond, by fish id: its colour, and the boot is a boot. */
const CATCH: Record<string, { tint: number; key: 'fx-fish' | 'fx-boot' }> = {
  minnow: { tint: 0xd7e3ea, key: 'fx-fish' },
  perch: { tint: 0xb5d86a, key: 'fx-fish' },
  trout: { tint: 0xf4a7c0, key: 'fx-fish' },
  catfish: { tint: 0xb59a86, key: 'fx-fish' },
  boot: { tint: 0x8a6a52, key: 'fx-boot' },
  koi: { tint: 0xffb300, key: 'fx-fish' },
};
/** The bobber flies out this long. */
const CAST_MS = 450;
/** On the water, behind an owl on the jetty. */
const WATER_DEPTH = 600;

/** White shapes for a catch, tinted per fish. */
function ensureCatchTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('fx-fish')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(26, 16, 42, 22);
    g.fillTriangle(42, 16, 60, 3, 60, 29);
    g.fillStyle(0x0c1e36, 1);
    g.fillCircle(13, 13, 2.6);
    g.generateTexture('fx-fish', 62, 32);
    g.destroy();
  }
  if (!scene.textures.exists('fx-boot')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(10, 0, 20, 30, 4);
    g.fillRoundedRect(10, 20, 36, 14, 6);
    g.generateTexture('fx-boot', 48, 36);
    g.destroy();
  }
}

/**
 * Fishing from the grove's jetty (activities.ts): a rod in the owl's wing, the line out to a bobber on
 * the pond, the bobber bobbing until the bite, when it dips and splashes; reeling in brings the
 * catch arcing out of the water. Only this visitor's line is drawn.
 */
export class FishingLine {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly bobber: Phaser.GameObjects.Graphics;
  private state: 'idle' | 'out' = 'idle';
  private castAt = 0;
  private biteAt = 0;
  private splashed = false;

  constructor(private readonly scene: Phaser.Scene) {
    ensureCatchTextures(scene);
    this.g = scene.add.graphics();
    this.bobber = scene.add.graphics().setDepth(WATER_DEPTH).setVisible(false);
    this.bobber.fillStyle(0xf6f1e3, 1).fillCircle(0, 0, 9);
    this.bobber.fillStyle(0xe5484d, 1).slice(0, 0, 9, Math.PI, 0, false).fillPath();
    this.bobber.lineStyle(2, 0x0c1e36, 0.8).strokeCircle(0, 0, 9);
  }

  /** Whether a line is in the water, and if a fish is on the hook at `now`. */
  status(now: number): 'idle' | 'out' | 'bite' | 'gone' {
    if (this.state === 'idle') return 'idle';
    if (now < this.biteAt) return 'out';
    return now <= this.biteAt + BITE_WINDOW_MS ? 'bite' : 'gone';
  }

  /** When the fish bites on the line out (this device's clock). */
  biteAtTime(): number {
    return this.biteAt;
  }

  /** The line goes out; a fish bites at `biteAt` (this device's clock). */
  cast(biteAt: number, now: number): void {
    this.state = 'out';
    this.castAt = now;
    this.biteAt = biteAt;
    this.splashed = false;
    this.bobber.setVisible(true);
  }

  /** The line comes in; a catch arcs out of the water to the owl. */
  reel(owl: Owl, caught: string | null): void {
    this.end();
    if (!caught) return;
    const look = CATCH[caught] ?? CATCH['minnow']!;
    const to = { x: owl.pos.x + owl.anchor('chest').x, y: owl.pos.y + owl.anchor('chest').y };
    const fish = this.scene.add.image(BOBBER_AT.x, BOBBER_AT.y, look.key).setTint(look.tint).setDepth(owl.depth + 2).setScale(caught === 'koi' ? 1.3 : 1);
    this.splash(BOBBER_AT, 10);
    this.scene.tweens.add({ targets: fish, x: to.x, duration: 650, ease: 'Sine.easeInOut' });
    this.scene.tweens.add({ targets: fish, y: to.y - 120, duration: 325, ease: 'Quad.easeOut', yoyo: true, onComplete: () => fish.destroy() });
    this.scene.tweens.add({ targets: fish, angle: -360, duration: 650 });
  }

  /** Put the line away (walked off, left the room). */
  end(): void {
    this.state = 'idle';
    this.g.clear();
    this.bobber.setVisible(false);
  }

  private splash(at: Vec2, n: number): void {
    const burst = this.scene.add
      .particles(at.x, at.y, symbolTexture(this.scene, 'dot'), {
        emitting: false,
        speed: { min: 40, max: 120 },
        angle: { min: 200, max: 340 },
        gravityY: 300,
        lifespan: { min: 400, max: 700 },
        scale: { start: 0.35, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint: [0xbfe4ff, 0xffffff],
      })
      .setDepth(WATER_DEPTH + 1);
    burst.explode(n);
    this.scene.time.delayedCall(800, () => burst.destroy());
  }

  /** Redraw the rod, the line and the bobber for this frame. */
  tick(now: number, owl: Owl): void {
    this.g.clear();
    if (this.state === 'idle') return;
    const dir = BOBBER_AT.x >= owl.pos.x ? 1 : -1;
    const chest = owl.anchor('chest');
    const base = { x: owl.pos.x + chest.x + dir * 6, y: owl.pos.y + chest.y + 6 };
    const tip = { x: base.x + dir * 70, y: base.y - 80 };
    // Where the bobber is: flying out, then on the water, bobbing; dipping while a fish bites.
    const t = Math.min(1, (now - this.castAt) / CAST_MS);
    let b: Vec2;
    if (t < 1) {
      b = { x: tip.x + (BOBBER_AT.x - tip.x) * t, y: tip.y + (BOBBER_AT.y - tip.y) * t - Math.sin(t * Math.PI) * 60 };
    } else {
      if (!this.splashed) {
        this.splashed = true;
        this.splash(BOBBER_AT, 6);
      }
      const biting = now >= this.biteAt && now <= this.biteAt + BITE_WINDOW_MS;
      b = { x: BOBBER_AT.x + (biting ? Math.sin(now / 35) * 3 : 0), y: BOBBER_AT.y + (biting ? 9 : Math.sin(now / 420) * 2.5) };
    }
    this.bobber.setPosition(b.x, b.y);
    this.g.setDepth(owl.depth + 1);
    this.g.lineStyle(4, 0x6b4a2b, 1).lineBetween(base.x, base.y, tip.x, tip.y);
    // The line sags a little between the rod's tip and the bobber.
    const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(tip.x, tip.y), new Phaser.Math.Vector2((tip.x + b.x) / 2, Math.max(tip.y, b.y) + 24), new Phaser.Math.Vector2(b.x, b.y - 8));
    this.g.lineStyle(1.5, 0xf6f1e3, 0.85);
    curve.draw(this.g, 24);
  }

  destroy(): void {
    this.g.destroy();
    this.bobber.destroy();
  }
}
