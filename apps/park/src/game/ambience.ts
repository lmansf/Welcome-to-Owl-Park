import Phaser from 'phaser';
import { ROOM_W, WAY_OUT_DOOR, type RoomDef } from '@owl-park/shared';
import { ANCHORS } from '../rooms';
import { ART, blockadeKey } from './art';

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

/** A set piece drawn at its logical size whatever the texture's resolution. */
function piece(scene: Phaser.Scene, x: number, y: number, key: string): Phaser.GameObjects.Image {
  const spec = ART[key];
  const img = scene.add.image(x, y, key).setOrigin(0.5, 1);
  if (spec) img.setDisplaySize(spec.w, spec.h);
  return img;
}

/** Scale so a set piece anchored at its feet keeps its head inside the frame. */
function fitBelowTop(key: string, anchorY: number, margin = 24): number {
  const h = ART[key]?.h ?? 1;
  return Math.min(1, Math.max(0.2, (anchorY - margin) / h));
}

export interface Idol {
  /** The tappable mythical owl. */
  image: Phaser.GameObjects.Image;
  /** Play the idol's reaction to a pledge. */
  react(): void;
}

export interface SetPieces {
  idol?: Idol;
  /** The lobby's turnstiles: a flash of gold as an owl goes through. */
  gate?: { react(): void };
  /** The hub's arches into gated realms, by door id: the blockade while the realm is closed, the doorway's glow while it is open. */
  arches?: Record<string, { blockade: Phaser.GameObjects.Image | null; glow: Phaser.GameObjects.Image }>;
}

const DOOR_GLOW: Record<string, number> = { market: 0xff2aa1, arcade: 0x00e5ff, grove: 0xffb347, glass: 0x9fd0ff };

/** The soft glow that marks an open doorway, tinted for the realm beyond it. */
function doorGlow(scene: Phaser.Scene, m: { x: number; y: number }, to: string): Phaser.GameObjects.Image {
  const glow = scene.add.image(m.x, m.y, 'fx-glow').setTint(DOOR_GLOW[to] ?? 0xc9a227).setAlpha(0.28).setScale(1.6).setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: glow, alpha: 0.5, scale: 1.9, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  return glow;
}

