/**
 * The art kit's catalogue and its placeholders (OP-234). Every piece a kit room names has a key,
 * `kit-<group>-<name>`, a logical size in room pixels and the way it repeats; the park looks each key
 * up like any other art (art.ts, artFiles.ts) and, until the kit's art ships, draws the placeholder
 * here instead: plain shapes in the tree's one palette (docs/TREE_STYLE.md, section 1), so a kit room
 * works and reads with no art at all.
 *
 * A placeholder is a list of drawing ops (KitOp), not pixels: the park draws it with Phaser's
 * graphics, the tests and the greybox tool with raster.ts. A texture that repeats is drawn as a base
 * and motifs, each motif again one period over wherever it crosses an edge, so the texture is one
 * period of an endless pattern and tiles with no seam (unit-tested).
 */
import { fillEllipse, fillPoly, fillRect, strokeLine, type Raster } from './raster';

/**
 * The tree's palette (docs/TREE_STYLE.md, section 1, and the underground's violet-navy from section 2).
 * Every placeholder draws in these and nothing else.
 */
export const KIT_PALETTE = {
  barkDark: 0x2b1c12,
  bark: 0x4a3322,
  woodDark: 0x5c4632,
  wood: 0x8f8068,
  moss: 0x3e5a3a,
  mossLight: 0x6e8b4e,
  leaf: 0x4f7a3e,
  leafLight: 0x8dae5a,
  gold: 0xc9a227,
  goldLight: 0xffd36a,
  cream: 0xf6f1e3,
  navy: 0x0c1e36,
  navyDeep: 0x07122a,
  dusk: 0x2e4c7a,
  sky: 0x6f9bc8,
  underground: 0x1b1a30,
} as const;

const P = KIT_PALETTE;

/** How a piece repeats: not at all (stretched to its box), across, down, or both. */
export type KitTile = 'none' | 'x' | 'y' | 'xy';

/** The kit's groups: the `<group>` of `kit-<group>-<name>`. */
export const KIT_GROUPS = ['tex', 'cap', 'mid', 'slope', 'trim', 'stair', 'door', 'portal', 'barrier', 'bench', 'shelf', 'sign', 'prop', 'decal', 'back'] as const;
export type KitGroup = (typeof KIT_GROUPS)[number];

export interface KitArtSpec {
  /** Logical size in room pixels: a repeating piece is repeated at this size. */
  w: number;
  h: number;
  tile: KitTile;
}

/** The five heights of the tree (docs/TREE_STYLE.md, section 2), each with its own backdrops. */
export const KIT_HEIGHTS = ['under', 'ground', 'low', 'high', 'top'] as const;
export type KitHeight = (typeof KIT_HEIGHTS)[number];

