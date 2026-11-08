/**
 * Shaped edges for rooms seen from above (the owner's ask, Nov 8: "convince users that the map isn't
 * big rectangles using clever foreground and boundary shapes"). A room's floor and walls are drawn from
 * rectangles of texture; edge pieces break the rectangles up: roots bulging out from the foot of a
 * wall, ferns curling over the front of the floor, rounded corners, bark pillars over the seams
 * between two textures, leaf litter across a floor's seam and a ragged rim along the top.
 *
 * The rule that keeps walking clear: a piece that eats into the floor (a bump) is also cut out of the
 * floor the owl walks on (shapedEdge), from the very same profile, so where the floor visibly ends is
 * where the owl stops, and the floor's edge line (walkFloor.ts) runs along the piece. Nothing else here
 * is drawn over the floor but leaf litter, which the owl walks across.
 *
 * Every piece is art under its own key, at its own size (EDGE_ART), drawn as plain shapes in the tree's
 * palette (edgePlaceholder) until an artist's file of the same name replaces it (a file swap, no code
 * change; its size is in the size list). A bump's art keeps to its box above the floor line and may
 * not reach past its profile into the floor: the profile is the walking edge.
 */
import type { Polygon } from './geometry';
import type { KitDraw } from './kit';
import { KIT_ART, KIT_PALETTE, type KitOp } from './kitArt';
import type { Vec2 } from './protocol';

/** What an edge piece is. */
export type EdgeKind =
  /** Seen from above: a worn ring of moss and stones in a plaza's floor, where owls gather; walked across. */
  | 'ring'
  /** Eats into the floor from its back edge (roots at a wall's foot) or its front (ferns over its lip): cut out of the walkable floor. */
  | 'bump'
  /** Stands on the wall, never on the floor (a bark pillar over a seam). */
  | 'wall'
  /** Lies flat on the floor and is walked across (leaf litter over a seam between two floors). */
  | 'litter'
  /** Hangs along the room's top (a ragged rim of bark and leaves), above anything an owl stands on. */
  | 'rim'
  /** Seen from the side: shade and creepers down a platform's side, repeated down it (kitFrames). */
  | 'side'
  /** Seen from the side: roots and drips hanging under a platform, repeated along it (kitFrames). */
  | 'under';

/** Which way a bump's profile eases: in and out (a bulge), or deepest at its left or right end (a corner). */
export type EdgeEase = 'both' | 'left' | 'right';

export interface EdgeArt {
  w: number;
  h: number;
  kind: EdgeKind;
  /** A bump: which edge of the floor it eats into. */
  side?: 'back' | 'front';
  /** A bump: where the floor's straight edge runs across its box (px from the box's top). */
  base?: number;
  /** A bump: how far it eats into the floor at its deepest (px). */
  depth?: number;
  /** A bump: how it eases; and how square its shoulders are (2 round, 4 nearly flat-bottomed). */
  ease?: EdgeEase;
  square?: number;
  /** A bump: how much its edge wanders (0 to 0.2 of its depth), the same for its key on every page. */
  wobble?: number;
}

/**
 * Every edge piece, by key. Sizes are the game's; an artist delivers at twice (the size list).
 * A bump's `base` is where the floor's line would run without it; the art fills the box above its
 * profile (a back bump) or below it (a front one).
 */
