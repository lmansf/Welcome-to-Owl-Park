import Phaser from 'phaser';
import type { InteractableDef, Vec2 } from '@owl-park/shared';
import { symbolTexture } from './symbols';

/** Autumn leaf colours, darkest first (the bottom of the pile is in shade). */
const LEAVES = [0x8c4a2f, 0xb5452a, 0xc65f2c, 0xd9622b, 0xe08a35, 0xe8a13a, 0xf2c14e];
const SMOKE = [0xe9e4da, 0xd8d2c8, 0xbfb8ad];
const PILE_W = 62;
const PILE_H = 52;
const LEAF_COUNT = 48;

/** A small seeded random source, so a pile looks the same every time the room opens. */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A pile of fallen leaves drawn from leaf shapes (no painted art): flopping into it throws the
 * leaves up in a poof of smoke and the pile is gone for everyone until it blows back together.
 */
export class LeafPile {
  private readonly root: Phaser.GameObjects.Container;
  private readonly leaves: Phaser.GameObjects.Image[] = [];
  /** When the pile is back (ms, this device's clock); 0 while it is here. */
  private until = 0;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly def: InteractableDef,
  ) {
    const { x, y } = def.pos;
    // A pile up on a perch (OP-084) is drawn that much higher, and sorts with the owls by its spot on the plan.
    const lift = def.top ?? 0;
    const rnd = seeded(def.id);
    // A soft shadow under the pile (the glow texture in black: no hard edge to read as a log).
    const shade = scene.add.image(0, 4, 'fx-glow').setTint(0x000000).setScale(0.62, 0.13).setAlpha(0.5);
    const spots: Array<{ x: number; y: number; depth: number }> = [];
    for (let i = 0; i < LEAF_COUNT; i++) {
      // A low dome: wider at the bottom, the top leaves near the middle.
      const u = rnd() * 2 - 1;
      const top = -PILE_H * Math.sqrt(Math.max(0, 1 - u * u));
      const v = rnd();
      spots.push({ x: u * PILE_W, y: top * v + 4 * (1 - v), depth: v });
    }
    spots.sort((a, b) => a.y - b.y);
    for (const p of spots) {
      // Leaves on top catch the light; the ones underneath are darker.
      const tint = LEAVES[Math.min(LEAVES.length - 1, Math.floor(rnd() * 4 + p.depth * 3))]!;
      const leaf = scene.add
        .image(p.x, p.y, symbolTexture(scene, 'fallen'))
        .setTint(tint)
        .setRotation(rnd() * Math.PI * 2)
        .setScale(0.85 + rnd() * 0.45, 0.6 + rnd() * 0.35);
      this.leaves.push(leaf);
    }
    this.root = scene.add.container(x, y - lift, [shade, ...this.leaves]).setDepth(y - 2);
    // A breath of wind now and then stirs the top leaves.
    for (const leaf of this.leaves.slice(-6)) {
      scene.tweens.add({ targets: leaf, angle: leaf.angle + 10, duration: 1400 + rnd() * 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: rnd() * 1500 });
    }
  }

  get id(): string {
    return this.def.id;
  }

  get pos(): Vec2 {
    return this.def.pos;
  }

  /** Here to flop into. */
  get here(): boolean {
    return this.until === 0;
  }

  /** From the room's list of used-up objects: gone until `until`, without a show (0: here). */
  setUntil(until: number): void {
    if (until > Date.now()) {
      this.until = until;
      this.root.setVisible(false);
    } else if (this.until) {
      this.respawn();
    }
  }

  /** Someone flopped in: leaves and smoke fly, and the pile is gone until `until`. */
  poof(until: number): void {
    if (this.destroyed) return;
    this.until = Math.max(until, Date.now() + 1000);
    const { x, y } = this.def.pos;
    const up = y - (this.def.top ?? 0);
    const scene = this.scene;
    const leaves = scene.add
      .particles(x, up - 18, symbolTexture(scene, 'fallen'), {
        emitting: false,
        speed: { min: 140, max: 360 },
        angle: { min: 200, max: 340 },
        gravityY: 520,
        rotate: { start: 0, end: 540 },
        scale: { start: 0.9, end: 0.6 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 900, max: 1500 },
        tint: LEAVES,
        emitZone: { type: 'random', source: new Phaser.Geom.Ellipse(0, 0, PILE_W * 2, PILE_H) } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      })
      .setDepth(y + 40);
    leaves.explode(40);
    const smoke = scene.add
      .particles(x, up - 14, symbolTexture(scene, 'puff'), {
        emitting: false,
        speed: { min: 20, max: 90 },
        angle: { min: 180, max: 360 },
        scale: { start: 0.9, end: 3 },
        alpha: { start: 0.85, end: 0 },
        lifespan: { min: 700, max: 1200 },
        tint: SMOKE,
        emitZone: { type: 'random', source: new Phaser.Geom.Ellipse(0, 0, PILE_W * 1.6, PILE_H * 0.8) } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      })
      .setDepth(y + 41);
    smoke.explode(16);
    scene.tweens.add({ targets: this.root, scaleY: 0.15, scaleX: 1.25, alpha: 0, duration: 200, ease: 'Quad.easeIn', onComplete: () => this.root.setVisible(false) });
    scene.time.delayedCall(1700, () => {
      leaves.destroy();
      smoke.destroy();
    });
  }

  /** Leaves drift down and gather again. */
  private respawn(): void {
    this.until = 0;
    const { x, y } = this.def.pos;
    this.scene.tweens.killTweensOf(this.root);
    this.root.setVisible(true).setAlpha(0).setScale(0.6, 0.2);
    this.scene.tweens.add({ targets: this.root, alpha: 1, scaleX: 1, scaleY: 1, duration: 650, ease: 'Back.easeOut' });
    const drift = this.scene.add
      .particles(x, y - (this.def.top ?? 0) - 120, symbolTexture(this.scene, 'fallen'), {
        emitting: false,
        speedY: { min: 60, max: 120 },
        speedX: { min: -40, max: 40 },
        rotate: { start: 0, end: 360 },
        scale: { start: 0.7, end: 0.6 },
        alpha: { start: 1, end: 0 },
        lifespan: 900,
        tint: LEAVES,
        emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-PILE_W, -30, PILE_W * 2, 60) } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      })
      .setDepth(y + 1);
    drift.explode(14);
    this.scene.time.delayedCall(1200, () => drift.destroy());
  }

  tick(now: number): void {
    if (this.until && now >= this.until) this.respawn();
  }

  destroy(): void {
    this.destroyed = true;
    this.scene.tweens.killTweensOf(this.root);
    for (const leaf of this.leaves) this.scene.tweens.killTweensOf(leaf);
    this.root.destroy();
  }
}

