import Phaser from 'phaser';
import { ON_GROUND, type Air } from '@owl-park/shared';
import { OWL_W } from './art';
import { footOrigin } from './fit';
import { ITEM_SIZES } from './itemArt';
import { NO_HOP, SETTLED, hopHeight, stepHop, stepRespawn, type PetHop, type PetRespawn } from './petMotion';

/** Pets are drawn at the owls' scale (their 90 x 90 canvas is in owl canvas units). */
const PET_SCALE = 0.5;
/** How far behind a great horned owl the pet trots, in room pixels. */
const TRAIL = 46;
/** A great horned owl's width in the room (its 200-wide canvas at the owls' scale), for the left-behind rule. */
const OWL_ROOM_W = OWL_W * PET_SCALE;

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

  /** `size` is its owl's (the species' size): a pet keeps to its owl's scale, like everything the owl wears (OP-127). */
  constructor(
    private readonly scene: Phaser.Scene,
    textureKey: string,
    at: { x: number; y: number },
    art?: string,
    private size = 1,
  ) {
    this.pos = { x: at.x - TRAIL * size, y: at.y + 4 };
    this.img = scene.add.image(this.pos.x, this.pos.y, textureKey).setOrigin(0.5, 1);
    this.setTexture(textureKey, art);
  }

  /** The pet's look; `art` (its art key) stands what it draws on the floor rather than its frame (OP-127). */
  setTexture(key: string, art?: string): void {
    const o = footOrigin(art);
    this.img.setTexture(key).setOrigin(o.x, o.y);
    this.setOwlSize(this.size);
  }

  /** Its owl changed kind: the pet grows or shrinks with it. */
  setOwlSize(size: number): void {
    this.size = size;
    this.img.setDisplaySize(ITEM_SIZES.pet.w * PET_SCALE * size, ITEM_SIZES.pet.h * PET_SCALE * size);
  }

  /** Follow the owl at (x, y) facing `facing`, its air `air` as drawn (OP-194); call every frame. */
  tick(now: number, x: number, y: number, facing: 1 | -1, alpha: number, air: Pick<Air, 's' | 'vz'> = ON_GROUND): void {
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
    const moving = Math.hypot(dx, ny - this.pos.y) > 0.4;
    if (Math.abs(dx) > 0.2) this.dir = dx < 0 ? -1 : 1;
    else if (!moving) this.dir = facing;
    this.pos = { x: nx, y: ny };
    const jump = hopHeight(this.hop, now, this.size);
    const hop = jump > 0 ? jump : moving ? Math.abs(Math.sin(now / 85)) * 7 : 0;
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
