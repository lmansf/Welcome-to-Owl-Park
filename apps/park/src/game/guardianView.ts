/**
 * The guardian as it is drawn (OP-359): its mind is guardian.ts, its parts are
 * painted (OP-397: a head, a body, two wings and its bough, laid out by idolParts.ts), and here they
 * become one picture in the room.
 *
 * The parts are put together, each frame, into a single picture (a texture the page draws into, shown
 * by a plain image) that the room draws: the head and the wings lie over the body where they meet, so
 * drawn apart the guardian would show darker bands there whenever it goes see-through (seeThrough.ts).
 * As one picture it fades as one, stands among the owls with its foot as its depth like any tall
 * piece, and takes the hall's light as the idols do. Its head turns about its neck, its chest swells
 * with its breath and beat, and its wings open a little with each beat and wide with a hoot.
 *
 * Round it: a soft glow that breathes with it, a shadow at its foot, the rings of its hoot and the
 * ripple that hoot sends across the floor, and motes of warm light rising off it, thick and fast
 * while an owl rides the rising air at the heart. In calm motion (Settings) its hoot is the sound and
 * the rings alone, its wings stay folded, and there are no motes.
 */
import Phaser from 'phaser';
import type { Vec2 } from '@owl-park/shared';
import { HALL_ROOM } from '@owl-park/shared/rooms';
import { FOOT_SHADOW_DEPTH, footShadow } from './bowlView';
import { onCanvas } from './canvasTint';
import { GUARDIAN_ART, GUARDIAN_AT, GUARDIAN_SCALE, GuardianMind, guardianBoxes, inRoom, type Call, type GuardianFrame, type HeadPose, type Lids, type OwlSeen } from './guardian';
import { carved, lidded, type Pixels } from './guardianArt';
import { IDOL_PARTS, PARTS, WING_OPEN_MAX, partKey, reach, wingOpen, type IdolPart } from './idolParts';
import { symbolTexture } from './symbols';

/** The guardian's parts as painted, and where each lies in its frame. */
const P = IDOL_PARTS.guardian;
/** The textures made from the paintings: the head with each lid, the parts put together, and its carving. */
const WHOLE_KEY = 'guardian:whole';
const headKey = (lids: Lids) => (lids === 'open' ? partKey('guardian', 'head') : `guardian:head:${lids}`);
export const CARVED_KEY = 'guardian:carved';
const SHUT_LIDS: readonly Lids[] = ['half', 'closed'];

/**
 * The picture the parts are put together into, in the frame's pixels: the frame, and past it as far as
 * its wings reach open wide and its head rises with a hoot.
 */
const CANVAS = (() => {
  const r = reach(P, WING_OPEN_MAX);
  const x0 = Math.min(0, Math.floor(r.x0) - 12);
  const x1 = Math.max(P.w, Math.ceil(r.x1) + 12);
  const y0 = Math.min(0, Math.floor(r.y0) - 40);
  return { x0, y0, w: x1 - x0, h: P.h - y0 };
})();

/** How far a breath swells it (of its height), and a beat (of its height and of its width). */
const SWELL = { breath: 0.011, beat: 0.012, wide: 0.016, hoot: 0.02 } as const;

/** A texture's pixels at its own size, or null where the page cannot read them. */
function texturePixels(scene: Phaser.Scene, key: string, w?: number, h?: number): Pixels | null {
  if (!scene.textures.exists(key)) return null;
  const img = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const width = w ?? img.width;
  const height = h ?? img.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(img as CanvasImageSource, 0, 0, width, height);
    return { width, height, data: ctx.getImageData(0, 0, width, height).data };
  } catch {
    // A picture from another address cannot be read back.
    return null;
  }
}

function addTexture(scene: Phaser.Scene, key: string, p: Pixels): void {
  const tex = scene.textures.createCanvas(key, p.width, p.height);
  if (!tex) return;
  tex.context.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  tex.refresh();
}

/** How many texture pixels a frame pixel of a part is drawn with: 2 where its @2x picture loaded. */
function resOf(scene: Phaser.Scene, part: IdolPart): number {
  return scene.textures.get(partKey('guardian', part)).getSourceImage().width / P.parts[part].w;
}