export const EDGE_ART: Readonly<Record<string, EdgeArt>> = {
  // The Great Hollow: roots out of the foot of its wall, between the doorways.
  'edge-hollow-roots-a': { w: 160, h: 150, kind: 'bump', side: 'back', base: 90, depth: 56, ease: 'both', square: 2, wobble: 0.14 },
  'edge-hollow-roots-b': { w: 200, h: 160, kind: 'bump', side: 'back', base: 90, depth: 66, ease: 'both', square: 2.4, wobble: 0.12 },
  'edge-hollow-roots-small': { w: 120, h: 130, kind: 'bump', side: 'back', base: 90, depth: 36, ease: 'both', square: 2, wobble: 0.1 },
  // A pillar's roots, flaring over the seam between two Commons' floors.
  'edge-hollow-root-flare': { w: 320, h: 170, kind: 'bump', side: 'back', base: 90, depth: 74, ease: 'both', square: 1.6, wobble: 0.1 },
  // The mossy mound an idol stands on: flat-bottomed, so the Realm Vote spot in front of it stays floor.
  'edge-hollow-idol-mound': { w: 300, h: 210, kind: 'bump', side: 'back', base: 90, depth: 100, ease: 'both', square: 4, wobble: 0.04 },
  // The back corners, rounded by a root buttress (the east one is the west one mirrored).
  'edge-hollow-corner-back': { w: 180, h: 260, kind: 'bump', side: 'back', base: 120, depth: 130, ease: 'left', square: 2, wobble: 0.08 },
  // Ferns over the front of the floor, end to end along it; they reach the room's foot.
  'edge-hollow-ferns-a': { w: 420, h: 60, kind: 'bump', side: 'front', base: 32, depth: 28, ease: 'both', square: 2, wobble: 0.16 },
  'edge-hollow-ferns-b': { w: 520, h: 60, kind: 'bump', side: 'front', base: 32, depth: 22, ease: 'both', square: 2, wobble: 0.2 },
  'edge-hollow-ferns-c': { w: 300, h: 64, kind: 'bump', side: 'front', base: 32, depth: 30, ease: 'both', square: 2, wobble: 0.14 },
  // The front corners (the east one mirrored).
  'edge-hollow-corner-front': { w: 140, h: 92, kind: 'bump', side: 'front', base: 64, depth: 60, ease: 'left', square: 2, wobble: 0.06 },
  // A bark pillar over each seam between two Commons' walls, from the rim to the floor.
  'edge-hollow-pillar': { w: 120, h: 640, kind: 'wall' },
  // Leaf litter across each seam between two Commons' floors, walked across.
  'edge-hollow-litter': { w: 380, h: 300, kind: 'litter' },
  // The worn ring in the middle of each Commons' plaza, round the moonbeam where owls gather.
  'edge-hollow-plaza-ring': { w: 760, h: 380, kind: 'ring' },
  // The ragged rim of the hollow along the top of its wall, one a screen.
  'edge-hollow-rim': { w: 1600, h: 150, kind: 'rim' },
  // The Treetop Commons' plaza (the lobby, grown to hold a crowd, Nov 8): flagstones over the join where
  // the painting's floor meets the new plaza, a worn ring round its moonbeam, planters along its front
  // and its rounded front corners (the east one mirrored).
  'edge-commons-join': { w: 400, h: 120, kind: 'litter' },
  'edge-commons-ring': { w: 760, h: 380, kind: 'ring' },
  'edge-commons-planters-a': { w: 420, h: 60, kind: 'bump', side: 'front', base: 32, depth: 28, ease: 'both', square: 2, wobble: 0.16 },
  'edge-commons-planters-b': { w: 520, h: 60, kind: 'bump', side: 'front', base: 32, depth: 22, ease: 'both', square: 2, wobble: 0.2 },
  'edge-commons-corner-front': { w: 140, h: 92, kind: 'bump', side: 'front', base: 64, depth: 60, ease: 'left', square: 2, wobble: 0.06 },
  // The arcade hall's floor, grown the same way: a trim over the join, a worn ring under each skylight,
  // crates and cables along its front and its rounded front corners.
  'edge-arcade-join': { w: 400, h: 120, kind: 'litter' },
  'edge-arcade-ring': { w: 760, h: 380, kind: 'ring' },
  'edge-arcade-clutter-a': { w: 420, h: 60, kind: 'bump', side: 'front', base: 32, depth: 28, ease: 'both', square: 2, wobble: 0.16 },
  'edge-arcade-clutter-b': { w: 520, h: 60, kind: 'bump', side: 'front', base: 32, depth: 22, ease: 'both', square: 2, wobble: 0.2 },
  'edge-arcade-corner-front': { w: 140, h: 92, kind: 'bump', side: 'front', base: 64, depth: 60, ease: 'left', square: 2, wobble: 0.06 },
  // Seen from the side, on every platform drawn from the kit: down its sides (repeats down; the right side is the left mirrored) and under it (repeats across).
  'edge-ledge-side': { w: 40, h: 240, kind: 'side' },
  'edge-ledge-under': { w: 240, h: 44, kind: 'under' },
};