/**
 * A feather left where the leaves were: it rises, turns, then glides into the owl. `from` is the
 * pile's spot on the plan and `lift` how high it is drawn above it (a pile up on a perch); `to` is
 * where the owl is drawn.
 */
export function featherFind(scene: Phaser.Scene, from: Vec2, to: () => Vec2, onArrive: () => void, lift = 0): void {
  const y = from.y - lift;
  const img = scene.add.image(from.x, y - 30, symbolTexture(scene, 'feather')).setTint(0xf6f1e3).setScale(1.4).setDepth(from.y + 60);
  const glow = scene.add.image(from.x, y - 30, 'fx-glow').setTint(0xffd36a).setScale(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(from.y + 59);
  scene.tweens.add({ targets: [img, glow], y: y - 110, duration: 700, ease: 'Sine.easeOut' });
  scene.tweens.add({ targets: img, angle: { from: -25, to: 25 }, duration: 350, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
  scene.time.delayedCall(800, () => {
    const start = { x: img.x, y: img.y };
    const state = { t: 0 };
    scene.tweens.add({
      targets: state,
      t: 1,
      duration: 450,
      ease: 'Quad.easeIn',
      onUpdate: () => {
        const end = to();
        const px = start.x + (end.x - start.x) * state.t;
        const py = start.y + (end.y - 70 - start.y) * state.t;
        img.setPosition(px, py).setScale(1.4 - state.t * 0.9);
        glow.setPosition(px, py);
      },
      onComplete: () => {
        img.destroy();
        glow.destroy();
        onArrive();
      },
    });
  });
}
