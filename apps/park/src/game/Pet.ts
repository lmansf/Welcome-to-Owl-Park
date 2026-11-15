import Phaser from 'phaser';
import { ON_GROUND, eggTilt, eggWobble, type Air, type EggWobble } from '@owl-park/shared';
import { OWL_W } from './art';
import { footOrigin } from './fit';
import { ITEM_SIZES } from './itemArt';
import { ensurePetArtTexture } from './items';
import { NO_HOP, SETTLED, hopHeight, stepHop, stepRespawn, type PetHop, type PetRespawn } from './petMotion';

/** Pets are drawn at the owls' scale (their 90 x 90 canvas is in owl canvas units). */
const PET_SCALE = 0.5;
/** How far behind a great horned owl the pet trots, in room pixels. */
const TRAIL = 46;
/** A great horned owl's width in the room (its 200-wide canvas at the owls' scale), for the left-behind rule. */
const OWL_ROOM_W = OWL_W * PET_SCALE;

/** The painted egg's art and its own frames (OP-261, OP-262). */
export const EGG_ART = 'item-painted-egg';
const EGG_CRACKS = { light: 'item-painted-egg-crack-light', heavy: 'item-painted-egg-crack-heavy' } as const;
const EGG_HATCH = ['item-painted-egg-hatch-1', 'item-painted-egg-hatch-2', 'item-painted-egg-hatch-3'] as const;
/** The rainbow bunny's art, and its hop frame drawn while it is off the ground. */
export const BUNNY_ART = 'item-rainbow-bunny';
const BUNNY_HOP = 'item-rainbow-bunny-hop';
/** How long the hatch plays (ms), its three frames in turn. */
const HATCH_MS = 1200;
/** How often the egg looks at the calendar again (ms). */
const WOBBLE_CHECK_MS = 1000;

/**
 * A little companion that trots after its owl: it lags behind, hops while it moves, turns to face
 * where it is going, and sorts by depth with everything else. It lives in the room, not inside
 * the owl's container, so it can lag and turn on its own. When its owl jumps it hops a beat later,
 * but stays on the floor below an owl in flight; left behind, it fades out and comes back just
 * behind its owl (OP-194, petMotion.ts).
 */
export class Pet {
  private readonly img: Phaser.GameObjects.Image;
  private pos: { x: number; y: number };
  private lastAt = 0;
  private dir: 1 | -1 = 1;
  private hop: PetHop = NO_HOP;
  private respawn: PetRespawn = SETTLED;
  private art: string | undefined;
  private baseKey = '';
  /** The painted egg: how it rocks just now, when that was read, how far it has rolled, and when it hatched here. */
  private wobble: EggWobble | null = null;
  private wobbleAt = Number.NEGATIVE_INFINITY;
  private rolled = 0;
  private hatchFrom: number | null = null;
  /** Its own frames once loaded (the egg's cracks and hatch, the bunny's hop), by art key. */
  private readonly frames = new Map<string, string>();

  /** `size` is its owl's (the species' size): a pet keeps to its owl's scale, like everything the owl wears (OP-127). */
  constructor(
    private readonly scene: Phaser.Scene,
    textureKey: string,
    at: { x: number; y: number },
    art?: string,
    private size = 1,
    private readonly textureScale = 1,
  ) {
    this.pos = { x: at.x - TRAIL * size, y: at.y + 4 };
    this.img = scene.add.image(this.pos.x, this.pos.y, textureKey).setOrigin(0.5, 1);
    this.setTexture(textureKey, art);
  }

  /** The pet's look; `art` (its art key) stands what it draws on the floor rather than its frame (OP-127). */
  setTexture(key: string, art?: string): void {
    this.art = art;
    this.baseKey = key;
    this.wobble = null;
    this.wobbleAt = Number.NEGATIVE_INFINITY;
    this.hatchFrom = null;
    this.img.setRotation(0);
    const own = art === EGG_ART ? [...Object.values(EGG_CRACKS), ...EGG_HATCH] : art === BUNNY_ART ? [BUNNY_HOP] : [];
    for (const a of own) {
      if (this.frames.has(a)) continue;
      void ensurePetArtTexture(this.scene, a, this.textureScale).then((k) => this.frames.set(a, k));
    }
    this.show(key);
  }

  /** The painted egg (OP-261): tapping it says how long until it hatches. */
  get isEgg(): boolean {
    return this.art === EGG_ART;
  }

  /** Whether a room point is on the pet as drawn (for a tap). */
  contains(p: { x: number; y: number }): boolean {
    return this.img.visible && this.img.alpha > 0.1 && this.img.getBounds().contains(p.x, p.y);
  }