/** A piece placed in a room: the left of its box and, but for a bump (whose box stands on its edge's line), its top. */
export interface EdgePlacement {
  id: string;
  key: string;
  /** The left of its box (room px). */
  x: number;
  /** A bump: the y of the floor's straight edge it eats into. Anything else: the top of its box. */
  y: number;
  flip?: true;
}

/** Where a placed piece is drawn (room px) and how deep (`litter` under the edge pieces, all under the floor's edge line). */
export interface EdgeDraw {
  id: string;
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  flip: boolean;
  kind: EdgeKind;
}

export function edgeArt(key: string): EdgeArt {
  const a = EDGE_ART[key];
  if (!a) throw new Error(`${key} is not an edge piece (EDGE_ART)`);
  return a;
}

/** Where each placed piece's box is in the room. */
export function edgeDraws(pieces: readonly EdgePlacement[]): EdgeDraw[] {
  return pieces.map((p) => {
    const a = edgeArt(p.key);
    const top = a.kind === 'bump' ? p.y - (a.base ?? 0) : p.y;
    return { id: p.id, key: p.key, x: p.x, y: top, w: a.w, h: a.h, flip: !!p.flip, kind: a.kind };
  });
}

/** A small seeded random (mulberry32) from a key, so a profile is the same for its key on every page and in the room server. */
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

/**
 * A bump's profile in its own box: how far it eats into the floor at each sample across it, left to
 * right (unflipped), as points {x across the box, d into the floor}. Whole pixels, its ends' depth 0
 * but at a corner's deep end.
 */
export function bumpProfile(key: string): Array<{ x: number; d: number }> {
  const a = edgeArt(key);
  if (a.kind !== 'bump') return [];
  const depth = a.depth ?? 0;
  const p = a.square ?? 2;
  const rnd = seeded(key);
  const k1 = 1 + Math.floor(rnd() * 2);
  const k2 = 3 + Math.floor(rnd() * 3);
  const f1 = rnd() * Math.PI * 2;
  const f2 = rnd() * Math.PI * 2;
  const wob = a.wobble ?? 0;
  // Few points: the floor is tested against on every step an owl takes, here and in the room server.
  const n = Math.max(4, Math.round(a.w / 80));
  const out: Array<{ x: number; d: number }> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // The envelope: a superellipse across the box (a bulge), or a quarter of one deepest at an end (a corner).
    const u = a.ease === 'left' ? t : a.ease === 'right' ? 1 - t : Math.abs(2 * t - 1);
    const env = Math.max(0, 1 - u ** p) ** (1 / p);
    const w = 1 + wob * (0.65 * Math.sin(2 * Math.PI * k1 * t + f1) + 0.35 * Math.sin(2 * Math.PI * k2 * t + f2));
    out.push({ x: Math.round(t * a.w), d: Math.round(depth * env * Math.max(0, w)) });
  }
  return out;
}

/** A placed bump's edge in room px, west to east: the points of the floor's edge along it. */
export function bumpEdge(piece: EdgePlacement): Vec2[] {
  const a = edgeArt(piece.key);
  const sign = a.side === 'front' ? -1 : 1;
  const prof = bumpProfile(piece.key);
  const pts = prof.map((q) => ({ x: piece.x + (piece.flip ? a.w - q.x : q.x), y: piece.y + sign * q.d }));
  return pts.sort((m, n) => m.x - n.x);
}

/**
 * The floor's edge from x0 to x1 along y, west to east, with the bumps placed on it (on this edge's
 * line, inside x0..x1, not overlapping) eating into it. Points where the line runs plain are only
 * its ends and each bump's; a bump that ends deep (a corner at x0 or x1) starts or ends the edge there.
 */
