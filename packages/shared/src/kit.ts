/**
 * The level assembler's rules (OP-234): how a room built from the art kit (RoomDef.kit) is drawn and
 * what it must hold to. The park draws `kitDrawPlan` with Phaser (apps/park/src/game/kitView.ts), the
 * greybox tool rasterizes the same plan (tools/kit/greybox.mjs), and the tests hold every kit room to
 * the barrier rule (`kitProblems`). Everything here is pure: room data in, pieces out.
 *
 * - A surface is a rectangle filled with a seamless texture, repeated from the room's origin, so two
 *   surfaces of one texture side by side read as one.
 * - A path or a ledge is a run from x0 to x1 at a height, drawn from the published kit's run pieces
 *   (OP-241): its left end, its middle repeated across in whole copies and its right end, each with
 *   its art's measured top edge at the walking line; a texture under it and a trim along its front.
 *   A run of the recut kit (OP-251) names its row instead: the row's caps, and its middles of three
 *   lengths laid in a seeded order around any joins set into it (a transition, a corner).
 * - A column (OP-251) is a piece repeated down at the column's width, art to art, with a head and a
 *   foot at the same scale: a trunk with its taper and its flare.
 *   A ledge is the room's perch of the same id (kitPerches); a stair draws its ledges as treads.
 * - A doorway's piece stands centred on its trigger, the foot of its art (as measured) at the
 *   doorway's height; a barrier or a prop stands on its height the same way, a decal where placed.
 * - The backdrops are the room's tiles (kitRoom), so their parallax and fades are a painted room's.
 */
import { pointInPolygon, pointInRect } from './geometry';
import { KIT_ART, kitGroup, type KitArtSpec, type KitTile } from './kitArt';
import { SLOPE_GENTLE, SLOPE_STEEP, profileProblems, type Perch, type ProfilePoint } from './perches';
import { ROOM_H, ROOM_W, mapOf, type KitBackdrop, type KitColumn, type KitHill, type KitHillStep, type KitRun, type RoomDef, type RoomKit, type RoomTile } from './room';
import { perchTiers } from './routes';

/** How deep a ledge's mid is drawn when the ledge does not say (room px). */
export const KIT_LEDGE_DEPTH = 36;
/** Half the depth of a perch's strip on the floor plan, as the tree's ledges have it. */
export const KIT_STRIP = 4;
/** How far past the end of where an owl walks a drawn path may run before it must end at a barrier or a doorway (room px). */
export const KIT_PATH_SLACK = 16;
/** How near the end of a walk a barrier (or a doorway) must stand to close it (room px). */
export const KIT_BARRIER_REACH = 48;
/** The widest a scene's group may run, its props' art and what it is about (room px): wider is a row, not a scene. */
export const KIT_SCENE_SPAN = 720;
/** The least room left between two scenes' groups (room px), so each reads as its own. */
export const KIT_SCENE_GAP = 40;
/** The longest a scene's one-line story may be. */
export const KIT_STORY_MAX = 140;

/** Where a kit room draws a piece, from back to front (the park's depths, kitView.ts). */
export type KitLayer = 'back' | 'play' | 'piece' | 'front';

/** One piece as the room draws it: its art, its box in room pixels and how it fills that box. */
export interface KitDraw {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * `none`: the piece drawn to its box. `xy` (a texture): repeated at its own size from the room's
   * origin, so neighbours line up. `x` or `y`: whole copies fitted along the box (kitCells).
   */
  tile: KitTile;
  layer: KitLayer;
  flip?: boolean;
  alpha?: number;
  /** What it is drawn for, and that thing's id (the greybox shades by it, the tests count by it). */
  role: 'surface' | 'path' | 'ledge' | 'hill' | 'stair' | 'door' | 'barrier' | 'prop' | 'decal';
  id: string;
}

/** One image of a drawn piece: where it stands (room px, at the piece's own size) and the part of the piece it shows (piece px). */
export interface KitCell {
  x: number;
  y: number;
  w: number;
  h: number;
  crop: { x: number; y: number; w: number; h: number };
}

/** The ledges of a kit room as perches: each one stood on, a strip of the floor plan along the ground line; and its hills (OP-238) as sloped perches. */
export function kitPerches(kit: RoomKit): Perch[] {
  const strip = (x0: number, x1: number) => [
    { x: x0, y: kit.ground - KIT_STRIP },
    { x: x1, y: kit.ground - KIT_STRIP },
    { x: x1, y: kit.ground + KIT_STRIP },
    { x: x0, y: kit.ground + KIT_STRIP },
  ];
  const ledges = (kit.ledges ?? [])
    .filter((l) => l.perch !== false)
    .map((l): Perch => ({ id: l.id, top: l.top, area: strip(l.x0, l.x1), ...(l.solid ? { solid: true } : {}) }));
  const hills = (kit.hills ?? []).map((h): Perch => {
    const profile = kitHillProfile(h);
    return { id: h.id, top: Math.max(...profile.map((p) => p.top)), area: strip(profile[0]!.x, profile.at(-1)!.x), profile, ...(h.solid ? { solid: true } : {}) };
  });
  return [...ledges, ...hills];
}

/** How far a hill piece's art may be stretched up or down to lie on its slope (OP-238): past this it is the wrong piece for the angle. */
export const KIT_HILL_STRETCH: readonly [number, number] = [0.65, 1.45];

/**
 * How far along a hill piece lies (room px, OP-238): every slope, crest and dip piece's art is laid
 * this wide, so a gentle step rises 80, a steep one 160 and a crest or dip 40, and hills meet the
 * ledges and paths of the kit's heights.
 */
export const KIT_HILL_STEP = 320;

