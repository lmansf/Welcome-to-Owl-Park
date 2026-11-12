import Phaser from 'phaser';
import { KIT_ART, ROOM_W, WAY_OUT_DOOR, idolRealms, kitFilesOf, seenFromSide, type RoomDef } from '@owl-park/shared';
import { ANCHORS } from '../rooms';
import { ART, blockadeKey } from './art';
import { FOOT_SHADOW_DEPTH, footShadow } from './bowlView';
import { tintImage } from './canvasTint';
import { footOrigin, hitArea } from './fit';
import { IDOL_FLARE } from './idolFlare';

/** Generated helper textures shared by every room. */
export function ensureFxTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('fx-dot')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture('fx-dot', 16, 16);
    g.destroy();
  }
  if (!scene.textures.exists('fx-glow')) {
    // Soft radial glow: concentric circles of falling alpha.
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const r = 128;
    for (let i = r; i > 0; i -= 4) {
      const a = Math.pow(1 - i / r, 2) * 0.9;
      g.fillStyle(0xffffff, a);
      g.fillCircle(r, r, i);
    }
    g.generateTexture('fx-glow', r * 2, r * 2);
    g.destroy();
  }
  if (!scene.textures.exists('fx-rain')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 2, 18);
    g.generateTexture('fx-rain', 2, 18);
    g.destroy();
  }
  if (!scene.textures.exists('fx-chevron')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(0, 0, 36, 0, 18, 22);
    g.generateTexture('fx-chevron', 36, 22);
    g.destroy();
  }
}

/**
 * A set piece drawn at its logical size whatever the texture's resolution, standing on its anchor by
 * what it draws rather than by its frame's padded bottom edge (OP-127).
 */
/** A kit piece standing with its art's foot at (x, y), at its logical size (things to use out on a plaza draw themselves with it too, FloorThing.ts). */
export function piece(scene: Phaser.Scene, x: number, y: number, key: string): Phaser.GameObjects.Image {
  const spec = ART[key];
  const foot = footOf(key);
  const img = scene.add.image(x, y, key).setOrigin(foot.x, foot.y);
  if (spec) img.setDisplaySize(spec.w, spec.h);
  return img;
}

/**
 * Where a piece stands in its frame: its own art's foot (the sprite manifest), else that of the art
 * standing in for a realm kit slot (OP-276), else a kit piece's measured box, else its frame's bottom middle.
 */
function footOf(key: string): { x: number; y: number } {
  const kit = KIT_ART[key];
  const box = kit?.foot !== undefined && kit.left !== undefined && kit.right !== undefined ? { x: (kit.left + kit.right) / 2 / kit.w, y: kit.foot / kit.h } : { x: 0.5, y: 1 };
  return footOrigin(key, footOrigin(kitFilesOf(key), box));
}

/** The realm's idol (OP-276): the glass realm's is its kit slot, drawn from today's idol until its artist's comes. */
export const GLASS_IDOL = 'kit-glass-idol-owl';

/**
 * A tap area round the piece itself, not its frame (OP-127): an idol's glow fills most of its picture
 * and a tap on that glow, over the shop or the street, should not walk the owl to the idol. In the
 * texture's own pixels, which may be twice the logical size.
 */
function hugging(img: Phaser.GameObjects.Image, key: string): Phaser.Types.Input.InputConfiguration {
  const res = img.frame.width / (ART[key]?.w ?? img.frame.width);
  const area = hitArea(key, Math.abs(img.scaleX) * res) ?? hitArea(kitFilesOf(key), Math.abs(img.scaleX) * res);
  if (!area) return { useHandCursor: true };
  return { hitArea: new Phaser.Geom.Rectangle(area.x * res, area.y * res, area.w * res, area.h * res), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true };
}

/** Scale so a set piece anchored at its feet keeps its head inside the frame. */
function fitBelowTop(key: string, anchorY: number, tallest = Number.POSITIVE_INFINITY, margin = 24): number {
  const h = ART[key]?.h ?? 1;
  return Math.min(1, tallest / h, Math.max(0.2, (anchorY - margin) / h));
}