export function shapedEdge(x0: number, x1: number, y: number, bumps: readonly EdgePlacement[]): Vec2[] {
  const mine = bumps.filter((b) => b.y === y).sort((m, n) => m.x - n.x);
  const out: Vec2[] = [];
  const push = (p: Vec2) => {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) return;
    out.push(p);
  };
  for (const b of mine) {
    const edge = bumpEdge(b);
    const first = edge[0]!;
    const last = edge[edge.length - 1]!;
    if (first.x < x0 || last.x > x1) throw new Error(`${b.id} runs past its edge (${x0} to ${x1})`);
    const prev = out[out.length - 1];
    if (prev && first.x < prev.x) throw new Error(`${b.id} overlaps the piece before it`);
    if (!out.length && first.x > x0) push({ x: x0, y });
    if (out.length && first.y !== y) push({ x: first.x, y });
    for (const p of edge) push(p);
    if (last.y !== y && last.x < x1) push({ x: last.x, y });
  }
  if (!out.length) push({ x: x0, y });
  const end = out[out.length - 1]!;
  if (end.x < x1) push({ x: x1, y });
  return out;
}

/**
 * A floor that was the box x0..x1 by back..front, its back and front edges shaped by their bumps:
 * the back edge west to east, then the front edge east to west. A deep-ended bump at a corner bends
 * the side wall's line in (the west side runs from the back edge's first point to the front's last).
 */
export function shapedFloor(x0: number, x1: number, back: number, front: number, bumps: readonly EdgePlacement[]): Polygon {
  const isBump = (b: EdgePlacement) => edgeArt(b.key).kind === 'bump';
  const backEdge = shapedEdge(x0, x1, back, bumps.filter((b) => isBump(b) && edgeArt(b.key).side === 'back'));
  const frontEdge = shapedEdge(x0, x1, front, bumps.filter((b) => isBump(b) && edgeArt(b.key).side === 'front'));
  return [...backEdge, ...frontEdge.reverse()];
}

// ---------- platforms seen from the side ----------

/** A strip drawn repeated over a platform's edge: down its side (`y`) or along under it (`x`). */
export interface EdgeStrip {
  id: string;
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tile: 'x' | 'y';
  flip: boolean;
}

/**
 * How far a side strip reaches out past its platform's side (none: its wandering edge eats into the
 * body, so the side never looks further out than an owl bumps into it), and how far an under strip's
 * roots hang below the platform's foot (room px).
 */
export const STRIP_OUT = { side: 0, under: 20 } as const;

/**
 * The strips that soften one of a kit room's platform bodies seen from the side (the textured block
 * under a path, a ledge or a hill: a kit draw of a texture): shade and creepers down each side that
 * stands inside the room, and roots and drips under a body that hangs clear of the room's foot. They
 * lie over the body's own edges (only the roots hang a little below a foot), behind everything an owl meets
 * (the caps it stands on are drawn over them), so nothing an owl stands on or must see moves or hides:
 * the top edge, where an owl lands, is left alone.
 */
export function kitFrames(
  d: Pick<KitDraw, 'key' | 'x' | 'y' | 'w' | 'h' | 'role' | 'id'>,
  room: { w: number; h: number },
  plan: readonly Pick<KitDraw, 'x' | 'y' | 'w' | 'role' | 'id'>[] = [],
): EdgeStrip[] {
  if (d.role !== 'path' && d.role !== 'ledge' && d.role !== 'hill') return [];
  if (KIT_ART[d.key]?.kind !== 'texture' || d.h < 48 || d.w < 96) return [];
  const side = EDGE_ART['edge-ledge-side']!;
  const under = EDGE_ART['edge-ledge-under']!;
  const out: EdgeStrip[] = [];
  const foot = d.y + d.h;
  // A body that stands on another (a tower on the ground) meets that one's cap: its sides stop above
  // the cap's art, and no roots hang from its foot, which is that one's walking line.
  const standsOn = plan.some((o) => o.id !== d.id && (o.role === 'path' || o.role === 'ledge' || o.role === 'hill') && o.x < d.x + d.w && o.x + o.w > d.x && o.y > foot - 60 && o.y < foot + STRIP_OUT.under + 4);
  const bottom = standsOn ? foot - 60 : foot;
  // Down from just under the cap's walking line, so the cap's own art stays the edge an owl lands on.
  const top = d.y + 12;
  if (bottom - top >= 40) {
    if (d.x > 2) out.push({ id: `${d.id}:left`, key: 'edge-ledge-side', x: d.x - STRIP_OUT.side, y: top, w: side.w, h: bottom - top, tile: 'y', flip: false });
    if (d.x + d.w < room.w - 2) out.push({ id: `${d.id}:right`, key: 'edge-ledge-side', x: d.x + d.w + STRIP_OUT.side - side.w, y: top, w: side.w, h: bottom - top, tile: 'y', flip: true });
  }
  if (foot < room.h - 4 && !standsOn) out.push({ id: `${d.id}:under`, key: 'edge-ledge-under', x: d.x + 6, y: foot + STRIP_OUT.under - under.h, w: d.w - 12, h: under.h, tile: 'x', flip: false });
  return out;
}