/** A hill piece's own numbers: its art's width, and its upper edge's row at the art's two ends and middle (its own px). */
function hillArt(key: string): { w: number; left: number; l: number; m: number; r: number } | null {
  const s = KIT_ART[key];
  if (!s?.surface) return null;
  const span = artSpan(s);
  const [l, m, r] = s.surface;
  // Measured an eighth in from each end (tools/kit/measure.py): a slope's line carried on to its ends.
  const slope = /-slope-/.test(key) ? (l - r) / 6 : 0;
  return { w: span.w, left: span.left, l: l + slope, m, r: r - slope };
}

/** A hill step's rise over its art's width: up (positive) or down, and for a crest or dip its middle's. */
function hillRise(step: KitHillStep, w: number): { end: number; mid?: number } {
  // Whole px, so a hill's ends meet a path or ledge at a whole height; within the slope rules' slack.
  if (step === 'crest') return { end: 0, mid: Math.round(w / 2 / SLOPE_GENTLE) };
  if (step === 'dip') return { end: 0, mid: -Math.round(w / 2 / SLOPE_GENTLE) };
  const r = Math.round(w / (step.startsWith('slope-gentle') ? SLOPE_GENTLE : SLOPE_STEEP));
  return { end: step.endsWith('-up') ? r : -r };
}

/** A hill's profile (OP-238): its height at each piece's ends, and at a crest's or dip's middle, left to right. */
export function kitHillProfile(hill: KitHill): ProfilePoint[] {
  const out: ProfilePoint[] = [{ x: hill.x0, top: hill.top0 }];
  let x = hill.x0;
  let top = hill.top0;
  for (const step of hill.steps) {
    const w = KIT_HILL_STEP;
    const rise = hillRise(step, w);
    if (rise.mid !== undefined) out.push({ x: x + w / 2, top: top + rise.mid });
    x += w;
    top += rise.end;
    out.push({ x, top });
  }
  return out;
}

/** How much a hill piece's art is stretched up or down to lie on its step (1 for art that already does); null for a piece with no measured edge. */
export function kitHillStretch(key: string, step: KitHillStep): number | null {
  const a = hillArt(key);
  if (!a) return null;
  const rise = hillRise(step, KIT_HILL_STEP);
  const drawn = rise.mid !== undefined ? Math.abs((a.l + a.r) / 2 - a.m) : Math.abs(a.l - a.r);
  const want = Math.abs(rise.mid ?? rise.end);
  return drawn > 0 ? want / drawn : null;
}

/**
 * What is wrong with a kit room's hill (OP-238), as sentences: a piece with no measured art, art that
 * must be stretched past KIT_HILL_STRETCH to lie on its angle (the angle is not one of the two, or the
 * piece is the wrong one), a crest or dip whose ends are not level, a profile that breaks the slope
 * rules, the room's perch not standing on it, and an end in mid-air: a raised end meets a path or
 * ledge at its height, or a barrier.
 */
export function kitHillProblems(room: Pick<RoomDef, 'kit' | 'perches'>, hill: KitHill): string[] {
  const out: string[] = [];
  for (const step of hill.steps) {
    const key = `kit-${hill.material}-${step}`;
    const k = kitHillStretch(key, step);
    if (k === null) {
      out.push(`hill ${hill.id}'s ${key} has no measured edge (tools/kit/measure.py)`);
      continue;
    }
    if (k < KIT_HILL_STRETCH[0] || k > KIT_HILL_STRETCH[1]) out.push(`hill ${hill.id}'s ${key} would be stretched ${k.toFixed(2)} to lie on its slope: not a ${step} piece`);
    const a = hillArt(key)!;
    if ((step === 'crest' || step === 'dip') && Math.abs(a.l - a.r) > 8) out.push(`hill ${hill.id}'s ${key} has ends ${Math.abs(a.l - a.r)} px apart: a ${step} joins level`);
  }
  const profile = kitHillProfile(hill);
  const perch = (room.perches ?? []).find((p) => p.id === hill.id);
  if (!perch?.profile) out.push(`hill ${hill.id} has no sloped perch ${hill.id} (kitPerches)`);
  else {
    out.push(...profileProblems(perch));
    const off = profile.some((p, i) => !perch.profile![i] || Math.abs(perch.profile![i]!.x - p.x) > 0.5 || Math.abs(perch.profile![i]!.top - p.top) > 0.5);
    if (off || perch.profile.length !== profile.length) out.push(`hill ${hill.id}'s perch is not on its profile`);
  }
  const kit = room.kit;
  const meets = (x: number, top: number) =>
    Math.abs(top) <= 0.5 ||
    [...(kit?.paths ?? []), ...(kit?.ledges ?? [])].some((r) => Math.abs(r.top - top) <= 0.5 && r.x0 - KIT_PATH_SLACK <= x && x <= r.x1 + KIT_PATH_SLACK) ||
    (kit?.barriers ?? []).some((b) => Math.abs(b.top - top) <= 0.5 && b.x0 - KIT_BARRIER_REACH <= x && x <= b.x1 + KIT_BARRIER_REACH);
  const first = profile[0]!;
  const last = profile.at(-1)!;
  if (!meets(first.x, first.top)) out.push(`hill ${hill.id} begins in mid-air at x ${first.x}, ${first.top} high: no path, ledge or barrier there`);
  if (!meets(last.x, last.top)) out.push(`hill ${hill.id} ends in mid-air at x ${Math.round(last.x)}, ${Math.round(last.top)} high: no path, ledge or barrier there`);
  return out;
}

