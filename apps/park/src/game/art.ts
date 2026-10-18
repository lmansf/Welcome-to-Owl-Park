/**
 * Art loading. Every piece of art has a key, a logical size in room pixels, and a kind.
 * For each key the loader tries, in order: `<key>.svg` (rasterized at the device's scale),
 * then `<key>@2x.webp` and `<key>@2x.png` when a sharper copy is wanted, then `<key>.webp` and
 * `<key>.png` (painted rooms ship as WebP, everything else as PNG). Whatever resolution the
 * file has, the game draws it at the logical size, so artists can hand in SVG, WebP or PNG.
 * Missing or broken files fall back to generated placeholders and never stop the park.
 */
import Phaser from 'phaser';
import { ROOM_H, ROOM_W } from '@owl-park/shared';
import { rasterCandidates } from './artFiles';
import { loadSvgTexture } from './svgLoader';

export const ART_PATH = 'art/';
export const OWL_W = 200;
export const OWL_H = 240;

export type ArtKind = 'room' | 'piece' | 'owl' | 'sign';

export interface ArtSpec {
  w: number;
  h: number;
  kind: ArtKind;
}

/** Everything the park can draw, with logical sizes. */
export const ART: Record<string, ArtSpec> = {
  hub: { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'hub-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  grove: { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'grove-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  market: { w: ROOM_W, h: ROOM_H, kind: 'room' },
  'market-fg': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  guardian: { w: 720, h: 820, kind: 'piece' },
  'robot-owl': { w: 900, h: 900, kind: 'piece' },
  'sign-not-yet-fledged': { w: 420, h: 520, kind: 'sign' },
  'sign-closed-for-molting': { w: 420, h: 520, kind: 'sign' },
  'sign-pardon-our-feathers': { w: 420, h: 520, kind: 'sign' },
  'sign-hatching-soon': { w: 420, h: 520, kind: 'sign' },
  'owl-body': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-belly': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-accent': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-face': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-blink': { w: OWL_W, h: OWL_H, kind: 'owl' },
};

/** Art needed in every room (loaded once at boot). */
export const GLOBAL_ART = Object.keys(ART).filter((k) => ART[k]!.kind === 'owl' || ART[k]!.kind === 'sign');

/** Art that belongs to one room (loaded when the room opens, released when it closes). */
export function roomArtKeys(roomId: string): string[] {
  const keys = [roomId, `${roomId}-fg`];
  if (roomId === 'grove') keys.push('guardian');
  if (roomId === 'market') keys.push('robot-owl');
  return keys.filter((k) => k in ART);
}

/**
 * How many texture pixels per room pixel to rasterize at. Owls and signs are small, so they
 * get the full device ratio; rooms and big set pieces are capped to keep GPU memory bounded
 * (a 1600 x 900 room costs about 5.8 MB per unit of scale squared).
 */
export function artScale(kind: ArtKind, pixelRatio: number, roomMax: number): number {
  const target = kind === 'owl' || kind === 'sign' ? Math.min(pixelRatio, 2) : Math.min(pixelRatio, roomMax);
  return Math.max(1, Math.round(target * 4) / 4);
}

function baseUrl(): string {
  const b = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${b}${ART_PATH}`;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Load one key. Returns true when a texture now exists for it (fresh or already present). */
export async function loadArtKey(scene: Phaser.Scene, key: string, scale: number): Promise<boolean> {
  if (scene.textures.exists(key)) return true;
  const spec = ART[key];
  if (!spec) return false;
  const url = baseUrl();
  if (await loadSvgTexture(scene, key, `${url}${key}.svg`, Math.round(spec.w * scale), Math.round(spec.h * scale))) return true;
  for (const c of rasterCandidates(url, key, scale)) {
    const img = await loadImage(c);
    if (img) {
      if (!scene.textures.exists(key)) scene.textures.addImage(key, img);
      return true;
    }
  }
  return false;
}

export interface LoadReport {
  missing: string[];
}

/** Load several keys concurrently; whatever is missing gets a placeholder so the scene can build. */
export async function loadArt(scene: Phaser.Scene, keys: string[], pixelRatio: number, roomMax: number, onProgress?: (done: number, total: number) => void): Promise<LoadReport> {
  const missing: string[] = [];
  let done = 0;
  await Promise.all(
    keys.map(async (key) => {
      const spec = ART[key];
      const ok = spec ? await loadArtKey(scene, key, artScale(spec.kind, pixelRatio, roomMax)) : false;
      if (!ok) missing.push(key);
      done += 1;
      onProgress?.(done, keys.length);
    }),
  );
  for (const key of missing) ensurePlaceholder(scene, key);
  if (missing.length) console.info(`[owl-park] placeholder art for: ${missing.join(', ')}`);
  return { missing };
}

/** Drop textures a room no longer needs (the next room loads its own). */
export function releaseArt(scene: Phaser.Scene, keys: string[]): void {
  for (const key of keys) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    // Tinted copies made for the Canvas renderer share the key prefix.
    for (const k of scene.textures.getTextureKeys()) if (k.startsWith(`${key}:`)) scene.textures.remove(k);
  }
}

/** A flat stand-in texture for a missing piece of art, so the park is always playable. */
export function ensurePlaceholder(scene: Phaser.Scene, key: string): void {
  if (scene.textures.exists(key)) return;
  const spec = ART[key];
  if (!spec) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const { w, h } = spec;
  switch (spec.kind) {
    case 'room': {
      if (key.endsWith('-fg')) break; // transparent overlay
      const fill: Record<string, number> = { hub: 0x163157, grove: 0x3b2a4a, market: 0x0b0b16 };
      g.fillStyle(fill[key] ?? 0x0c1e36, 1);
      g.fillRect(0, 0, w, h);
      g.fillStyle(0x2f4f3a, 1);
      g.fillRect(0, 460, w, h - 460);
      break;
    }
    case 'sign':
      g.fillStyle(0x5c4033, 1);
      g.fillRect(w / 2 - 10, h - 150, 20, 150);
      g.fillStyle(0x8b5a2b, 1);
      g.fillRoundedRect(w / 2 - 110, h - 230, 220, 100, 14);
      g.fillStyle(0xf6f1e3, 1);
      g.fillEllipse(w / 2, h - 180, 70, 60);
      break;
    case 'piece':
      g.fillStyle(0xc9a227, 0.18);
      g.fillEllipse(w / 2, h / 2, w * 0.6, h * 0.8);
      break;
    case 'owl':
      drawOwlPlaceholder(g, key);
      break;
  }
  g.generateTexture(key, w, h);
  g.destroy();
}

function drawOwlPlaceholder(g: Phaser.GameObjects.Graphics, key: string): void {
  switch (key) {
    case 'owl-body':
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(100, 150, 120, 150);
      g.fillCircle(100, 80, 60);
      g.fillTriangle(55, 40, 70, 10, 85, 45);
      g.fillTriangle(145, 40, 130, 10, 115, 45);
      break;
    case 'owl-belly':
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(100, 165, 70, 100);
      break;
    case 'owl-accent':
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(80, 226, 30, 12);
      g.fillEllipse(120, 226, 30, 12);
      break;
    case 'owl-face':
      g.fillStyle(0xf6f1e3, 1);
      g.fillCircle(78, 78, 20);
      g.fillCircle(122, 78, 20);
      g.fillStyle(0x0c1e36, 1);
      g.fillCircle(80, 80, 9);
      g.fillCircle(124, 80, 9);
      g.fillStyle(0xc9a227, 1);
      g.fillTriangle(92, 96, 108, 96, 100, 112);
      break;
    case 'owl-blink':
      g.lineStyle(4, 0x0c1e36, 1);
      g.beginPath();
      g.arc(78, 80, 16, Math.PI * 0.15, Math.PI * 0.85);
      g.strokePath();
      g.beginPath();
      g.arc(122, 80, 16, Math.PI * 0.15, Math.PI * 0.85);
      g.strokePath();
      g.fillStyle(0xc9a227, 1);
      g.fillTriangle(92, 96, 108, 96, 100, 112);
      break;
  }
}
