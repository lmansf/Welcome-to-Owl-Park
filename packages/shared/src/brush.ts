/**
 * Brush stones (OP-235, docs/levels/brushstroke-bridges.md, section 2): the ink-wash course's one new
 * mechanic. A brush stone is a ledge with an arrow. Landing on it paints, at once, ink the way its
 * arrow points: across (R) or back (L), a bridge BRIDGE_LEN long at the stone's own top, from its right
 * or left edge; up (U), three treads TREAD_W wide centred over the stone, TREAD_RISE apart, as many as
 * fit under MAX_PERCH_TOP. What it paints lasts the stone's `ms` (BRIDGE_MS, or RAIN_BRIDGE_MS out in
 * the rain) from the landing, greys over its last BRUSH_FADE_MS, then is gone, and an owl standing on
 * it falls. Landing on the stone again paints it afresh.
 *
 * A pass over a stone paints it too (OP-360, brushTouch): an owl in the air over the stone, no higher
 * than BRUSH_SWEEP above its top. A jump that clears a stone lands on the bridge it has just painted,
 * where it used to land in the water beside a stone it had reached (the play log, Nov 12: a jump from
 * a ledge's very edge carries 35 to 70 px past a stone 140 px wide).
 *
 * TODO-DOCS (OP-360): docs/levels/brushstroke-bridges.md, section 2 (what paints a stone), and its
 * act 1 tables (the first screen as laid again).
 *
 * Every stroke a stone can paint is a perch of its room, declared in the room's data (brushPerches), so
 * the room server believes an owl standing on one while it lasts. Each page decides what is painted
 * for itself: by its own owl's landings and by the other owls it sees land on a stone, so every owl in
 * the room sees the bridges the others paint and none is seen standing on air (livePerches).
 */
import { MAX_RISE } from './flight';
import { MAX_PERCH_TOP, type Perch } from './perches';

/** Which way a stone paints: across to the right, back to the left, or up. */
export type BrushArrow = 'R' | 'L' | 'U';

/** A brush stone: its ledge's id, its width across and its top, its arrow, and how long its ink lasts. */
export interface BrushStone {
  /** The ledge it is (a perch of the room with the same id). */
  id: string;
  x0: number;
  x1: number;
  top: number;
  arrow: BrushArrow;
  /** How long its ink lasts from a landing (ms): BRIDGE_MS when absent. */
  ms?: number;
}

/** A painted bridge or tread: the perch of the same id while it lasts. */
export interface BrushStroke {
  id: string;
  /** The stone that paints it. */
  stone: string;
  x0: number;
  x1: number;
  top: number;
  /** A bridge across, or a tread up. */
  kind: 'bridge' | 'tread';
}

/** A bridge's length (room px). */
export const BRIDGE_LEN = 480;
/** How long ink lasts from a landing (ms). */
export const BRIDGE_MS = 6000;
/** Out in the rain (act 2): how long ink lasts on a stone with no eave over it (ms). */
export const RAIN_BRIDGE_MS = 4000;
/** The last stretch of a stroke's life, in which it greys out (ms). */
export const BRUSH_FADE_MS = 1000;
/** A tread's width (room px), centred over its stone. */
export const TREAD_W = 160;
/** How far apart the treads rise, the first over the stone's own top (room px): a single jump each. */
export const TREAD_RISE = 130;
/** The most treads an upward stone paints. */
export const TREADS = 3;

/** How long a stone's ink lasts (ms). */
export function strokeMs(stone: Pick<BrushStone, 'ms'>): number {
  return stone.ms ?? BRIDGE_MS;
}

/** The strokes a stone paints: one bridge across or back, or its treads up. */
export function brushStrokes(stone: BrushStone): BrushStroke[] {
  if (stone.arrow === 'R') return [{ id: `${stone.id}~`, stone: stone.id, x0: stone.x1, x1: stone.x1 + BRIDGE_LEN, top: stone.top, kind: 'bridge' }];
  if (stone.arrow === 'L') return [{ id: `${stone.id}~`, stone: stone.id, x0: stone.x0 - BRIDGE_LEN, x1: stone.x0, top: stone.top, kind: 'bridge' }];
  const mid = (stone.x0 + stone.x1) / 2;
  const out: BrushStroke[] = [];
  for (let i = 1; i <= TREADS && stone.top + i * TREAD_RISE <= MAX_PERCH_TOP; i++) {
    out.push({ id: `${stone.id}~${i}`, stone: stone.id, x0: mid - TREAD_W / 2, x1: mid + TREAD_W / 2, top: stone.top + i * TREAD_RISE, kind: 'tread' });
  }
  return out;
}