/** A hill's pieces: each KIT_HILL_STEP along, stretched up or down so its upper edge lies on the profile, its feet KIT_STAND_SINK into it; its mid texture under it. */
function hillDraws(hill: KitHill, ground: number, roomH: number, out: KitDraw[]): void {
  const profile = kitHillProfile(hill);
  if (hill.mid) {
    const low = Math.min(...profile.map((p) => p.top));
    const x0 = profile[0]!.x;
    const x1 = profile.at(-1)!.x;
    out.push({ key: hill.mid, x: x0, y: ground - low + KIT_STAND_SINK, w: x1 - x0, h: roomH - (ground - low), tile: sizeOf(hill.mid).tile, layer: 'play', role: 'hill', id: hill.id });
  }
  let x = hill.x0;
  let top = hill.top0;
  for (const step of hill.steps) {
    const key = `kit-${hill.material}-${step}`;
    const s = sizeOf(key);
    const a = hillArt(key);
    const k = kitHillStretch(key, step) ?? 1;
    // Its art spans the step, stretched across to it, and up or down to lie on its slope.
    const kx = KIT_HILL_STEP / (a?.w ?? KIT_HILL_STEP);
    out.push({ key, x: Math.round(x - (a?.left ?? 0) * kx), y: Math.round(ground - top - ((a?.l ?? 0) + KIT_STAND_SINK) * k), w: Math.round(s.w * kx), h: Math.round(s.h * k), tile: 'none', layer: 'play', role: 'hill', id: hill.id });
    x += KIT_HILL_STEP;
    top += hillRise(step, KIT_HILL_STEP).end;
  }
}

/** A kit's backdrops as the room's tiles: one per screen each (each row of screens, in a tall room), those behind the owls and those in front. */
export function kitTiles(kit: RoomKit): { backgrounds: RoomTile[]; foregrounds: RoomTile[] } {
  const tiles = (list: KitBackdrop[]) =>
    list.flatMap((b) => {
      const out: RoomTile[] = [];
      const [r0, r1] = b.rows ?? [0, 0];
      for (let r = r0; r <= r1; r++)
        for (let s = b.screens[0]; s <= b.screens[1]; s++) out.push({ key: b.key, x: s * ROOM_W, y: r * ROOM_H, ...(b.rate === 1 ? {} : { rate: b.rate }), ...(b.fade ? { fade: b.fade } : {}) });
      return out;
    });
  const all = kit.backdrops ?? [];
  return { backgrounds: tiles(all.filter((b) => !b.front)), foregrounds: tiles(all.filter((b) => b.front)) };
}

/** A room drawn from its kit: its backdrops become its tiles (its `background` the first of them), the rest of it as given. */
export function kitRoom(def: Omit<RoomDef, 'background' | 'backgrounds' | 'foregrounds' | 'foreground' | 'kit'> & { kit: RoomKit }): RoomDef {
  const { backgrounds, foregrounds } = kitTiles(def.kit);
  return { ...def, background: backgrounds[0]?.key ?? 'kit-ground-sky-a', backgrounds, ...(foregrounds.length ? { foregrounds } : {}) };
}

/** A piece's catalogue entry (a key outside the catalogue counts as 64 square, its art filling its box). */
function sizeOf(key: string): KitArtSpec {
  return KIT_ART[key] ?? { w: 64, h: 64, tile: 'none', kind: 'piece' };
}

/** Where a piece's art begins and ends down its box (its own px): as measured, or its whole box. */
function artBand(s: KitArtSpec): { top: number; foot: number } {
  return { top: s.top ?? 0, foot: s.foot ?? s.h };
}

/** Where a piece's art begins and ends across its box (its own px): as measured, or its whole box. */
function artSpan(s: KitArtSpec): { left: number; right: number; w: number } {
  const left = s.left ?? 0;
  const right = s.right ?? s.w;
  return { left, right, w: Math.max(1, right - left) };
}

/**
 * How far into a run piece's art, below its upper edge, an owl's feet stand (its own px): the kit's
 * platforms are seen a little from above, so the walking line is a step into the top face, not on
 * its back edge.
 */
export const KIT_STAND_SINK = 10;

/**
 * A run's pieces: the texture under it, its ends and the cap between them (each piece's top edge at
 * the run's height, KIT_STAND_SINK above the walking line), the trim at the cap's foot, and the slopes
 * outside its ends.
 */