/** Large set pieces (guardian, giant robot owl, blockades) sorted into the owl depth range. */
export function addSetPieces(scene: Phaser.Scene, room: RoomDef, onIdolTap?: (pointer: Phaser.Input.Pointer, event: Phaser.Types.Input.EventData) => void): SetPieces {
  const anchors = ANCHORS[room.id] ?? {};
  const pieces: SetPieces = {};
  const tappable = (img: Phaser.GameObjects.Image) => {
    img.setInteractive({ useHandCursor: true });
    img.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => onIdolTap?.(pointer, event));
  };
  if (room.id === 'grove' && anchors['guardian']) {
    const a = anchors['guardian'];
    const glow = scene.add.image(a.x, a.y - 300, 'fx-glow').setTint(0xffd27a).setAlpha(0.3).setScale(5, 4).setDepth(a.y - 1).setBlendMode(Phaser.BlendModes.ADD);
    const k = fitBelowTop('guardian', a.y);
    const guardian = piece(scene, a.x, a.y, 'guardian').setDepth(a.y);
    const sx = guardian.scaleX * k;
    const sy = guardian.scaleY * k;
    guardian.setScale(sx, sy);
    scene.tweens.add({ targets: guardian, scaleY: sy * 1.015, scaleX: sx * 0.995, duration: 4200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: glow, alpha: 0.48, scaleX: 5.4, duration: 3600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    tappable(guardian);
    pieces.idol = {
      image: guardian,
      react: () => {
        // The guardian stirs: its glow swells and a drift of fireflies rises from the bough.
        scene.tweens.add({ targets: glow, alpha: 0.9, scaleX: 6.4, scaleY: 5, duration: 500, yoyo: true, ease: 'Sine.easeOut' });
        scene.tweens.add({ targets: guardian, scaleY: sy * 1.04, scaleX: sx * 0.985, duration: 450, yoyo: true, ease: 'Sine.easeOut' });
        scene.add
          .particles(a.x, a.y - 40, 'fx-dot', {
            lifespan: { min: 1500, max: 2600 },
            speed: { min: 40, max: 120 },
            angle: { min: 200, max: 340 },
            scale: { start: 0.5, end: 0 },
            alpha: { start: 1, end: 0 },
            tint: [0xffe08a, 0xfff2b3, 0xc9a227],
            blendMode: Phaser.BlendModes.ADD,
            emitting: false,
          })
          .setDepth(a.y + 1)
          .explode(36);
      },
    };
  }
  if (room.id === 'market' && anchors['robot']) {
    const a = anchors['robot'];
    const glow = scene.add.image(a.x, a.y - 420, 'fx-glow').setTint(0xff2aa1).setAlpha(0.22).setScale(5, 5).setDepth(a.y - 1).setBlendMode(Phaser.BlendModes.ADD);
    const robot = piece(scene, a.x, a.y, 'robot-owl').setDepth(a.y);
    const kr = fitBelowTop('robot-owl', a.y);
    robot.setScale(robot.scaleX * kr, robot.scaleY * kr);
    tappable(robot);
    pieces.idol = {
      image: robot,
      react: () => {
        // The robot owl flares: a cyan flash and a swell of its glow.
        robot.setTint(0x9ffcff);
        scene.time.delayedCall(180, () => robot.clearTint());
        scene.tweens.add({ targets: glow, alpha: 0.7, scaleX: 6.5, scaleY: 6.5, duration: 450, yoyo: true, ease: 'Sine.easeOut' });
        scene.add
          .particles(a.x, a.y - 320, 'fx-dot', {
            lifespan: { min: 600, max: 1200 },
            speed: { min: 120, max: 260 },
            scale: { start: 0.45, end: 0 },
            alpha: { start: 1, end: 0 },
            tint: [0x00e5ff, 0xff2aa1, 0xc7ceda],
            blendMode: Phaser.BlendModes.ADD,
            emitting: false,
          })
          .setDepth(a.y + 1)
          .explode(40);
      },
    };
    scene.tweens.add({ targets: robot, y: a.y - 6, duration: 5200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: glow, alpha: 0.4, tint: 0x00e5ff, duration: 2800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  if (room.id === 'glass' && anchors['idol'] && scene.textures.exists('glass-idol')) {
    // The stained-glass owl on its plinth: lit from within, it brightens when a visitor pledges.
    const a = anchors['idol'];
    const glow = scene.add.image(a.x, a.y - 230, 'fx-glow').setTint(0x9fd0ff).setAlpha(0.24).setScale(4, 3.2).setDepth(a.y - 1).setBlendMode(Phaser.BlendModes.ADD);
    const idol = piece(scene, a.x, a.y, 'glass-idol').setDepth(a.y);
    const ki = fitBelowTop('glass-idol', a.y);
    idol.setScale(idol.scaleX * ki, idol.scaleY * ki);
    tappable(idol);
    pieces.idol = {
      image: idol,
      react: () => {
        // The panes flare white-gold and a scatter of glass light rises from the owl.
        idol.setTint(0xfff2c2);
        scene.time.delayedCall(220, () => idol.clearTint());
        scene.tweens.add({ targets: glow, alpha: 0.7, scaleX: 5, scaleY: 4, duration: 450, yoyo: true, ease: 'Sine.easeOut' });
        scene.add
          .particles(a.x, a.y - 200, 'fx-dot', {
            lifespan: { min: 900, max: 1800 },
            speed: { min: 60, max: 180 },
            angle: { min: 200, max: 340 },
            scale: { start: 0.5, end: 0 },
            alpha: { start: 1, end: 0 },
            tint: [0x9fd0ff, 0xffd36a, 0xff8ad0, 0x7be0c8, 0xcdb0ff],
            blendMode: Phaser.BlendModes.ADD,
            emitting: false,
          })
          .setDepth(a.y + 1)
          .explode(36);
      },
    };
    scene.tweens.add({ targets: glow, alpha: 0.4, duration: 3200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  for (const door of room.doors) {
    const m = door.marker;
    if (!m) continue;
    if (door.closedSign) {
      // A construction blockade stands in the closed arch, its phrase on its board. An arch into a
      // gated realm also has a doorway's glow, shown instead of the blockade once the realm opens.
      const key = blockadeKey(door.closedSign);
      const blockade = scene.textures.exists(key) ? piece(scene, m.x, m.y, key).setDepth(m.y) : null;
      if (door.to) (pieces.arches ??= {})[door.id] = { blockade, glow: doorGlow(scene, m, door.to.room).setVisible(false) };
    } else if (room.id === 'hub' && door.id === WAY_OUT_DOOR) {
      // The way out of the park (C43): a soft gold ring on the floor where the owls came in.
      const ring = scene.add.image(m.x, m.y, 'fx-glow').setTint(0xc9a227).setAlpha(0.18).setScale(2.2, 0.42).setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: ring, alpha: 0.34, scaleX: 2.5, scaleY: 0.48, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (door.to) {
      doorGlow(scene, m, door.to.room);
    } else if (door.id === 'shop' || door.id === 'booth') {
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
            alpha: { start: 1, end: 0 },
            tint: [0xffd36a, 0xf6f1e3, 0xc9a227],
            blendMode: Phaser.BlendModes.ADD,
            emitting: false,
          })
          .setDepth(m.y + 1)
          .explode(36);
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
  } else if (room.mood === 'neon') {
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
