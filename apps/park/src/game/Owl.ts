import Phaser from 'phaser';
import { facing, hexToInt, positionAlongWalk, type OwlLook, type Vec2, type Walk } from '@owl-park/shared';

/** Native size of the avatar layers; drawn at OWL_SCALE in 1600-wide rooms. */
export const OWL_W = 200;
export const OWL_H = 240;
export const OWL_SCALE = 0.5;
/** Feet position inside the layer canvas. */
const FEET = { x: 100, y: 232 };

const LAYERS = ['owl-body', 'owl-belly', 'owl-accent', 'owl-face'] as const;

/** A copy of a white layer multiplied by a colour, for renderers without tint support. */
function tintedLayer(scene: Phaser.Scene, key: string, hex: string): string {
  const out = `${key}:${hex.toLowerCase()}`;
  if (scene.textures.exists(out)) return out;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const canvas = scene.textures.createCanvas(out, src.width, src.height);
  if (!canvas) return key;
  const ctx = canvas.context;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, src.width, src.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  canvas.refresh();
  return out;
}

/**
 * A visitor's owl: tintable layered sprites in a container whose origin is at the feet.
 * Walking is driven from wall-clock time via positionAlongWalk, so local and remote
 * owls use exactly the same code path.
 */
export class Owl extends Phaser.GameObjects.Container {
  readonly id: string;
  look: OwlLook;
  walk: Walk | null = null;
  pos: Vec2;
  private readonly bodyImg: Phaser.GameObjects.Image;
  private readonly bellyImg: Phaser.GameObjects.Image;
  private readonly accentImg: Phaser.GameObjects.Image;
  private readonly faceImg: Phaser.GameObjects.Image;
  private readonly blinkImg: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly art: Phaser.GameObjects.Container;
  private dir: -1 | 1 = 1;
  private nextBlinkAt = 0;

  constructor(scene: Phaser.Scene, id: string, look: OwlLook, pos: Vec2) {
    super(scene, pos.x, pos.y);
    this.id = id;
    this.look = look;
    this.pos = { ...pos };

    this.shadow = scene.add.ellipse(0, 0, 54, 18, 0x000000, 0.28);
    const mk = (key: string) => scene.add.image(-FEET.x, -FEET.y, key).setOrigin(0, 0);
    this.bodyImg = mk(LAYERS[0]);
    this.bellyImg = mk(LAYERS[1]);
    this.accentImg = mk(LAYERS[2]);
    this.faceImg = mk(LAYERS[3]);
    this.blinkImg = mk('owl-blink').setVisible(false);
    this.art = scene.add.container(0, 0, [this.bodyImg, this.bellyImg, this.accentImg, this.faceImg, this.blinkImg]);
    this.add([this.shadow, this.art]);
    this.setScale(OWL_SCALE);
    this.applyLook(look);
    this.nextBlinkAt = Date.now() + 1500 + Math.random() * 4000;
    scene.add.existing(this);
  }

  applyLook(look: OwlLook): void {
    this.look = look;
    if (this.scene.renderer.type === Phaser.CANVAS) {
      // Tint is WebGL-only; on the Canvas renderer bake the colour into a texture instead.
      this.bodyImg.setTexture(tintedLayer(this.scene, LAYERS[0], look.body));
      this.bellyImg.setTexture(tintedLayer(this.scene, LAYERS[1], look.belly));
      this.accentImg.setTexture(tintedLayer(this.scene, LAYERS[2], look.accent));
      return;
    }
    this.bodyImg.setTint(hexToInt(look.body));
    this.bellyImg.setTint(hexToInt(look.belly));
    this.accentImg.setTint(hexToInt(look.accent));
  }

  /** Begin (or replace) a walk. Facing flips immediately. */
  startWalk(walk: Walk): void {
    this.walk = walk;
    const f = facing(walk);
    if (f !== 0) this.dir = f;
  }

  /** Teleport without animation (room entry, snapshot of a standing owl). */
  place(pos: Vec2): void {
    this.walk = null;
    this.pos = { ...pos };
    this.setPosition(pos.x, pos.y);
  }

  get walking(): boolean {
    return this.walk !== null;
  }

  /** Advance to wall-clock time `now` (ms). Returns true when a walk just finished. */
  tick(now: number): boolean {
    let finished = false;
    if (this.walk) {
      const { pos, done } = positionAlongWalk(this.walk, now);
      this.pos = pos;
      if (done) {
        this.walk = null;
        finished = true;
      }
    }
    this.setPosition(this.pos.x, this.pos.y);
    this.setDepth(this.pos.y);

    // Facing: art is drawn in a slight 3/4 turn; flipping it reads as turning around.
    this.art.setScale(this.dir, 1);

    // Walk cycle: a gentle bob and squash while moving.
    if (this.walk) {
      const phase = (now / 140) % (Math.PI * 2);
      const bob = Math.abs(Math.sin(phase));
      this.art.y = -bob * 10;
      this.art.scaleY = 1 - bob * 0.04;
      this.shadow.setScale(1 - bob * 0.08, 1 - bob * 0.08);
    } else {
      // Idle breathing.
      const breathe = Math.sin(now / 900) * 0.012;
      this.art.y = 0;
      this.art.scaleY = 1 + breathe;
      this.shadow.setScale(1, 1);
    }

    // Blink now and then.
    if (now >= this.nextBlinkAt) {
      this.blinkImg.setVisible(true);
      this.faceImg.setVisible(false);
      if (now >= this.nextBlinkAt + 120) {
        this.blinkImg.setVisible(false);
        this.faceImg.setVisible(true);
        this.nextBlinkAt = now + 2500 + Math.random() * 5000;
      }
    }
    return finished;
  }
}
