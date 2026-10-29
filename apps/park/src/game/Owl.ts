import Phaser from 'phaser';
import { DEFAULT_SPECIES, GLIDING, GROUNDED, ON_GROUND, facing, hexToInt, parseVariant, positionAlongWalk, speciesOf, type Air, type OwlLook, type Vec2, type Walk, type Wear } from '@owl-park/shared';
import { artFacing, type OwlAnchors } from '../collect/pixels';
import { OWL_H, OWL_LAYERS, OWL_W, SPECIES_FLIGHT_LAYERS, SPECIES_LAYERS, WING_H, WING_W, loadFlightArt, loadSpeciesArt } from './art';
import { playEmote, playFlop, type EmoteHost } from './emotes';
import { AirTrack, WING_TURN, shadowFade, wingTurn } from './airTrack';
import { createFx, type AnchorName, type FxHandle, type FxHost } from './fx';
import { EYE_SPREAD, FEET, solidTop, wornAt } from './fit';
import type { OwlFit } from './fitOverlay';
import { ensureVariantTexture, owlAnchors } from './items';
import { Pet } from './Pet';

export { OWL_H, OWL_W };
/** The 200 x 240 layer canvas is drawn at this scale in 1600-wide rooms. */
export const OWL_SCALE = 0.5;

const LAYERS = OWL_LAYERS;

/** How far a gliding owl leans into its glide (radians, OP-084). */
const GLIDE_LEAN = 0.07;

/**
 * The wings (OP-084): one painted right wing, `owl-wing-body` in the owl's body colour and
 * `owl-wing-accent` in its accent colour, drawn twice behind the body (the left one mirrored), each
 * turned about its root at a shoulder (airTrack.ts wingTurn). `root` is the root on the wing's canvas
 * (the art tools' wing_layers.ROOT); `scale` how big the wing is drawn against the owl; the shoulders
 * sit `shoulder` of the chest's width either side of its middle and `drop` below its top (owl canvas
 * units); a held wing eases to where it is held at `ease` a second.
 */
const WING = { root: { x: 12, y: 72 }, scale: 0.85, shoulder: 0.24, drop: 10, ease: 10 } as const;

/** How long an owl waits before asking again for flight layers that failed to load (ms, OP-136). */
const FLIGHT_ASK_MS = 2000;

