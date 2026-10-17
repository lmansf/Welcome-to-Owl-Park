import Phaser from 'phaser';
import { facing, hexToInt, positionAlongWalk, type OwlLook, type Vec2, type Walk } from '@owl-park/shared';

import { OWL_H, OWL_W } from './art';

export { OWL_H, OWL_W };
/** The 200 x 240 layer canvas is drawn at this scale in 1600-wide rooms. */
export const OWL_SCALE = 0.5;
/** Feet position inside the layer canvas: bottom-centre, per the art pipeline canon. */
const FEET = { x: 100, y: 240 };

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
  private readonly pledgeMark: Phaser.GameObjects.Image;
  private readonly art: Phaser.GameObjects.Container;
  private dir: -1 | 1 = 1;
  private nextBlinkAt = 0;

  constructor(scene: Phaser.Scene, id: string, look: OwlLook, pos: Vec2) {
    super(scene, pos.x, pos.y);
    this.id = id;
    this.look = look;
    this.pos = { ...pos };

    this.shadow = scene.add.ellipse(0, 0, 54, 18, 0x000000, 0.28);
    // The pledge mark: a small gold glow at the feet, shown for the day after a Realm Vote.
    this.pledgeMark = scene.add.image(0, 2, 'fx-glow').setTint(0xffd36a).setScale(0.5, 0.2).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    // Textures may be rasterized at any resolution; every layer is drawn at the logical canvas size.
    const mk = (key: string) => scene.add.image(-FEET.x, -FEET.y, key).setOrigin(0, 0).setDisplaySize(OWL_W, OWL_H);
    this.bodyImg = mk(LAYERS[0]);
    this.bellyImg = mk(LAYERS[1]);
    this.accentImg = mk(LAYERS[2]);
    this.faceImg = mk(LAYERS[3]);
    this.blinkImg = mk('owl-blink').setVisible(false);
    this.art = scene.add.container(0, 0, [this.bodyImg, this.bellyImg, this.accentImg, this.faceImg, this.blinkImg]);
    this.add([this.pledgeMark, this.shadow, this.art]);
    this.setScale(OWL_SCALE);
    this.applyLook(look);
    this.nextBlinkAt = Date.now() + 1500 + Math.random() * 4000;
    scene.add.existing(this);
  }

  applyLook(look: OwlLook): void {
    this.look = look;
    this.pledgeMark.setAlpha(look.pledge ? 0.75 : 0);
    if (this.scene.renderer.type === Phaser.CANVAS) {
      // Tint is WebGL-only; on the Canvas renderer bake the colour into a texture instead.
      this.bodyImg.setTexture(tintedLayer(this.scene, LAYERS[0], look.body)).setDisplaySize(OWL_W, OWL_H);
      this.bellyImg.setTexture(tintedLayer(this.scene, LAYERS[1], look.belly)).setDisplaySize(OWL_W, OWL_H);
      this.accentImg.setTexture(tintedLayer(this.scene, LAYERS[2], look.accent)).setDisplaySize(OWL_W, OWL_H);
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

    if (this.look.pledge) this.pledgeMark.setAlpha(0.6 + Math.sin(now / 500) * 0.15);

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
