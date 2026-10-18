/**
 * Collectible effects worn by an owl: glows, particles and little rigs, tinted by the variant's
 * colourway. Cheap by design (a few emitters capped at a couple of dozen live particles, no
 * shaders), so a room full of sparkling owls still runs on a phone.
 *
 * Emitters sit at (0, 0) and follow the owl, so trails stay where they were dropped in the
 * world; glows and orbiting rigs live in the owl's own containers and turn and bob with it.
 */
import Phaser from 'phaser';
import { hexToInt, parseVariant } from '@owl-park/shared';
import { symbolTexture, type SymbolName } from './symbols';

export type AnchorName = 'head' | 'eyes' | 'eyeL' | 'eyeR' | 'beak' | 'chest' | 'feet';

/** What an effect needs from the owl it decorates. Anchors are world offsets from the feet. */
export interface FxHost {
  readonly scene: Phaser.Scene;
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  /** 1 facing right, -1 facing left. */
  facing(): 1 | -1;
  isWalking(): boolean;
  anchor(name: AnchorName): { x: number; y: number };
  /** The same anchor in owl canvas units inside the owl's containers (origin at the feet, facing right). */
  localAnchor(name: AnchorName): { x: number; y: number };
  /** Containers inside the owl (owl canvas units, origin at the feet): behind and in front of the layers. */
  readonly back: Phaser.GameObjects.Container;
  readonly front: Phaser.GameObjects.Container;
  /** The body layer's texture, for outline effects. */
  bodyTexture(): string;
  /** A horizontal jolt of the whole owl (glitch), in owl canvas units. */
  setJitter(dx: number): void;
}

export interface FxHandle {
  tick(now: number): void;
  destroy(): void;
}

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;
type EmitterConfig = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
const ADD = Phaser.BlendModes.ADD;

/** Brighten a colour toward white (for cores and highlights). */
function lighten(c: number, k: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const m = (x: number) => Math.round(x + (255 - x) * k);
  return (m(r) << 16) | (m(g) << 8) | m(b);
}
function darken(c: number, k: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const m = (x: number) => Math.round(x * (1 - k));
  return (m(r) << 16) | (m(g) << 8) | m(b);
}

class Rig implements FxHandle {
  readonly emitters: Array<{ e: Emitter; at: Parameters<FxHost['anchor']>[0]; dx?: number; dy?: number; mirror?: boolean; zone?: boolean }> = [];
  readonly objects: Phaser.GameObjects.GameObject[] = [];
  readonly tweens: Phaser.Tweens.Tween[] = [];
  onTick: ((now: number) => void) | null = null;

  constructor(readonly host: FxHost) {}

  emitter(symbol: SymbolName, at: Parameters<FxHost['anchor']>[0], config: EmitterConfig, opts: { dx?: number; dy?: number; mirror?: boolean; behind?: boolean } = {}): Emitter {
    const scene = this.host.scene;
    const e = scene.add.particles(0, 0, symbolTexture(scene, symbol), { maxAliveParticles: 24, ...config });
    const a = this.host.anchor(at);
    e.startFollow(this.host as unknown as Phaser.Types.Math.Vector2Like, a.x + (opts.dx ?? 0), a.y + (opts.dy ?? 0));
    e.setDepth(this.host.depth + (opts.behind ? -0.5 : 0.5));
    this.emitters.push({ e, at, ...(opts.dx !== undefined ? { dx: opts.dx } : {}), ...(opts.dy !== undefined ? { dy: opts.dy } : {}), ...(opts.mirror !== undefined ? { mirror: opts.mirror } : {}) });
    return e;
  }

  image(where: 'back' | 'front', x: number, y: number, key: string, tint: number, alpha: number, blend = ADD): Phaser.GameObjects.Image {
    const img = this.host.scene.add.image(x, y, key).setTint(tint).setAlpha(alpha).setBlendMode(blend);
    this.host[where].add(img);
    this.objects.push(img);
    return img;
  }

  tween(config: Phaser.Types.Tweens.TweenBuilderConfig): void {
    this.tweens.push(this.host.scene.tweens.add(config));
  }

  tick(now: number): void {
    const dir = this.host.facing();
    for (const it of this.emitters) {
      const a = this.host.anchor(it.at);
      it.e.followOffset.set(a.x + (it.dx ?? 0) * (it.mirror === false ? 1 : dir), a.y + (it.dy ?? 0));
      it.e.setDepth(this.host.depth + 0.5);
    }
    this.onTick?.(now);
  }