function runDraws(given: KitRun, ground: number, depth: number, role: 'path' | 'ledge', out: KitDraw[]): void {
  const run = withRow(given);
  const walk = ground - run.top;
  // A piece whose art spans x0 to x1 at scale k (one copy, its box wider by its margins), or repeated
  // across x0 to x1 at its own size; its top KIT_STAND_SINK over the walk either way.
  const at = (key: string, x0: number, x1: number, k: number, opts: { repeats?: boolean; flip?: boolean } = {}): KitDraw => {
    const s = sizeOf(key);
    const span = artSpan(s);
    const repeats = !!opts.repeats;
    const flip = !!opts.flip;
    return {
      key,
      ...(repeats ? { x: x0, w: x1 - x0 } : { x: Math.round(x0 - (flip ? s.w - span.right : span.left) * k), w: Math.round(s.w * k) }),
      y: Math.round(walk - (artBand(s).top + KIT_STAND_SINK) * k),
      h: Math.round(s.h * k),
      tile: repeats ? 'x' : 'none',
      layer: 'play',
      ...(flip ? { flip: true } : {}),
      role,
      id: run.id,
    };
  };
  if (run.mid) out.push({ key: run.mid, x: run.x0, y: walk, w: run.x1 - run.x0, h: depth, tile: sizeOf(run.mid).tile, layer: 'play', role, id: run.id });
  const lw = run.left ? artSpan(sizeOf(run.left)).w : 0;
  const rw = run.right ? artSpan(sizeOf(run.right)).w : 0;
  const pieces: KitDraw[] = [];
  const mids = run.mids?.filter((m) => KIT_ART[m]) ?? [];
  if (mids.length) {
    // The middles of several lengths, art to art, around the joins set into the run.
    const joins = [...(run.joins ?? [])].sort((a, b) => a.x - b.x);
    let from = run.x0 + lw;
    joins.forEach((j, i) => {
      pieces.push(...midFill(mids, from, j.x, `${run.id}:${i}`).map((m) => ({ ...at(m.key, m.x0, m.x1, 1), ...stretched(m.key, m.x0, m.x1) })));
      pieces.push(at(j.piece, j.x, j.x + artSpan(sizeOf(j.piece)).w, 1));
      from = j.x + artSpan(sizeOf(j.piece)).w;
    });
    pieces.push(...midFill(mids, from, run.x1 - rw, `${run.id}:${joins.length}`).map((m) => ({ ...at(m.key, m.x0, m.x1, 1), ...stretched(m.key, m.x0, m.x1) })));
  } else if (run.cap) {
    const c = sizeOf(run.cap);
    const x0 = run.x0 + lw;
    const x1 = run.x1 - rw;
    // A single platform spans the run with its art, scaled to it, and so does a middle piece on a run
    // too short for one whole copy at its own size; a longer run repeats the middle at its own height.
    const single = c.tile === 'none' || (!run.left && !run.right && x1 - x0 < artSpan(c).w * 0.75);
    if (x1 > x0) pieces.push(single ? at(run.cap, run.x0, run.x1, (run.x1 - run.x0) / artSpan(c).w) : at(run.cap, x0, x1, 1, { repeats: true }));
  }
  if (run.left) pieces.push(at(run.left, run.x0, run.x0 + lw, 1));
  // A realm's perch end (OP-275) is painted for the left end and mirrored for the right, once delivered.
  if (run.right) pieces.push(at(run.right, run.x1 - rw, run.x1, 1, { flip: KIT_ART[run.right]?.slot === 'perch-end' && !KIT_ART[run.right]?.standIn }));
  if (run.trim && pieces[0]) {
    const cap = pieces[0];
    const t = sizeOf(run.trim);
    const foot = cap.y + (artBand(sizeOf(cap.key)).foot * cap.h) / sizeOf(cap.key).h;
    out.push({ key: run.trim, x: run.x0, y: Math.round(foot - artBand(t).top - 6), w: run.x1 - run.x0, h: t.h, tile: t.tile, layer: 'play', role, id: run.id });
  }
  out.push(...pieces);
  if (run.slope) {
    const s = artSpan(sizeOf(run.slope));
    out.push(at(run.slope, run.x0 - s.w, run.x0, 1));
    out.push(at(run.slope, run.x1, run.x1 + s.w, 1, { flip: true }));
  }
}

/** The lengths of a recut row's middle pieces (OP-251): `<row>-mid-<length>`. */
export const KIT_ROW_LENGTHS = [320, 480, 640] as const;

/** A run with its row (OP-251) spelled out: the row's caps and middles wherever the run names none of its own. */
export function withRow(run: KitRun): KitRun {
  if (!run.row) return run;
  const has = (k: string) => Object.hasOwn(KIT_ART, k);
  const left = run.left ?? (has(`${run.row}-cap-left`) ? `${run.row}-cap-left` : undefined);
  const right = run.right ?? (has(`${run.row}-cap-right`) ? `${run.row}-cap-right` : undefined);
  const mids = run.mids ?? KIT_ROW_LENGTHS.map((l) => `${run.row}-mid-${l}`).filter(has);
  return { ...run, ...(left ? { left } : {}), ...(right ? { right } : {}), mids };
}

/** A small hash of a string, the seed of a run's order of middles: the same run is always laid the same way. */
function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A seeded stream of numbers in [0, 1) (mulberry32). */
function stream(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How far a middle piece may be stretched or squeezed across to fill its stretch of run (1 is its own size). */
export const KIT_MID_STRETCH = { min: 0.85, max: 1.2 } as const;

/**
 * Middle pieces filling x0 to x1, art to art (OP-251): a few seeded orders of the lengths are tried and
 * the one that needs the least stretch kept, never the same piece twice running where another fits;
 * each piece then spans its share of the run, all stretched alike. A stretch too short for the shortest
 * piece takes the shortest, squeezed.
 */
export function midFill(mids: string[], x0: number, x1: number, seed: string): { key: string; x0: number; x1: number }[] {
  const len = x1 - x0;
  if (len <= 0 || !mids.length) return [];
  const widths = mids.map((m) => artSpan(sizeOf(m)).w);
  const shortest = Math.min(...widths);
  const rand = stream(seedOf(seed));
  let best: { order: number[]; k: number } | null = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const order: number[] = [];
    let used = 0;
    while (len - used > shortest * 0.5) {
      const left = len - used;
      const fits = widths.flatMap((w, i) => (w <= left + shortest * 0.25 ? [i] : []));
      const last = order[order.length - 1];
      const fresh = fits.filter((i) => i !== last);
      const pool = fresh.length ? fresh : fits.length ? fits : [widths.indexOf(shortest)];
      const pick = pool[Math.floor(rand() * pool.length)] ?? 0;
      order.push(pick);
      used += widths[pick] ?? shortest;
    }
    if (!order.length) order.push(widths.indexOf(shortest));
    const k = len / order.reduce((t, i) => t + (widths[i] ?? shortest), 0);
    if (!best || Math.abs(Math.log(k)) < Math.abs(Math.log(best.k))) best = { order, k };
  }
  const out: { key: string; x0: number; x1: number }[] = [];
  let x = x0;
  for (const i of best?.order ?? []) {
    const w = (widths[i] ?? shortest) * (best?.k ?? 1);
    out.push({ key: mids[i] ?? mids[0]!, x0: x, x1: x + w });
    x += w;
  }
  return out;
}