// ---------- placeholders ----------

const P = KIT_PALETTE;

const poly = (pts: Vec2[], c: number, a?: number): KitOp => ({ op: 'poly', pts: pts.flatMap((p) => [p.x, p.y]), c, ...(a === undefined ? {} : { a }) });
const ell = (x: number, y: number, rx: number, ry: number, c: number, a?: number): KitOp => ({ op: 'ellipse', x, y, rx, ry, c, ...(a === undefined ? {} : { a }) });
const line = (x0: number, y0: number, x1: number, y1: number, width: number, c: number, a?: number): KitOp => ({ op: 'line', x0, y0, x1, y1, width, c, ...(a === undefined ? {} : { a }) });

/** A back bump: bark and roots from the box's top down to its profile, with moss along the floor's edge. */
function backBumpOps(key: string, a: EdgeArt): KitOp[] {
  const base = a.base ?? 0;
  const prof = bumpProfile(key);
  const rnd = seeded(`${key}:paint`);
  const edge = prof.map((q) => ({ x: q.x, y: base + q.d }));
  // The wall's foot runs into the roots: a ragged top so the box never shows a straight line.
  const top: Vec2[] = [];
  const n = Math.max(4, Math.round(a.w / 40));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const shoulder = Math.min(1, 4 * t * (1 - t) * 1.6);
    top.push({ x: Math.round(t * a.w), y: Math.round(base - shoulder * (base * (0.35 + rnd() * 0.5))) });
  }
  const body = [...top, ...edge.slice().reverse()];
  const ops: KitOp[] = [poly(body, P.barkDark), poly(body.map((p) => ({ x: p.x, y: p.y - 6 })).slice(0, top.length).concat(edge.slice().reverse().map((p) => ({ x: p.x, y: p.y - 10 }))), P.bark)];
  // Roots: a few curved strokes from the top down towards the edge.
  const roots = Math.max(2, Math.round(a.w / 70));
  for (let i = 0; i < roots; i++) {
    const x = Math.round(((i + 0.5) / roots) * a.w + (rnd() - 0.5) * 20);
    const q = prof.reduce((m, v) => (Math.abs(v.x - x) < Math.abs(m.x - x) ? v : m), prof[0]!);
    const y1 = base + q.d - 12;
    if (y1 < base * 0.5) continue;
    const bend = (rnd() - 0.5) * 30;
    ops.push(line(x, Math.round(base * 0.4), Math.round(x + bend / 2), Math.round((base * 0.4 + y1) / 2), 9, P.woodDark));
    ops.push(line(Math.round(x + bend / 2), Math.round((base * 0.4 + y1) / 2), Math.round(x + bend), y1, 7, P.woodDark));
  }
  // Moss along the edge, so the line the owl stops at reads soft, not cut.
  for (let i = 1; i < edge.length - 1; i++) {
    const p = edge[i]!;
    if (p.y - base < 8) continue;
    ops.push(ell(p.x, p.y - 5, 10 + Math.round(rnd() * 8), 6, i % 3 ? P.moss : P.mossLight));
  }
  return ops;
}

