import Phaser from 'phaser';
import type { InteractableDef, QuestItemKind, Vec2 } from '@owl-park/shared';
import { symbolTexture, type SymbolName } from './symbols';

const LOOK: Record<QuestItemKind, { tint: number; symbol: SymbolName }> = {
  acorn: { tint: 0xd08a4a, symbol: 'acorn' },
  gear: { tint: 0xe2bd5c, symbol: 'gear' },
  moonstone: { tint: 0xbfe4ff, symbol: 'gem' },
};

/**
 * Something a quest hides on the floor or up on a perch (an acorn, a lost gear, a moonstone): a soft
 * glow and a bobbing glint, sorted by depth like everything else, by its spot on the plan; one up on
 * a perch is drawn `top` above it (OP-084). Only the visitor on that quest sees it.
 */
export class QuestItemMarker {
  private readonly root: Phaser.GameObjects.Container;
  private readonly sparkles: Phaser.GameObjects.Particles.ParticleEmitter;
  private done = false;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly quest: string,
    readonly n: number,
    readonly kind: QuestItemKind,
    readonly pos: Vec2,
    readonly top = 0,
  ) {
    const { tint, symbol } = LOOK[kind];
    const glow = scene.add.image(0, 0, 'fx-glow').setTint(tint).setAlpha(0.55).setScale(0.42, 0.16).setBlendMode(Phaser.BlendModes.ADD);
    const halo = scene.add.image(0, -26, 'fx-glow').setTint(tint).setAlpha(0.45).setScale(0.22).setBlendMode(Phaser.BlendModes.ADD);
    const glint = scene.add.image(0, -26, symbolTexture(scene, symbol)).setTint(tint).setScale(1.1);
    this.root = scene.add.container(pos.x, pos.y - top, [glow, halo, glint]).setDepth(pos.y - 1);
    scene.tweens.add({ targets: [glint, halo], y: -34, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: glow, alpha: 0.8, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.sparkles = scene.add
      .particles(pos.x, pos.y - top - 24, symbolTexture(scene, 'star4'), {
        lifespan: { min: 500, max: 900 },
        speed: { min: 6, max: 18 },
        scale: { start: 0.3, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [tint, 0xffffff],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 300,
        maxAliveParticles: 6,
        emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-18, -18, 36, 30) } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      })
      .setDepth(pos.y);
  }

  get key(): string {
    return `${this.quest}#${this.n}`;
  }

  /** Picked up: a pop and a burst, then gone. */
  collect(): void {
    if (this.done) return;
    this.done = true;
    const { tint } = LOOK[this.kind];
    this.sparkles.stop();
    const burst = this.scene.add
      .particles(this.pos.x, this.pos.y - this.top - 26, symbolTexture(this.scene, 'star4'), {
        speed: { min: 60, max: 160 },
        lifespan: { min: 500, max: 900 },
        scale: { start: 0.55, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [tint, 0xffffff, 0xffd36a],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(this.pos.y + 1);
    burst.explode(14);
    this.scene.tweens.add({ targets: this.root, scale: 1.6, alpha: 0, duration: 260, ease: 'Quad.easeOut', onComplete: () => this.destroy() });
    this.scene.time.delayedCall(1200, () => burst.destroy());
  }

  destroy(): void {
    this.done = true;
    this.scene.tweens.killTweensOf(this.root);
    for (const child of this.root.list) this.scene.tweens.killTweensOf(child);
    this.root.destroy();
    const s = this.sparkles;
    s.stop();
    this.scene.time.delayedCall(1000, () => s.destroy());
  }
}

/** Glow colours of interactables that stay put (stalls). */
const SPOT_TINTS: Record<string, number> = { stall: 0xff2aa1 };

/**
 * A soft floor glow under an interactable that stays put (a market stall): faint from afar, brighter
 * when the owl is close enough to use it.
 */
export class SpotGlow {
  private readonly glow: Phaser.GameObjects.Image;
  private near = false;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly def: InteractableDef,
  ) {
    const { x } = def.pos;
    // On a perch (OP-084) the glow is under the thing, up on the perch's top; it sorts by its spot on the plan.
    const y = def.pos.y - (def.top ?? 0);
    const depth = def.pos.y;
    const tint = SPOT_TINTS[def.kind] ?? 0xffd36a;
    this.glow = scene.add.image(x, y, 'fx-glow').setTint(tint).setScale(0.6, 0.2).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth - 3);
  }

  setNear(near: boolean): void {
    if (near === this.near) return;
    this.near = near;
    this.scene.tweens.killTweensOf(this.glow);
    this.scene.tweens.add({ targets: this.glow, alpha: near ? 0.45 : 0.22, scaleX: near ? 0.72 : 0.6, duration: 250, ease: 'Sine.easeOut' });
  }

  /** A use: a little burst of light. */
  pulse(): void {
    const { x } = this.def.pos;
    const y = this.def.pos.y - (this.def.top ?? 0);
    const depth = this.def.pos.y;
    const tint = SPOT_TINTS[this.def.kind] ?? 0xffd36a;
    const burst = this.scene.add
      .particles(x, y - 40, symbolTexture(this.scene, 'star4'), {
        emitting: false,
        speed: { min: 40, max: 120 },
        lifespan: { min: 500, max: 900 },
        scale: { start: 0.5, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [tint, 0xffffff],
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(depth + 50);
    burst.explode(12);
    this.scene.time.delayedCall(1000, () => burst.destroy());
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.glow);
    this.glow.destroy();
  }
}

/** The moonlight's colour, where the warm air rises in it. */
const MOONLIGHT = 0xbfe4ff;

/**
 * The light a thermal rises in (thermal.ts): a shaft of moonlight down onto the floor, a pool where it
 * lands and motes carried up through it, so an owl sees where the warm air is before it stands in it.
 * It was the moonbeam until Nov 18, a thing to bask in as well; no prop does two unrelated jobs (the
 * owner's rule), so it is only the rising air's light now, with nothing to press.
 */
export class RisingLight {
  private readonly parts: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    pos: Vec2,
  ) {
    const { x, y } = pos;
    const depth = y;
    const pool = scene.add.image(x, y, 'fx-glow').setTint(MOONLIGHT).setScale(0.6, 0.2).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth - 3);
    const shaft = scene.add.image(x, y - 260, 'fx-glow').setTint(MOONLIGHT).setScale(0.45, 2.2).setAlpha(0.16).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth - 4);
    scene.tweens.add({ targets: shaft, alpha: 0.26, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const motes = scene.add
      .particles(x, y - 10, symbolTexture(scene, 'dot'), {
        speedY: { min: -40, max: -18 },
        speedX: { min: -6, max: 6 },
        lifespan: { min: 2200, max: 3400 },
        scale: { start: 0.18, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint: [MOONLIGHT, 0xffffff],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 380,
        emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-45, -20, 90, 30) } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      })
      .setDepth(depth + 2);
    this.parts.push(pool, shaft, motes);
  }

  destroy(): void {
    for (const p of this.parts) {
      this.scene.tweens.killTweensOf(p);
      p.destroy();
    }
  }
}