/** A piece's box across when its art is stretched (not scaled) to span x0 to x1. */
function stretched(key: string, x0: number, x1: number): { x: number; w: number } {
  const s = sizeOf(key);
  const span = artSpan(s);
  const k = (x1 - x0) / span.w;
  return { x: Math.round(x0 - span.left * k), w: Math.round(s.w * k) };
}

/** A column's pieces (OP-251): its head, its middle repeated down at the column's width, its foot. */
function columnDraws(c: KitColumn, out: KitDraw[]): void {
  const m = sizeOf(c.mid);
  const edgeW = (key?: string) => (key ? artSpan(sizeOf(key)).w : 0);
  const u = (c.x1 - c.x0) / (edgeW(c.left) + artSpan(m).w + edgeW(c.right));
  const box = (key: string) => {
    const s = sizeOf(key);
    const span = artSpan(s);
    const w = Math.round(s.w * u);
    // Centred on the column, so a wider foot spreads both ways.
    return { x: Math.round((c.x0 + c.x1) / 2 - ((span.left + span.right) / 2) * u), w, h: Math.round(s.h * u), s };
  };
  let y0 = c.y0;
  let y1 = c.y1;
  const ends: KitDraw[] = [];
  if (c.head) {
    const b = box(c.head);
    ends.push({ key: c.head, x: b.x, y: Math.round(c.y0 - artBand(b.s).top * u), w: b.w, h: b.h, tile: 'none', layer: 'back', role: 'surface', id: c.id });
    y0 = Math.round(c.y0 + (artBand(b.s).foot - artBand(b.s).top) * u);
  }
  if (c.foot) {
    const b = box(c.foot);
    const y = Math.round(c.y1 - artBand(b.s).foot * u);
    ends.push({ key: c.foot, x: b.x, y, w: b.w, h: b.h, tile: 'none', layer: 'back', role: 'surface', id: c.id });
    y1 = Math.round(y + artBand(b.s).top * u);
  }
  if (y1 > y0) {
    if (c.left || c.right) {
      // Left edge, middle, right edge, art to art across, at one scale (OP-259): each repeated down in the same courses.
      let at = c.x0;
      const keys = [c.left, c.mid, c.right].filter((k): k is string => !!k);
      for (const [i, key] of keys.entries()) {
        const s = sizeOf(key);
        const span = artSpan(s);
        // A pixel wider than the next piece's start, so no hairline of sky shows where two rounded boxes meet.
        const w = Math.round(s.w * u) + (i < keys.length - 1 ? 1 : 0);
        out.push({ key, x: Math.round(at - span.left * u), y: y0, w, h: y1 - y0, tile: 'y', layer: 'back', role: 'surface', id: c.id });
        at += span.w * u;
      }
    } else {
      const b = box(c.mid);
      out.push({ key: c.mid, x: b.x, y: y0, w: b.w, h: y1 - y0, tile: 'y', layer: 'back', role: 'surface', id: c.id });
    }
  }
  out.push(...ends);
}

/** A piece stood with its art's foot at `foot` (room y), centred on x, at scale k. */
function standing(key: string, x: number, foot: number, k = 1): { x: number; y: number; w: number; h: number } {
  const s = sizeOf(key);
  const w = Math.round(s.w * k);
  const h = Math.round(s.h * k);
  return { x: Math.round(x - w / 2), y: Math.round(foot - artBand(s).foot * k), w, h };
}

