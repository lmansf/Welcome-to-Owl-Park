import Phaser from 'phaser';
import { LANTERNS, LANTERN_FLOOR } from '@owl-park/shared';
import { symbolTexture } from './symbols';

/** A lantern starts to fade this long before it burns out. */
const FADE_MS = 4_000;
const WARM = 0xffb347;
const CORE = 0xfff1c1;

/**
 * Light in the hub's painted paper lanterns (activities.ts): a warm, flickering glow over each lit
 * one that fades as it burns down; while the whole beam is lit every lantern blazes and the floor
 * beneath it glows. The lanterns themselves are the painting's.
 */
export class LanternGlows {
  private readonly halos: Phaser.GameObjects.Image[] = [];
  private readonly cores: Phaser.GameObjects.Image[] = [];
  private readonly wash: Phaser.GameObjects.Image;
  private lit: Record<string, number> = {};
  private glowUntil = 0;

  constructor(private readonly scene: Phaser.Scene) {
    for (const l of LANTERNS) {
      this.halos.push(scene.add.image(l.pos.x, l.pos.y, 'fx-glow').setTint(WARM).setScale(0.55).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(l.pos.y));
      this.cores.push(scene.add.image(l.pos.x, l.pos.y, 'fx-glow').setTint(CORE).setScale(0.2).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(l.pos.y + 1));
    }
    const f = LANTERN_FLOOR;
    this.wash = scene.add
      .image(f.x + f.w / 2, f.y + f.h / 3, 'fx-glow')
      .setTint(WARM)
      .setScale(f.w / 190, 0.9)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(f.y - 140);
  }

  /** The beam as the room has it (this device's clock). */
  set(beam: { lit: Record<string, number>; glowUntil: number }): void {
    this.lit = beam.lit;
    this.glowUntil = beam.glowUntil;
  }

  /** The lanterns burning at `now`. */
  litAt(now: number): string[] {
    if (this.glowUntil > now) return LANTERNS.map((l) => l.id);
    return LANTERNS.filter((l) => (this.lit[l.id] ?? 0) > now).map((l) => l.id);
  }

  glowing(now: number): boolean {
    return this.glowUntil > now;
  }

  /** A lantern just lit: a puff of sparks from it. */
  flash(id: string): void {
    const l = LANTERNS.find((x) => x.id === id);
    if (l) this.sparks(l.pos.x, l.pos.y, 10);
  }

  /** The whole beam lit at once: sparks all along it. */
  fill(): void {
    for (const l of LANTERNS) this.sparks(l.pos.x, l.pos.y, 8);
  }

  private sparks(x: number, y: number, n: number): void {
    const burst = this.scene.add
      .particles(x, y, symbolTexture(this.scene, 'star4'), {
        emitting: false,
        speed: { min: 30, max: 110 },
        lifespan: { min: 500, max: 1000 },
        scale: { start: 0.45, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [WARM, CORE, 0xffd36a],
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(y + 2);
    burst.explode(n);
    this.scene.time.delayedCall(1100, () => burst.destroy());
  }

  tick(now: number): void {
    const glowing = this.glowUntil > now;
    LANTERNS.forEach((l, i) => {
      const left = (glowing ? this.glowUntil : (this.lit[l.id] ?? 0)) - now;
      const a = left <= 0 ? 0 : Math.min(1, left / FADE_MS);
      // A candle's flicker: two waves out of step, different for each lantern.
      const flicker = 0.86 + 0.09 * Math.sin(now / 140 + i * 1.7) + 0.05 * Math.sin(now / 53 + i * 2.3);
      this.halos[i]!.setAlpha(a * (glowing ? 0.95 : 0.7) * flicker);
      this.cores[i]!.setAlpha(a * 0.9 * flicker);
    });
    this.wash.setAlpha(glowing ? Math.min(1, (this.glowUntil - now) / FADE_MS) * 0.32 : 0);
  }

  destroy(): void {
    for (const img of [...this.halos, ...this.cores, this.wash]) img.destroy();
  }
}
