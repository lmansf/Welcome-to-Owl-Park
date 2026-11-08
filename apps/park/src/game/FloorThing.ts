import Phaser from 'phaser';
import { FLOOR_THING_STAND, KIT_ART, type InteractableDef, type Vec2 } from '@owl-park/shared';
import { piece } from './ambience';
import { tintImage } from './canvasTint';
import { symbolTexture } from './symbols';

/** The glow under each kind, and the colours of what flies when it is used. */
const LOOK: Record<string, { glow: number; fx: number[] }> = {
  'bird-bath': { glow: 0x9fd8ff, fx: [0xbfe8ff, 0x8fd0ff, 0xffffff] },
  mushroom: { glow: 0xffd36a, fx: [0xfff2c4, 0xffd36a, 0xffffff] },
  telescope: { glow: 0xcdb0ff, fx: [0xfff6d8, 0xcdb0ff, 0xffffff] },
  shiny: { glow: 0xffe9a0, fx: [0xffe9a0, 0xffffff, 0xffd36a] },
};

/** How far round a thing's spot a tap on the floor counts as a tap on the thing (room px), past its art. */
const TAP_PAD = 24;

/**
 * Something to use out on a plaza's floor (plazaFloor.ts): a bird bath, mushrooms or a telescope drawn
 * from its kit art, or a shiny thing drawn as a glint. A soft glow under it brightens when the owl can
 * reach it, a tap on it walks the owl over and uses it, and a use answers with a little show: water
 * splashes up, the mushrooms squash and puff spores, stars twinkle over the telescope. A shiny thing is
 * shared as a leaf pile is: picked up, it is gone for everyone until another turns up.
 */
