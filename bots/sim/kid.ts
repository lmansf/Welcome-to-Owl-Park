/**
 * The kid bot: how a ten-year-old plays a hop, and what comes of it.
 *
 * A kid walks to roughly the right spot (somewhere within KID_SPOT px of the best one), heads for the
 * ledge it wants, presses Jump and keeps it held (so a fall turns into a glide), and taps Jump again at
 * a time of its own: never, once, or twice, at any of KID_TAPS (ms after the jump). In a course it may
 * also tap Dash, at one of KID_DASH_MS. These are the plans the ink course's kid sim played (Nov 7,
 * brush-2's hop up to k10 went from 14% to 97%), so its numbers and these read the same way.
 *
 * What a kid can see, it goes by. It jumps off a neon sign while it is lit, and goes when the sign it
 * means to land on will be lit as it comes down (the circuits take turns). It goes for an updraft on
 * its way about when the column comes on, a moment sooner or later (it knows the rhythm, roughly:
 * KID_COLUMN_MS). In a column that rises near a ledge higher than it, it stops steering and lets the
 * column carry it up, then steers on. Held up at a column's top or on a wind near a ledge higher than
 * it, it taps Jump to flap up onto it; gliding down short of the ledge, or at the top of a rise under
 * it, it taps Jump to flap while it has a flap left; over the ledge, it lets go of Jump to drop onto it.
 *
 * A hop's rate is the share of those plans that end on the ledge aimed for or on any other the route
 * counts as progress (route.ts). Walking off an edge on purpose is a plan of its own: holding Jump as
 * it goes, or dropping first for about as long as it means to (KID_DROPS) and then holding Jump to
 * glide (under a hedge of thorns, into a column).
 */
import { AIR_DASH_MS, FLAP_RISE, FLIGHT_STEP_MS, GLIDE_SLOPE, GLIDING, GROUNDED, inUpdraft, LIFTED, JUMP_RISE, MAX_FLAPS, signLit, updraftOn } from '@owl-park/shared';
import { owlAt, STEPS_PER_S, stepOwl, type BotRoom, type Owl, type Press } from './owl';
import { heightOf, surfaceAt, type Surface } from './surfaces';

/** Jump taps after the first press (ms): 9 times from 50 ms to 1.25 s. */
export const KID_TAPS: readonly number[] = Array.from({ length: 9 }, (_, i) => 50 + i * 150);
/** When a kid taps Dash in a course (ms after the jump). */
export const KID_DASH_MS: readonly number[] = [100, 300, 500];
/** When a kid goes for a column that switches on and off, against the moment it comes on (ms): it knows the rhythm, roughly. */
export const KID_COLUMN_MS: readonly number[] = [-900, -600, -300, 0, 300, 600];
/** Walking off an edge, how long a kid drops before it holds Jump to glide (ms): none (Jump held as it walks off), or a while. */
export const KID_DROPS: readonly number[] = [0, 150, 300, 450, 600, 750, 900];
/** How far from the drop it means a kid's drop lands (ms either side). */
export const KID_DROP_SLACK = 150;
/** How far from the best spot a kid's takeoff lands (px either side). */
export const KID_SPOT = 40;
/** Takeoff spots are tried this far apart (px). */
const SPOT_STEP = 40;
/** Takeoff spots are tried this far either side of the ledge aimed for (px). */
const SPOT_REACH = 520;
/** The longest a hop is played (s): long enough for a glide down from the highest ledge. */
const HOP_S = 8;
/** The farthest across a hop is tried (px between the two ledges' near ends). */
const MAX_GAP = 900;
/** How high a hop can go without lift: a jump and both flaps, and a little. */
const MAX_RISE = JUMP_RISE + MAX_FLAPS * FLAP_RISE + 10;

const STEP_OF = (ms: number) => Math.round(ms / FLIGHT_STEP_MS);
/** The least time between two flaps a kid taps on seeing it will come down short (steps of 300 ms). */
const SHORT_FLAP_GAP = STEP_OF(300);

/** Every plan: the steps at which Jump is tapped again (none, one, or two of KID_TAPS). */
export const PLANS: readonly (readonly number[])[] = (() => {
  const steps = KID_TAPS.map(STEP_OF);
  const out: number[][] = [[]];
  for (let i = 0; i < steps.length; i++) {
    out.push([steps[i]!]);
    for (let j = i + 1; j < steps.length; j++) out.push([steps[i]!, steps[j]!]);
  }
  return out;
})();

