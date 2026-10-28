/**
 * Art loading. Every piece of art has a key, a logical size in room pixels, and a kind.
 * For each key the loader takes, in order: `<key>.svg` (rasterized at the device's scale),
 * then `<key>@2x.webp` and `<key>@2x.png` when a sharper copy is wanted, then `<key>.webp` and
 * `<key>.png` (painted rooms ship as WebP, everything else as PNG), asking only for the files the
 * build ships (PUBLISHED_ART), so each key is one request, with its content's hash. Whatever resolution the file has, the
 * game draws it at the logical size, so artists can hand in SVG, WebP or PNG. Missing or broken
 * files fall back to generated placeholders and never stop the park.
 */
import Phaser from 'phaser';
import { ARCADE_ROOM, FURNITURE, ROOM_H, ROOM_W, backgroundTiles, foregroundTiles, isNestRoom, type RoomDef, type SpeciesId } from '@owl-park/shared';
import { GAME_ART } from '../arcade/paint';
import type { ParkConfig } from '../config';
import { ROOMS, roomFor } from '../rooms';
import { DENSE_SCALE, OWL_LAYERS, SPECIES_LAYERS, isSpeciesLayer, rasterCandidates, rasterNames, roomScaleCap } from './artFiles';
import { ART_BYTES, PUBLISHED_ART, versioned } from './publishedArt';
import { loadSvgTexture } from './svgLoader';

export const ART_PATH = 'art/';
export const OWL_W = 200;
export const OWL_H = 240;
/** The wing's canvas (OP-084): one right wing, its root at Owl.ts's WING.root, in owl canvas units. */
export const WING_W = 200;
export const WING_H = 120;

/**
 * `arcade`: the arcade's own art, its title signs and its games' paintings. Drawn sharp (a game fills
 * the screen), and never given a placeholder: the arcade draws its neon stand-in for anything missing.
 * `climb`: the stained-glass climb's tower pieces, the same way; the climb draws glass of its own until they come.
 */