export class FloorThing {
  private readonly art: Phaser.GameObjects.Image | null;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly glint: Phaser.GameObjects.Container | null;
  private near = false;
  /** A shiny thing: when it is back (ms, this device's clock); 0 while it is here. */
  private until = 0;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly def: InteractableDef,
  ) {
    const foot = this.foot;
    const look = LOOK[def.kind] ?? LOOK['shiny']!;
    this.glow = tintImage(scene, scene.add.image(foot.x, foot.y, 'fx-glow'), 'fx-glow', look.glow)
      .setScale(0.55, 0.16)
      .setAlpha(0.2)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(foot.y - 3);
    this.art = def.piece && scene.textures.exists(def.piece) ? piece(scene, foot.x, foot.y, def.piece).setDepth(foot.y).setFlipX(!!def.flip) : null;
    this.glint = def.kind === 'shiny' ? this.drawGlint() : null;
  }

  get id(): string {
    return this.def.id;
  }

  get pos(): Vec2 {
    return this.def.pos;
  }

  /** Where its art stands: just behind where the owl stands to use it. */
  private get foot(): Vec2 {
    return { x: this.def.pos.x, y: this.def.pos.y - FLOOR_THING_STAND };
  }

  /** A shiny thing: a gem's glint on the floor, twinkling now and then so the eye finds it across the plaza. */
  private drawGlint(): Phaser.GameObjects.Container {
    const scene = this.scene;
    const { x, y } = this.foot;
    const gem = symbolTexture(scene, 'gem');
    const star = symbolTexture(scene, 'star4');
    const shade = tintImage(scene, scene.add.image(0, 4, 'fx-glow'), 'fx-glow', 0x000000).setScale(0.22, 0.06).setAlpha(0.45);
    const stone = tintImage(scene, scene.add.image(0, -6, gem), gem, 0xffe9a0).setScale(0.75);
    const spark = tintImage(scene, scene.add.image(8, -16, star), star, 0xffffff).setScale(0.35).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    const root = scene.add.container(x, y, [shade, stone, spark]).setDepth(y);
    scene.tweens.add({ targets: spark, alpha: 1, scale: 0.7, angle: 90, duration: 380, yoyo: true, repeat: -1, repeatDelay: 1600, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: stone, y: -9, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return root;
  }

  /** Here to use: always, but for a shiny thing someone picked up. */
  get here(): boolean {
    return this.until === 0;
  }

  /** A tap at this point of the room is on the thing: on its art or close round its spot. */
  hit(p: Vec2): boolean {
    if (!this.here) return false;
    if (this.art) {
      const b = this.art.getBounds();
      if (p.x >= b.left - TAP_PAD && p.x <= b.right + TAP_PAD && p.y >= b.top && p.y <= b.bottom + TAP_PAD) return true;
    }
    return Math.hypot(p.x - this.def.pos.x, p.y - this.def.pos.y) <= 40 + TAP_PAD;
  }

  setNear(near: boolean): void {
    if (near === this.near || this.destroyed) return;
    this.near = near;
    this.scene.tweens.killTweensOf(this.glow);
    this.scene.tweens.add({ targets: this.glow, alpha: near && this.here ? 0.5 : 0.2, scaleX: near ? 0.7 : 0.55, duration: 250, ease: 'Sine.easeOut' });
  }

  /** Used by this owl: the show for its kind. */
  respond(): void {
    if (this.destroyed) return;
    switch (this.def.kind) {
      case 'bird-bath':
        return this.splash();
      case 'mushroom':
        return this.bounce();
      case 'telescope':
        return this.stargaze();
      default:
        return;
    }
  }

  /** Water splashes up out of the basin and falls back in drops. */
  private splash(): void {
    const { x, y } = this.foot;
    const h = this.art ? this.art.displayHeight : (KIT_ART[this.def.piece ?? '']?.h ?? 200);
    const drops = this.scene.add
      .particles(x, y - h * 0.9, symbolTexture(this.scene, 'bubble'), {
        emitting: false,
        speed: { min: 120, max: 300 },
        angle: { min: 220, max: 320 },
        gravityY: 700,
        scale: { start: 0.45, end: 0.2 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 600, max: 1000 },
        tint: LOOK['bird-bath']!.fx,
        emitZone: { type: 'random', source: new Phaser.Geom.Ellipse(0, 0, 90, 16) } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      })
      .setDepth(y + 50);
    drops.explode(26);
    this.scene.time.delayedCall(1200, () => drops.destroy());
  }

  /** The caps squash under the owl and spring back, puffing glowing spores. */
  private bounce(): void {
    const { x, y } = this.foot;
    if (this.art) {
      const sx = this.art.scaleX;
      const sy = this.art.scaleY;
      this.scene.tweens.killTweensOf(this.art);
      this.art.setScale(sx, sy);
      this.scene.tweens.add({ targets: this.art, scaleY: sy * 0.72, scaleX: sx * 1.12, duration: 110, yoyo: true, ease: 'Quad.easeOut', onComplete: () => this.art?.setScale(sx, sy) });
    }
    const spores = this.scene.add
      .particles(x, y - 60, symbolTexture(this.scene, 'dot'), {
        emitting: false,
        speedY: { min: -90, max: -30 },
        speedX: { min: -50, max: 50 },
        scale: { start: 0.25, end: 0 },
        alpha: { start: 0.95, end: 0 },
        lifespan: { min: 900, max: 1600 },
        tint: LOOK['mushroom']!.fx,
        blendMode: Phaser.BlendModes.ADD,
        emitZone: { type: 'random', source: new Phaser.Geom.Ellipse(0, 0, 110, 40) } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      })
      .setDepth(y + 50);
    spores.explode(22);
    this.scene.time.delayedCall(1800, () => spores.destroy());
  }

  /** The telescope tips up a little and stars twinkle out over its end. */
  private stargaze(): void {
    const { x, y } = this.foot;
    if (this.art) {
      const angle = this.art.angle;
      this.scene.tweens.add({ targets: this.art, angle: angle + (this.def.flip ? 4 : -4), duration: 260, yoyo: true, ease: 'Sine.easeInOut', onComplete: () => this.art?.setAngle(angle) });
    }
    const end = { x: x + (this.def.flip ? -50 : 50), y: y - (this.art?.displayHeight ?? 200) * 0.95 };
    const stars = this.scene.add
      .particles(end.x, end.y, symbolTexture(this.scene, 'star5'), {
        emitting: false,
        speed: { min: 30, max: 110 },
        angle: { min: 200, max: 340 },
        scale: { start: 0.5, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 900, max: 1500 },
        tint: LOOK['telescope']!.fx,
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(y + 50);
    stars.explode(10);
    this.scene.time.delayedCall(1600, () => stars.destroy());
  }

  /** From the room's list of used-up objects: gone until `until`, without a show (0: here). */
  setUntil(until: number): void {
    if (!this.glint) return;
    if (until > Date.now()) {
      this.until = until;
      this.glint.setVisible(false);
      this.glow.setVisible(false);
    } else if (this.until) {
      this.respawn();
    }
  }

  /** Someone picked the shiny thing up: a burst of sparkle, and it is gone until `until`. */
  poof(until: number): void {
    if (this.destroyed || !this.glint) return;
    this.until = Math.max(until, Date.now() + 1000);
    const { x, y } = this.foot;
    const burst = this.scene.add
      .particles(x, y - 10, symbolTexture(this.scene, 'star4'), {
        emitting: false,
        speed: { min: 60, max: 180 },
        scale: { start: 0.5, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 500, max: 900 },
        tint: LOOK['shiny']!.fx,
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(y + 50);
    burst.explode(16);
    const glint = this.glint;
    this.scene.tweens.add({ targets: glint, y: y - 40, alpha: 0, duration: 260, ease: 'Quad.easeIn', onComplete: () => glint.setVisible(false).setPosition(x, y) });
    this.glow.setVisible(false);
    this.scene.time.delayedCall(1000, () => burst.destroy());
  }

  /** Another shiny thing turns up where the last one was. */
  private respawn(): void {
    if (!this.glint) return;
    this.until = 0;
    this.scene.tweens.killTweensOf(this.glint);
    this.glint.setVisible(true).setAlpha(0).setScale(0.4);
    this.glow.setVisible(true);
    this.scene.tweens.add({ targets: this.glint, alpha: 1, scale: 1, duration: 500, ease: 'Back.easeOut' });
  }

  tick(now: number): void {
    if (this.until && now >= this.until) this.respawn();
  }

  destroy(): void {
    this.destroyed = true;
    this.scene.tweens.killTweensOf(this.glow);
    this.glow.destroy();
    if (this.art) {
      this.scene.tweens.killTweensOf(this.art);
      this.art.destroy();
    }
    if (this.glint) {
      for (const child of this.glint.list) this.scene.tweens.killTweensOf(child);
      this.scene.tweens.killTweensOf(this.glint);
      this.glint.destroy();
    }
  }
}

/** The kinds a plaza's floor has that FloorThing draws (plazaFloor.ts). */
export const FLOOR_KINDS: ReadonlySet<string> = new Set(['bird-bath', 'mushroom', 'telescope', 'shiny']);