/** Where a hop ended: on a surface (its id), or a fall (pit, thorns), or nowhere useful. */
export type Landing = string | 'fall' | 'miss';
/** Outcomes as shares (they sum to 1). */
export type Outcomes = Map<Landing, number>;

export type Mode = 'jump' | 'dash' | 'walk';

/** A way a kid can try to get from one surface to another: aimed at `to`, from about `x`, by `mode`, and how it goes. */
export interface Action {
  from: string;
  to: string;
  x: number;
  mode: Mode;
  out: Outcomes;
}

/** The longest cycle of the room's timed things (signs, updrafts), 0 for none. */
function cycleOf(br: BotRoom): number {
  const r = br.room;
  const cyc = [...(r.neonSigns ?? []), ...(r.updrafts ?? [])].map((u) => ('onMs' in u && u.onMs !== undefined && u.offMs !== undefined ? u.onMs + u.offMs : 0));
  return Math.max(0, ...cyc);
}

/** The park times a kid starts a hop from F to T at: across the room's cycle, while F and T are there. */
function startTimes(br: BotRoom, F: Surface, T: Surface): number[] {
  const c = cycleOf(br);
  if (c === 0) return [0];
  const signs = br.room.neonSigns ?? [];
  const litAt = (s: Surface, t: number) => !s.sign || signs.some((g) => g.id === s.id && signLit(g, t));
  // A kid jumps off a sign while it is lit, and goes when the sign it means to land on will be lit as it
  // comes down (the circuits take turns, so that is often after the one under it goes dark).
  const off = (t: number) => litAt(F, t) && litAt(F, t + 150);
  const landing = (t: number) => [300, 500, 700, 900].filter((d) => litAt(T, t + d)).length;
  // A column between the two ledges that rises near T and switches: a kid sees its rhythm and goes about
  // when it comes on, a moment sooner or later (KID_COLUMN_MS; the nearest such column to F, if any).
  const a = Math.min(F.x0, T.x0);
  const b = Math.max(F.x1, T.x1);
  const topT = T.perch?.top ?? 0;
  const mid = (F.x0 + F.x1) / 2;
  const col = (br.room.updrafts ?? [])
    .filter((u) => u.onMs !== undefined && u.offMs !== undefined && u.x + u.w >= a && u.x <= b && u.top >= topT - 40)
    .sort((p, q) => Math.abs(p.x + p.w / 2 - mid) - Math.abs(q.x + q.w / 2 - mid))[0];
  const out: number[] = [];
  if (col) {
    let t = 100_000;
    while (updraftOn(col, t)) t += 50;
    while (!updraftOn(col, t)) t += 50;
    for (const d of KID_COLUMN_MS) if (off(t + d)) out.push(t + d);
    if (out.length > 0) return out;
  }
  const cands: Array<{ t: number; score: number }> = [];
  for (let i = 0; i < 16; i++) {
    const t = 100_000 + (c * i) / 16;
    if (off(t)) cands.push({ t, score: landing(t) });
  }
  const best = Math.max(0, ...cands.map((x) => x.score));
  return cands.filter((x) => x.score === best).slice(0, 4).map((x) => x.t);
}

/** The stone whose ink a surface is (a stroke), or the stone it is. */
function stoneOf(br: BotRoom, s: Surface): string | null {
  if (s.stone) return s.stone;
  return (br.room.brushStones ?? []).some((b) => b.id === s.id) ? s.id : null;
}

/** Where on T a kid steers for: its middle part, or when T is lower and under F, the part out from under F. */
function window(F: Surface, T: Surface): [number, number] {
  const edge = Math.min(20, (T.x1 - T.x0) / 2);
  let lo = T.x0 + edge;
  let hi = T.x1 - edge;
  if (T.low < F.low) {
    if (T.x0 < F.x0 && hi > F.x0 - 10) hi = Math.max(lo, F.x0 - 20);
    else if (T.x1 > F.x1 && lo < F.x1 + 10) lo = Math.min(hi, F.x1 + 20);
  }
  return [lo, hi];
}

/**
 * One kid's try: from `x` on F at park time `t0`, aimed at T, Jump tapped again at the plan's steps,
 * Dash at `dashStep` (-1 for none); `walk` walks off F's nearer edge with no jump instead, Jump held
 * from step `holdFrom` (a drop first, then the glide).
 */