/** Every piece of the kit. A key a room names must be here (kit.test.ts). */
export const KIT_ART: Readonly<Record<string, KitArtSpec>> = {
  // Seamless textures for surfaces.
  'kit-tex-bark': { w: 256, h: 256, tile: 'xy' },
  'kit-tex-wood': { w: 256, h: 256, tile: 'xy' },
  'kit-tex-moss': { w: 256, h: 256, tile: 'xy' },
  'kit-tex-earth': { w: 256, h: 256, tile: 'xy' },
  'kit-tex-leaf': { w: 256, h: 256, tile: 'xy' },
  'kit-tex-plank': { w: 256, h: 256, tile: 'xy' },
  // Platforms: the cap along the top, the mid under it, the slope at each end.
  'kit-cap-plank': { w: 128, h: 28, tile: 'x' },
  'kit-cap-moss': { w: 128, h: 28, tile: 'x' },
  'kit-cap-branch': { w: 128, h: 28, tile: 'x' },
  'kit-mid-plank': { w: 128, h: 128, tile: 'xy' },
  'kit-mid-branch': { w: 128, h: 128, tile: 'xy' },
  'kit-slope-plank': { w: 48, h: 72, tile: 'none' },
  'kit-slope-branch': { w: 48, h: 72, tile: 'none' },
  // Trims hung along a platform's front.
  'kit-trim-rope': { w: 128, h: 24, tile: 'x' },
  'kit-trim-vine': { w: 128, h: 24, tile: 'x' },
  // Stairs: a tread and the post under it.
  'kit-stair-tread': { w: 64, h: 22, tile: 'x' },
  'kit-stair-post': { w: 20, h: 128, tile: 'y' },
  // Doorways.
  'kit-door-arch': { w: 180, h: 260, tile: 'none' },
  'kit-door-stair': { w: 160, h: 220, tile: 'none' },
  'kit-portal-arch': { w: 320, h: 420, tile: 'none' },
  // Barriers: "no way on".
  'kit-barrier-railing': { w: 128, h: 80, tile: 'x' },
  'kit-barrier-rope': { w: 128, h: 70, tile: 'x' },
  'kit-barrier-roots': { w: 180, h: 150, tile: 'none' },
  // Benches, shelves, signs and props.
  'kit-bench-plank': { w: 180, h: 70, tile: 'none' },
  'kit-shelf-fungus': { w: 150, h: 50, tile: 'none' },
  'kit-shelf-plank': { w: 160, h: 40, tile: 'none' },
  'kit-sign-post': { w: 100, h: 170, tile: 'none' },
  'kit-sign-arrow': { w: 130, h: 70, tile: 'none' },
  'kit-prop-lantern': { w: 64, h: 110, tile: 'none' },
  'kit-prop-lamppost': { w: 90, h: 300, tile: 'none' },
  'kit-prop-mushroom': { w: 140, h: 120, tile: 'none' },
  // Decals laid over surfaces.
  'kit-decal-moss': { w: 160, h: 80, tile: 'none' },
  'kit-decal-knot': { w: 90, h: 110, tile: 'none' },
  'kit-decal-glow': { w: 220, h: 220, tile: 'none' },
  'kit-decal-roots': { w: 240, h: 120, tile: 'none' },
  // Backdrops, one sky plate and one middle distance (half size, drawn twice as big) per height, and the overlays.
  ...Object.fromEntries(
    KIT_HEIGHTS.flatMap((h): Array<[string, KitArtSpec]> => [
      [`kit-back-sky-${h}`, { w: 1600, h: 900, tile: 'none' }],
      [`kit-back-mid-${h}`, { w: 800, h: 450, tile: 'none' }],
    ]),
  ),
  'kit-back-over-leaves': { w: 1600, h: 900, tile: 'none' },
  'kit-back-over-roots': { w: 1600, h: 900, tile: 'none' },
};

/** The pattern of a kit key: `kit-<group>-<name>`, lower case. */
export const KIT_KEY = /^kit-([a-z]+)-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The group of a kit key, or null for a key that is not one. */
export function kitGroup(key: string): KitGroup | null {
  const m = KIT_KEY.exec(key);
  const g = m?.[1];
  return g && (KIT_GROUPS as readonly string[]).includes(g) ? (g as KitGroup) : null;
}

/** One drawing op of a placeholder, in the piece's own pixels; `c` a palette colour, `a` its alpha (1 when absent). */
export type KitOp =
  | { op: 'rect'; x: number; y: number; w: number; h: number; c: number; a?: number }
  | { op: 'ellipse'; x: number; y: number; rx: number; ry: number; c: number; a?: number }
  | { op: 'poly'; pts: number[]; c: number; a?: number }
  | { op: 'line'; x0: number; y0: number; x1: number; y1: number; width: number; c: number; a?: number };

const rect = (x: number, y: number, w: number, h: number, c: number, a?: number): KitOp => ({ op: 'rect', x, y, w, h, c, ...(a === undefined ? {} : { a }) });
const ell = (x: number, y: number, rx: number, ry: number, c: number, a?: number): KitOp => ({ op: 'ellipse', x, y, rx, ry, c, ...(a === undefined ? {} : { a }) });
const poly = (c: number, ...pts: number[]): KitOp => ({ op: 'poly', pts, c });
const line = (x0: number, y0: number, x1: number, y1: number, width: number, c: number, a?: number): KitOp => ({ op: 'line', x0, y0, x1, y1, width, c, ...(a === undefined ? {} : { a }) });

/** A repeating piece's pattern: what fills it, and the motifs over that. */
export interface KitMotifs {
  base: KitOp[];
  motifs: KitOp[];
}

