/**
 * The guardian as it is drawn (OP-359; behind `?guardian=1`): its mind is guardian.ts, its parts are
 * cut from the one painting by guardianArt.ts, and here they become one picture in the room.
 *
 * The body and the head are put together, each frame, into a single picture (a texture the page draws
 * into, shown by a plain image) that the room draws: the head
 * lies over the body where they meet, so drawn as two the guardian would show a darker band at its
 * neck whenever it goes see-through (seeThrough.ts). As one picture it fades as one, stands among the
 * owls with its foot as its depth like any tall piece, and takes the hall's light as the idols do.
 *
 * Round it: a soft glow that breathes with it, a shadow at its foot, the rings of its hoot and the
 * ripple that hoot sends across the floor, and motes of warm light rising off it, thick and fast
 * while an owl rides the rising air at the heart. In calm motion the rings stay and the rest is still.
 */
import Phaser from 'phaser';
import type { Vec2 } from '@owl-park/shared';
import { HALL_ROOM } from '@owl-park/shared/rooms';
import { FOOT_SHADOW_DEPTH, footShadow } from './bowlView';
import { onCanvas } from './canvasTint';
import { GUARDIAN_ART, GUARDIAN_AT, GUARDIAN_SCALE, GuardianMind, guardianBoxes, inRoom, type Call, type GuardianFrame, type HeadPose, type Lids, type OwlSeen } from './guardian';
import { HEAD_BOX, carved, cutBody, cutHead, type Pixels } from './guardianArt';
import { symbolTexture } from './symbols';

/** The textures made from the painting: its body, its head with each lid, the two put together, and its carving. */
const BODY_KEY = 'guardian:body';
const WHOLE_KEY = 'guardian:whole';
const headKey = (lids: Lids) => `guardian:head:${lids}`;
export const CARVED_KEY = 'guardian:carved';
const ALL_LIDS: readonly Lids[] = ['open', 'half', 'closed'];

/** How far a breath swells it (of its height), and a beat (of its height and of its width). */
const SWELL = { breath: 0.011, beat: 0.012, wide: 0.016, hoot: 0.02 } as const;

/** The painting's pixels at its own size, or null where the page cannot read them (the guardian then stands as the one picture, breathing). */
function paintingPixels(scene: Phaser.Scene): Pixels | null {
  if (!scene.textures.exists(GUARDIAN_ART.key)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = GUARDIAN_ART.w;
  canvas.height = GUARDIAN_ART.h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(scene.textures.get(GUARDIAN_ART.key).getSourceImage() as CanvasImageSource, 0, 0, GUARDIAN_ART.w, GUARDIAN_ART.h);
    return { width: GUARDIAN_ART.w, height: GUARDIAN_ART.h, data: ctx.getImageData(0, 0, GUARDIAN_ART.w, GUARDIAN_ART.h).data };
  } catch {
    // A picture from another address cannot be read back: no parts, and the whole painting stands in.
    return null;
  }
}

function addTexture(scene: Phaser.Scene, key: string, p: Pixels): void {
  const tex = scene.textures.createCanvas(key, p.width, p.height);
  if (!tex) return;
  tex.context.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  tex.refresh();
}

/** The guardian's parts as textures, made once: whether they are there to draw with. */
export function ensureGuardianParts(scene: Phaser.Scene): boolean {
  if (scene.textures.exists(BODY_KEY)) return true;
  const src = paintingPixels(scene);
  if (!src) return false;
  addTexture(scene, BODY_KEY, cutBody(src));
  for (const lids of ALL_LIDS) addTexture(scene, headKey(lids), cutHead(src, lids));
  return scene.textures.exists(BODY_KEY) && ALL_LIDS.every((l) => scene.textures.exists(headKey(l)));
}

/** The picture the body and head are put together into, made once and kept from one visit of the hall to the next. */
function wholeTexture(scene: Phaser.Scene): Phaser.Textures.DynamicTexture | null {
  if (scene.textures.exists(WHOLE_KEY)) return scene.textures.get(WHOLE_KEY) as Phaser.Textures.DynamicTexture;
  return scene.textures.addDynamicTexture(WHOLE_KEY, GUARDIAN_ART.w, GUARDIAN_ART.h);
}

/** The painting as a carving, as a texture: its key, or null where it cannot be made. */
export function carvedTexture(scene: Phaser.Scene): string | null {
  if (scene.textures.exists(CARVED_KEY)) return CARVED_KEY;
  const src = paintingPixels(scene);
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
  /** The picture its body and head are put together into each frame; none where its parts could not be made, and the whole painting stands in. */
  private readonly whole: Phaser.Textures.DynamicTexture | null;
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
    this.whole = ensureGuardianParts(scene) ? wholeTexture(scene) : null;
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
    const origin = { x: A.foot.x / A.w, y: A.foot.y / A.h };
    this.image = scene.add.image(this.at.x, this.at.y, this.whole ? WHOLE_KEY : A.key).setOrigin(origin.x, origin.y).setDepth(depth);
    this.image.setDisplaySize(A.w * this.scale, A.h * this.scale);
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

  /** The body and the head put together into the one picture, as this frame holds them. */
  private compose(whole: Phaser.Textures.DynamicTexture, f: GuardianFrame): void {
    const A = GUARDIAN_ART;
    const tall = 1 + SWELL.breath * f.breath + SWELL.beat * f.breath * f.beat + SWELL.hoot * this.hootSwell;
    const wide = 1 + SWELL.wide * f.breath * f.beat;
    // The head rides on the chest's swell.
    const lift = (A.foot.y - A.neck.y) * (tall - 1);
    const hx = A.neck.x + f.head.dx;
    const hy = A.neck.y + f.head.dy - lift;
    const key = `${f.lids}|${f.head.roll.toFixed(4)}|${hx.toFixed(1)}|${hy.toFixed(1)}|${tall.toFixed(4)}|${wide.toFixed(4)}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const rt = whole;
    rt.clear();
    rt.beginDraw();
    rt.stamp(BODY_KEY, undefined, A.foot.x, A.foot.y, { originX: A.foot.x / A.w, originY: A.foot.y / A.h, scaleX: wide, scaleY: tall, skipBatch: true });
    rt.stamp(headKey(f.lids), undefined, hx, hy, {
      originX: (A.neck.x - HEAD_BOX.x) / HEAD_BOX.w,
      originY: (A.neck.y - HEAD_BOX.y) / HEAD_BOX.h,
      rotation: f.head.roll,
      skipBatch: true,
    });
    rt.endDraw();
  }

  /** Its hoot: the sound, rings from its beak, its chest and glow swelling, and a ripple across the floor. */
  private hoot(): void {
    this.opts.onHoot();
    const scene = this.scene;
    this.rings.explode(1);
    scene.time.delayedCall(260, () => this.rings.active && this.rings.explode(1));
    scene.time.delayedCall(560, () => this.rings.active && this.rings.explode(1));
    scene.tweens.add({ targets: this, hootSwell: 1, duration: 260, yoyo: true, hold: 240, ease: 'Sine.easeOut' });
    if (this.opts.calm()) return;
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