  /** The middle of the pet as drawn, in room pixels. */
  middle(): { x: number; y: number } {
    const b = this.img.getBounds();
    return { x: b.centerX, y: b.centerY };
  }

  private show(key: string): void {
    if (this.img.texture.key === key) return;
    const o = footOrigin(this.art);
    this.img.setTexture(key).setOrigin(o.x, o.y);
    this.setOwlSize(this.size);
  }

  /** The texture for this moment: the egg's crack or hatch frame, the bunny's hop, or its own. */
  private frameFor(clock: number, up: boolean): string {
    if (this.art === BUNNY_ART) return (up && this.frames.get(BUNNY_HOP)) || this.baseKey;
    if (this.art !== EGG_ART || !this.wobble) return this.baseKey;
    if (this.hatchFrom !== null) {
      const i = Math.floor((clock - this.hatchFrom) / (HATCH_MS / EGG_HATCH.length));
      if (i < EGG_HATCH.length) return this.frames.get(EGG_HATCH[i]!) ?? this.baseKey;
      this.hatchFrom = null;
    }
    return this.wobble.crack === 'none' ? this.baseKey : (this.frames.get(EGG_CRACKS[this.wobble.crack]) ?? this.baseKey);
  }

  /** The egg reads the calendar now and then; seen to hatch here, it plays its hatch once. */
  private readWobble(clock: number): void {
    if (clock - this.wobbleAt < WOBBLE_CHECK_MS) return;
    const was = this.wobble;
    this.wobble = eggWobble(clock);
    this.wobbleAt = clock;
    if (was && !was.hatched && this.wobble.hatched) this.hatchFrom = clock;
  }

  /** Its owl changed kind: the pet grows or shrinks with it. */
  setOwlSize(size: number): void {
    this.size = size;
    this.img.setDisplaySize(ITEM_SIZES.pet.w * PET_SCALE * size, ITEM_SIZES.pet.h * PET_SCALE * size);
  }

  /** Follow the owl at (x, y) facing `facing`, its air `air` as drawn (OP-194); call every frame. */
  tick(now: number, x: number, y: number, facing: 1 | -1, alpha: number, air: Pick<Air, 's' | 'vz'> = ON_GROUND, clock = Date.now()): void {
    const dt = this.lastAt ? Math.min(0.1, (now - this.lastAt) / 1000) : 0;
    this.lastAt = now;
    const tx = x - facing * TRAIL * this.size;
    const ty = y + 4;
    this.hop = stepHop(this.hop, now, air);
    const back = stepRespawn(this.respawn, now, Math.hypot(tx - this.pos.x, ty - this.pos.y), OWL_ROOM_W * this.size);
    this.respawn = back.r;
    if (back.snap) {
      this.pos = { x: tx, y: ty };
      this.dir = facing;
    }
    const k = 1 - Math.exp(-dt * 5);
    const nx = this.pos.x + (tx - this.pos.x) * k;
    const ny = this.pos.y + (ty - this.pos.y) * k;
    const dx = nx - this.pos.x;
    const step = Math.hypot(dx, ny - this.pos.y);
    const moving = step > 0.4;
    if (Math.abs(dx) > 0.2) this.dir = dx < 0 ? -1 : 1;
    else if (!moving) this.dir = facing;
    this.pos = { x: nx, y: ny };
    const jump = hopHeight(this.hop, now, this.size);
    let hop = jump > 0 ? jump : moving ? Math.abs(Math.sin(now / 85)) * 7 : 0;
    if (this.art === EGG_ART) {
      // The egg never hops: it rocks on the spot by the calendar, and rocks side to side as it rolls after its owl.
      this.readWobble(clock);
      this.rolled += step;
      const tilt = moving ? Math.sin(this.rolled / 9) * 14 : this.wobble ? eggTilt(this.wobble, clock) : 0;
      this.img.setRotation(Phaser.Math.DegToRad(tilt));
      hop = 0;
    }
    this.show(this.frameFor(clock, hop > 0));
    this.img.setPosition(nx, ny - hop);
    this.img.setFlipX(this.dir < 0);
    this.img.setDepth(ny - 0.2);
    this.img.setAlpha(alpha * back.fade);
  }

  /** Jump straight to the owl (room entry, teleports). */
  snap(x: number, y: number, facing: 1 | -1): void {
    this.respawn = { ...SETTLED, backAt: this.respawn.backAt };
    this.pos = { x: x - facing * TRAIL * this.size, y: y + 4 };
    this.img.setPosition(this.pos.x, this.pos.y);
  }

  destroy(): void {
    this.img.destroy();
  }
}