/** Every piece a kit room draws, back to front (backdrops aside: they are the room's tiles). Empty for a painted room. */
export function kitDrawPlan(room: Pick<RoomDef, 'kit' | 'doors' | 'size'>): KitDraw[] {
  const kit = room.kit;
  if (!kit) return [];
  const out: KitDraw[] = [];
  const g = kit.ground;
  for (const s of kit.surfaces ?? []) out.push({ key: s.texture, ...s.rect, tile: sizeOf(s.texture).tile, layer: 'back', role: 'surface', id: s.id });
  for (const c of kit.columns ?? []) columnDraws(c, out);
  for (const p of kit.paths ?? []) runDraws(p, g, p.depth ?? room.size.h - (g - p.top), 'path', out);
  for (const h of kit.hills ?? []) hillDraws(h, g, room.size.h, out);
  const treads = new Map<string, { stair: string; tread: string | undefined; post: string | undefined }>();
  for (const st of kit.stairs ?? []) for (const id of st.treads) treads.set(id, { stair: st.id, tread: st.tread, post: st.post });
  for (const l of kit.ledges ?? []) {
    const st = treads.get(l.id);
    if (!st) {
      runDraws(l, g, l.depth ?? KIT_LEDGE_DEPTH, 'ledge', out);
      continue;
    }
    // A tread: its post down to the ground from under its middle, then the tread over it.
    const y = g - l.top;
    const tread = st.tread ? sizeOf(st.tread) : null;
    if (st.post && l.top > 0) {
      const p = sizeOf(st.post);
      out.push({ key: st.post, x: Math.round((l.x0 + l.x1) / 2 - p.w / 2), y: y + (tread?.h ?? 0), w: p.w, h: l.top - (tread?.h ?? 0), tile: p.tile, layer: 'play', role: 'stair', id: st.stair });
    }
    if (st.tread && tread) out.push({ key: st.tread, x: l.x0, y, w: l.x1 - l.x0, h: tread.h, tile: tread.tile, layer: 'play', role: 'stair', id: st.stair });
  }
  for (const d of kit.doors ?? []) {
    const door = room.doors.find((x) => x.id === d.door);
    if (!door) continue;
    out.push({ key: d.piece, ...standing(d.piece, door.rect.x + door.rect.w / 2, g - (door.top ?? 0), d.scale), tile: 'none', layer: 'piece', role: 'door', id: d.door });
  }
  for (const b of kit.barriers ?? []) {
    // A repeating barrier is repeated across its box; any other spans it with its art, scaled to it.
    const s = sizeOf(b.piece);
    const span = artSpan(s);
    const repeats = s.tile !== 'none';
    const k = repeats ? 1 : (b.x1 - b.x0) / span.w;
    const box = repeats ? { x: b.x0, w: b.x1 - b.x0 } : { x: Math.round(b.x0 - span.left * k), w: Math.round(s.w * k) };
    out.push({ key: b.piece, ...box, y: Math.round(g - b.top - artBand(s).foot * k), h: Math.round(s.h * k), tile: repeats ? 'x' : 'none', layer: 'piece', role: 'barrier', id: b.id });
  }
  for (const p of kit.props ?? []) {
    out.push({ key: p.piece, ...standing(p.piece, p.x, g - p.top, p.scale), tile: 'none', layer: p.front ? 'front' : 'piece', ...(p.flip ? { flip: true } : {}), role: 'prop', id: p.id });
  }
  for (const [i, d] of (kit.decals ?? []).entries()) {
    const s = sizeOf(d.piece);
    const k = d.scale ?? 1;
    const w = Math.round(s.w * k);
    const h = Math.round(s.h * k);
    out.push({ key: d.piece, x: Math.round(d.x - w / 2), y: Math.round(d.y - h / 2), w, h, tile: 'none', layer: d.front ? 'front' : 'piece', ...(d.flip ? { flip: true } : {}), ...(d.alpha === undefined ? {} : { alpha: d.alpha }), role: 'decal', id: `${d.piece}-${i}` });
  }
  return out;
}

/**
 * The images a drawn piece takes: one for a piece drawn to its box. A texture (repeating both ways) is
 * a cell per repeat the box covers, counted from the room's origin and each cropped to the box, so
 * neighbouring surfaces of one texture continue into each other. A piece that repeats along one axis
 * (a run's middle, a trim) is a whole number of whole copies laid art to art from the box's start
 * (their transparent margins overlapping), each stretched a little so their art fills the box
 * exactly, so no copy is cut through.
 */
export function kitCells(d: KitDraw): KitCell[] {
  const s = sizeOf(d.key);
  const whole = { x: 0, y: 0, w: s.w, h: s.h };
  if (d.tile === 'none') return [{ x: d.x, y: d.y, w: d.w, h: d.h, crop: whole }];
  if (d.tile === 'x' || d.tile === 'y') {
    // Copies meet art to art: each is laid one art width on from the last, its margins over its neighbours'.
    // Down a column (y) each copy is first scaled to the box's width, so the piece keeps its shape.
    const u = d.tile === 'y' ? d.w / s.w : 1;
    const along =
      d.tile === 'x'
        ? { size: d.w, at: d.x, ...artSpan(s) }
        : { size: d.h, at: d.y, left: artBand(s).top * u, w: Math.max(1, artBand(s).foot - artBand(s).top) * u };
    const n = Math.max(1, Math.round(along.size / along.w));
    const k = along.size / (n * along.w);
    return Array.from({ length: n }, (_, i) => {
      const p = along.at + (i * along.w - along.left) * k;
      return d.tile === 'x' ? { x: p, y: d.y, w: s.w * k, h: d.h, crop: whole } : { x: d.x, y: p, w: d.w, h: s.h * u * k, crop: whole };
    });
  }
  const cells: KitCell[] = [];
  for (let y = Math.floor(d.y / s.h) * s.h; y < d.y + d.h; y += s.h) {
    for (let x = Math.floor(d.x / s.w) * s.w; x < d.x + d.w; x += s.w) {
      const ix0 = Math.max(x, d.x);
      const iy0 = Math.max(y, d.y);
      const ix1 = Math.min(x + s.w, d.x + d.w);
      const iy1 = Math.min(y + s.h, d.y + d.h);
      if (ix1 <= ix0 || iy1 <= iy0) continue;
      cells.push({ x, y, w: s.w, h: s.h, crop: { x: ix0 - x, y: iy0 - y, w: ix1 - ix0, h: iy1 - iy0 } });
    }
  }
  return cells;
}

/** Every art key a kit room draws: its pieces and its backdrops, once each. */
export function kitArtKeys(room: Pick<RoomDef, 'kit' | 'doors' | 'size'>): string[] {
  if (!room.kit) return [];
  return [...new Set([...kitDrawPlan(room).map((d) => d.key), ...(room.kit.backdrops ?? []).map((b) => b.key)])];
}

/** What drawing a kit room costs: its images (the draw's objects), its textures and their decoded bytes at `scale` texture px per room px. */
export function kitCost(room: Pick<RoomDef, 'kit' | 'doors' | 'size'>, scale: number): { images: number; textures: number; bytes: number } {
  const plan = kitDrawPlan(room);
  const keys = kitArtKeys(room);
  const tiles = room.kit ? kitTiles(room.kit) : { backgrounds: [], foregrounds: [] };
  const images = plan.reduce((n, d) => n + kitCells(d).length, 0) + tiles.backgrounds.length + tiles.foregrounds.length;
  const bytes = keys.reduce((n, k) => n + Math.ceil(sizeOf(k).w * scale) * Math.ceil(sizeOf(k).h * scale) * 4, 0);
  return { images, textures: keys.length, bytes };
}

