import Phaser from 'phaser';
import { DEFAULT_SPECIES, facing, hexToInt, positionAlongWalk, speciesOf, type OwlLook, type Vec2, type Walk, type Wear } from '@owl-park/shared';
import { artFacing, type OwlAnchors } from '../collect/pixels';
import { OWL_H, OWL_LAYERS, OWL_W, SPECIES_LAYERS, loadSpeciesArt } from './art';
import { playEmote, playFlop, type EmoteHost } from './emotes';
import { createFx, type AnchorName, type FxHandle, type FxHost } from './fx';
import { ITEM_SIZES } from './itemArt';
import { ensureVariantTexture, owlAnchors } from './items';
import { Pet } from './Pet';

export { OWL_H, OWL_W };
/** The 200 x 240 layer canvas is drawn at this scale in 1600-wide rooms. */
export const OWL_SCALE = 0.5;
/** Feet position inside the layer canvas: bottom-centre, per the art pipeline canon. */
const FEET = { x: 100, y: 240 };

const LAYERS = OWL_LAYERS;

/**
 * The layer textures for a look's species: its own (`owl-<species>-body` and so on) once that art
 * is approved and loaded, otherwise the great horned owl's.
 */
function layersFor(scene: Phaser.Scene, look: OwlLook): readonly string[] {
  const sp = speciesOf(look);
  if (!sp.art || sp.id === DEFAULT_SPECIES) return LAYERS;
  const own = SPECIES_LAYERS[sp.id];
  return own.every((k) => scene.textures.exists(k)) ? own : LAYERS;
}