export type ArtKind = 'room' | 'piece' | 'owl' | 'arcade' | 'climb';

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
  // The street of nests (two screens: `homes-west` at x 0, `homes` at x 1600) and a nest's interior.
  'homes-west': { w: ROOM_W, h: ROOM_H, kind: 'room' },
  homes: { w: ROOM_W, h: ROOM_H, kind: 'room' },
  nest: { w: ROOM_W, h: ROOM_H, kind: 'room' },
  // The arcade's three screens are tiles of its room data (below); these are its title signs over the
  // cabinets, and each game's painted field and pieces at the size the game draws them.
  'arcade-title-hoot-hop': { w: 364, h: 114, kind: 'arcade' },
  'arcade-title-moon-flap': { w: 251, h: 115, kind: 'arcade' },
  'arcade-title-nest-knockdown': { w: 280, h: 110, kind: 'arcade' },
  ...Object.fromEntries(Object.values(GAME_ART).flatMap((art) => Object.entries(art).map(([key, size]): [string, ArtSpec] => [key, { ...size, kind: 'arcade' }]))),
  // The climb's tower (designs/the-stained-glass-climb.md, Appendix A): a band's sky, its ledges, the balcony on each band line, the cloud cap.
  'climb-sky': { w: 480, h: 900, kind: 'climb' },
  'climb-column': { w: 240, h: 900, kind: 'climb' },
  'climb-ledge-a': { w: 160, h: 40, kind: 'climb' },
  'climb-ledge-b': { w: 240, h: 60, kind: 'climb' },
  'climb-balcony': { w: 480, h: 120, kind: 'climb' },
  'climb-cloud-cap': { w: 480, h: 220, kind: 'climb' },
  guardian: { w: 720, h: 820, kind: 'piece' },
  'robot-owl': { w: 900, h: 900, kind: 'piece' },
  // The stained-glass realm's idol, on the plinth of its west screen.
  'glass-idol': { w: 520, h: 416, kind: 'piece' },
  // Nest furniture (`decor-<id>`), drawn with its bottom centre on its spot in a nest. The wall
  // pieces are the clock, the framed leaf, the window box, the lanterns and the feather mobile.
  'decor-rug': { w: 240, h: 100, kind: 'piece' },
  'decor-armchair': { w: 150, h: 150, kind: 'piece' },
  'decor-bookshelf': { w: 150, h: 230, kind: 'piece' },
  'decor-lamp': { w: 120, h: 210, kind: 'piece' },
  'decor-potted-fern': { w: 130, h: 150, kind: 'piece' },
  'decor-mushroom-stool': { w: 120, h: 100, kind: 'piece' },
  'decor-quilt-bed': { w: 260, h: 170, kind: 'piece' },
  'decor-acorn-bowl': { w: 120, h: 90, kind: 'piece' },
  'decor-teapot-table': { w: 170, h: 140, kind: 'piece' },
  'decor-wall-clock': { w: 100, h: 140, kind: 'piece' },
  'decor-framed-leaf': { w: 110, h: 140, kind: 'piece' },
  'decor-window-box': { w: 180, h: 110, kind: 'piece' },
  'decor-lantern-string': { w: 180, h: 100, kind: 'piece' },
  'decor-moss-rug': { w: 220, h: 100, kind: 'piece' },
  'decor-stump-table': { w: 160, h: 120, kind: 'piece' },
  'decor-feather-mobile': { w: 110, h: 160, kind: 'piece' },
  // Construction blockades in the hub's two closed arches, each carrying its doorway's phrase.
  'blockade-not-yet-fledged': { w: 300, h: 300, kind: 'piece' },
  'blockade-hatching-soon': { w: 300, h: 300, kind: 'piece' },
  'owl-body': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-belly': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-accent': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-face': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-blink': { w: OWL_W, h: OWL_H, kind: 'owl' },
  // Species with their own painted layers (species.ts `art`), loaded when an owl of that kind shows up.
  'owl-barn-body': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-barn-belly': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-barn-accent': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-barn-face': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-barn-blink': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-burrowing-body': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-burrowing-belly': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-burrowing-accent': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-burrowing-face': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-burrowing-blink': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-snowy-body': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-snowy-belly': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-snowy-accent': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-snowy-face': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-snowy-blink': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-screech-body': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-screech-belly': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-screech-accent': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-screech-face': { w: OWL_W, h: OWL_H, kind: 'owl' },
  'owl-screech-blink': { w: OWL_W, h: OWL_H, kind: 'owl' },
  // Flight (OP-084): the owls' wing, one painted right wing in two tintable layers, its feathers in
  // the owl's body colour and its flight feathers in its accent colour. Every owl kind wears it, drawn
  // twice behind the body (the left one mirrored) and turned at the shoulder, so it loads at boot.
  'owl-wing-body': { w: WING_W, h: WING_H, kind: 'owl' },
  'owl-wing-accent': { w: WING_W, h: WING_H, kind: 'owl' },
};

export { OWL_LAYERS, SPECIES_LAYERS };

/** The climb's pieces, loaded by its scene when a climb opens and released when it closes. */
export const CLIMB_ART_KEYS = Object.keys(ART).filter((k) => ART[k]!.kind === 'climb');

// The tiles of a room bigger than one screen are room art of one screen each, like `hub`.
for (const room of Object.values(ROOMS)) {
  for (const t of [...backgroundTiles(room), ...foregroundTiles(room)]) ART[t.key] ??= { w: ROOM_W, h: ROOM_H, kind: 'room' };
}

/** Art needed in every room (loaded once at boot). Species layers wait until an owl of that kind shows up. */
export const GLOBAL_ART = Object.keys(ART).filter((k) => ART[k]!.kind === 'owl' && !isSpeciesLayer(k));

/** The blockade standing in a closed doorway that shows `phrase` ("Not Yet Fledged" -> blockade-not-yet-fledged). */
export function blockadeKey(phrase: string): string {
  return `blockade-${phrase.toLowerCase().replace(/\s+/g, '-')}`;
}

/** Art that belongs to one room (released when it closes; roomOpeningArt is what loads as it opens). */
export function roomArtKeys(roomId: string, room: RoomDef | undefined = roomFor(roomId)): string[] {
  const keys = room ? [...backgroundTiles(room), ...foregroundTiles(room)].map((t) => t.key) : [roomId, `${roomId}-fg`];
  for (const door of room?.doors ?? []) if (door.closedSign) keys.push(blockadeKey(door.closedSign));
  if (roomId === 'grove') keys.push('guardian');
  if (roomId === 'market') keys.push('robot-owl');
  if (roomId === 'glass') keys.push('glass-idol');
  if (roomId === ARCADE_ROOM) keys.push(...Object.keys(ART).filter((k) => ART[k]!.kind === 'arcade'));
  // A nest can show any piece of furniture: the owner may put out whatever they own.
  if (isNestRoom(roomId)) keys.push(...FURNITURE.map((f) => f.art));
  return keys.filter((k) => k in ART);
}