/** The guardian's parts as textures, its head with each lid made once: whether they are there to draw with. */
export function ensureGuardianParts(scene: Phaser.Scene): boolean {
  if (!PARTS.every((part) => scene.textures.exists(partKey('guardian', part)))) return false;
  if (SHUT_LIDS.every((l) => scene.textures.exists(headKey(l)))) return true;
  const head = texturePixels(scene, partKey('guardian', 'head'));
  if (!head) return false;
  for (const lids of SHUT_LIDS) addTexture(scene, headKey(lids), lidded(head, lids));
  return SHUT_LIDS.every((l) => scene.textures.exists(headKey(l)));
}

/** The picture the parts are put together into, made once and kept from one visit of the hall to the next. */
function wholeTexture(scene: Phaser.Scene, res: number): Phaser.Textures.DynamicTexture | null {
  if (scene.textures.exists(WHOLE_KEY)) {
    const t = scene.textures.get(WHOLE_KEY) as Phaser.Textures.DynamicTexture;
    if (t.width === Math.round(CANVAS.w * res)) return t;
    t.destroy();
  }
  return scene.textures.addDynamicTexture(WHOLE_KEY, Math.round(CANVAS.w * res), Math.round(CANVAS.h * res));
}

/** The painting as a carving, as a texture: its key, or null where it cannot be made. */
export function carvedTexture(scene: Phaser.Scene): string | null {
  if (scene.textures.exists(CARVED_KEY)) return CARVED_KEY;
  const src = texturePixels(scene, GUARDIAN_ART.key, GUARDIAN_ART.w, GUARDIAN_ART.h);
  if (!src) return null;
  addTexture(scene, CARVED_KEY, carved(src));
  return scene.textures.exists(CARVED_KEY) ? CARVED_KEY : null;
}

export interface GuardianOpts {
  /** The hall's light on its idols (RoomBowl.light), which the guardian takes too. */
  light?: number | undefined;
  /** Calm motion (Settings): no ripple, no motes. */
  calm: () => boolean;
  /** Its hoot, to be sounded. */
  onHoot: () => void;
  /** What makes its blinks its own: a test gives a seed. */
  seed?: number;
}

/** What a test reads of it. */
export interface GuardianState {
  at: Vec2;
  scale: number;
  /** Whether it is drawn in parts (a head that turns), or as the one painting. */
  parts: boolean;
  attending: string | null;
  lids: Lids;
  dozing: boolean;
  hoots: number;
  beat: number;
  head: HeadPose;
  /** How solid it is drawn: under 1 while the visitor's own owl is behind it. */
  alpha: number;
  /** The boxes hugging what it draws, in the room. */
  boxes: Array<{ x: number; y: number; w: number; h: number }>;
}

