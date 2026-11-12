import { KIT_ART, distance, type RoomDef, type Vec2 } from '@owl-park/shared';
import { HALL_MIDDLE, ROOT_RUNS, rootId, type RootRun } from '@owl-park/shared/rooms';
import { HALL_WORDS } from '../ui/hallWords';

/**
 * A first flight where owls arrive (OP-347). The play log's outside visitors mostly never reach the
 * arcade or a course (on a phone, 11 of 13 visits since Nov 1), and every one of them is a guest, who
 * may take no quest. (This note first said 15 of 20 visits end in the Great Hollow half a minute
 * after the owl comes in; read owl by owl on Nov 12, 11 of those 15 were a keeper's own phone and
 * automated visits. PLAN.md, Baseline.) What a guest may do is already in the hall: the root runs
 * across its middle (OP-308), a fallen root to hop up, a knot, and a stump to glide off. Nothing led
 * to them and nothing said what they are for, so an owl met its first course without ever having
 * jumped.
 *
 * This file is the rule, pure and unit-tested: where the tips stand and which one speaks to an owl,
 * where the feather trail leads (the floor before each inner run's first root), and what counts as the
 * first glide. RoomScene draws the tips with the course's own signs (courseTipSigns.ts).
 */
export interface HallTip {
  /** `hop-<level>` at an inner run's first root, `glide-<level>` at its stump. */
  id: string;
  /** Where its words stand: the middle of their foot (room px), over the art of the thing it is about. */
  at: Vec2;
  words: string;
  /** The thing it is about, on the floor (room px), and how far across and down the room from it an owl may be. */
  spot: Vec2;
  reach: Vec2;
  /** How high over the floor the owl it speaks to is: from `low` up to, not counting, `high`. */
  low: number;
  high: number;
}

/** How far over a root's art its tip's words stand (room px). */
const TIP_OVER = 16;
/** How near a root an owl is spoken to (room px, across and down the room): the first root from a little further off than the stump. */
const HOP_REACH = { x: 380, y: 340 } as const;
const GLIDE_REACH = { x: 460, y: 340 } as const;
/** An owl this far under the knot's top or higher is up the roots: the glide's tip speaks to it, not the hop's. */
const UP_SLACK = 30;

/** The inner run on each side of the hall's middle: the first a new owl comes to from the way in. */
export function innerRuns(runs: readonly RootRun[] = ROOT_RUNS, middle = HALL_MIDDLE): RootRun[] {
  const side = (west: boolean) =>
    runs.filter((r) => (r.steps[0]?.[1] ?? middle) < middle === west).sort((a, b) => Math.abs((a.steps[0]?.[1] ?? 0) - middle) - Math.abs((b.steps[0]?.[1] ?? 0) - middle))[0];
  return [side(true), side(false)].filter((r): r is RootRun => r !== undefined);
}

/** A root of the hall as the room has it: its perch (where an owl stands on it) and how tall its art stands over its foot. */
function rootOf(room: RoomDef, id: string): { x: number; y: number; back: number; front: number; top: number; tall: number } | null {
  const perch = room.perches?.find((p) => p.id === id);
  const piece = room.pieces?.find((p) => p.id === id);
  if (!perch || !piece) return null;
  const xs = perch.area.map((p) => p.x);
  const ys = perch.area.map((p) => p.y);
  const back = Math.min(...ys);
  const front = Math.max(...ys);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (back + front) / 2, back, front, top: perch.top, tall: (KIT_ART[piece.key]?.h ?? perch.top) * (piece.scale ?? 1) };
}

/**
 * The hall's tips: for each inner run, how to hop up at its first root and how to glide at its stump,
 * worded for what the device plays with (`touch`). None for a room with no such roots.
 */
export function hallTips(room: RoomDef, touch: boolean, runs: readonly RootRun[] = ROOT_RUNS): HallTip[] {
  const out: HallTip[] = [];
  for (const run of innerRuns(runs)) {
    const log = rootOf(room, rootId(run.level, 'log'));
    const knot = rootOf(room, rootId(run.level, 'knot'));
    const stump = rootOf(room, rootId(run.level, 'stump'));
    if (!log || !knot || !stump) continue;
    const up = knot.top - UP_SLACK;
    out.push({
      id: `hop-${run.level}`,
      at: { x: Math.round(log.x), y: Math.round(log.back - log.tall - TIP_OVER) },
      words: touch ? HALL_WORDS.hop.touch : HALL_WORDS.hop.keys,
      spot: { x: Math.round(log.x), y: Math.round(log.y) },
      reach: { ...HOP_REACH },
      low: 0,
      high: up,
    });
    out.push({
      id: `glide-${run.level}`,
      at: { x: Math.round(stump.x), y: Math.round(stump.back - stump.tall - TIP_OVER) },
      words: touch ? HALL_WORDS.glide.touch : HALL_WORDS.glide.keys,
      spot: { x: Math.round(stump.x), y: Math.round(stump.y) },
      reach: { ...GLIDE_REACH },
      low: up,
      high: Number.POSITIVE_INFINITY,
    });
  }
  return out;
}

/** The tip that speaks to an owl at `pos`, `z` over the floor: the nearest whose thing it is near and about as high as; null for none. */
export function hallTipFor(tips: readonly HallTip[], pos: Vec2, z: number): HallTip | null {
  let best: HallTip | null = null;
  let near = Number.POSITIVE_INFINITY;
  for (const t of tips) {
    const dx = Math.abs(pos.x - t.spot.x);
    const dy = Math.abs(pos.y - t.spot.y);
    if (dx > t.reach.x || dy > t.reach.y || z < t.low || z >= t.high) continue;
    if (dx + dy < near) {
      best = t;
      near = dx + dy;
    }
  }
  return best;
}

/** How deep the strip of floor before a first root is where the trail's feathers end, and the gap between root and strip (room px). */
const BEFORE_ROOT = { gap: 14, deep: 110 } as const;

/**
 * Where the feather trail leads a new owl (featherTrail.ts, PLAY_SPOTS): the floor before each inner
 * run's first root, on the near side, where an owl faces the root's cut end and the jump up is plain.
 * Standing there counts as having found the roots.
 */
export function rootSpots(room: RoomDef, runs: readonly RootRun[] = ROOT_RUNS): Array<{ x: number; y: number; w: number; h: number }> {
  const out: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const run of innerRuns(runs)) {
    const perch = room.perches?.find((p) => p.id === rootId(run.level, 'log'));
    if (!perch) continue;
    const xs = perch.area.map((p) => p.x);
    const front = Math.max(...perch.area.map((p) => p.y));
    out.push({ x: Math.min(...xs), y: front + BEFORE_ROOT.gap, w: Math.max(...xs) - Math.min(...xs), h: BEFORE_ROOT.deep });
  }
  return out;
}

/** The mark this device keeps once its owl has glided off a root (with the doorways tried, featherTrail.ts): the roots' tips show no more. */
export const FIRST_FLIGHT_MARK = 'first-flight';

/** How high an owl leaves from, and how far it comes down from there, for it to have glided off a root (room px). */
export const FIRST_FLIGHT = { from: 240, far: 320 } as const;

/** Whether a flight that left the ground `z` up at `from` and came down at `to` is a glide off the roots: from the stump's height, and far. */
export function glidedOff(from: Vec2, z: number, to: Vec2): boolean {
  return z >= FIRST_FLIGHT.from && distance(from, to) >= FIRST_FLIGHT.far;
}