/** A small seeded random (mulberry32) from a key, so a placeholder is the same on every page. */
function seeded(key: string): () => number {
  let s = 0;
  for (let i = 0; i < key.length; i++) s = (Math.imul(s, 31) + key.charCodeAt(i)) | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A whole number from lo to hi. */
const pick = (rnd: () => number, lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

/** An op moved by dx, dy. */
export function shiftOp(o: KitOp, dx: number, dy: number): KitOp {
  switch (o.op) {
    case 'rect':
    case 'ellipse':
      return { ...o, x: o.x + dx, y: o.y + dy };
    case 'poly':
      return { ...o, pts: o.pts.map((v, i) => v + (i % 2 ? dy : dx)) };
    case 'line':
      return { ...o, x0: o.x0 + dx, y0: o.y0 + dy, x1: o.x1 + dx, y1: o.y1 + dy };
  }
}

/** The box an op covers. */
export function opBox(o: KitOp): { x0: number; y0: number; x1: number; y1: number } {
  switch (o.op) {
    case 'rect':
      return { x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.h };
    case 'ellipse':
      return { x0: o.x - o.rx, y0: o.y - o.ry, x1: o.x + o.rx, y1: o.y + o.ry };
    case 'poly': {
      const xs = o.pts.filter((_, i) => i % 2 === 0);
      const ys = o.pts.filter((_, i) => i % 2 === 1);
      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    }
    case 'line': {
      const r = o.width / 2;
      return { x0: Math.min(o.x0, o.x1) - r, y0: Math.min(o.y0, o.y1) - r, x1: Math.max(o.x0, o.x1) + r, y1: Math.max(o.y0, o.y1) + r };
    }
  }
}

/** The shifts a repeating piece's motifs are drawn again at: one period each way along the axes it repeats on. */
export function periodShifts(w: number, h: number, tile: KitTile): Array<[number, number]> {
  const xs = tile === 'x' || tile === 'xy' ? [-w, 0, w] : [0];
  const ys = tile === 'y' || tile === 'xy' ? [-h, 0, h] : [0];
  return xs.flatMap((dx) => ys.map((dy): [number, number] => [dx, dy]));
}

/** A repeating piece's ops: its base, then each motif at every shift that still lands on the piece. */
export function wrapMotifs(m: KitMotifs, spec: KitArtSpec): KitOp[] {
  const out = [...m.base];
  for (const o of m.motifs) {
    for (const [dx, dy] of periodShifts(spec.w, spec.h, spec.tile)) {
      const b = opBox(o);
      if (b.x1 + dx <= 0 || b.x0 + dx >= spec.w || b.y1 + dy <= 0 || b.y0 + dy >= spec.h) continue;
      out.push(shiftOp(o, dx, dy));
    }
  }
  return out;
}

/** Streaks down a texture (bark, a post), random but the same for a key. */
function streaks(rnd: () => number, w: number, h: number, n: number, colours: readonly number[], wide: [number, number], long: [number, number]): KitOp[] {
  return Array.from({ length: n }, () => rect(pick(rnd, 0, w - 1), pick(rnd, 0, h - 1), pick(rnd, ...wide), pick(rnd, ...long), colours[pick(rnd, 0, colours.length - 1)]!));
}

/** Blobs over a texture (moss, leaves, pebbles). */
function blobs(rnd: () => number, w: number, h: number, n: number, colours: readonly number[], r: [number, number]): KitOp[] {
  return Array.from({ length: n }, () => {
    const rx = pick(rnd, ...r);
    return ell(pick(rnd, 0, w - 1), pick(rnd, 0, h - 1), rx, Math.max(2, Math.round(rx * (0.5 + rnd() * 0.5))), colours[pick(rnd, 0, colours.length - 1)]!);
  });
}

/** The pattern of a repeating piece; null for one that does not repeat. */
export function kitMotifs(key: string): KitMotifs | null {
  const spec = KIT_ART[key];
  if (!spec || spec.tile === 'none') return null;
  const { w, h } = spec;
  const rnd = seeded(key);
  switch (key) {
    case 'kit-tex-bark':
      return {
        base: [rect(0, 0, w, h, P.bark)],
        motifs: [...streaks(rnd, w, h, 22, [P.barkDark, P.woodDark], [4, 12], [50, 170]), ...blobs(rnd, w, h, 3, [P.barkDark], [8, 14]), ...blobs(rnd, w, h, 4, [P.moss], [6, 16])],
      };
    case 'kit-tex-wood':
      return { base: [rect(0, 0, w, h, P.woodDark)], motifs: [...streaks(rnd, w, h, 14, [P.wood], [60, 140], [3, 6]), ...blobs(rnd, w, h, 2, [P.bark], [10, 18])] };
    case 'kit-tex-moss':
      return { base: [rect(0, 0, w, h, P.moss)], motifs: blobs(rnd, w, h, 28, [P.mossLight, P.leaf], [8, 26]) };
    case 'kit-tex-earth':
      return { base: [rect(0, 0, w, h, P.barkDark)], motifs: [...blobs(rnd, w, h, 26, [P.bark, P.woodDark], [4, 12]), ...streaks(rnd, w, h, 5, [P.bark], [50, 120], [4, 6])] };
    case 'kit-tex-leaf':
      return { base: [rect(0, 0, w, h, P.leaf)], motifs: blobs(rnd, w, h, 40, [P.leafLight, P.moss, P.mossLight], [10, 22]) };
    case 'kit-tex-plank':
      return {
        base: [rect(0, 0, w, h, P.wood)],
        motifs: [...Array.from({ length: 8 }, (_, i) => rect(0, i * 32, w, 3, P.woodDark)), ...Array.from({ length: 8 }, (_, i) => rect(((i * 97) % w) - 2, i * 32 + 3, 3, 29, P.woodDark))],
      };
    case 'kit-cap-plank':
      return { base: [rect(0, 0, w, 5, P.cream), rect(0, 5, w, 4, P.goldLight), rect(0, 9, w, h - 9, P.wood), rect(0, h - 3, w, 3, P.woodDark)], motifs: [rect(62, 9, 3, h - 9, P.woodDark), rect(126, 9, 3, h - 9, P.woodDark)] };
    case 'kit-cap-moss':
      return { base: [rect(0, 0, w, 5, P.cream), rect(0, 5, w, h - 5, P.moss)], motifs: blobs(rnd, w, h, 10, [P.mossLight, P.leaf], [6, 10]).map((o) => (o.op === 'ellipse' ? { ...o, y: Math.max(10, Math.min(h - 4, o.y)) } : o)) };
    case 'kit-cap-branch':
      return { base: [rect(0, 0, w, 5, P.cream), rect(0, 5, w, h - 5, P.bark)], motifs: streaks(rnd, w, h - 10, 8, [P.barkDark], [16, 40], [3, 5]).map((o) => shiftOp(o, 0, 8)) };
    case 'kit-mid-plank':
      return { base: [rect(0, 0, w, h, P.woodDark)], motifs: [rect(0, 0, 3, h, P.barkDark), rect(64, 0, 3, h, P.barkDark), ...blobs(rnd, w, h, 4, [P.barkDark], [2, 3])] };
    case 'kit-mid-branch':
      return { base: [rect(0, 0, w, h, P.bark)], motifs: streaks(rnd, w, h, 12, [P.barkDark, P.woodDark], [4, 10], [30, 90]) };
    case 'kit-trim-rope':
      return { base: [], motifs: Array.from({ length: 8 }, (_, i) => ell(i * 16 + 8, 6 + (i % 2) * 2, 9, 5, i % 2 ? P.gold : P.goldLight)) };
    case 'kit-trim-vine':
      return { base: [rect(0, 4, w, 4, P.moss)], motifs: [ell(20, 12, 9, 6, P.leaf), ell(58, 16, 10, 7, P.mossLight), ell(96, 12, 8, 6, P.leaf)] };
    case 'kit-stair-tread':
      return { base: [rect(0, 0, w, 4, P.cream), rect(0, 4, w, h - 4, P.wood), rect(0, h - 3, w, 3, P.woodDark)], motifs: [rect(30, 6, 2, h - 9, P.woodDark)] };
    case 'kit-stair-post':
      return { base: [rect(0, 0, w, h, P.barkDark), rect(3, 0, 4, h, P.bark)], motifs: [rect(0, 60, w, 4, P.woodDark)] };
    case 'kit-barrier-railing':
      return {
        base: [rect(0, 8, w, 7, P.woodDark), rect(0, 6, w, 3, P.cream), rect(0, 42, w, 6, P.woodDark)],
        motifs: [rect(4, 6, 12, h - 6, P.barkDark), rect(68, 6, 12, h - 6, P.barkDark), rect(6, 6, 3, h - 6, P.bark), rect(70, 6, 3, h - 6, P.bark)],
      };
    case 'kit-barrier-rope':
      return { base: [], motifs: [rect(0, 8, 12, h - 8, P.barkDark), line(12, 16, 64, 30, 5, P.gold), line(64, 30, 128, 16, 5, P.gold), rect(0, 6, 12, 4, P.cream)] };
  }
  // A repeating piece with no recipe of its own: its group's colours, flat.
  return { base: [rect(0, 0, w, h, P.woodDark)], motifs: [] };
}

/** The ops of a piece that does not repeat. */
function pieceOps(key: string, spec: KitArtSpec): KitOp[] {
  const { w, h } = spec;
  const rnd = seeded(key);
  const height = KIT_HEIGHTS.find((k) => key.endsWith(`-${k}`));
  if (key.startsWith('kit-back-sky-')) return skyOps(height ?? 'ground', w, h, rnd);
  if (key.startsWith('kit-back-mid-')) return midOps(height ?? 'ground', w, h, rnd);
  switch (key) {
    case 'kit-slope-plank':
      return [poly(P.woodDark, 0, 0, w, 0, w, h, 0, 12), line(4, 6, w - 6, h - 8, 6, P.barkDark), rect(0, 0, w, 4, P.cream)];
    case 'kit-slope-branch':
      return [poly(P.bark, 0, 0, w, 0, w, h, 0, 8), line(8, 10, w - 4, h - 12, 4, P.barkDark), rect(0, 0, w, 4, P.cream)];
    case 'kit-door-arch':
      return [poly(P.bark, 0, h, 0, 90, 20, 36, 90, 0, 160, 36, 180, 90, 180, h), poly(P.navyDeep, 28, h, 28, 100, 44, 60, 90, 36, 136, 60, 152, 100, 152, h), line(28, 100, 44, 60, 4, P.cream), line(44, 60, 90, 36, 4, P.cream), line(90, 36, 136, 60, 4, P.cream), line(136, 60, 152, 100, 4, P.cream), ell(90, 18, 7, 7, P.goldLight)];
    case 'kit-door-stair':
      return [
        rect(0, 0, w, h, P.bark),
        rect(20, 24, w - 40, h - 24, P.underground),
        ...Array.from({ length: 6 }, (_, i) => rect(20 + i * 12, 60 + i * 26, w - 40 - i * 24, 8, P.woodDark)),
        rect(20, 20, w - 40, 4, P.cream),
        ell(w / 2, 10, 6, 6, P.goldLight),
      ];
    case 'kit-portal-arch':
      return [ell(160, 170, 160, 170, P.gold), rect(0, 170, w, h - 170, P.gold), ell(160, 175, 130, 145, P.dusk), rect(30, 175, 260, h - 175, P.dusk), ell(160, 200, 90, 100, P.sky, 0.6), rect(0, h - 14, w, 14, P.goldLight)];
    case 'kit-barrier-roots':
      return [line(10, h, 60, 30, 18, P.barkDark), line(60, 30, 120, 10, 14, P.bark), line(40, h, 110, 60, 16, P.bark), line(110, 60, 170, 40, 12, P.barkDark), line(90, h, 150, 90, 14, P.barkDark), line(150, 90, 176, h, 12, P.bark), ell(60, 30, 12, 10, P.moss)];
    case 'kit-bench-plank':
      return [rect(0, 20, w, 14, P.wood), rect(0, 18, w, 4, P.cream), rect(14, 34, 14, h - 34, P.barkDark), rect(w - 28, 34, 14, h - 34, P.barkDark), rect(0, 0, w, 10, P.woodDark)];
    case 'kit-shelf-fungus':
      return [ell(w / 2, h, w / 2, h, P.mossLight), ell(w / 2, h, w / 2 - 10, h - 10, P.gold), rect(0, h - 4, w, 4, P.cream)];
    case 'kit-shelf-plank':
      return [rect(0, 0, w, 4, P.cream), rect(0, 4, w, 14, P.wood), line(16, 18, 40, h, 6, P.barkDark), line(w - 16, 18, w - 40, h, 6, P.barkDark)];
    case 'kit-sign-post':
      return [rect(44, 40, 12, h - 40, P.barkDark), rect(6, 10, w - 12, 60, P.wood), rect(10, 14, w - 20, 52, P.cream), rect(20, 30, w - 40, 6, P.gold), rect(20, 44, w - 50, 6, P.gold)];
    case 'kit-sign-arrow':
      return [poly(P.wood, 0, 10, w - 30, 10, w, h / 2, w - 30, h - 10, 0, h - 10), rect(4, 14, w - 40, h - 28, P.cream), rect(14, h / 2 - 3, w - 60, 6, P.gold)];
    case 'kit-prop-lantern':
      return lanternOps(w / 2, 0);
    case 'kit-prop-lamppost':
      return [rect(w / 2 - 7, 40, 14, h - 40, P.barkDark), rect(w / 2 - 4, 40, 3, h - 40, P.bark), rect(w / 2 - 24, h - 14, 48, 14, P.barkDark), line(w / 2, 44, w - 10, 34, 5, P.navyDeep), ...lanternOps(w - 14, 34)];
    case 'kit-prop-mushroom':
      return [rect(56, 50, 28, h - 50, P.cream), poly(P.gold, 0, 56, 20, 18, 70, 4, 120, 18, w, 56), rect(10, 56, w - 20, 6, P.woodDark), ell(40, 36, 9, 6, P.goldLight), ell(92, 30, 7, 5, P.goldLight)];
    case 'kit-decal-moss':
      return blobs(rnd, w - 44, h - 32, 12, [P.moss, P.mossLight], [10, 22]).map((o) => ({ ...shiftOp(o, 22, 16), a: 0.7 }) as KitOp);
    case 'kit-decal-knot':
      return [ell(w / 2, h / 2, w / 2 - 2, h / 2 - 2, P.barkDark), ell(w / 2, h / 2, w / 2 - 14, h / 2 - 16, P.bark), ell(w / 2, h / 2 + 4, 12, 16, P.underground)];
    case 'kit-decal-glow':
      return [0.06, 0.08, 0.1, 0.14].map((a, i) => ell(w / 2, h / 2, w / 2 - i * 22, h / 2 - i * 22, P.goldLight, a));
    case 'kit-decal-roots':
      return [line(0, 0, 60, 80, 10, P.barkDark), line(60, 80, 70, h, 6, P.bark), line(100, 0, 140, 60, 12, P.bark), line(140, 60, 130, h, 6, P.barkDark), line(200, 0, 190, 70, 9, P.barkDark), line(190, 70, 230, h - 10, 5, P.bark)];
    case 'kit-back-over-leaves':
      return edgeOps(w, h, rnd, [P.leaf, P.moss, P.leafLight]);
    case 'kit-back-over-roots':
      return edgeOps(w, h, rnd, [P.barkDark, P.bark]);
  }
  return [rect(0, 0, w, h, P.woodDark, 0.6)];
}

/** The one lantern (docs/TREE_STYLE.md): a round amber paper lantern on a dark iron hook, hung at x, y. */
function lanternOps(x: number, y: number): KitOp[] {
  return [line(x, y, x, y + 26, 4, P.navyDeep), ell(x, y + 60, 26, 30, P.gold), ell(x, y + 60, 18, 24, P.goldLight), rect(x - 12, y + 26, 24, 6, P.navyDeep), rect(x - 10, y + 88, 20, 6, P.navyDeep)];
}

/** A sky plate per height (docs/TREE_STYLE.md, section 2), in flat bands of the palette. */
function skyOps(height: KitHeight, w: number, h: number, rnd: () => number): KitOp[] {
  const bands: Record<KitHeight, readonly number[]> = {
    under: [P.navyDeep, P.underground, P.underground, P.navyDeep],
    ground: [P.navyDeep, P.navy, P.navy, P.dusk, P.dusk],
    low: [P.navy, P.dusk, P.dusk, P.dusk],
    high: [P.navyDeep, P.navy, P.dusk, P.sky],
    top: [P.navyDeep, P.navyDeep, P.navy, P.navy, P.dusk],
  };
  const b = bands[height];
  const out: KitOp[] = b.map((c, i) => rect(0, Math.floor((i * h) / b.length), w, Math.ceil(h / b.length) + 1, c));
  if (height === 'under') out.push(...Array.from({ length: 14 }, (_, i) => line(60 + i * 110, 0, 60 + i * 110 + pick(rnd, -40, 40), pick(rnd, 120, 320), pick(rnd, 6, 14), P.barkDark)));
  if (height === 'ground') out.push(ell(260, 520, 60, 60, P.cream, 0.9), ...[180, 640, 1120, 1480].map((x) => rect(x, 0, pick(rnd, 90, 150), h, P.barkDark, 0.8)));
  if (height === 'low') out.push(...blobs(rnd, w, 260, 30, [P.leaf, P.moss], [60, 140]), ...blobs(rnd, w, h, 20, [P.goldLight], [3, 6]).map((o) => ({ ...o, a: 0.5 }) as KitOp));
  if (height === 'high') out.push(ell(1240, 220, 54, 54, P.cream, 0.9), ...blobs(rnd, w, h, 8, [P.cream], [80, 200]).map((o) => ({ ...o, a: 0.12 }) as KitOp));
  if (height === 'top') out.push(ell(1120, 150, 70, 70, P.cream), ...blobs(rnd, w, 600, 60, [P.cream], [1, 3]));
  return out;
}

/** A middle distance per height: what lies between the sky and the playfield, clear above it. */
function midOps(height: KitHeight, w: number, h: number, rnd: () => number): KitOp[] {
  switch (height) {
    case 'under':
      return Array.from({ length: 10 }, (_, i) => line(i * 85 + 30, 0, i * 85 + pick(rnd, 0, 60), pick(rnd, 100, 260), pick(rnd, 8, 18), P.bark, 0.8));
    case 'ground':
      return [rect(0, h - 90, w, 90, P.moss), ...[90, 330, 600].map((x) => rect(x, 0, pick(rnd, 50, 80), h - 80, P.bark, 0.9)), ...blobs(rnd, w, 60, 18, [P.leaf, P.mossLight], [20, 40]).map((o) => shiftOp(o, 0, h - 80))];
    case 'low':
      return [line(0, 120, 360, 200, 28, P.bark), line(440, 260, w, 160, 24, P.bark), ...blobs(rnd, w, 160, 16, [P.leaf, P.moss], [30, 60])];
    case 'high':
      return [...blobs(rnd, w, 90, 20, [P.moss, P.leaf], [50, 90]).map((o) => shiftOp(o, 0, h - 60)), ...blobs(rnd, w, 200, 4, [P.cream], [60, 120]).map((o) => ({ ...o, a: 0.15 }) as KitOp)];
    case 'top':
      return blobs(rnd, w, 80, 30, [P.leaf, P.leafLight, P.moss], [40, 80]).map((o) => shiftOp(o, 0, h - 40));
  }
}

/** An overlay: hanging things in the outer fifth of each side only (docs/TREE_STYLE.md, section 3). */
function edgeOps(w: number, h: number, rnd: () => number, colours: readonly number[]): KitOp[] {
  const fifth = Math.floor(w / 5);
  const out: KitOp[] = [];
  for (const side of [0, w - fifth]) {
    for (let i = 0; i < 9; i++) {
      const x = side + pick(rnd, 10, fifth - 10);
      const len = pick(rnd, 120, 420);
      out.push(line(x, 0, x + pick(rnd, -20, 20), len, pick(rnd, 3, 6), colours[i % colours.length]!));
      out.push(ell(x, len, pick(rnd, 10, 22), pick(rnd, 8, 14), colours[(i + 1) % colours.length]!));
    }
  }
  return out.filter((o) => opBox(o).y1 <= h);
}

/** A kit key's placeholder: what the park draws until the key's art ships. Null for a key not in the kit. */
export function kitPlaceholder(key: string): KitOp[] | null {
  const spec = KIT_ART[key];
  if (!spec) return null;
  const m = kitMotifs(key);
  return m ? wrapMotifs(m, spec) : pieceOps(key, spec);
}

/** Draws ops onto a raster, moved by dx, dy and scaled by k (the greybox tool and the tests). */
export function drawOps(r: Raster, ops: readonly KitOp[], dx = 0, dy = 0, k = 1): void {
  for (const o of ops) {
    const a = o.a ?? 1;
    switch (o.op) {
      case 'rect':
        fillRect(r, dx + o.x * k, dy + o.y * k, o.w * k, o.h * k, o.c, a);
        break;
      case 'ellipse':
        fillEllipse(r, dx + o.x * k, dy + o.y * k, o.rx * k, o.ry * k, o.c, a);
        break;
      case 'poly':
        fillPoly(r, o.pts.map((v, i) => (i % 2 ? dy : dx) + v * k), o.c, a);
        break;
      case 'line':
        strokeLine(r, dx + o.x0 * k, dy + o.y0 * k, dx + o.x1 * k, dy + o.y1 * k, o.width * k, o.c, a);
        break;
    }
  }
}