const FURNITURE_ART = new Set(FURNITURE.map((f) => f.art));

/**
 * The art a room waits for before it opens: all of its own but a nest's furniture, each piece of
 * which loads as the nest puts it out or its owner decorates (OP-129: the sixteen pieces were over
 * a megabyte on a phone before the owl could move, most of them in nobody's nest).
 */
export function roomOpeningArt(roomId: string, room: RoomDef | undefined = roomFor(roomId)): string[] {
  return roomArtKeys(roomId, room).filter((k) => !FURNITURE_ART.has(k));
}

/** How sharp a room's art loads (texture pixels per room pixel at most): a room of several screens keeps to one screen's memory budget, at 1x if need be. */
export function roomArtCap(room: RoomDef, cfg: Pick<ParkConfig, 'pixelRatio' | 'artScaleMax' | 'roomArtBudget'>): number {
  const textures = backgroundTiles(room).length + foregroundTiles(room).length;
  return roomScaleCap(textures, cfg.pixelRatio, cfg.artScaleMax, cfg.roomArtBudget);
}

const prefetched = new Set<string>();

/**
 * Fetch a room's opening art ahead (OP-129), as an owl nears a doorway into it or the home screen
 * waits on Play: the very files its opening will ask for, at the same sharpness, into the browser's
 * cache (where the art keeps a year), not drawn. Each file once a page; art already drawn is left out.
 */
export function prefetchRoomArt(scene: Phaser.Scene, room: RoomDef, cfg: Pick<ParkConfig, 'pixelRatio' | 'artScaleMax' | 'roomArtBudget'>): void {
  if (typeof fetch !== 'function') return;
  const cap = roomArtCap(room, cfg);
  for (const key of roomOpeningArt(room.id, room)) {
    const spec = ART[key];
    if (!spec || scene.textures.exists(key)) continue;
    const name = firstFile(key, artScale(spec.kind, cfg.pixelRatio, cap));
    if (!name || prefetched.has(name)) continue;
    prefetched.add(name);
    void fetch(`${baseUrl()}${versioned(name)}`, { priority: 'low' })
      .then((res) => res.arrayBuffer())
      .catch(() => prefetched.delete(name));
  }
}

/**
 * A room's paintings that may open soft on this screen (OP-129). On a dense screen a room wants its
 * 2x copies, about three times the bytes of the 1x ones, so a painting whose 2x copy the browser does
 * not have yet opens at 1x and sharpens once the 2x comes (sharpenArt). These are the tiles that can:
 * the room wants them at 2x, and the build ships both copies.
 */
export function softTiles(room: RoomDef, cfg: Pick<ParkConfig, 'pixelRatio' | 'artScaleMax' | 'roomArtBudget'>, published: ReadonlyMap<string, string> = PUBLISHED_ART): string[] {
  const scale = artScale('room', cfg.pixelRatio, roomArtCap(room, cfg));
  if (scale <= DENSE_SCALE) return [];
  return [...backgroundTiles(room), ...foregroundTiles(room)]
    .map((t) => t.key)
    .filter((key) => !published.has(`${key}.svg`) && (rasterNames(key, scale, published)[0]?.includes('@2x') ?? false) && rasterNames(key, 1, published).length > 0);
}

/** How long the browser's cache gets to say whether it has a file (an answer from it takes a few ms). */
const CACHE_ASK_MS = 150;

/**
 * Whether the browser has this file already, asking its cache and not the server. A browser that
 * would go to the server instead (or anything else slow) counts as not having it: the room opens soft.
 */