export function tryHop(br: BotRoom, surfaces: readonly Surface[], F: Surface, T: Surface, x: number, t0: number, plan: readonly number[], dashStep: number, walk: boolean, holdFrom = 0): Landing {
  const painted = new Map<string, number>();
  const fs = stoneOf(br, F);
  const [lo, hi] = window(F, T);
  if (fs) {
    const stone = br.room.brushStones!.find((b) => b.id === fs)!;
    const walkMs = (Math.abs(x - (stone.x0 + stone.x1) / 2) / 260) * 1000;
    painted.set(fs, t0 - walkMs);
  }
  let o: Owl;
  if (walk) {
    const west = (lo + hi) / 2 < (F.x0 + F.x1) / 2;
    const ex = west ? F.x0 : F.x1;
    o = owlAt(ex, heightOf(F, ex), t0, painted);
  } else o = owlAt(x, heightOf(F, x), t0, painted);
  if (fs && stoneOf(br, F) === F.id) o.onStone = F.id;
  let flew = false;
  let flapped = false;
  let lastFlap = -SHORT_FLAP_GAP;
  const topT = T.perch ? Math.max(heightOf(T, lo), heightOf(T, hi)) : 0;
  const steps = HOP_S * STEPS_PER_S;
  for (let i = 0; i < steps; i++) {
    let way: -1 | 0 | 1;
    if (walk && !flew) way = (lo + hi) / 2 < (F.x0 + F.x1) / 2 ? -1 : 1;
    // Dropping off the edge, a kid lets go of the way too, and steers again once it holds Jump.
    else if (walk && i < holdFrom) way = 0;
    else way = o.x < lo - 1 ? 1 : o.x > hi + 1 ? -1 : 0;
    if (way === 0 && i === 0) way = (lo + hi) / 2 < o.x ? -1 : 1;
    // In a column that is on and rises near a ledge higher than the owl, a kid stops steering and lets it
    // carry the owl up, then steers on.
    const a = o.fl.air;
    if (a.z < topT + 10 && (br.room.updrafts ?? []).some((u) => inUpdraft(u, o.x) && u.top >= topT - 40 && a.z < u.top - 1 && updraftOn(u, o.t))) way = 0;
    // Held up at the top of a column or on a wind, near a ledge higher than the owl: a kid taps Jump to
    // flap up onto it (once a hop).
    let flap = false;
    if (!flapped && a.s === LIFTED && a.h !== undefined && a.z >= a.h - 1 && topT > a.z + 5 && a.f > 0 && o.x >= lo - 120 && o.x <= hi + 120) {
      flap = true;
      flapped = true;
    }
    // Gliding and coming down short of the ledge: a kid taps Jump to flap, while it has a flap left.
    const short = o.x < lo ? lo - o.x : o.x > hi ? o.x - hi : 0;
    // Or at the top of a rise, under the ledge it means to land on: it taps Jump to flap up.
    const under = short === 0 && a.s !== LIFTED && a.s !== GROUNDED && a.vz <= 0 && a.z < topT;
    if (!flap && a.f > 0 && i - lastFlap >= SHORT_FLAP_GAP && (under || (a.s === GLIDING && short > 0 && (a.z - topT) * GLIDE_SLOPE < short - 20))) {
      flap = true;
      lastFlap = i;
    }
    // Over the ledge and coming down onto it, a kid lets go of Jump to drop onto it rather than glide on.
    const over = short === 0 && a.s === GLIDING && a.z > topT + 2;
    const p: Press = { way, pressed: (!walk && i === 0) || plan.includes(i) || flap, held: i >= holdFrom && !over, dash: i === dashStep };
    if (stepOwl(br, o, p) === 'fall') return 'fall';
    const grounded = o.fl.air.s === GROUNDED;
    if (!grounded) flew = true;
    if (grounded && (flew || i > 0)) {
      const s = surfaceAt(surfaces, o.x, o.fl.air.z);
      if (flew || (s && s.id !== F.id)) {
        if (!s) return 'miss';
        return s.id === F.id ? 'miss' : s.id;
      }
    }
    if (o.x < -50 || o.x > br.room.size.w + 50) return 'miss';
  }
  return 'miss';
}

