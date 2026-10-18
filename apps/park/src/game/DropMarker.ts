import Phaser from 'phaser';
import type { DropView, ItemKind } from '@owl-park/shared';
import { symbolTexture, type SymbolName } from './symbols';

/** A hint of what kind of thing waits at a drop, without giving the find away. */
const LOOK: Record<ItemKind, { tint: number; symbol: SymbolName }> = {
  wear: { tint: 0xffd36a, symbol: 'star5' },
  pet: { tint: 0x6ef2c2, symbol: 'heart' },
  fx: { tint: 0xff2aa1, symbol: 'star4' },
  emote: { tint: 0x4fa3ff, symbol: 'note' },
};

/**
 * One of this visitor's finds waiting on the floor: a soft glow, a bobbing glint and a few
 * sparkles, sorted by depth like everything else. Only the finder sees it.
 */
export class DropMarker {
  readonly view: DropView;
  private readonly root: Phaser.GameObjects.Container;
  private readonly sparkles: Phaser.GameObjects.Particles.ParticleEmitter;
  private done = false;

  constructor(
    private readonly scene: Phaser.Scene,
    view: DropView,
  ) {
    this.view = view;
    const { tint, symbol } = LOOK[view.kind];
    const glow = scene.add.image(0, 0, 'fx-glow').setTint(tint).setAlpha(0.55).setScale(0.42, 0.16).setBlendMode(Phaser.BlendModes.ADD);
    const halo = scene.add.image(0, -26, 'fx-glow').setTint(tint).setAlpha(0.5).setScale(0.22).setBlendMode(Phaser.BlendModes.ADD);
    const glint = scene.add.image(0, -26, symbolTexture(scene, symbol)).setTint(tint).setScale(0.8);
    this.root = scene.add.container(view.x, view.y, [glow, halo, glint]).setDepth(view.y - 1);
    scene.tweens.add({ targets: [glint, halo], y: -34, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: glow, alpha: 0.8, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.sparkles = scene.add
      .particles(view.x, view.y - 24, symbolTexture(scene, 'star4'), {
        lifespan: { min: 500, max: 900 },
        speed: { min: 6, max: 18 },
        scale: { start: 0.3, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [tint, 0xffffff],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 260,
        maxAliveParticles: 8,
        emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-18, -18, 36, 30) } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      })
      .setDepth(view.y);
  }

  get x(): number {
    return this.view.x;
  }
  get y(): number {
    return this.view.y;
  }

  /** The pickup: a pop and a burst, then gone. */
  collect(): void {
    if (this.done) return;
    this.done = true;
    const { tint } = LOOK[this.view.kind];
    this.sparkles.stop();
    const burst = this.scene.add
      .particles(this.view.x, this.view.y - 26, symbolTexture(this.scene, 'star4'), {
        speed: { min: 60, max: 160 },
        lifespan: { min: 500, max: 900 },
        scale: { start: 0.55, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [tint, 0xffffff, 0xffd36a],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(this.view.y + 1);
    burst.explode(16);
    this.scene.tweens.add({ targets: this.root, scale: 1.6, alpha: 0, duration: 260, ease: 'Quad.easeOut', onComplete: () => this.destroy() });
    this.scene.time.delayedCall(1200, () => burst.destroy());
  }

  destroy(): void {
    this.done = true;
    this.scene.tweens.killTweensOf(this.root);
    this.root.destroy();
    const s = this.sparkles;
    s.stop();
    this.scene.time.delayedCall(1000, () => s.destroy());
  }
}
