import Phaser from 'phaser';
import { ITEM_SIZES } from './itemArt';

/** Pets are drawn at the owls' scale (their 90 x 90 canvas is in owl canvas units). */
const PET_SCALE = 0.5;
/** How far behind the owl the pet trots, in room pixels. */
const TRAIL = 46;

/**
 * A little companion that trots after its owl: it lags behind, hops while it moves, turns to face
 * where it is going, and sorts by depth with everything else. It lives in the room, not inside
 * the owl's container, so it can lag and turn on its own.
 */
export class Pet {
  private readonly img: Phaser.GameObjects.Image;
  private pos: { x: number; y: number };
  private lastAt = 0;
  private dir: 1 | -1 = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    textureKey: string,
    at: { x: number; y: number },
  ) {
    this.pos = { x: at.x - TRAIL, y: at.y + 4 };
    this.img = scene.add.image(this.pos.x, this.pos.y, textureKey).setOrigin(0.5, 1);
    this.setTexture(textureKey);
  }

  setTexture(key: string): void {
    this.img.setTexture(key).setDisplaySize(ITEM_SIZES.pet.w * PET_SCALE, ITEM_SIZES.pet.h * PET_SCALE);
  }

  /** Follow the owl at (x, y) facing `facing`; call every frame. */
  tick(now: number, x: number, y: number, facing: 1 | -1, alpha: number): void {
    const dt = this.lastAt ? Math.min(0.1, (now - this.lastAt) / 1000) : 0;
    this.lastAt = now;
    const tx = x - facing * TRAIL;
    const ty = y + 4;
    const k = 1 - Math.exp(-dt * 5);
    const nx = this.pos.x + (tx - this.pos.x) * k;
    const ny = this.pos.y + (ty - this.pos.y) * k;
    const dx = nx - this.pos.x;
    const moving = Math.hypot(dx, ny - this.pos.y) > 0.4;
    if (Math.abs(dx) > 0.2) this.dir = dx < 0 ? -1 : 1;
    else if (!moving) this.dir = facing;
    this.pos = { x: nx, y: ny };
    const hop = moving ? Math.abs(Math.sin(now / 85)) * 7 : 0;
    this.img.setPosition(nx, ny - hop);
    this.img.setFlipX(this.dir < 0);
    this.img.setDepth(ny - 0.2);
    this.img.setAlpha(alpha);
  }

  /** Jump straight to the owl (room entry, teleports). */
  snap(x: number, y: number, facing: 1 | -1): void {
    this.pos = { x: x - facing * TRAIL, y: y + 4 };
    this.img.setPosition(this.pos.x, this.pos.y);
  }

  destroy(): void {
    this.img.destroy();
  }
}