/** Asleep (OP-126): a breath this long, a 'z' this often, and the blink a waking owl gives. */
const SLEEP = { breathMs: 1500, zEveryMs: 2600, zRiseMs: 700, zFadeMs: 1100, wakeBlinkMs: 150 };
const Z_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

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
  /** How far down its frame the worn hat's own top edge is (0..1), for the crown. */
  private hatTop = 0;
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
  /** Asleep since (ms), its visitor idle (OP-126); 0 awake. */
  private asleepSince = 0;
  /** Calm motion: asleep, it neither heaves nor sends its 'z' drifting. */
  private calmSleep = false;
  private nextZAt = 0;
  private readonly zs: Phaser.GameObjects.Text[] = [];
  private jitter = 0;
  /** Its flight (OP-084): the air states it is told, carried on as frames go by. Flight lifts the drawn owl, never its place in the room. */
  private readonly flight = new AirTrack();
  /** Its air as last drawn: how high above the floor (room px), and on the ground, in the air or gliding. */
  private air: Air = ON_GROUND;
  /** How high the owl is drawn above its feet right now (owl canvas units). */
  private lift = 0;
  /** What the owl comes down on where it is (OP-084, perches.ts groundAt): the scene's, the floor until it says. */
  groundUnder: (pos: Vec2, z: number) => number = () => 0;
  /** The wings (OP-084): behind the body, a side for each shoulder; folded away on the ground. */
  private readonly wings: Phaser.GameObjects.Container;
  private readonly wingSides: ReadonlyArray<{ side: Phaser.GameObjects.Container; body: Phaser.GameObjects.Image; accent: Phaser.GameObjects.Image; dir: 1 | -1 }>;
  /** The wings' turn as last drawn (radians), and when the owl was last drawn (ms). */
  private wingAt: number = WING_TURN.fall;
  /**
   * The body, belly and accent drawn right now: its layers, or with its wings out their flight copies,
   * the folded wings taken away (OP-136). Until those have loaded the wings stay folded.
   */
  private worn: readonly string[] = LAYERS;
  /** When the owl may next ask for its flight layers (ms). */
  private flightAskAt = 0;
  private drawnAt = 0;
  private fx: FxHandle | null = null;
  private fxVariant: string | undefined;
  private pet: Pet | null = null;
  private petVariant: string | undefined;
  /** Scratch matrices for drawnAnchor (it runs for every effect every frame). */
  private readonly drawnTm = new Phaser.GameObjects.Components.TransformMatrix();
  private readonly drawnParentTm = new Phaser.GameObjects.Components.TransformMatrix();
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
    const wing = (dir: 1 | -1) => {
      const layer = (key: string) => scene.add.image(0, 0, key).setOrigin(WING.root.x / WING_W, WING.root.y / WING_H).setDisplaySize(WING_W * WING.scale, WING_H * WING.scale);
      const body = layer('owl-wing-body');
      const accent = layer('owl-wing-accent');
      return { side: scene.add.container(0, 0, [body, accent]).setScale(dir, 1), body, accent, dir };
    };
    this.wingSides = [wing(1), wing(-1)];
    this.wings = scene.add.container(0, 0, this.wingSides.map((w) => w.side)).setVisible(false);
    this.pose = scene.add.container(0, 0, [this.back, this.wings, this.bodyImg, this.bellyImg, this.accentImg, this.wearImgs.neck, this.faceImg, this.blinkImg, this.wearImgs.face, this.wearImgs.head, this.front]);
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
    this.pet?.setOwlSize(this.size);
    const layers = layersFor(this.scene, look);
    if (layers !== this.layers) {
      this.layers = layers;
      this.anchors = owlAnchors(this.scene, layers);
      this.drawnFacing = artFacing(this.anchors);
      this.faceImg.setTexture(layers[3]!).setDisplaySize(OWL_W, OWL_H);
      this.blinkImg.setTexture(layers[4]!).setDisplaySize(OWL_W, OWL_H);
    }
    // The wings sit at this kind's shoulders, measured from its chest.
    const chest = this.anchors.neck;
    for (const w of this.wingSides) w.side.setPosition(chest.x - FEET.x + w.dir * chest.w * WING.shoulder, chest.y - FEET.y + WING.drop);
    const sp = speciesOf(look);
    if (sp.art && layers === LAYERS && sp.id !== DEFAULT_SPECIES) {
      // Its own layers load on first sight; until then (or if they are missing) it wears the great horned owl's.
      void loadSpeciesArt(this.scene, sp.id).then((ok) => {
        if (ok && !this.destroyed && speciesOf(this.look).id === sp.id) this.applyLook(this.look);
      });
    }
    // On the ground layers; a flying owl puts its flight body back on at its next frame.
    this.wearBody(layers);
    if (this.scene.renderer.type === Phaser.CANVAS) {
      // Tint is WebGL-only; on the Canvas renderer bake the colour into a texture instead.
      for (const w of this.wingSides) {
        w.body.setTexture(tintedLayer(this.scene, 'owl-wing-body', look.body)).setDisplaySize(WING_W * WING.scale, WING_H * WING.scale);
        w.accent.setTexture(tintedLayer(this.scene, 'owl-wing-accent', look.accent)).setDisplaySize(WING_W * WING.scale, WING_H * WING.scale);
      }
    } else {
      for (const w of this.wingSides) {
        w.body.setTint(hexToInt(look.body));
        w.accent.setTint(hexToInt(look.accent));
      }
    }
    this.applyWear(look.wear);
  }

  /** Draw the body, belly and accent of `set` (its layers or their flight copies) in the look's colours. */
  private wearBody(set: readonly string[]): void {
    const look = this.look;
    const parts = [
      [this.bodyImg, set[0]!, look.body],
      [this.bellyImg, set[1]!, look.belly],
      [this.accentImg, set[2]!, look.accent],
    ] as const;
    for (const [img, key, hex] of parts) {
      // Tint is WebGL-only; on the Canvas renderer the colour is baked into a texture instead.
      if (this.scene.renderer.type === Phaser.CANVAS) img.setTexture(tintedLayer(this.scene, key, hex));
      else img.setTexture(key).setTint(hexToInt(hex));
      img.setDisplaySize(OWL_W, OWL_H);
    }
    this.worn = set;
  }

  /**
   * The flight layers that go with the layers worn, once they have loaded (OP-136): the great horned
   * owl's while a kind's own layers are still on their way, else its own. Asks for them meanwhile.
   */
  private flightSet(now: number): readonly string[] | null {
    const species = this.layers === LAYERS ? DEFAULT_SPECIES : speciesOf(this.look).id;
    const set = SPECIES_FLIGHT_LAYERS[species];
    if (set.every((k) => this.scene.textures.exists(k))) return set;
    if (now >= this.flightAskAt) {
      this.flightAskAt = now + FLIGHT_ASK_MS;
      void loadFlightArt(this.scene, species);
    }
    return null;
  }

  /** Load its kind's flight layers ahead of a first take-off (OP-136): the room asks once its own art is in. */
  readyForFlight(): void {
    const sp = speciesOf(this.look);
    void loadFlightArt(this.scene, sp.art ? sp.id : DEFAULT_SPECIES);
  }

  // ---------- collectibles ----------

  private applyWear(wear: Wear | undefined): void {
    const a = this.anchors;
    // A texture that finishes loading is applied only if its slot still wants that variant, so
    // quick changes in any order settle on the latest look.
    const wanted = (slot: keyof Wear, variant: string) => !this.destroyed && this.look.wear?.[slot] === variant;
    for (const slot of ['head', 'face', 'neck'] as const) {
      const img = this.wearImgs[slot];
      const variant = wear?.[slot];
      if (!variant) {
        img.setVisible(false);
        continue;
      }
      void ensureVariantTexture(this.scene, variant, this.textureScale).then((key) => {
        if (!wanted(slot, variant)) return;
        // Placed by what the item draws, not by its frame (OP-127).
        const art = parseVariant(variant)?.item.art;
        const p = wornAt(slot, a, art);
        if (slot === 'head') this.hatTop = solidTop(art);
        img.setTexture(key).setOrigin(p.origin.x, p.origin.y).setPosition(p.x, p.y).setDisplaySize(p.w, p.h).setVisible(true);
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
          const art = parseVariant(variant)?.item.art;
          if (this.pet) this.pet.setTexture(key, art);
          else this.pet = new Pet(this.scene, key, this.pos, art, this.size);
        });
      }
    }
  }

  /** Play an emote on this owl (everyone in the room plays it on their copy). */
  playEmote(emote: string): boolean {
    return playEmote(this, emote);
  }

  /**
   * Tell the owl an air state from `at` on (OP-084; this page's clock): it carries it on as every
   * page does, so all draw the same arc. Only the drawing goes up, so the owl's place, its walk and
   * what it stands at stay as they are. Its own state beside emotes, so one can play during the other.
   */
  fly(air: Air, at: number): void {
    this.flight.tell(air, at);
  }

  /** How high the owl is drawn above the floor right now, in room pixels (0 on the ground). */
  flightHeight(): number {
    return this.air.z;
  }

  /** On the ground, in the air or gliding, as last drawn. */
  get airMode(): Air['s'] {
    return this.air.s;
  }

  /** Its take-offs as this page carried them on (AirTrack's `flown`): how many, the last one's top, whether it glided, how long it was up. */
  get flown(): { n: number; peak: number; glided: boolean; ms: number } {
    return { ...this.flight.flown };
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

  /**
   * Asleep where it stands (OP-126): eyes shut, slow deep breaths, a small 'z' off its head every few
   * seconds, no sound. Woken, it blinks once and is itself again.
   */
  setAsleep(on: boolean, calm = false): void {
    if (on === this.asleep) return;
    const now = Date.now();
    if (on) {
      this.asleepSince = now;
      this.calmSleep = calm;
      this.nextZAt = now + SLEEP.zRiseMs;
      return;
    }
    this.asleepSince = 0;
    this.eyesClosedUntil = now + SLEEP.wakeBlinkMs;
    for (const z of this.zs.splice(0)) {
      this.scene.tweens.killTweensOf(z);
      z.destroy();
    }
  }

  get asleep(): boolean {
    return this.asleepSince > 0;
  }

  /** One small 'z' off the head, rising and fading (in calm motion it fades where it is). */
  private puffZ(): void {
    const head = this.localAnchor('head');
    // The z sits on this container, which the owl's turn does not mirror (only its art is), so it
    // turns with the art by hand and rises from the same side of the head either way.
    const side = this.dir * this.drawnFacing;
    const z = this.scene.add
      .text((head.x + 34) * side, head.y - 4, 'z', { fontFamily: Z_FONT, fontSize: '40px', fontStyle: '800', color: '#F6F1E3', stroke: '#0C1E36', strokeThickness: 8 })
      .setOrigin(0.5, 1)
      .setAlpha(0);
    this.add(z);
    this.zs.push(z);
    const drift = this.calmSleep ? 0 : 1;
    this.scene.tweens.chain({
      targets: z,
      tweens: [
        { alpha: 0.95, x: z.x + 10 * drift * side, y: z.y - 30 * drift, duration: SLEEP.zRiseMs, ease: 'Sine.easeOut' },
        { alpha: 0, x: z.x + 26 * drift * side, y: z.y - 80 * drift, duration: SLEEP.zFadeMs, ease: 'Sine.easeIn' },
      ],
      onComplete: () => {
        this.zs.splice(this.zs.indexOf(z), 1);
        z.destroy();
      },
    });
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

  /** The body layer drawn right now: `artKey`, or its flight copy (`owl-flight-body`) while the wings are out (OP-136). */
  get wornKey(): string {
    return this.worn[0]!;
  }

  /** Whether its wings are open (OP-084). */
  get wingsOut(): boolean {
    return this.wings.visible;
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

  /** The shadow at its feet (off for an owl in the air, as in the arcade's flight). */
  showShadow(on: boolean): void {
    this.shadow.setVisible(on);
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
        return { x: a.eyes.x - a.eyes.w * EYE_SPREAD - FEET.x, y: a.eyes.y - FEET.y };
      case 'eyeR':
        return { x: a.eyes.x + a.eyes.w * EYE_SPREAD - FEET.x, y: a.eyes.y - FEET.y };
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

  /**
   * The same anchor where it is drawn right now, as a world offset from the feet: lifted in flight,
   * bobbing with the walk, turned by an emote (OP-127). Effects follow this one, so a halo stays on
   * the head in the air; bubbles and marks keep the steady `anchor`, so they can be read.
   */
  drawnAnchor(name: AnchorName): { x: number; y: number } {
    const p = this.localAnchor(name);
    const m = this.pose.getWorldTransformMatrix(this.drawnTm, this.drawnParentTm);
    return { x: m.getX(p.x, p.y) - this.x, y: m.getY(p.x, p.y) - this.y };
  }

  /** Its anchors and worn items in room pixels, for the fit overlay (OP-127). */
  fitMarks(): OwlFit {
    const k = OWL_SCALE * this.size;
    const at = (p: { x: number; y: number }) => ({ x: this.x + p.x, y: this.y + p.y });
    const neck = this.anchors.neck;
    const worn = (['head', 'face', 'neck'] as const)
      .map((slot) => this.wearImgs[slot])
      .filter((img) => img.visible)
      .map((img) => {
        const b = img.getBounds();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      });
    return {
      feet: { x: this.x, y: this.y },
      head: at(this.anchor('head')),
      eyes: at(this.anchor('eyes')),
      neck: at({ x: (neck.x - FEET.x) * k * this.dir * this.drawnFacing, y: (neck.y - FEET.y) * k }),
      crown: this.crown(),
      worn,
    };
  }

  /**
   * How far above its feet the owl reaches: the top of its head, or of the hat it wears (a world
   * offset, negative). The hat's own top, not its frame's: a crown's frame is a third empty above it.
   */
  crown(): number {
    const hat = this.wearImgs.head;
    const head = this.localAnchor('head').y;
    const hatTop = hat.y - hat.displayHeight * (hat.originY - this.hatTop);
    return (hat.visible ? Math.min(head, hatTop) : head) * OWL_SCALE * this.size;
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
    let sx = 1;
    let sy = 1;
    let y = 0;
    let shadow = 1;
    this.art.x = this.jitter;

    // In the air (OP-084): carried on from the last state told, as every page does.
    const air = this.flight.at(now);
    this.air = air;
    const flying = air.s !== GROUNDED;

    // Walk cycle: a gentle bob and squash while moving (on the ground: in the air the feet are off it).
    if (this.walk && !flying) {
      const phase = (now / 140) % (Math.PI * 2);
      const bob = Math.abs(Math.sin(phase));
      y = -bob * 10;
      sy = 1 - bob * 0.04;
      shadow = 1 - bob * 0.08;
    } else if (this.asleep && !this.calmSleep) {
      // Asleep: slow, deep breaths.
      const breath = Math.sin((now / SLEEP.breathMs) * Math.PI);
      sy = 1 + breath * 0.03;
      sx = 1 - breath * 0.01;
    } else {
      // Idle breathing.
      sy = 1 + Math.sin(now / 900) * 0.012;
    }

    // Flight: the drawing rises and falls; the wings open behind the body, beating for a jump or a
    // flap, spread in a glide (the owl leaning into it) and raised a little in a fall, and fold away
    // on landing; the shadow stays on what is under the owl (the floor, or a perch), smaller and fainter.
    this.lift = air.z / (OWL_SCALE * this.size);
    const dt = this.drawnAt ? Math.min(0.1, Math.max(0, now - this.drawnAt) / 1000) : 0;
    this.drawnAt = now;
    const wingPose = wingTurn(air, now - this.flight.flapAt);
    // Wings out, the owl wears its flight body, its folded wings taken away (OP-136); until that has
    // loaded, its wings stay folded, so it never shows four.
    const flightSet = wingPose ? this.flightSet(now) : null;
    if (!wingPose || !flightSet) {
      if (this.worn !== this.layers) this.wearBody(this.layers);
      this.wings.setVisible(false);
      this.wingAt = WING_TURN.fall;
    } else {
      if (this.worn !== flightSet) this.wearBody(flightSet);
      this.wings.setVisible(true);
      this.wingAt = wingPose.beating ? wingPose.turn : this.wingAt + (wingPose.turn - this.wingAt) * Math.min(1, dt * WING.ease);
      for (const w of this.wingSides) w.side.rotation = this.wingAt * w.dir;
    }
    this.art.setScale(this.dir * this.drawnFacing * sx, sy);
    this.art.y = y - this.lift;
    this.art.rotation = air.s === GLIDING ? GLIDE_LEAN * this.dir : 0;
    const ground = this.groundUnder(this.pos, air.z);
    this.shadow.y = -ground / (OWL_SCALE * this.size);
    const up = shadowFade(air.z - ground);
    this.shadow.setScale(shadow * (1 - up * 0.45), shadow * (1 - up * 0.45));
    this.shadow.setAlpha(1 - up * 0.5);

    if (this.look.pledge) this.pledgeMark.setAlpha(0.6 + Math.sin(now / 500) * 0.15);

    if (this.asleep && now >= this.nextZAt) {
      this.puffZ();
      this.nextZAt = now + SLEEP.zEveryMs;
    }

    // Blink now and then (and keep the eyes shut while an emote wants them closed, or the owl sleeps).
    const closed = this.asleep || now < this.eyesClosedUntil;
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
    for (const z of this.zs.splice(0)) this.scene?.tweens.killTweensOf(z);
    this.scene?.tweens.killTweensOf(this.pose);
    this.fx?.destroy();
    this.fx = null;
    this.pet?.destroy();
    this.pet = null;
    super.destroy(fromScene);
  }
}