/** The widths wearables are drawn for (owl canvas units); a bigger or smaller head scales them. */
const REF = { head: 110, eyes: 92, neck: 100 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

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

type WearImageSlot = 'head' | 'face' | 'neck';

/**
 * A visitor's owl: tintable layered sprites in a container whose origin is at the feet.
 * Walking is driven from wall-clock time via positionAlongWalk, so local and remote
 * owls use exactly the same code path.
 *
 * Inside: `art` turns (facing) and bobs (walking, breathing); `pose` inside it is what emotes
 * animate; the layers, the worn items and the effect rigs (`back`, `front`) live in `pose`.
 * A pet trots alongside in the room itself.
 */
export class Owl extends Phaser.GameObjects.Container implements FxHost, EmoteHost {
  readonly id: string;
  look: OwlLook;
  walk: Walk | null = null;
  pos: Vec2;
  readonly pose: Phaser.GameObjects.Container;
  readonly back: Phaser.GameObjects.Container;
  readonly front: Phaser.GameObjects.Container;
  private readonly bodyImg: Phaser.GameObjects.Image;
  private readonly bellyImg: Phaser.GameObjects.Image;
  private readonly accentImg: Phaser.GameObjects.Image;
  private readonly faceImg: Phaser.GameObjects.Image;
  private readonly blinkImg: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly pledgeMark: Phaser.GameObjects.Image;
  private readonly art: Phaser.GameObjects.Container;
  private readonly wearImgs: Record<WearImageSlot, Phaser.GameObjects.Image>;
  /** Where worn items sit, measured from the layers in use (each species' painting differs). */
  private anchors: OwlAnchors;
  /** Which way the painting itself is turned (1 right, -1 left): the art is mirrored when that differs from `dir`. */
  private drawnFacing: 1 | -1;
  private dir: -1 | 1 = 1;
  /** Drawn size relative to the great horned owl (the species' size). */
  private size = 1;
  private layers: readonly string[] = LAYERS;
  private nextBlinkAt = 0;
  private eyesClosedUntil = 0;
  private jitter = 0;
  private fx: FxHandle | null = null;
  private fxVariant: string | undefined;
  private pet: Pet | null = null;
  private petVariant: string | undefined;
  private destroyed = false;

  constructor(
    scene: Phaser.Scene,
    id: string,
    look: OwlLook,
    pos: Vec2,
    private readonly textureScale = 1,
  ) {
    super(scene, pos.x, pos.y);
    this.id = id;
    this.look = look;
    this.pos = { ...pos };
    this.anchors = owlAnchors(scene);
    this.drawnFacing = artFacing(this.anchors);

    this.shadow = scene.add.ellipse(0, 0, 54, 18, 0x000000, 0.28);
    // The pledge mark: a small gold glow at the feet, shown for the day after a Realm Vote.
    this.pledgeMark = scene.add.image(0, 2, 'fx-glow').setTint(0xffd36a).setScale(0.5, 0.2).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    // Textures may be rasterized at any resolution; every layer is drawn at the logical canvas size.
    const mk = (key: string) => scene.add.image(-FEET.x, -FEET.y, key).setOrigin(0, 0).setDisplaySize(OWL_W, OWL_H);
    const worn = (originY: number) => scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, originY).setVisible(false);
    this.bodyImg = mk(LAYERS[0]);
    this.bellyImg = mk(LAYERS[1]);
    this.accentImg = mk(LAYERS[2]);
    this.faceImg = mk(LAYERS[3]);
    this.blinkImg = mk(LAYERS[4]).setVisible(false);
    this.wearImgs = { neck: worn(0.12), face: worn(0.5), head: worn(1) };
    this.back = scene.add.container(0, 0);
    this.front = scene.add.container(0, 0);
    this.pose = scene.add.container(0, 0, [this.back, this.bodyImg, this.bellyImg, this.accentImg, this.wearImgs.neck, this.faceImg, this.blinkImg, this.wearImgs.face, this.wearImgs.head, this.front]);
    this.art = scene.add.container(0, 0, [this.pose]);
    this.add([this.pledgeMark, this.shadow, this.art]);
    this.applyLook(look);
    this.nextBlinkAt = Date.now() + 1500 + Math.random() * 4000;
    scene.add.existing(this);
  }

  applyLook(look: OwlLook): void {
    this.look = look;
    this.pledgeMark.setAlpha(look.pledge ? 0.75 : 0);
    this.size = speciesOf(look).size;
    this.setScale(OWL_SCALE * this.size);
    const layers = layersFor(this.scene, look);
    if (layers !== this.layers) {
      this.layers = layers;
      this.anchors = owlAnchors(this.scene, layers);
      this.drawnFacing = artFacing(this.anchors);
      this.faceImg.setTexture(layers[3]!).setDisplaySize(OWL_W, OWL_H);
      this.blinkImg.setTexture(layers[4]!).setDisplaySize(OWL_W, OWL_H);
    }
    const sp = speciesOf(look);
    if (sp.art && layers === LAYERS && sp.id !== DEFAULT_SPECIES) {
      // Its own layers load on first sight; until then (or if they are missing) it wears the great horned owl's.
      void loadSpeciesArt(this.scene, sp.id).then((ok) => {
        if (ok && !this.destroyed && speciesOf(this.look).id === sp.id) this.applyLook(this.look);
      });
    }
    if (this.scene.renderer.type === Phaser.CANVAS) {
      // Tint is WebGL-only; on the Canvas renderer bake the colour into a texture instead.
      this.bodyImg.setTexture(tintedLayer(this.scene, layers[0]!, look.body)).setDisplaySize(OWL_W, OWL_H);
      this.bellyImg.setTexture(tintedLayer(this.scene, layers[1]!, look.belly)).setDisplaySize(OWL_W, OWL_H);
      this.accentImg.setTexture(tintedLayer(this.scene, layers[2]!, look.accent)).setDisplaySize(OWL_W, OWL_H);
    } else {
      this.bodyImg.setTexture(layers[0]!).setDisplaySize(OWL_W, OWL_H);
      this.bellyImg.setTexture(layers[1]!).setDisplaySize(OWL_W, OWL_H);
      this.accentImg.setTexture(layers[2]!).setDisplaySize(OWL_W, OWL_H);
      this.bodyImg.setTint(hexToInt(look.body));
      this.bellyImg.setTint(hexToInt(look.belly));
      this.accentImg.setTint(hexToInt(look.accent));
    }
    this.applyWear(look.wear);
  }

  // ---------- collectibles ----------

  private applyWear(wear: Wear | undefined): void {
    const a = this.anchors;
    // A texture that finishes loading is applied only if its slot still wants that variant, so
    // quick changes in any order settle on the latest look.
    const wanted = (slot: keyof Wear, variant: string) => !this.destroyed && this.look.wear?.[slot] === variant;
    const place: Record<WearImageSlot, { x: number; y: number; s: number }> = {
      head: { x: a.head.x - FEET.x, y: a.head.y - FEET.y + 8, s: clamp(a.head.w / REF.head, 0.75, 1.35) },
      face: { x: a.eyes.x - FEET.x, y: a.eyes.y - FEET.y, s: clamp(a.eyes.w / REF.eyes, 0.7, 1.4) },
      neck: { x: a.neck.x - FEET.x, y: a.neck.y - FEET.y - 4, s: clamp(a.neck.w / REF.neck, 0.7, 1.4) },
    };
    for (const slot of ['head', 'face', 'neck'] as const) {
      const img = this.wearImgs[slot];
      const variant = wear?.[slot];
      if (!variant) {
        img.setVisible(false);
        continue;
      }
      void ensureVariantTexture(this.scene, variant, this.textureScale).then((key) => {
        if (!wanted(slot, variant)) return;
        const p = place[slot];
        img.setTexture(key).setPosition(p.x, p.y).setDisplaySize(ITEM_SIZES[slot].w * p.s, ITEM_SIZES[slot].h * p.s).setVisible(true);
      });
    }

    if (wear?.fx !== this.fxVariant) {
      this.fx?.destroy();
      this.fx = wear?.fx ? createFx(this, wear.fx) : null;
      this.fxVariant = wear?.fx;
    }

    if (wear?.pet !== this.petVariant) {
      this.petVariant = wear?.pet;
      const variant = wear?.pet;
      if (!variant) {
        this.pet?.destroy();
        this.pet = null;
      } else {
        void ensureVariantTexture(this.scene, variant, this.textureScale).then((key) => {
          if (!wanted('pet', variant)) return;
          if (this.pet) this.pet.setTexture(key);
          else this.pet = new Pet(this.scene, key, this.pos);
        });
      }
    }
  }

  /** Play an emote on this owl (everyone in the room plays it on their copy). */
  playEmote(emote: string): boolean {
    return playEmote(this, emote);
  }

  /** Flop into a leaf pile. */
  flop(): void {
    playFlop(this);
  }

  /** Turn to face a way without walking (NPC owls greeting a visitor). */
  face(dir: 1 | -1): void {
    this.dir = dir;
  }

  /** Close the eyes for a while (sleep, wink). */
  closeEyes(ms: number): void {
    this.eyesClosedUntil = Date.now() + ms;
  }

  facing(): 1 | -1 {
    return this.dir;
  }

  /** Which way the owl faces inside `pose`, where emotes work: the painting's own turn. */
  forward(): 1 | -1 {
    return this.drawnFacing;
  }

  /** The body layer in use: `owl-body`, or a species' own such as `owl-barn-body`. */
  get artKey(): string {
    return this.layers[0]!;
  }

  isWalking(): boolean {
    return this.walk !== null;
  }

  bodyTexture(): string {
    return this.bodyImg.texture.key;
  }

  setJitter(dx: number): void {
    this.jitter = dx;
  }

  /** An anchor in owl canvas units inside the owl's containers (origin at the feet, as painted). */
  localAnchor(name: AnchorName): { x: number; y: number } {
    const a = this.anchors;
    switch (name) {
      case 'head':
        return { x: a.head.x - FEET.x, y: a.head.y - FEET.y };
      case 'eyes':
        return { x: a.eyes.x - FEET.x, y: a.eyes.y - FEET.y };
      case 'eyeL':
        return { x: a.eyes.x - a.eyes.w * 0.27 - FEET.x, y: a.eyes.y - FEET.y };
      case 'eyeR':
        return { x: a.eyes.x + a.eyes.w * 0.27 - FEET.x, y: a.eyes.y - FEET.y };
      case 'beak':
        return { x: a.eyes.x - FEET.x, y: a.eyes.y + a.eyes.w * 0.24 - FEET.y };
      case 'chest':
        return { x: a.neck.x - FEET.x, y: a.neck.y + 40 - FEET.y };
      case 'feet':
        return { x: 0, y: -4 };
    }
  }

  /** The same anchor as a world offset from the feet, turned with the owl. */
  anchor(name: AnchorName): { x: number; y: number } {
    const p = this.localAnchor(name);
    const k = OWL_SCALE * this.size;
    return { x: p.x * k * this.dir * this.drawnFacing, y: p.y * k };
  }

  /** How far above its feet the owl reaches: the top of its head, or of the hat it wears (a world offset, negative). */
  crown(): number {
    const hat = this.wearImgs.head;
    const head = this.localAnchor('head').y;
    return (hat.visible ? Math.min(head, hat.y - hat.displayHeight) : head) * OWL_SCALE * this.size;
  }

  // ---------- movement ----------

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
    this.pet?.snap(pos.x, pos.y, this.dir);
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

    // Facing: the art is painted in a slight 3/4 turn to one side; mirroring it reads as turning around.
    this.art.setScale(this.dir * this.drawnFacing, 1);
    this.art.x = this.jitter;

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

    // Blink now and then (and keep the eyes shut while an emote wants them closed).
    const closed = now < this.eyesClosedUntil;
    if (closed) {
      this.blinkImg.setVisible(true);
      this.faceImg.setVisible(false);
    } else if (now >= this.nextBlinkAt) {
      this.blinkImg.setVisible(true);
      this.faceImg.setVisible(false);
      if (now >= this.nextBlinkAt + 120) {
        this.blinkImg.setVisible(false);
        this.faceImg.setVisible(true);
        this.nextBlinkAt = now + 2500 + Math.random() * 5000;
      }
    } else if (!this.faceImg.visible) {
      this.blinkImg.setVisible(false);
      this.faceImg.setVisible(true);
    }

    this.fx?.tick(now);
    this.pet?.tick(now, this.pos.x, this.pos.y, this.dir, this.alpha);
    return finished;
  }

  override destroy(fromScene?: boolean): void {
    this.destroyed = true;
    this.fx?.destroy();
    this.fx = null;
    this.pet?.destroy();
    this.pet = null;
    super.destroy(fromScene);
  }
}