/**
 * How tall an idol stands at most in a room seen from almost straight above (RoomDef.bowl, the Great
 * Hollow): the three stand the same height round the rim, and on a phone none hides the doorways
 * beside it (the neon robot owl, Nov 8, covered the neon street's sign).
 */
export const BOWL_IDOL_TALL = 560;

export interface Idol {
  /** The tappable mythical owl. */
  image: Phaser.GameObjects.Image;
  /** Play the idol's reaction to a pledge. */
  react(): void;
}

export interface SetPieces {
  /** The room's idol: its one, or the first of several. */
  idol?: Idol;
  /** A room with several idols (RoomDef.idols): each, by the realm it takes the vote for. */
  idols?: Record<string, Idol>;
  /** The lobby's turnstiles: a flash of gold as an owl goes through. */
  gate?: { react(): void };
  /** The hub's arches into gated realms, by door id: the blockade while the realm is closed, the doorway's glow while it is open. */
  arches?: Record<string, { blockade: Phaser.GameObjects.Image | null; glow: Phaser.GameObjects.Image }>;
  /** Every piece stood among the owls, its foot its depth: the tall ones go see-through while the visitor's own owl is behind them (seeThroughArt.ts, OP-346). */
  standing?: Phaser.GameObjects.Image[];
}

/** Each idol glow's size before any swell, and the swell under way, so pledges close together never stack. */
const FLARES = new WeakMap<Phaser.GameObjects.Image, { scaleX: number; scaleY: number; alpha: number; tween?: Phaser.Tweens.TweenChain | undefined }>();

/**
 * An idol's glow swells once, slowly, when a visitor pledges (IDOL_FLARE), and settles back. A pledge
 * during a swell restarts it from where the glow is, so a burst of pledges holds the glow up rather
 * than pulsing it, and the glow always settles back to its own size.
 */
function flareGlow(scene: Phaser.Scene, glow: Phaser.GameObjects.Image): void {
  let flare = FLARES.get(glow);
  if (!flare) FLARES.set(glow, (flare = { scaleX: glow.scaleX, scaleY: glow.scaleY, alpha: glow.alpha }));
  const settled = flare.tween ? flare.alpha : glow.alpha;
  flare.tween?.stop();
  flare.alpha = settled;
  const { scaleX, scaleY } = flare;
  flare.tween = scene.tweens.chain({
    targets: glow,
    tweens: [
      { alpha: IDOL_FLARE.glowPeak, scaleX: scaleX * IDOL_FLARE.glowSwell, scaleY: scaleY * IDOL_FLARE.glowSwell, duration: IDOL_FLARE.riseMs, ease: 'Sine.easeInOut' },
      { alpha: settled, scaleX, scaleY, duration: IDOL_FLARE.riseMs, ease: 'Sine.easeInOut' },
    ],
    onComplete: () => {
      if (flare) flare.tween = undefined;
    },
  });
}

const DOOR_GLOW: Record<string, number> = { market: 0xff2aa1, arcade: 0x00e5ff, grove: 0xffb347, glass: 0x9fd0ff };

/** The soft glow that marks an open doorway, tinted for the realm beyond it. */
function doorGlow(scene: Phaser.Scene, m: { x: number; y: number }, to: string): Phaser.GameObjects.Image {
  const glow = scene.add.image(m.x, m.y, 'fx-glow').setTint(DOOR_GLOW[to] ?? 0xc9a227).setAlpha(0.28).setScale(1.6).setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: glow, alpha: 0.5, scale: 1.9, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  return glow;
}