/** The stretches of a height an owl walks along x: the floor's (top 0) across its walkable polygons at the ground line, a perch's its own. */
export function walkedAt(room: Pick<RoomDef, 'walkable' | 'perches'>, ground: number, top: number, x0: number, x1: number): Array<[number, number]> {
  const inside =
    top === 0
      ? (x: number) => room.walkable.some((poly) => pointInPolygon({ x, y: ground }, poly))
      : (x: number) => (room.perches ?? []).some((p) => p.top === top && pointInPolygon({ x, y: ground }, p.area));
  const runs: Array<[number, number]> = [];
  let from: number | null = null;
  let last = x0;
  // Sampled every 2 px: a run's ends are found to within that.
  for (let x = Math.floor(x0); x <= x1; x += 2) {
    const on = inside(x);
    if (on && from === null) from = x;
    if (!on && from !== null) {
      runs.push([from, last]);
      from = null;
    }
    last = x;
  }
  if (from !== null) runs.push([from, last]);
  return runs;
}

/**
 * What is wrong with a kit room, as sentences (none for a room that holds to the rules, or a painted
 * room). The barrier rule: a drawn ledge or path that an owl cannot reach, or that leads nowhere, has
 * a barrier piece at its foot.
 *
 * - A ledge an owl cannot stand on (`perch: false`), or whose perch no route from the floor reaches
 *   (perchTiers), has a barrier under or on it, across part of its span.
 * - A path drawn past the end of where an owl walks along it (by more than KIT_PATH_SLACK) leads
 *   nowhere there unless a doorway at that height stands at the end: a barrier at that height stands
 *   within KIT_BARRIER_REACH of the end. A path no owl walks at all has a barrier across it.
 *
 * Also: every key is a kit key of the catalogue, every stair's treads, doorway's door and perch are
 * the room's, and every stretch of floor an owl walks is drawn (a path at top 0 covers it).
 */
/** A scene of a kit room (docs/TREE_STYLE.md section 8) where it is drawn: its group's art from x0 to x1 (room px), in a row of screens. */
export interface KitSceneSpan {
  id: string;
  story: string;
  x0: number;
  x1: number;
  /** The screen its group's middle stands on (0 is the room's first). */
  screen: number;
  /** The row of screens its group's middle stands in (0 is the top row): a tall room's scenes up the hall stand apart by height. */
  row: number;
}

/** Where each scene of a kit room is drawn: the art of its props and of the doorways, barriers and ledges it is about, left to right. */
export function kitSceneSpans(room: Pick<RoomDef, 'kit' | 'doors' | 'size'>): KitSceneSpan[] {
  const plan = kitDrawPlan(room);
  const art = (d: KitDraw) => {
    const s = sizeOf(d.key);
    const a = artSpan(s);
    const k = d.w / s.w;
    const b = artBand(s);
    const ky = d.h / s.h;
    return [d.x + a.left * k, d.x + a.right * k, d.y + b.top * ky, d.y + b.foot * ky] as const;
  };
  const out: KitSceneSpan[] = [];
  for (const sc of room.kit?.scenes ?? []) {
    const ids = new Set([...sc.props, ...(sc.about ?? [])]);
    const spans = plan.filter((d) => (d.role === 'prop' || d.role === 'door' || d.role === 'barrier' || d.role === 'ledge') && ids.has(d.id)).map(art);
    if (!spans.length) continue;
    const x0 = Math.round(Math.min(...spans.map((a) => a[0])));
    const x1 = Math.round(Math.max(...spans.map((a) => a[1])));
    const y = (Math.min(...spans.map((a) => a[2])) + Math.max(...spans.map((a) => a[3]))) / 2;
    out.push({ id: sc.id, story: sc.story, x0, x1, screen: Math.floor((x0 + x1) / 2 / ROOM_W), row: Math.max(0, Math.floor(y / ROOM_H)) });
  }
  return out.sort((a, b) => a.row - b.row || a.x0 - b.x0);
}

/**
 * The story rule (the owner, 2026-11-03; docs/TREE_STYLE.md section 8): every prop of a kit room belongs
 * to exactly one scene with a one-line story; a scene's group is close together (KIT_SCENE_SPAN) with
 * room around it (KIT_SCENE_GAP), so props never stand in an even row like a catalogue.
 */
export function kitSceneProblems(room: Pick<RoomDef, 'kit' | 'doors' | 'size'>): string[] {
  const kit = room.kit;
  if (!kit) return [];
  const out: string[] = [];
  const scenes = kit.scenes ?? [];
  const propIds = new Set((kit.props ?? []).map((p) => p.id));
  const anchors = new Set([...room.doors.map((d) => d.id), ...(kit.barriers ?? []).map((b) => b.id), ...(kit.ledges ?? []).map((l) => l.id)]);
  const owner = new Map<string, string>();
  for (const sc of scenes) {
    const story = sc.story.trim();
    if (!story) out.push(`scene ${sc.id} has no story`);
    else if (/\n/.test(sc.story) || story.length > KIT_STORY_MAX) out.push(`scene ${sc.id}'s story is not one line of at most ${KIT_STORY_MAX} characters`);
    if (!sc.props.length) out.push(`scene ${sc.id} groups no props`);
    for (const id of sc.props) {
      if (!propIds.has(id)) out.push(`scene ${sc.id} groups ${id}, which is no prop of the room`);
      else if (owner.has(id)) out.push(`prop ${id} is in two scenes, ${owner.get(id)} and ${sc.id}`);
      else owner.set(id, sc.id);
    }
    for (const id of sc.about ?? []) if (!anchors.has(id)) out.push(`scene ${sc.id} is about ${id}, which is no doorway, barrier or ledge of the room`);
  }
  for (const id of propIds) if (!owner.has(id)) out.push(`prop ${id} belongs to no scene: what story does it tell?`);
  const spans = kitSceneSpans(room);
  for (const sp of spans) if (sp.x1 - sp.x0 > KIT_SCENE_SPAN) out.push(`scene ${sp.id} runs ${sp.x1 - sp.x0} px, more than ${KIT_SCENE_SPAN}: a row, not a scene`);
  for (let i = 1; i < spans.length; i++) {
    const a = spans[i - 1]!;
    const b = spans[i]!;
    if (a.row === b.row && b.x0 - a.x1 < KIT_SCENE_GAP) out.push(`scenes ${a.id} and ${b.id} run into each other (${b.x0 - a.x1} px apart, at least ${KIT_SCENE_GAP})`);
  }
  return out;
}