/** A front bump: fern fronds and a dark lip from its profile down to the box's foot. */
function frontBumpOps(key: string, a: EdgeArt): KitOp[] {
  const base = a.base ?? 0;
  const prof = bumpProfile(key);
  const rnd = seeded(`${key}:paint`);
  const edge = prof.map((q) => ({ x: q.x, y: base - q.d }));
  const body = [...edge, { x: a.w, y: a.h }, { x: 0, y: a.h }];
  const ops: KitOp[] = [poly(body, P.navyDeep, 0.92), poly(edge.map((p) => ({ x: p.x, y: p.y + 6 })).concat([{ x: a.w, y: a.h }, { x: 0, y: a.h }]), P.moss)];
  // Fronds leaning in from the front, their tips on the profile.
  for (let i = 1; i < edge.length - 1; i++) {
    const p = edge[i]!;
    const lean = (rnd() - 0.5) * 24;
    ops.push(line(Math.round(p.x + lean), a.h, p.x, p.y + 4, 6, i % 2 ? P.leaf : P.mossLight));
    ops.push(ell(p.x, p.y + 8, 9, 5, i % 2 ? P.leafLight : P.leaf));
  }
  return ops;
}

/** A bark pillar: a column with a flared foot and a darker edge each side. */
function pillarOps(a: EdgeArt): KitOp[] {
  const { w, h } = a;
  const flare = 26;
  return [
    poly([{ x: 14, y: 0 }, { x: w - 14, y: 0 }, { x: w - 10, y: h - 120 }, { x: w, y: h }, { x: 0, y: h }, { x: 10, y: h - 120 }], P.barkDark),
    poly([{ x: 26, y: 0 }, { x: w - 26, y: 0 }, { x: w - 24, y: h - 110 }, { x: w - flare, y: h - 8 }, { x: flare, y: h - 8 }, { x: 24, y: h - 110 }], P.bark),
    line(w / 2 - 12, 20, w / 2 - 16, h - 60, 6, P.woodDark),
    line(w / 2 + 14, 60, w / 2 + 18, h - 40, 5, P.woodDark),
    ell(w / 2, h * 0.35, 12, 18, P.barkDark),
    ell(w / 2 + 20, h * 0.7, 18, 8, P.moss),
  ];
}

/** Leaf litter: leaves scattered thick in the middle and thin at the sides, so two floors blend. */
function litterOps(key: string, a: EdgeArt): KitOp[] {
  const rnd = seeded(`${key}:paint`);
  const ops: KitOp[] = [];
  const colours = [P.moss, P.mossLight, P.leaf, P.bark, P.gold];
  for (let i = 0; i < 140; i++) {
    // Thick in the middle: two randoms averaged lean to the centre.
    const x = Math.round(((rnd() + rnd() + rnd()) / 3) * a.w);
    const y = Math.round(rnd() * a.h);
    const r = 6 + Math.round(rnd() * 9);
    const fade = 1 - Math.abs(x / a.w - 0.5) * 1.6;
    ops.push(ell(x, y, r, Math.max(3, Math.round(r * 0.55)), colours[Math.floor(rnd() * colours.length)]!, Math.max(0.25, Math.min(0.9, fade))));
  }
  return ops;
}

/** A plaza's ring: a worn, paler band of moss round a mossy middle, set with flat stones, flat on the floor. */
function ringOps(key: string, a: EdgeArt): KitOp[] {
  const rnd = seeded(`${key}:paint`);
  const cx = a.w / 2;
  const cy = a.h / 2;
  const ops: KitOp[] = [ell(cx, cy, cx - 4, cy - 4, P.mossLight, 0.28), ell(cx, cy, cx * 0.74, cy * 0.74, P.moss, 0.4), ell(cx, cy, cx * 0.5, cy * 0.5, P.mossLight, 0.22)];
  const n = 22;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + rnd() * 0.12;
    const r = 0.87 + rnd() * 0.06;
    ops.push(ell(Math.round(cx + Math.cos(t) * cx * r), Math.round(cy + Math.sin(t) * cy * r), 14 + Math.round(rnd() * 8), 8 + Math.round(rnd() * 4), i % 4 ? P.wood : P.woodDark, 0.75));
  }
  return ops;
}