/** Large set pieces (guardian, giant robot owl, blockades) sorted into the owl depth range. */
export function addSetPieces(
  scene: Phaser.Scene,
  room: RoomDef,
  onIdolTap?: (pointer: Phaser.Input.Pointer, event: Phaser.Types.Input.EventData, realm: string) => void,
): SetPieces {
  const anchors = ANCHORS[room.id] ?? {};
  // The realms whose idols stand here: the room's own, the one its `idol` doorway votes for, or each of
  // several over its own spot (the Great Hollow's Commons, RoomDef.idols).
  const realms = idolRealms(room);
  const tallest = room.bowl ? BOWL_IDOL_TALL : Number.POSITIVE_INFINITY;
  const standing: Phaser.GameObjects.Image[] = [];
  const pieces: SetPieces = { standing };
  const tappable = (img: Phaser.GameObjects.Image, realm: string) => {
    img.setInteractive(hugging(img, img.texture.key));
    img.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => onIdolTap?.(pointer, event, realm));
  };
  // In a room with a light of its own (the Great Hollow, OP-348) each idol, painted for its realm, takes
  // that light, and a shadow lies at its foot: it stands in the room and is not laid over it.
  const idolShadows = room.bowl ? scene.add.graphics().setDepth(FOOT_SHADOW_DEPTH) : null;
  const stood = (realm: string, idol: Idol) => {
    if (room.bowl?.light !== undefined) tintImage(scene, idol.image, idol.image.texture.key, room.bowl.light);
    if (idolShadows) footShadow(idolShadows, idol.image.x, idol.image.y, idol.image.displayWidth * 0.62);
    standing.push(idol.image);
    pieces.idol ??= idol;
    if (!room.idols) return;
    pieces.idols ??= {};
    pieces.idols[realm] = idol;
  };
  if (realms.includes('grove') && anchors['guardian']) {
    const a = anchors['guardian'];
    const k = fitBelowTop('guardian', a.y, tallest);
    // Its glow is the idol's size: an idol drawn smaller (a bowl room) lights that much less of the room round it (OP-348).
    const glow = scene.add.image(a.x, a.y - 300 * k, 'fx-glow').setTint(0xffd27a).setAlpha(0.3).setScale(5 * k, 4 * k).setDepth(a.y - 1).setBlendMode(Phaser.BlendModes.ADD);
    const guardian = piece(scene, a.x, a.y, 'guardian').setDepth(a.y);
    const sx = guardian.scaleX * k;
    const sy = guardian.scaleY * k;
    guardian.setScale(sx, sy);
    scene.tweens.add({ targets: guardian, scaleY: sy * 1.015, scaleX: sx * 0.995, duration: 4200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: glow, alpha: 0.48, scaleX: 5.4 * k, duration: 3600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    tappable(guardian, 'grove');
    stood('grove', {
      image: guardian,
      react: () => {
        // The guardian stirs: its glow swells and a drift of fireflies rises from the bough.
        flareGlow(scene, glow);
        scene.tweens.add({ targets: guardian, scaleY: sy * 1.04, scaleX: sx * 0.985, duration: 450, yoyo: true, ease: 'Sine.easeOut' });
        scene.add
          .particles(a.x, a.y - 40, 'fx-dot', {
            lifespan: { min: 1500, max: 2600 },
            speed: { min: 40, max: 120 },
            angle: { min: 200, max: 340 },
            scale: { start: 0.5, end: 0 },
            alpha: { start: IDOL_FLARE.sparkAlpha, end: 0 },
            tint: [0xffe08a, 0xfff2b3, 0xc9a227],
            blendMode: Phaser.BlendModes.ADD,
            emitting: false,
          })
          .setDepth(a.y + 1)
          .explode(IDOL_FLARE.sparks);
      },
    });
  }
  if (realms.includes('market') && anchors['robot']) {
    const a = anchors['robot'];
    const kr = fitBelowTop('robot-owl', a.y, tallest);
    const glow = scene.add.image(a.x, a.y - 420 * kr, 'fx-glow').setTint(0xff2aa1).setAlpha(0.22).setScale(5 * kr, 5 * kr).setDepth(a.y - 1).setBlendMode(Phaser.BlendModes.ADD);
    const robot = piece(scene, a.x, a.y, 'robot-owl').setDepth(a.y);
    robot.setScale(robot.scaleX * kr, robot.scaleY * kr);
    tappable(robot, 'market');
    stood('market', {
      image: robot,
      react: () => {
        // The robot owl hums: a slow swell of its glow (OP-324: no flash on the owl itself).
        flareGlow(scene, glow);
        scene.add
          .particles(a.x, a.y - 320, 'fx-dot', {
            lifespan: { min: 600, max: 1200 },
            speed: { min: 120, max: 260 },
            scale: { start: 0.45, end: 0 },
            alpha: { start: IDOL_FLARE.sparkAlpha, end: 0 },
            tint: [0x00e5ff, 0xff2aa1, 0xc7ceda],
            blendMode: Phaser.BlendModes.ADD,
            emitting: false,
          })
          .setDepth(a.y + 1)
          .explode(IDOL_FLARE.sparks);
      },
    });
    scene.tweens.add({ targets: robot, y: a.y - 6, duration: 5200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: glow, alpha: 0.4, tint: 0x00e5ff, duration: 2800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  if (realms.includes('glass') && anchors['idol'] && scene.textures.exists(GLASS_IDOL)) {
    // The stained-glass owl on its plinth: lit from within, it brightens when a visitor pledges.
    const a = anchors['idol'];
    const ki = fitBelowTop(GLASS_IDOL, a.y, tallest);
    const glow = scene.add.image(a.x, a.y - 230 * ki, 'fx-glow').setTint(0x9fd0ff).setAlpha(0.24).setScale(4 * ki, 3.2 * ki).setDepth(a.y - 1).setBlendMode(Phaser.BlendModes.ADD);
    const idol = piece(scene, a.x, a.y, GLASS_IDOL).setDepth(a.y);
    idol.setScale(idol.scaleX * ki, idol.scaleY * ki);
    tappable(idol, 'glass');
    stood('glass', {
      image: idol,
      react: () => {
        // The panes glow brighter and a scatter of glass light rises from the owl.
        flareGlow(scene, glow);
        scene.add
          .particles(a.x, a.y - 200, 'fx-dot', {
            lifespan: { min: 900, max: 1800 },
            speed: { min: 60, max: 180 },
            angle: { min: 200, max: 340 },
            scale: { start: 0.5, end: 0 },
            alpha: { start: IDOL_FLARE.sparkAlpha, end: 0 },
            tint: [0x9fd0ff, 0xffd36a, 0xff8ad0, 0x7be0c8, 0xcdb0ff],
            blendMode: Phaser.BlendModes.ADD,
            emitting: false,
          })
          .setDepth(a.y + 1)
          .explode(IDOL_FLARE.sparks);
      },
    });
    scene.tweens.add({ targets: glow, alpha: 0.4, duration: 3200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  // A realm start's pieces (OP-276): its quest post, trading nest and decor, each standing at its foot among the owls.
  for (const p of room.pieces ?? []) {
    if (!scene.textures.exists(p.key)) continue;
    const img = piece(scene, p.x, p.y, p.key).setDepth(p.y).setFlipX(!!p.flip);
    if (p.scale) img.setDisplaySize(img.displayWidth * p.scale, img.displayHeight * p.scale);
    if (p.tint !== undefined) tintImage(scene, img, p.key, p.tint);
    standing.push(img);
  }
  for (const door of room.doors) {
    const m = door.marker;
    if (!m) continue;
    if (door.closedSign) {
      // A room seen from the side (the tree) draws its own barriers (treeView, OP-220), never this art.
      if (seenFromSide(room)) continue;
      // A construction blockade stands in the closed arch, its phrase on its board. An arch into a
      // gated realm also has a doorway's glow, shown instead of the blockade once the realm opens.
      const key = blockadeKey(door.closedSign);
      const blockade = scene.textures.exists(key) ? piece(scene, m.x, m.y, key).setDepth(m.y) : null;
      if (blockade) standing.push(blockade);
      if (door.to) (pieces.arches ??= {})[door.id] = { blockade, glow: doorGlow(scene, m, door.to.room).setVisible(false) };
    } else if (room.id === 'hub' && door.id === WAY_OUT_DOOR) {
      // The way out of the park (C43): a soft gold ring on the floor where the owls came in.
      const ring = scene.add.image(m.x, m.y, 'fx-glow').setTint(0xc9a227).setAlpha(0.18).setScale(2.2, 0.42).setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: ring, alpha: 0.34, scaleX: 2.5, scaleY: 0.48, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (door.to) {
      doorGlow(scene, m, door.to.room);
    } else if (door.id === 'shop') {
      const chevron = scene.add.image(m.x, m.y, 'fx-chevron').setTint(0xc9a227).setDepth(m.y + 1);
      scene.tweens.add({ targets: chevron, y: m.y + 14, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (door.id === 'idol') {
      // A soft gold ring on the ground where visitors gather to vote.
      const ring = scene.add.image(m.x, m.y, 'fx-glow').setTint(0xc9a227).setAlpha(0.22).setScale(1.1, 0.45).setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: ring, alpha: 0.4, scaleX: 1.3, scaleY: 0.52, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }
  const gate = room.doors.find((d) => d.id === 'gate');
  if (gate?.marker) {
    // The turnstiles light up gold as an owl goes through.
    const m = { x: gate.marker.x, y: gate.rect.y + gate.rect.h / 2 };
    const flash = scene.add.image(m.x, m.y, 'fx-glow').setTint(0xffd36a).setAlpha(0).setScale(4.2, 1.4).setDepth(m.y - 1).setBlendMode(Phaser.BlendModes.ADD);
    pieces.gate = {
      react() {
        scene.tweens.add({ targets: flash, alpha: 0.9, duration: 220, yoyo: true, hold: 280, ease: 'Sine.easeOut' });
        scene.add
          .particles(m.x, m.y - 20, 'fx-dot', {
            lifespan: { min: 600, max: 1200 },
            speed: { min: 100, max: 240 },
            scale: { start: 0.5, end: 0 },
            alpha: { start: IDOL_FLARE.sparkAlpha, end: 0 },
            tint: [0xffd36a, 0xf6f1e3, 0xc9a227],
            blendMode: Phaser.BlendModes.ADD,
            emitting: false,
          })
          .setDepth(m.y + 1)
          .explode(IDOL_FLARE.sparks);
      },
    };
  }
  return pieces;
}

/** The room's drifting particles, which calm motion (a setting) stills and hides. */
export interface Ambience {
  setCalm(calm: boolean): void;
}

/** Mood particles: fireflies, neon rain, drifting gold dust, spread over the whole room. */
export function addAmbience(scene: Phaser.Scene, room: RoomDef): Ambience {
  const drifting: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  let haze: Phaser.GameObjects.Rectangle | null = null;
  const floorTop = Math.min(...room.walkable.flat().map((p) => p.y));
  const { w, h } = room.size;
  // A room several screens wide gets as many particles per screen as a one-screen room.
  const k = Math.max(1, w / ROOM_W);
  if (room.mood === 'dusk') {
    const dust = scene.add
      .particles(0, 0, 'fx-dot', {
        x: { min: 40, max: w - 40 },
        y: { min: floorTop - 260, max: h - 60 },
        lifespan: { min: 4000, max: 7000 },
        speedX: { min: -14, max: 14 },
        speedY: { min: -22, max: -6 },
        scale: { start: 0.45, end: 0.1 },
        alpha: { start: 0, end: 0.95, ease: 'Sine.easeInOut', random: false },
        tint: [0xffe08a, 0xfff2b3, 0xc9a227],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 140 / k,
        quantity: 1,
        maxAliveParticles: Math.round(70 * k),
      })
      .setDepth(h + 10);
    drifting.push(dust);
  }
  // Rain across a room seen from the side (the ink-wash course's act 2, OP-235): grey streaks over the river, under the overlay.
  if (room.weather === 'rain') {
    const rain = scene.add
      .particles(0, 0, 'fx-rain', {
        x: { min: -100, max: w + 100 },
        y: -30,
        lifespan: 1100,
        speedY: { min: 900, max: 1200 },
        speedX: { min: -50, max: -30 },
        rotate: 3,
        alpha: { start: 0.4, end: 0.08 },
        scaleY: { min: 0.8, max: 1.5 },
        tint: [0xc7ceda, 0x9aa3b2, 0xe8ebf0],
        frequency: 26 / k,
        quantity: 2,
        maxAliveParticles: Math.round(120 * k),
      })
      .setDepth(h + 20);
    drifting.push(rain);
  }
  if (room.mood === 'neon') {
    const rain = scene.add
      .particles(0, 0, 'fx-rain', {
        x: { min: -100, max: w + 100 },
        y: -30,
        lifespan: 1100,
        speedY: { min: 900, max: 1300 },
        speedX: { min: -60, max: -40 },
        rotate: 3,
        alpha: { start: 0.35, end: 0.05 },
        scaleY: { min: 0.8, max: 1.6 },
        tint: [0x9fe9ff, 0xffb3e0, 0xc7ceda],
        frequency: 22 / k,
        quantity: 2,
        maxAliveParticles: Math.round(140 * k),
      })
      .setDepth(h + 20);
    drifting.push(rain);
    haze = scene.add.rectangle(w / 2, h / 2, w, h, 0xff2aa1, 0.05).setDepth(h + 5).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: haze, fillAlpha: 0.1, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  } else if (room.mood === 'arcade') {
    // Indoors off the neon street: no rain, a slow drift of neon motes in the cabinets' light.
    const motes = scene.add
      .particles(0, 0, 'fx-dot', {
        x: { min: 0, max: w },
        y: { min: floorTop - 420, max: h - 40 },
        lifespan: { min: 5000, max: 9000 },
        speedX: { min: -8, max: 8 },
        speedY: { min: -14, max: -4 },
        scale: { start: 0.3, end: 0.05 },
        alpha: { start: 0, end: 0.7 },
        tint: [0xff2aa1, 0x00e5ff, 0x8a4dff],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 220 / k,
        quantity: 1,
        maxAliveParticles: Math.round(40 * k),
      })
      .setDepth(h + 10);
    drifting.push(motes);
    haze = scene.add.rectangle(w / 2, h / 2, w, h, 0xff2aa1, 0.03).setDepth(h + 5).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: haze, fillAlpha: 0.06, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  } else {
    const gold = scene.add
      .particles(0, 0, 'fx-dot', {
        x: { min: 0, max: w },
        y: { min: 0, max: h },
        lifespan: { min: 6000, max: 10000 },
        speedX: { min: -10, max: 10 },
        speedY: { min: 4, max: 16 },
        scale: { start: 0.25, end: 0.05 },
        alpha: { start: 0, end: 0.5 },
        tint: [0xc9a227, 0xf6f1e3],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 260 / k,
        quantity: 1,
        maxAliveParticles: Math.round(40 * k),
      })
      .setDepth(h + 10);
    drifting.push(gold);
    const anchors = ANCHORS['hub'];
    const tb = anchors?.['tree-base'];
    if (tb) {
      const glow = scene.add.image(tb.x, tb.y - 40, 'fx-glow').setTint(0xffc866).setAlpha(0.18).setScale(3.2, 2).setDepth(0).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: glow, alpha: 0.3, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }
  return {
    setCalm(calm) {
      for (const e of drifting) {
        if (calm) e.stop(true);
        else e.start();
        e.setVisible(!calm);
      }
      // The neon pink haze keeps its glow but stops pulsing.
      if (haze) {
        for (const t of scene.tweens.getTweensOf(haze)) {
          if (calm) t.pause();
          else t.resume();
        }
      }
    },
  };
}
