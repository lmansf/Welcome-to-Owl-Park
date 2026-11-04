/**
 * The art kit's catalogue and its placeholders (OP-234, OP-241). Every piece a kit room names is a
 * piece of the published kit (kitCatalog.ts, generated from tools/art/config/kit.json by
 * tools/kit/catalog.mjs): its key, its logical size in room pixels, the way it repeats and, measured
 * from its art, where the art stands in its box. The park looks each key up like any other art
 * (art.ts); a placeholder here is only what the greybox tool and a missing file fall back to: plain
 * shapes in the tree's one palette (docs/TREE_STYLE.md, section 1), where the piece's art would be.
 *
 * A placeholder is a list of drawing ops (KitOp), not pixels: the park draws it with Phaser's
 * graphics, the tests and the greybox tool with raster.ts. A texture that repeats is drawn as a base
 * and motifs, each motif again one period over wherever it crosses an edge, so the texture is one
 * period of an endless pattern and tiles with no seam (unit-tested).
 */
import { KIT_CATALOG, type KitArtKind } from './kitCatalog';
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

/** How a piece repeats: not at all (drawn to its box), across, down, or both. */
export type KitTile = 'none' | 'x' | 'y' | 'xy';

export interface KitArtSpec {
  /** Logical size in room pixels: a repeating piece is repeated at about this size. */
  w: number;
  h: number;
  tile: KitTile;
  kind: KitArtKind;
  /** Where the piece's art begins and ends down its box (room px from its top), where it was measured (tools/kit/measure.py). */
  top?: number;
  foot?: number;
  /** Where the piece's art begins and ends across its box (room px from its left), where measured. */
  left?: number;
  right?: number;
  /** A rolling-ground piece (OP-238): its upper edge's row at its art's left end, middle and right end, where measured. */
  surface?: readonly [number, number, number];
}

/**
 * How a published piece repeats (OP-241): a texture both ways; a run's middle piece (`…-mid`), a trim
 * and a string of lanterns or a garland across, each copy whole (kitCells fits a whole number of them
 * to the run); everything else, a backdrop layer included, not at all.
 */
export function kitTileOf(key: string, kind: KitArtKind): KitTile {
  if (kind === 'texture') return 'xy';
  if (kind === 'layer') return 'none';
  return /-mid$/.test(key) || key.startsWith('kit-trim-') || /lantern-string|lantern-garland/.test(key) ? 'x' : 'none';
}

/** Every piece of the published kit (kitCatalog.ts, generated from the art tools' config). A key a room names must be here (kit.test.ts). */
export const KIT_ART: Readonly<Record<string, KitArtSpec>> = Object.fromEntries(Object.entries(KIT_CATALOG).map(([key, e]): [string, KitArtSpec] => [key, { ...e, tile: kitTileOf(key, e.kind) }]));

/** The pattern of a kit key: `kit-<group>` or `kit-<group>-<name>`, lower case (`kit-landing`, `kit-plank-mid`). */
export const KIT_KEY = /^kit-([a-z]+)(?:-[a-z0-9]+)*$/;

/** The group of a kit key (its first word: `tex`, `plank`, `high`, `landing`…), or null for a key that is not one. */
export function kitGroup(key: string): string | null {
  return KIT_KEY.exec(key)?.[1] ?? null;
}

/** One drawing op of a placeholder, in the piece's own pixels; `c` a palette colour, `a` its alpha (1 when absent). */
export type KitOp =
  | { op: 'rect'; x: number; y: number; w: number; h: number; c: number; a?: number }
  | { op: 'ellipse'; x: number; y: number; rx: number; ry: number; c: number; a?: number }
  | { op: 'poly'; pts: number[]; c: number; a?: number }
  | { op: 'line'; x0: number; y0: number; x1: number; y1: number; width: number; c: number; a?: number };

const rect = (x: number, y: number, w: number, h: number, c: number, a?: number): KitOp => ({ op: 'rect', x, y, w, h, c, ...(a === undefined ? {} : { a }) });
const ell = (x: number, y: number, rx: number, ry: number, c: number, a?: number): KitOp => ({ op: 'ellipse', x, y, rx, ry, c, ...(a === undefined ? {} : { a }) });

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

