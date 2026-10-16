import Phaser from 'phaser';
import { readConfig } from './config';
import { BootScene } from './game/BootScene';
import { RoomScene, type RoomStart } from './game/RoomScene';
import { loadLook, loadPlayerId } from './identity';
import { createTransport } from './net';
import { createHud } from './ui/hud';

const cfg = readConfig();
const playerId = loadPlayerId(cfg);
const look = loadLook(cfg, playerId);
const parent = document.getElementById('game') as HTMLElement;
const hud = createHud(document.body, look);
const transport = createTransport(cfg);

const dpr = cfg.pixelRatio;
const size = () => ({ w: Math.round(window.innerWidth * dpr), h: Math.round(window.innerHeight * dpr) });
const s0 = size();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  width: s0.w,
  height: s0.h,
  backgroundColor: '#0C1E36',
  // Render at device pixels, display at CSS pixels: crisp on phones, and Phaser maps input through the zoom.
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
  input: { activePointers: 2 },
  render: { antialias: true, pixelArt: false, roundPixels: false },
  scene: [BootScene, RoomScene],
});

game.registry.set('config', cfg);
game.registry.set('playerId', playerId);
game.registry.set('look', look);
game.registry.set('hud', hud);
game.registry.set('transport', transport);
game.registry.set('startRoom', { room: cfg.room, spawn: cfg.spawn } satisfies RoomStart);

let resizeTimer: ReturnType<typeof setTimeout> | null = null;
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const s = size();
    game.scale.resize(s.w, s.h);
  }, 60);
});

// Exposed for end-to-end tests and the browser console.
declare global {
  interface Window {
    owlPark: {
      game: Phaser.Game;
      playerId: string;
      transport: string;
      state(): ReturnType<RoomScene['debugState']> | null;
      walkTo(x: number, y: number): void;
      camera(): { viewX: number; viewY: number; viewW: number; viewH: number; zoom: number; dpr: number } | null;
      /** Texture resolution actually loaded for an art key (tests check per-device rasterization). */
      textureSize(key: string): { w: number; h: number } | null;
    };
  }
}
const roomScene = () => {
  const s = game.scene.getScene('room') as RoomScene | null;
  return s && s.scene.isActive() ? s : null;
};
window.owlPark = {
  game,
  playerId,
  transport: transport.kind,
  state: () => roomScene()?.debugState() ?? null,
  walkTo: (x, y) => roomScene()?.walkTo({ x, y }),
  camera: () => {
    const s = roomScene();
    if (!s) return null;
    const c = s.cameras.main;
    const v = c.worldView;
    return { viewX: v.x, viewY: v.y, viewW: v.width, viewH: v.height, zoom: c.zoom, dpr };
  },
  textureSize: (key) => {
    if (!game.textures.exists(key)) return null;
    const src = game.textures.get(key).getSourceImage() as { width: number; height: number };
    return { w: src.width, h: src.height };
  },
};