/** Whether T can be aimed at from F at all: near enough (with a wind's carry), not too high, and there when F is stood on. */
export function canAim(br: BotRoom, F: Surface, T: Surface): boolean {
  if (F.id === T.id) return false;
  const fs = stoneOf(br, F);
  if (T.stone && T.stone !== fs) return false;
  const gap = Math.max(0, T.x0 - F.x1, F.x0 - T.x1);
  // A wind current carries a glide its whole length on top of what a glide makes by itself.
  const carry = Math.max(0, ...(br.room.winds ?? []).map((w) => w.x1 - w.x0));
  if (gap > MAX_GAP + carry) return false;
  const lifts = (br.room.updrafts?.length ?? 0) + (br.room.winds?.length ?? 0) > 0;
  const topT = T.perch?.top ?? 0;
  const topF = F.perch?.top ?? 0;
  if (!lifts && T.low - topF > MAX_RISE) return false;
  return !(topT < 0);
}

function add(m: Outcomes, k: Landing, v: number) {
  m.set(k, (m.get(k) ?? 0) + v);
}

/** The takeoff spots tried on F for T: every SPOT_STEP px of F within MAX_GAP of T. */
function spots(F: Surface, T: Surface): number[] {
  const a = Math.max(F.x0, T.x0 - SPOT_REACH);
  const b = Math.min(F.x1, T.x1 + SPOT_REACH);
  const out: number[] = [];
  for (let x = a; x <= b; x += SPOT_STEP) out.push(x);
  if (out.length === 0) out.push((F.x0 + F.x1) / 2);
  return out;
}

/** Every action a kid has from F toward T: from each spot by jump (and dash in a course), and walking off. */
export function actionsToward(br: BotRoom, surfaces: readonly Surface[], F: Surface, T: Surface): Action[] {
  const times = startTimes(br, F, T);
  if (times.length === 0) return [];
  const xs = spots(F, T);
  const per = new Map<string, Outcomes>();
  const modes: Array<'jump' | 'dash'> = [];
  for (const mode of ['jump', 'dash'] as const) {
    // The dash only in a course, and only where a jump alone mostly misses.
    if (mode === 'dash' && (!br.dash || Math.max(...xs.map((x) => per.get(`jump:${x}`)!.get(T.id) ?? 0)) >= 0.9)) continue;
    modes.push(mode);
    const dashSteps = mode === 'dash' ? KID_DASH_MS.map(STEP_OF) : [-1];
    for (const x of xs) {
      const out: Outcomes = new Map();
      const n = PLANS.length * times.length * dashSteps.length;
      for (const t0 of times) for (const plan of PLANS) for (const d of dashSteps) add(out, tryHop(br, surfaces, F, T, x, t0, plan, d, false), 1 / n);
      per.set(`${mode}:${x}`, out);
    }
  }
  const actions: Action[] = [];
  for (const mode of modes) {
    for (const x of xs) {
      // A kid stands somewhere within KID_SPOT of x: the shares over those spots.
      const near = xs.filter((v) => Math.abs(v - x) <= KID_SPOT);
      const out: Outcomes = new Map();
      for (const v of near) for (const [k, p] of per.get(`${mode}:${v}`)!) add(out, k, p / near.length);
      actions.push({ from: F.id, to: T.id, x, mode, out });
    }
  }
  // Walking off F's nearer edge toward T, holding Jump to glide at once, or dropping first for about a
  // moment of its own choosing (KID_DROPS: a kid's drop lands within KID_DROP_SLACK of the one it means).
  const edge = (window(F, T)[0] + window(F, T)[1]) / 2 < (F.x0 + F.x1) / 2 ? F.x0 : F.x1;
  const byDrop = new Map<number, Outcomes>();
  for (const d of KID_DROPS) {
    const out: Outcomes = new Map();
    for (const t0 of times) add(out, tryHop(br, surfaces, F, T, 0, t0, [], -1, true, STEP_OF(d)), 1 / times.length);
    byDrop.set(d, out);
  }
  for (const d of KID_DROPS) {
    const near = d === 0 ? [0] : KID_DROPS.filter((e) => e > 0 && Math.abs(e - d) <= KID_DROP_SLACK);
    const out: Outcomes = new Map();
    for (const e of near) for (const [k, p] of byDrop.get(e)!) add(out, k, p / near.length);
    actions.push({ from: F.id, to: T.id, x: edge, mode: 'walk', out });
  }
  return actions;
}

/** Whether a timed thing of the room (an updraft) is on at `t`: re-exported for the report's notes. */
export const on = updraftOn;
export const DASH_MS = AIR_DASH_MS;