/** The rim: a dark ragged band of bark with leaves hanging from it, its lower edge never straight. */
function rimOps(key: string, a: EdgeArt): KitOp[] {
  const rnd = seeded(`${key}:paint`);
  const lower: Vec2[] = [];
  const n = Math.round(a.w / 40);
  for (let i = 0; i <= n; i++) lower.push({ x: Math.round((i / n) * a.w), y: Math.round(a.h * (0.28 + rnd() * 0.32)) });
  const ops: KitOp[] = [poly([{ x: 0, y: 0 }, { x: a.w, y: 0 }, ...lower.slice().reverse()], P.barkDark)];
  ops.push(poly([{ x: 0, y: 0 }, { x: a.w, y: 0 }, ...lower.slice().reverse().map((p) => ({ x: p.x, y: Math.round(p.y * 0.55) }))], P.navyDeep));
  // Leaves and vines hanging from it.
  for (let i = 0; i < Math.round(a.w / 55); i++) {
    const x = Math.round(rnd() * a.w);
    const at = lower[Math.min(lower.length - 1, Math.round((x / a.w) * n))]!;
    const len = 12 + Math.round(rnd() * (a.h - at.y - 14));
    ops.push(line(x, at.y - 4, x + Math.round((rnd() - 0.5) * 10), at.y + len, 4, P.moss));
    ops.push(ell(x, at.y + len, 9, 6, rnd() < 0.5 ? P.leaf : P.mossLight));
  }
  return ops;
}

/** A platform's side: shade deepening to its outer edge, which wanders, with creepers down it. Repeats down with no seam. */
function sideOps(key: string, a: EdgeArt): KitOp[] {
  const rnd = seeded(`${key}:paint`);
  const { w, h } = a;
  const out = STRIP_OUT.side;
  const ops: KitOp[] = [];
  // The shade: bands from the inner edge (faint) to the outer (dark).
  for (let i = 0; i < 4; i++) ops.push({ op: 'rect', x: 8 + i * 6, y: 0, w: w - 8 - i * 6, h, c: P.navyDeep, a: 0.12 } as KitOp);
  // The outer edge wanders: blobs along it, the same at the strip's top and foot so it repeats down.
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const y = Math.round((i / n) * h);
    const r = i === 0 || i === n ? 9 : 6 + Math.round(rnd() * 8);
    ops.push(ell(out - 2, y, r, r + 6, P.navyDeep, 0.85));
    if (i % 2) ops.push(ell(out + 4, y, 5, 10, rnd() < 0.5 ? P.moss : P.leaf, 0.9));
  }
  ops.push(line(out + 6, 0, out + 2, h, 3, P.moss, 0.8));
  return ops;
}

/** Under a platform: a dark lip, roots and drips hanging from it, ragged along its foot. Repeats across with no seam. */
function underOps(key: string, a: EdgeArt): KitOp[] {
  const rnd = seeded(`${key}:paint`);
  const { w, h } = a;
  const lip = h - STRIP_OUT.under;
  const ops: KitOp[] = [{ op: 'rect', x: 0, y: 0, w, h: lip, c: P.navyDeep, a: 0.35 } as KitOp, { op: 'rect', x: 0, y: lip - 4, w, h: 6, c: P.navyDeep, a: 0.7 } as KitOp];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const x = Math.round(((i + 0.5) / n) * w);
    const len = 6 + Math.round(rnd() * (STRIP_OUT.under - 6));
    ops.push(line(x, lip - 2, x + Math.round((rnd() - 0.5) * 8), lip + len, 4, i % 3 ? P.barkDark : P.moss, 0.9));
    ops.push(ell(x, lip + 1, 10, 5, P.navyDeep, 0.8));
  }
  return ops;
}

/** An edge piece's placeholder: plain shapes in the tree's palette, where its art will be. Null for a key that is not one. */
export function edgePlaceholder(key: string): KitOp[] | null {
  const a = EDGE_ART[key];
  if (!a) return null;
  switch (a.kind) {
    case 'bump':
      return a.side === 'front' ? frontBumpOps(key, a) : backBumpOps(key, a);
    case 'wall':
      return pillarOps(a);
    case 'litter':
      return litterOps(key, a);
    case 'ring':
      return ringOps(key, a);
    case 'rim':
      return rimOps(key, a);
    case 'side':
      return sideOps(key, a);
    case 'under':
      return underOps(key, a);
  }
}