async function inCache(url: string): Promise<boolean> {
  if (typeof fetch !== 'function' || typeof AbortController !== 'function') return false;
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), CACHE_ASK_MS);
  try {
    const res = await fetch(url, { cache: 'only-if-cached', mode: 'same-origin', signal: stop.signal });
    void res.body?.cancel().catch(() => undefined);
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Of a room's soft tiles, those that open at 1x now: the ones whose 2x copies the browser does not have (fetched ahead, or kept from a visit before). */
export async function opensSoft(room: RoomDef, cfg: Pick<ParkConfig, 'pixelRatio' | 'artScaleMax' | 'roomArtBudget'>): Promise<Set<string>> {
  const keys = softTiles(room, cfg);
  const scale = artScale('room', cfg.pixelRatio, roomArtCap(room, cfg));
  const have = await Promise.all(keys.map((key) => inCache(`${baseUrl()}${versioned(rasterNames(key, scale, PUBLISHED_ART)[0]!)}`)));
  return new Set(keys.filter((_, i) => !have[i]));
}

/** The images in this display list (and the containers in it) that show texture `key`. */
function imagesShowing(list: Phaser.GameObjects.GameObject[], key: string, out: Phaser.GameObjects.Image[] = []): Phaser.GameObjects.Image[] {
  for (const o of list) {
    if (o instanceof Phaser.GameObjects.Container) imagesShowing(o.list, key, out);
    else if (o instanceof Phaser.GameObjects.Image && o.texture.key === key) out.push(o);
  }
  return out;
}

/**
 * Sharpen a painting that opened soft (OP-129): load its 2x copy, then replace the texture under the
 * same key, every image showing it keeping its size on screen. Nothing changes when `live` says the
 * room has gone meanwhile, or its texture was released.
 */
export async function sharpenArt(scene: Phaser.Scene, key: string, scale: number, live: () => boolean): Promise<boolean> {
  const name = rasterNames(key, scale, PUBLISHED_ART)[0];
  if (!name?.includes('@2x')) return false;
  const img = await loadImage(`${baseUrl()}${versioned(name)}`);
  if (!img || !live() || !scene.textures.exists(key)) return false;
  const shown = imagesShowing(scene.children.list, key);
  const sizes = shown.map((o) => [o.displayWidth, o.displayHeight] as const);
  scene.textures.remove(key);
  scene.textures.addImage(key, img);
  shown.forEach((o, i) => o.setTexture(key).setDisplaySize(sizes[i]![0], sizes[i]![1]));
  return true;
}

/**
 * How many texture pixels per room pixel to rasterize at. Owls are small, and the arcade's games
 * fill the screen, so they get the full device ratio (up to 2); rooms and big set pieces are capped
 * to keep GPU memory bounded
 * (a 1600 x 900 room tile costs about 5.8 MB per unit of scale squared; see roomScaleCap for rooms
 * of several tiles).
 */
export function artScale(kind: ArtKind, pixelRatio: number, roomMax: number): number {
  const target = kind === 'owl' || kind === 'arcade' || kind === 'climb' ? Math.min(pixelRatio, 2) : Math.min(pixelRatio, roomMax);
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

/** The page's own download of this address, begun before the script came (index.html; artNames.ts's earlyArtScript), taken once. */
function earlyArt(url: string): Promise<Response | null> | undefined {
  const early = (globalThis as { __owlParkArt?: Record<string, Promise<Response | null>> }).__owlParkArt;
  const res = early?.[url];
  if (res) delete early![url];
  return res;
}

/**
 * Load an image reading it as it comes, each piece's bytes told to `onBytes` (the load screen's
 * progress, OP-129), or the rest of it when the page began the download itself; a browser that
 * cannot read a download as it comes loads it whole.
 */
async function streamImage(url: string, onBytes: (n: number) => void): Promise<HTMLImageElement | null> {
  if (typeof fetch !== 'function' || typeof URL.createObjectURL !== 'function') return loadImage(url);
  try {
    const res = (await earlyArt(url)) ?? (await fetch(url));
    if (!res.ok) return null;
    if (!res.body) return loadImage(url);
    const reader = res.body.getReader();
    const parts: BlobPart[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      onBytes(value.byteLength);
    }
    const src = URL.createObjectURL(new Blob(parts, { type: res.headers.get('content-type') ?? '' }));
    const img = await loadImage(src);
    URL.revokeObjectURL(src);
    return img;
  } catch {
    return null;
  }
}

/** Load one key. Returns true when a texture now exists for it (fresh or already present). With `onBytes`, its download is counted as it comes. */
export async function loadArtKey(scene: Phaser.Scene, key: string, scale: number, onBytes?: (n: number) => void): Promise<boolean> {
  if (scene.textures.exists(key)) return true;
  const spec = ART[key];
  if (!spec) return false;
  const url = baseUrl();
  if (PUBLISHED_ART.has(`${key}.svg`) && (await loadSvgTexture(scene, key, `${url}${versioned(`${key}.svg`)}`, Math.round(spec.w * scale), Math.round(spec.h * scale)))) return true;
  for (const c of rasterCandidates(url, key, scale, PUBLISHED_ART)) {
    const img = await (onBytes ? streamImage(c, onBytes) : loadImage(c));
    if (img) {
      if (!scene.textures.exists(key)) scene.textures.addImage(key, img);
      return true;
    }
  }
  return false;
}

/**
 * Load a piece of art at 1x under a texture key of its own (`as`): the home screen's backdrop is
 * the lobby's painting, kept apart from the lobby's own texture so each is freed on its own.
 */
export async function loadArtCopy(scene: Phaser.Scene, key: string, as: string): Promise<boolean> {
  if (scene.textures.exists(as)) return true;
  if (!ART[key]) return false;
  for (const c of rasterCandidates(baseUrl(), key, 1, PUBLISHED_ART)) {
    const img = await loadImage(c);
    if (img) {
      if (!scene.textures.exists(as)) scene.textures.addImage(as, img);
      return true;
    }
  }
  return false;
}

const speciesLoads = new Map<SpeciesId, Promise<boolean>>();

/**
 * Load a species' own layers, once per page; resolves true when all five are there. Nothing is
 * drawn in their place while they load or if they are missing: the owl keeps the great horned
 * owl's layers at the species' size.
 */
export function loadSpeciesArt(scene: Phaser.Scene, species: SpeciesId): Promise<boolean> {
  const keys = SPECIES_LAYERS[species];
  if (keys.every((k) => scene.textures.exists(k))) return Promise.resolve(true);
  let load = speciesLoads.get(species);
  if (!load) {
    const cfg = scene.registry.get('config') as ParkConfig | undefined;
    const scale = artScale('owl', cfg?.pixelRatio ?? 1, cfg?.artScaleMax ?? 1);
    load = Promise.all(keys.map((k) => loadArtKey(scene, k, scale))).then((ok) => ok.every(Boolean));
    speciesLoads.set(species, load);
  }
  return load;
}

export interface LoadReport {
  missing: string[];
}

/** The file loading `key` at `scale` asks for first: its SVG when the build ships one, else its best picture. */
function firstFile(key: string, scale: number): string | undefined {
  return PUBLISHED_ART.has(`${key}.svg`) ? `${key}.svg` : rasterNames(key, scale, PUBLISHED_ART)[0];
}

/** The bytes loading `key` at `scale` downloads: its first file's size (none when its texture is here already). */
function artBytes(scene: Phaser.Scene, key: string, scale: number): number {
  if (scene.textures.exists(key)) return 0;
  const name = firstFile(key, scale);
  return name ? (ART_BYTES.get(name) ?? 0) : 0;
}

/**
 * Load several keys concurrently; whatever is missing gets a placeholder so the scene can build.
 * `onProgress` hears the bytes downloaded of the bytes expected, as they come (the load screen's
 * progress, OP-129). The keys in `soft` load at 1x, to be sharpened later (sharpenArt).
 */
export async function loadArt(scene: Phaser.Scene, keys: string[], pixelRatio: number, roomMax: number, onProgress?: (done: number, total: number) => void, soft?: ReadonlySet<string>): Promise<LoadReport> {
  const missing: string[] = [];
  const plan = keys.map((key) => {
    const spec = ART[key];
    const scale = spec && !soft?.has(key) ? artScale(spec.kind, pixelRatio, roomMax) : 1;
    return { key, spec, scale, bytes: spec ? artBytes(scene, key, scale) : 0 };
  });
  const total = plan.reduce((sum, p) => sum + p.bytes, 0);
  let done = 0;
  const tell = () => onProgress?.(Math.min(done, total), total);
  await Promise.all(
    plan.map(async ({ key, spec, scale, bytes }) => {
      let got = 0;
      const count = (n: number) => {
        got += n;
        done += n;
        tell();
      };
      const ok = spec ? await loadArtKey(scene, key, scale, onProgress ? count : undefined) : false;
      if (!ok) missing.push(key);
      // A piece that came some other way (an SVG, the browser's cache whole) or not at all counts as come.
      if (got < bytes) count(bytes - got);
    }),
  );
  tell();
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
  if (!spec || spec.kind === 'arcade' || spec.kind === 'climb') return;
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
    case 'owl-wing-body':
      // A broad rounded wing from its root (12, 72) out to the right, a little raised.
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(96, 60, 168, 64);
      break;
    case 'owl-wing-accent':
      // Its flight feathers along the trailing edge.
      g.fillStyle(0xffffff, 1);
      for (let i = 0; i < 5; i++) g.fillEllipse(118 + i * 14, 70 + i * 5, 64, 16);
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