/** The palette colours a placeholder takes, from the words in its key (bark, plank, moss, stone…). */
export function kitColours(key: string): readonly [number, number, number] {
  const k = key.replace(/^kit-/, '');
  if (/sky|cloud|mist|glass|pane|window/.test(k)) return [P.sky, P.dusk, P.cream];
  if (/neon|night/.test(k)) return [P.dusk, P.navy, P.goldLight];
  if (/under|cave|stalac/.test(k)) return [P.underground, P.navyDeep, P.bark];
  if (/moss|lichen|fern|grass|hedge|leaf|leaves|vine|planter|bramble|lotus|reed|bamboo|pine/.test(k)) return [P.moss, P.leaf, P.mossLight];
  if (/stone|cobble|pavement|brick|boulder|wall|pillar|plaza|paper|ink/.test(k)) return [P.cream, P.wood, P.woodDark];
  if (/rope|lantern|garland|brass|turnstile|bell|lamp|chime/.test(k)) return [P.gold, P.goldLight, P.woodDark];
  if (/cloth|awning|banner|pennant|mat|easel/.test(k)) return [P.goldLight, P.gold, P.cream];
  if (/earth|soil|dip|crest|slope/.test(k)) return [P.barkDark, P.bark, P.woodDark];
  if (/bark|branch|bough|root|log|stump|trunk/.test(k)) return [P.bark, P.barkDark, P.woodDark];
  return [P.wood, P.woodDark, P.cream];
}

/** The pattern of a repeating piece; null for one that does not repeat. */
export function kitMotifs(key: string): KitMotifs | null {
  const spec = KIT_ART[key];
  if (!spec || spec.tile === 'none') return null;
  const { w, h } = spec;
  const rnd = seeded(key);
  const [base, dark, light] = kitColours(key);
  if (spec.kind === 'texture') return { base: [rect(0, 0, w, h, base)], motifs: [...streaks(rnd, w, h, 14, [dark], [6, 18], [40, 140]), ...blobs(rnd, w, h, 18, [light, dark], [8, 24])] };
  // A run's middle or a trim: its art's band, with a light lip along the top and knots along it.
  const top = Math.min(spec.top ?? 0, h - 4);
  const foot = Math.max(top + 4, spec.foot ?? h);
  return { base: [rect(0, top, w, foot - top, base), rect(0, top, w, 4, P.cream)], motifs: blobs(rnd, w, foot - top - 8, 6, [dark, light], [6, 14]).map((o) => shiftOp(o, 0, top + 8)) };
}

/** The ops of a piece that does not repeat: a block where its art is, or a backdrop's bands. */
function pieceOps(key: string, spec: KitArtSpec): KitOp[] {
  const { w, h } = spec;
  const rnd = seeded(key);
  const [base, dark, light] = kitColours(key);
  if (spec.kind === 'layer') {
    if (/-sky-/.test(key)) return [rect(0, 0, w, h / 2, P.navy), rect(0, h / 2, w, h / 2, base === P.sky ? P.dusk : P.navyDeep), ...blobs(rnd, w, h / 2, 8, [P.cream], [40, 120]).map((o) => ({ ...o, a: 0.12 }) as KitOp)];
    // A far or middle layer: shapes along its lower half, the upper half clear.
    return blobs(rnd, w, h / 2, 18, [dark, base], [30, 90]).map((o) => shiftOp(o, 0, h / 2));
  }
  const top = Math.min(spec.top ?? 0, h - 4);
  const foot = Math.max(top + 4, spec.foot ?? h);
  return [rect(w * 0.1, top, w * 0.8, foot - top, base, 0.85), rect(w * 0.1, top, w * 0.8, 4, light), rect(w * 0.1, foot - 6, w * 0.8, 6, dark)];
}

/** A kit key's placeholder: what is drawn where the key's art has not loaded. Null for a key not in the kit. */
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