  destroy(): void {
    for (const t of this.tweens) t.remove();
    for (const it of this.emitters) {
      it.e.stopFollow();
      it.e.stop();
      // Let the last particles fade out where they are, then remove the emitter.
      const e = it.e;
      this.host.scene.time.delayedCall(2500, () => e.destroy());
    }
    for (const o of this.objects) o.destroy();
    this.host.setJitter(0);
    this.emitters.length = 0;
    this.objects.length = 0;
    this.onTick = null;
  }
}

const rnd = Phaser.Math.FloatBetween;

/** Build an effect for an owl; null for anything that is not an effect variant. */
export function createFx(host: FxHost, variant: string): FxHandle | null {
  const v = parseVariant(variant);
  if (!v || v.item.kind !== 'fx' || !v.colour?.tint) return null;
  const tint = hexToInt(v.colour.tint);
  const light = lighten(tint, 0.55);
  const rig = new Rig(host);
  const scene = host.scene;
  const glow = 'fx-glow';

  switch (v.item.id) {
    case 'aura': {
      const g = rig.image('back', 0, -120, glow, tint, 0.45).setScale(1.5, 1.7);
      rig.tween({ targets: g, alpha: 0.75, scaleX: 1.65, scaleY: 1.85, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      break;
    }
    case 'sparkle':
      rig.emitter('star4', 'chest', { lifespan: { min: 500, max: 900 }, speed: { min: 4, max: 18 }, scale: { start: 0.45, end: 0 }, alpha: { start: 1, end: 0 }, tint: [tint, light], blendMode: ADD, frequency: 160, emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-36, -50, 72, 100) } as Phaser.Types.GameObjects.Particles.EmitZoneData });
      break;
    case 'eye-flames':
      for (const at of ['eyeL', 'eyeR'] as const) {
        rig.emitter('flame', at, { lifespan: { min: 260, max: 460 }, speedY: { min: -70, max: -40 }, speedX: { min: -8, max: 8 }, scale: { start: 0.42, end: 0.08 }, alpha: { start: 0.95, end: 0 }, tint: [tint, light, 0xffd36a], blendMode: ADD, frequency: 55 });
      }
      break;
    case 'ember-trail': {
      const e = rig.emitter('dot', 'feet', { lifespan: { min: 500, max: 900 }, speed: { min: 6, max: 22 }, gravityY: -30, scale: { start: 0.32, end: 0 }, alpha: { start: 1, end: 0 }, tint: [tint, 0xffd36a, light], blendMode: ADD, frequency: 400 }, { dy: -6 });
      rig.onTick = () => (e.frequency = host.isWalking() ? 35 : 420);
      break;
    }
    case 'frost-breath': {
      // One emitter per direction: the breath always leaves the beak forwards.
      const puff = (min: number, max: number) => rig.emitter('puff', 'beak', { lifespan: { min: 700, max: 1000 }, speedX: { min, max }, speedY: { min: -10, max: 8 }, scale: { start: 0.18, end: 0.6 }, alpha: { start: 0.65, end: 0 }, tint: [light, tint], emitting: false }, { dx: 8 });
      const right = puff(40, 90);
      const left = puff(-90, -40);
      let nextAt = 0;
      rig.onTick = (now) => {
        if (now < nextAt) return;
        nextAt = now + rnd(1800, 2800);
        (host.facing() > 0 ? right : left).explode(7);
      };
      break;
    }
    case 'snowfall':
      rig.emitter('flake', 'head', { lifespan: { min: 1600, max: 2300 }, speedY: { min: 18, max: 36 }, speedX: { min: -10, max: 10 }, rotate: { min: 0, max: 360 }, scale: { min: 0.2, max: 0.38 }, alpha: { start: 0.95, end: 0 }, tint: [tint, light, 0xffffff], frequency: 200, emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-60, -40, 120, 20) } as Phaser.Types.GameObjects.Particles.EmitZoneData });
      break;
    case 'fireflies':
      rig.emitter('dot', 'chest', { lifespan: { min: 1800, max: 2800 }, speed: { min: 8, max: 22 }, scale: { start: 0.2, end: 0.06 }, alpha: { start: 1, end: 0 }, tint: [tint, light], blendMode: ADD, frequency: 380, emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-60, -60, 120, 110) } as Phaser.Types.GameObjects.Particles.EmitZoneData });
      break;
    case 'hearts':
      rig.emitter('heart', 'head', { lifespan: { min: 1100, max: 1500 }, speedY: { min: -48, max: -28 }, speedX: { min: -14, max: 14 }, scale: { start: 0.36, end: 0.2 }, alpha: { start: 1, end: 0 }, tint: [tint, light], frequency: 520 }, { dy: -6 });
      break;
    case 'music-notes':
      rig.emitter('note', 'head', { lifespan: { min: 1200, max: 1600 }, speedY: { min: -40, max: -24 }, speedX: { min: 6, max: 22 }, rotate: { min: -15, max: 15 }, scale: { start: 0.42, end: 0.26 }, alpha: { start: 1, end: 0 }, tint: [tint, light], frequency: 640 }, { dx: 14, dy: -4 });
      break;
    case 'star-halo': {
      const stars = Array.from({ length: 6 }, () => rig.image('front', 0, 0, symbolTexture(scene, 'star4'), tint, 0.95).setScale(0.55));
      rig.onTick = (now) => {
        const a = host.localAnchor('head');
        for (let i = 0; i < stars.length; i++) {
          const t = now / 1300 + (i * Math.PI * 2) / stars.length;
          stars[i]!.setPosition(a.x + Math.cos(t) * 42, a.y - 26 + Math.sin(t) * 9);
          stars[i]!.setAlpha(Math.sin(t) > 0 ? 1 : 0.55);
        }
      };
      break;
    }
    case 'moon-halo': {
      const halo = rig.image('back', 0, 0, glow, tint, 0.35).setScale(0.55, 0.35);
      const moon = rig.image('front', 0, 0, symbolTexture(scene, 'crescent'), light, 1, Phaser.BlendModes.NORMAL).setScale(0.9);
      rig.onTick = (now) => {
        const a = host.localAnchor('head');
        const y = a.y - 34 + Math.sin(now / 700) * 3;
        moon.setPosition(a.x + 10, y);
        halo.setPosition(a.x + 10, y);
      };
      break;
    }
    case 'leaf-swirl':
      rig.emitter('leaf', 'chest', { lifespan: { min: 1200, max: 1700 }, speed: { min: 30, max: 55 }, angle: { min: 0, max: 360 }, gravityY: 25, rotate: { start: 0, end: 360 }, scale: { min: 0.3, max: 0.45 }, alpha: { start: 1, end: 0 }, tint: [tint, darken(tint, 0.25), light], frequency: 260 });
      break;
    case 'petal-swirl':
      rig.emitter('petal', 'chest', { lifespan: { min: 1300, max: 1800 }, speed: { min: 24, max: 46 }, angle: { min: 0, max: 360 }, gravityY: 18, rotate: { start: 0, end: 270 }, scale: { min: 0.26, max: 0.4 }, alpha: { start: 1, end: 0 }, tint: [tint, light], frequency: 240 });
      break;
    case 'bubbles':
      rig.emitter('bubble', 'beak', { lifespan: { min: 1400, max: 1800 }, speedY: { min: -42, max: -22 }, speedX: { min: -10, max: 10 }, scale: { start: 0.24, end: 0.46 }, alpha: { start: 0.95, end: 0 }, tint: [tint, light], frequency: 430 });
      break;
    case 'smoke-wisps':
      rig.emitter('puff', 'feet', { lifespan: { min: 1600, max: 2200 }, speedY: { min: -30, max: -14 }, speedX: { min: -8, max: 8 }, scale: { start: 0.35, end: 1 }, alpha: { start: 0.32, end: 0 }, tint: [darken(tint, 0.35), tint], frequency: 320, emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-30, -20, 60, 10) } as Phaser.Types.GameObjects.Particles.EmitZoneData }, { behind: true });
      break;
    case 'rainbow-trail': {
      const hues = [0, 45, 90, 160, 220, 280].map((d) => Phaser.Display.Color.HSVToRGB(((Phaser.Display.Color.IntegerToColor(tint).h * 360 + d) % 360) / 360, 0.75, 1).color as number);
      const e = rig.emitter('dot', 'chest', { lifespan: 650, speed: { min: 2, max: 8 }, scale: { start: 0.46, end: 0 }, alpha: { start: 0.9, end: 0 }, tint: hues, blendMode: ADD, frequency: 600 }, { dy: 20 });
      rig.onTick = () => (e.frequency = host.isWalking() ? 22 : 600);
      break;
    }
    case 'lightning': {
      const sparks = rig.emitter('spark', 'chest', { lifespan: { min: 160, max: 320 }, speed: { min: 60, max: 140 }, rotate: { min: 0, max: 360 }, scale: { start: 0.4, end: 0 }, alpha: { start: 1, end: 0 }, tint: [tint, light, 0xffffff], blendMode: ADD, emitting: false });
      const bolt = rig.image('front', 0, 0, symbolTexture(scene, 'bolt'), light, 0).setScale(2.2);
      let nextAt = 0;
      rig.onTick = (now) => {
        if (now < nextAt) return;
        nextAt = now + rnd(1400, 3000);
        const a = host.localAnchor('head');
        bolt.setPosition(a.x + rnd(-50, 50), a.y - rnd(10, 40)).setAngle(rnd(-20, 20)).setAlpha(1);
        scene.tweens.add({ targets: bolt, alpha: 0, duration: 260, ease: 'Quad.easeIn' });
        sparks.explode(9);
      };
      break;
    }
    case 'neon-outline': {
      const outline = rig.image('back', 0, 6, host.bodyTexture(), tint, 0.65).setOrigin(0.5, 1).setDisplaySize(216, 254);
      rig.tween({ targets: outline, alpha: 0.95, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      break;
    }
    case 'shadow-aura': {
      const g = rig.image('back', 0, -110, glow, darken(tint, 0.65), 0.55, Phaser.BlendModes.NORMAL).setScale(1.6, 1.8);
      rig.tween({ targets: g, alpha: 0.75, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      rig.emitter('puff', 'feet', { lifespan: { min: 1400, max: 1900 }, speedY: { min: -26, max: -12 }, scale: { start: 0.3, end: 0.8 }, alpha: { start: 0.4, end: 0 }, tint: darken(tint, 0.7), frequency: 380, emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-34, -16, 68, 8) } as Phaser.Types.GameObjects.Particles.EmitZoneData }, { behind: true });
      break;
    }
    case 'sunbeam': {
      const beam = rig.image('back', 0, -240, glow, light, 0.35).setScale(0.75, 3.2);
      rig.tween({ targets: beam, alpha: 0.55, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      rig.emitter('dot', 'head', { lifespan: { min: 1400, max: 2000 }, speedY: { min: 6, max: 16 }, scale: { start: 0.12, end: 0.04 }, alpha: { start: 0.9, end: 0 }, tint: [light, 0xffffff], blendMode: ADD, frequency: 300, emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-24, -90, 48, 90) } as Phaser.Types.GameObjects.Particles.EmitZoneData });
      break;
    }
    case 'confetti': {
      const e = rig.emitter('square', 'head', { lifespan: { min: 1100, max: 1500 }, speed: { min: 90, max: 170 }, angle: { min: 225, max: 315 }, gravityY: 260, rotate: { min: 0, max: 360 }, scale: { min: 0.18, max: 0.3 }, alpha: { start: 1, end: 0.2 }, tint: [tint, light, 0xffd36a, 0x00e5ff, 0xff2aa1], emitting: false });
      let nextAt = 0;
      let wasWalking = false;
      rig.onTick = (now) => {
        const walking = host.isWalking();
        if ((wasWalking && !walking) || now >= nextAt) {
          nextAt = now + rnd(2800, 4200);
          e.explode(14);
        }
        wasWalking = walking;
      };
      break;
    }
    case 'comet-tail': {
      const e = rig.emitter('star4', 'chest', { lifespan: { min: 450, max: 750 }, speed: { min: 4, max: 14 }, scale: { start: 0.55, end: 0 }, alpha: { start: 1, end: 0 }, tint: [light, tint, 0xffffff], blendMode: ADD, frequency: 400 }, { dx: -18 });
      rig.onTick = () => (e.frequency = host.isWalking() ? 18 : 380);
      break;
    }
    case 'rune-ring': {
      const shapes: SymbolName[] = ['diamond', 'triangle', 'ring', 'diamond', 'triangle', 'ring', 'diamond', 'triangle'];
      const runes = shapes.map((s) => rig.image('back', 0, 0, symbolTexture(scene, s), tint, 0.9).setScale(0.5));
      rig.onTick = (now) => {
        for (let i = 0; i < runes.length; i++) {
          const t = now / 1600 + (i * Math.PI * 2) / runes.length;
          runes[i]!.setPosition(Math.cos(t) * 64, -6 + Math.sin(t) * 14).setAlpha(Math.sin(t) > 0 ? 0.95 : 0.45);
        }
      };
      break;
    }
    case 'glitch': {
      const bits = rig.emitter('square', 'chest', { lifespan: { min: 160, max: 380 }, speedX: { min: -60, max: 60 }, speedY: { min: -10, max: 10 }, scale: { min: 0.16, max: 0.32 }, alpha: { start: 1, end: 0 }, tint: [tint, 0x00e5ff, 0xff2aa1], blendMode: ADD, emitting: false, emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-36, -50, 72, 100) } as Phaser.Types.GameObjects.Particles.EmitZoneData });
      let nextAt = 0;
      let until = 0;
      rig.onTick = (now) => {
        if (now >= nextAt) {
          nextAt = now + rnd(1200, 2600);
          until = now + 140;
          bits.explode(10);
        }
        host.setJitter(now < until ? (Math.random() < 0.5 ? -8 : 8) : 0);
      };
      break;
    }
    default:
      return null;
  }
  return rig;
}
