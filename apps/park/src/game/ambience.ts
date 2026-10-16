import Phaser from 'phaser';
import { ROOM_H, ROOM_W, type RoomDef } from '@owl-park/shared';
import { ANCHORS } from '../rooms';

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

/** Large set pieces (guardian, giant robot owl, signs) sorted into the owl depth range. */
export function addSetPieces(scene: Phaser.Scene, room: RoomDef): void {
  const anchors = ANCHORS[room.id] ?? {};
  if (room.id === 'grove' && anchors['guardian']) {
    const a = anchors['guardian'];
    const glow = scene.add.image(a.x, a.y - 300, 'fx-glow').setTint(0xffd27a).setAlpha(0.3).setScale(5, 4).setDepth(a.y - 1).setBlendMode(Phaser.BlendModes.ADD);
    const guardian = scene.add.image(a.x, a.y, 'guardian').setOrigin(0.5, 1).setDepth(a.y);
    scene.tweens.add({ targets: guardian, scaleY: 1.015, scaleX: 0.995, duration: 4200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: glow, alpha: 0.48, scaleX: 5.4, duration: 3600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  if (room.id === 'market' && anchors['robot']) {
    const a = anchors['robot'];
    const glow = scene.add.image(a.x, a.y - 420, 'fx-glow').setTint(0xff2aa1).setAlpha(0.22).setScale(5, 5).setDepth(a.y - 1).setBlendMode(Phaser.BlendModes.ADD);
    const robot = scene.add.image(a.x, a.y, 'robot-owl').setOrigin(0.5, 1).setDepth(a.y);
    scene.tweens.add({ targets: robot, y: a.y - 6, duration: 5200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: glow, alpha: 0.4, tint: 0x00e5ff, duration: 2800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  for (const door of room.doors) {
    const m = door.marker;
    if (!m) continue;
    if (door.closedSign) {
      const key = `sign-${door.closedSign.toLowerCase().replace(/\s+/g, '-')}`;
      scene.add.image(m.x, m.y, scene.textures.exists(key) ? key : 'sign-hatching-soon').setOrigin(0.5, 1).setDepth(m.y);
    } else if (door.to) {
      const tint = door.to.room === 'market' ? 0xff2aa1 : door.to.room === 'grove' ? 0xffb347 : 0xc9a227;
      const glow = scene.add.image(m.x, m.y, 'fx-glow').setTint(tint).setAlpha(0.28).setScale(1.6).setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: glow, alpha: 0.5, scale: 1.9, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (door.id === 'shop') {
      const chevron = scene.add.image(m.x, m.y, 'fx-chevron').setTint(0xc9a227).setDepth(m.y + 1);
      scene.tweens.add({ targets: chevron, y: m.y + 14, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }
}

/** Mood particles: fireflies, neon rain, drifting gold dust. */
export function addAmbience(scene: Phaser.Scene, room: RoomDef): void {
  const floorTop = Math.min(...room.walkable.flat().map((p) => p.y));
  if (room.mood === 'dusk') {
    scene.add
      .particles(0, 0, 'fx-dot', {
        x: { min: 40, max: ROOM_W - 40 },
        y: { min: floorTop - 260, max: ROOM_H - 60 },
        lifespan: { min: 4000, max: 7000 },
        speedX: { min: -14, max: 14 },
        speedY: { min: -22, max: -6 },
        scale: { start: 0.45, end: 0.1 },
        alpha: { start: 0, end: 0.95, ease: 'Sine.easeInOut', random: false },
        tint: [0xffe08a, 0xfff2b3, 0xc9a227],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 140,
        quantity: 1,
        maxAliveParticles: 70,
      })
      .setDepth(ROOM_H + 10);
  } else if (room.mood === 'neon') {
    scene.add
      .particles(0, 0, 'fx-rain', {
        x: { min: -100, max: ROOM_W + 100 },
        y: -30,
        lifespan: 1100,
        speedY: { min: 900, max: 1300 },
        speedX: { min: -60, max: -40 },
        rotate: 3,
        alpha: { start: 0.35, end: 0.05 },
        scaleY: { min: 0.8, max: 1.6 },
        tint: [0x9fe9ff, 0xffb3e0, 0xc7ceda],
        frequency: 22,
        quantity: 2,
        maxAliveParticles: 140,
      })
      .setDepth(ROOM_H + 20);
    const haze = scene.add.rectangle(ROOM_W / 2, ROOM_H / 2, ROOM_W, ROOM_H, 0xff2aa1, 0.05).setDepth(ROOM_H + 5).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: haze, fillAlpha: 0.1, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  } else {
    scene.add
      .particles(0, 0, 'fx-dot', {
        x: { min: 0, max: ROOM_W },
        y: { min: 0, max: ROOM_H },
        lifespan: { min: 6000, max: 10000 },
        speedX: { min: -10, max: 10 },
        speedY: { min: 4, max: 16 },
        scale: { start: 0.25, end: 0.05 },
        alpha: { start: 0, end: 0.5 },
        tint: [0xc9a227, 0xf6f1e3],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 260,
        quantity: 1,
        maxAliveParticles: 40,
      })
      .setDepth(ROOM_H + 10);
    const anchors = ANCHORS['hub'];
    const tb = anchors?.['tree-base'];
    if (tb) {
      const glow = scene.add.image(tb.x, tb.y - 40, 'fx-glow').setTint(0xffc866).setAlpha(0.18).setScale(3.2, 2).setDepth(0).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: glow, alpha: 0.3, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }
}