export class GuardianView {
  /** The one picture the room draws: it stands among the room's tall art (seeThroughArt.ts). */
  readonly image: Phaser.GameObjects.Image;
  private readonly mind: GuardianMind;
  /** The picture its parts are put together into each frame; none where its parts could not be made, and the whole painting stands in. */
  private readonly whole: Phaser.Textures.DynamicTexture | null;
  /** Texture pixels to a frame pixel in that picture: 2 where the @2x parts loaded. */
  private readonly res: number;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly motes: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly rings: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly at: Vec2 = { ...GUARDIAN_AT };
  private readonly scale = GUARDIAN_SCALE;
  private now: GuardianFrame | null = null;
  /** What was last put together, so a frame that changes nothing draws nothing. */
  private drawn = '';
  /** A hoot's swell of the chest and of the glow, 0 to 1, eased out by a tween. */
  private hootSwell = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: GuardianOpts,
  ) {
    const A = GUARDIAN_ART;
    const heart = HALL_ROOM.thermals?.[0] ?? null;
    this.mind = new GuardianMind({ face: inRoom(A.face, this.at, this.scale), heart, seed: opts.seed ?? Math.floor(Math.random() * 0x7fffffff) + 1 });
    const parts = ensureGuardianParts(scene);
    this.res = parts ? resOf(scene, 'head') : 1;
    this.whole = parts ? wholeTexture(scene, this.res) : null;
    const depth = this.at.y;
    const chest = inRoom(A.chest, this.at, this.scale);
    this.glow = scene.add
      .image(chest.x, chest.y, 'fx-glow')
      .setTint(0xffd27a)
      .setAlpha(0.3)
      .setScale(6.4 * this.scale, 5.6 * this.scale)
      .setDepth(depth - 1)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.shadow = scene.add.graphics().setDepth(FOOT_SHADOW_DEPTH);
    footShadow(this.shadow, this.at.x, this.at.y, A.w * this.scale * 0.7);
    // Drawn in parts, the picture runs past the frame (as far as the wings open), with the foot where it was.
    const box = this.whole ? CANVAS : { x0: 0, y0: 0, w: A.w, h: A.h };
    this.image = scene.add
      .image(this.at.x, this.at.y, this.whole ? WHOLE_KEY : A.key)
      .setOrigin((A.foot.x - box.x0) / box.w, (A.foot.y - box.y0) / box.h)
      .setDepth(depth);
    this.image.setDisplaySize(box.w * this.scale, box.h * this.scale);
    // The hall's light, as on its idols. On the Canvas renderer, which draws no tint, it keeps its own colours.
    if (opts.light !== undefined && !onCanvas(scene)) this.image.setTint(opts.light);
    // What it draws, for the room's see-through rule: its head and its body, not its frame's empty corners.
    this.image.setData('artBoxes', guardianBoxes(this.at, this.scale));

    // Motes of warm light rising off it: over it, so they show against its feathers.
    const rise = heart ? heart.pos : inRoom(A.neck, this.at, this.scale);
    this.motes = scene.add
      .particles(0, 0, 'fx-dot', {
        x: { min: rise.x - 170, max: rise.x + 170 },
        y: { min: rise.y - 30, max: rise.y + 150 },
        lifespan: { min: 2200, max: 3400 },
        speedY: { min: -95, max: -45 },
        speedX: { min: -12, max: 12 },
        scale: { start: 0.42, end: 0 },
        alpha: { start: 0.55, end: 0 },
        tint: [0xffe08a, 0xfff2b3, 0xffd27a],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 260,
        emitting: !opts.calm(),
      })
      .setDepth(depth + 1);
    // Its hoot: rings from its beak, out toward the room.
    const beak = inRoom(A.beak, this.at, this.scale);
    this.rings = scene.add
      .particles(beak.x, beak.y, symbolTexture(scene, 'ring'), {
        lifespan: 1500,
        speedY: { min: 26, max: 44 },
        speedX: { min: -8, max: 8 },
        scale: { start: 0.7, end: 3.4 },
        alpha: { start: 0.85, end: 0 },
        tint: [0xf6f1e3, 0xffd36a],
        emitting: false,
      })
      .setDepth(depth + 2);
  }

  /** An owl has come into the hall. `greet`: by the knothole, so it is hooted to. */
  arrived(id: string, now: number, greet: boolean): void {
    this.mind.arrived(id, now, greet);
  }

  /** An owl has called to it: a hoot, a bow or a tilt. */
  called(id: string, call: Call, now: number): void {
    this.mind.called(id, call, now);
  }

  /** One frame: the owls in the hall now. */
  frame(now: number, owls: readonly OwlSeen[]): void {
    const f = this.mind.frame(now, owls);
    this.now = f;
    if (f.hooted) this.hoot();
    const calm = this.opts.calm();
    // Its glow breathes with it, and swells with a hoot.
    this.glow.setAlpha(0.26 + 0.12 * f.breath + 0.1 * f.beat + 0.22 * this.hootSwell);
    this.glow.setScale((6.4 + 0.5 * f.breath + 1.2 * this.hootSwell) * this.scale, (5.6 + 0.4 * f.breath + 1 * this.hootSwell) * this.scale);
    // The motes thicken and quicken with its beat.
    this.motes.emitting = !calm && !f.dozing;
    this.motes.frequency = 260 - 190 * f.beat;
    if (this.whole) this.compose(this.whole, f);
    else this.image.setDisplaySize(GUARDIAN_ART.w * this.scale * (1 - 0.004 * f.breath), GUARDIAN_ART.h * this.scale * (1 + SWELL.breath * f.breath));
  }

  /** The parts put together into the one picture, as this frame holds them. */
  private compose(whole: Phaser.Textures.DynamicTexture, f: GuardianFrame): void {
    const tall = 1 + SWELL.breath * f.breath + SWELL.beat * f.breath * f.beat + SWELL.hoot * this.hootSwell;
    const wide = 1 + SWELL.wide * f.breath * f.beat;
    // In calm motion its wings stay folded.
    const open = this.opts.calm() ? 0 : wingOpen(f.breath, f.beat, this.hootSwell);
    const key = `${f.lids}|${f.head.roll.toFixed(4)}|${f.head.dx.toFixed(1)}|${f.head.dy.toFixed(1)}|${tall.toFixed(4)}|${wide.toFixed(4)}|${open.toFixed(4)}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const R = this.res;
    const body = P.parts.body;
    // A point carried by the chest's swell, from where the body sits.
    const swell = (p: Vec2): Vec2 => ({ x: body.pivot.x + (p.x - body.pivot.x) * wide, y: body.pivot.y + (p.y - body.pivot.y) * tall });
    const stamp = (part: IdolPart, texture: string, at: Vec2, opts: { scaleX?: number; scaleY?: number; rotation?: number } = {}) => {
      const q = P.parts[part];
      const k = R / resOf(this.scene, part);
      whole.stamp(texture, undefined, (at.x - CANVAS.x0) * R, (at.y - CANVAS.y0) * R, {
        originX: (q.pivot.x - q.x) / q.w,
        originY: (q.pivot.y - q.y) / q.h,
        scaleX: k * (opts.scaleX ?? 1),
        scaleY: k * (opts.scaleY ?? 1),
        rotation: opts.rotation ?? 0,
        skipBatch: true,
      });
    };
    whole.clear();
    whole.beginDraw();
    stamp('base', partKey('guardian', 'base'), P.parts.base.pivot);
    stamp('body', partKey('guardian', 'body'), body.pivot, { scaleX: wide, scaleY: tall });
    // Phaser turns clockwise: the left wing's tip swings out to the left, the right wing's to the right.
    stamp('wing-left', partKey('guardian', 'wing-left'), swell(P.parts['wing-left'].pivot), { rotation: open });
    stamp('wing-right', partKey('guardian', 'wing-right'), swell(P.parts['wing-right'].pivot), { rotation: -open });
    const neck = swell(P.parts.head.pivot);
    stamp('head', headKey(f.lids), { x: neck.x + f.head.dx, y: neck.y + f.head.dy }, { rotation: f.head.roll });
    whole.endDraw();
  }

  /** Its hoot: the sound, rings from its beak, its chest and glow swelling, and a ripple across the floor. */
  private hoot(): void {
    this.opts.onHoot();
    const scene = this.scene;
    this.rings.explode(1);
    scene.time.delayedCall(260, () => this.rings.active && this.rings.explode(1));
    scene.time.delayedCall(560, () => this.rings.active && this.rings.explode(1));
    // In calm motion its hoot is the sound and the rings: no swell of light, no ripple.
    if (this.opts.calm()) return;
    scene.tweens.add({ targets: this, hootSwell: 1, duration: 260, yoyo: true, hold: 240, ease: 'Sine.easeOut' });
    const ripple = scene.add
      .ellipse(this.at.x, this.at.y - 30, 520, 170)
      .setStrokeStyle(5, 0xffe2a8, 0.55)
      .setDepth(FOOT_SHADOW_DEPTH + 0.001);
    ripple.isFilled = false;
    scene.tweens.add({ targets: ripple, scaleX: 5.2, scaleY: 5.2, alpha: 0, duration: 1900, ease: 'Sine.easeOut', onComplete: () => ripple.destroy() });
  }

  /** What a test reads of it. */
  state(): GuardianState {
    const f = this.now;
    return {
      at: { ...this.at },
      scale: this.scale,
      parts: this.whole !== null,
      attending: f?.attending ?? null,
      lids: f?.lids ?? 'closed',
      dozing: f?.dozing ?? true,
      hoots: this.mind.hooted,
      beat: f?.beat ?? 0,
      head: f ? { ...f.head } : { roll: 0, dx: 0, dy: 0 },
      alpha: this.image.alpha,
      boxes: guardianBoxes(this.at, this.scale),
    };
  }
}