export function kitProblems(room: RoomDef): string[] {
  const kit = room.kit;
  if (!kit) return [];
  const out: string[] = [];
  const g = kit.ground;
  const barriers = kit.barriers ?? [];
  const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;
  const barrierAt = (x0: number, x1: number, maxTop: number, minTop = 0) => barriers.some((b) => overlaps(b.x0, b.x1, x0, x1) && b.top <= maxTop && b.top >= minTop);

  for (const key of [...kitArtKeys(room)]) {
    if (!kitGroup(key)) out.push(`${key} is not a kit key (kit-<group>-<name>)`);
    else if (!KIT_ART[key]) out.push(`${key} is not in the kit's catalogue (KIT_ART)`);
  }
  const ledgeIds = new Set((kit.ledges ?? []).map((l) => l.id));
  for (const st of kit.stairs ?? []) for (const t of st.treads) if (!ledgeIds.has(t)) out.push(`stair ${st.id}'s tread ${t} is no ledge`);
  for (const d of kit.doors ?? []) if (!room.doors.some((x) => x.id === d.door)) out.push(`door piece ${d.piece} stands at ${d.door}, which is no doorway of the room`);

  // Ledges: stood on and reached, or barred.
  const tiers = perchTiers(room);
  for (const l of kit.ledges ?? []) {
    const perch = (room.perches ?? []).find((p) => p.id === l.id);
    if (l.perch !== false && !perch) {
      out.push(`ledge ${l.id} is drawn but the room has no perch ${l.id}`);
      continue;
    }
    const reached = l.perch !== false && tiers[l.id] !== null && tiers[l.id] !== undefined;
    if (!reached && !barrierAt(l.x0, l.x1, l.top)) out.push(`ledge ${l.id} is drawn where no owl reaches it, with no barrier at its foot`);
  }

  // Paths: walked to their ends, or ending at a doorway or a barrier.
  const doorAt = (x: number, top: number) =>
    room.doors.some((d) => (d.top ?? 0) === top && d.rect.x - KIT_BARRIER_REACH <= x && x <= d.rect.x + d.rect.w + KIT_BARRIER_REACH);
  const closed = (x: number, top: number) => doorAt(x, top) || barriers.some((b) => b.top === top && overlaps(b.x0, b.x1, x - KIT_BARRIER_REACH, x + KIT_BARRIER_REACH));
  for (const p of kit.paths ?? []) {
    const walked = walkedAt(room, g, p.top, p.x0, p.x1);
    if (!walked.length) {
      if (!barrierAt(p.x0, p.x1, p.top)) out.push(`path ${p.id} is drawn where no owl walks, with no barrier at its foot`);
      continue;
    }
    for (const [a, b] of walked) {
      if (a - p.x0 > KIT_PATH_SLACK && !closed(a, p.top)) out.push(`path ${p.id} leads nowhere west of x ${a}: no barrier or doorway at the end of the walk`);
      if (p.x1 - b > KIT_PATH_SLACK && !closed(b, p.top)) out.push(`path ${p.id} leads nowhere east of x ${b}: no barrier or doorway at the end of the walk`);
    }
  }

  // Rolling ground (OP-238): each hill stood on as its profile, its pieces fit for their angles, its ends met.
  for (const h of kit.hills ?? []) out.push(...kitHillProblems(room, h));

  // A room seen from above (the Great Hollow) is walked across its floor polygons, not along a ground
  // line, and has no paths: every bit of its floor is drawn by a surface of the kit.
  if (mapOf(room) !== 2 && !kit.paths?.length) {
    for (const poly of room.walkable) {
      const xs = poly.map((p) => p.x);
      const ys = poly.map((p) => p.y);
      const bare = (x: number, y: number) => pointInPolygon({ x, y }, poly) && !(kit.surfaces ?? []).some((s) => pointInRect({ x, y }, s.rect));
      search: for (let x = Math.min(...xs); x <= Math.max(...xs); x += 16)
        for (let y = Math.min(...ys); y <= Math.max(...ys); y += 16)
          if (bare(x, y)) {
            out.push(`the floor at ${Math.round(x)}, ${Math.round(y)} is walked but not drawn`);
            break search;
          }
    }
    return [...out, ...kitSceneProblems(room)];
  }

  // The floor an owl walks is drawn.
  const floorPaths = (kit.paths ?? []).filter((p) => p.top === 0);
  for (const [a, b] of walkedAt(room, g, 0, 0, room.size.w)) {
    for (let x = a; x <= b; x += 8) {
      if (!floorPaths.some((p) => p.x0 <= x && x <= p.x1)) {
        out.push(`the floor at x ${x} is walked but not drawn`);
        break;
      }
    }
  }
  return [...out, ...kitSceneProblems(room)];
}