/** Every stroke the stones of a room paint. */
export function allStrokes(stones: readonly BrushStone[] | undefined): BrushStroke[] {
  return (stones ?? []).flatMap(brushStrokes);
}

/** A thin strip of the ground line from `x0` to `x1`: where a perch of a room seen from the side stands (as kitPerches lays its ledges). */
function strip(ground: number, x0: number, x1: number) {
  return [
    { x: x0, y: ground - 4 },
    { x: x1, y: ground - 4 },
    { x: x1, y: ground + 4 },
    { x: x0, y: ground + 4 },
  ];
}

/** The perches of every stroke a room's stones can paint, as the room declares them. */
export function brushPerches(stones: readonly BrushStone[], ground: number): Perch[] {
  return allStrokes(stones).map((s) => ({ id: s.id, top: s.top, area: strip(ground, s.x0, s.x1) }));
}

/** How long a stone's ink has left at `now` (ms), painted at `paintedAt` (0 when never or gone). */
export function inkLeft(stone: Pick<BrushStone, 'ms'>, paintedAt: number | undefined, now: number): number {
  if (paintedAt === undefined) return 0;
  return Math.max(0, paintedAt + strokeMs(stone) - now);
}

/** The stone an owl stands on: standing (not in the air) at its top, over it. */
export function stoneUnder(stones: readonly BrushStone[] | undefined, x: number, z: number): BrushStone | undefined {
  return (stones ?? []).find((s) => x >= s.x0 && x <= s.x1 && Math.abs(z - s.top) <= 0.5);
}

/**
 * How far over a stone's top an owl in the air still paints it as it passes (room px): as high as a
 * jump with every flap rises (MAX_RISE), so no jump taken from the stone's own height, however it is
 * flapped, goes over the stone unpainted. A glide from far above it paints nothing.
 */
export const BRUSH_SWEEP = MAX_RISE;

/** What an owl touches of a room's stones where it is: the stone it stands on, or the one it is passing over in the air; none otherwise. */
export interface BrushTouch {
  /** The stone's id, or null for none. */
  stone: string | null;
  /** Standing on it (true), or in the air over it (false). */
  standing: boolean;
}

export const NO_TOUCH: BrushTouch = { stone: null, standing: false };

/** The stone an owl at `x`, `z` up touches: standing on it, or in the air over it at its top or up to BRUSH_SWEEP above. */
export function brushTouch(stones: readonly BrushStone[] | undefined, x: number, z: number, grounded: boolean): BrushTouch {
  if (grounded) {
    const under = stoneUnder(stones, x, z);
    return under ? { stone: under.id, standing: true } : NO_TOUCH;
  }
  const over = (stones ?? []).find((s) => x >= s.x0 && x <= s.x1 && z >= s.top && z - s.top <= BRUSH_SWEEP);
  return over ? { stone: over.id, standing: false } : NO_TOUCH;
}

/**
 * Whether what an owl touches now paints its stone afresh, given what it touched a moment before: a
 * landing on the stone (it was not standing on it), or coming over it in the air (it was neither on
 * it nor over it). A jump up off a stone, still over it, paints nothing; coming down on it again does.
 */
export function paintsStone(before: BrushTouch | undefined, now: BrushTouch): boolean {
  if (now.stone === null) return false;
  const same = before?.stone === now.stone;
  return now.standing ? !(same && before!.standing) : !same;
}

/** The strokes painted at `now`, by the stones painted at the times in `painted`. */
export function liveStrokes(stones: readonly BrushStone[] | undefined, painted: ReadonlyMap<string, number>, now: number): Set<string> {
  const out = new Set<string>();
  for (const s of stones ?? []) if (inkLeft(s, painted.get(s.id), now) > 0) for (const st of brushStrokes(s)) out.add(st.id);
  return out;
}

/** A room's perches as they stand at `now`: its own, less the strokes not painted (or faded). */
export function livePerches(perches: readonly Perch[] | undefined, stones: readonly BrushStone[] | undefined, painted: ReadonlyMap<string, number>, now: number): Perch[] {
  const strokes = new Set(allStrokes(stones).map((s) => s.id));
  if (strokes.size === 0) return [...(perches ?? [])];
  const live = liveStrokes(stones, painted, now);
  return (perches ?? []).filter((p) => !strokes.has(p.id) || live.has(p.id));
}
