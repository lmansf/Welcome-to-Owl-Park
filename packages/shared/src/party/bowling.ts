/**
 * Pinecone bowling in the Party Grove (OP-403, Dec 1 plan D5's second game), behind the park's `bowl`
 * flag: an owl stands at the head of the bowling lane (BOWLING_LANE, laid out with feather tag), aims,
 * and rolls a pinecone at six pins at the far end. A game is three rolls, the pins set up again before
 * each; the score is how many pins fell in all, out of eighteen. Drawn as size boxes until its art is
 * painted.
 *
 * Aiming takes no skill to learn: the aim swings slowly up and down the lane, and the owl lets go when it
 * looks right. The lane's edges are bumpers, so a pinecone never rolls off it: every roll reaches the pins,
 * and a ten year old knocks some down from the first try and gets better in a few (Logan's kid bar).
 *
 * Every step is plain data, the same for any page: where the pinecone goes for an aim, which pins fall,
 * and the game's score. It is this owl's own game, played on its own page, so the room server needs
 * nothing new for it.
 */
import type { Vec2 } from '../protocol';
import { BOWLING_LANE } from './tag';

export const BOWL_ROLLS = 3;
export const BOWL_PIN_R = 8;
export const BOWL_BALL_R = 9;
/** The aim's widest angle either way from straight down the lane (radians). */
export const BOWL_AIM_MAX = 0.11;
/** One whole swing of the aim, up and back (ms): slow enough to let go at the moment wanted. */
export const BOWL_SWING_MS = 2600;
/** How fast the pinecone rolls (room px a second). */
export const BOWL_SPEED = 520;
/** A pin the pinecone hits knocks down a standing one this close behind it (room px). */
export const BOWL_KNOCK_ON = 34;
/** How long the pins that fell stay shown before the next roll (ms). */
export const BOWL_SETTLE_MS = 1400;

const MID_Y = BOWLING_LANE.y + BOWLING_LANE.h / 2;
const END_X = BOWLING_LANE.x + BOWLING_LANE.w;

/** Where the owl stands to bowl: just before the head of the lane. */
export const BOWL_SPOT: Vec2 = { x: BOWLING_LANE.x - 40, y: MID_Y };
/** How close to that spot the owl must stand for Bowl to show (room px). */
export const BOWL_REACH = 70;
/** Where the pinecone sets off from. */
export const BOWL_START: Vec2 = { x: BOWLING_LANE.x + 24, y: MID_Y };

/** The six pins, a triangle at the far end of the lane, its point toward the owl. */
export const BOWL_PINS: readonly Vec2[] = [
  { x: END_X - 90, y: MID_Y },
  { x: END_X - 60, y: MID_Y - 15 },
  { x: END_X - 60, y: MID_Y + 15 },
  { x: END_X - 30, y: MID_Y - 24 },
  { x: END_X - 30, y: MID_Y },
  { x: END_X - 30, y: MID_Y + 24 },
];

/** The aim at `ms` into a swing: from straight down the lane, out to one side, back, to the other. */
export function bowlAim(ms: number): number {
  return BOWL_AIM_MAX * Math.sin((2 * Math.PI * ms) / BOWL_SWING_MS);
}

/** Whether the owl stands where it can bowl. */
export function atBowlSpot(p: Vec2): boolean {
  return Math.hypot(p.x - BOWL_SPOT.x, p.y - BOWL_SPOT.y) <= BOWL_REACH;
}

export interface BowlRoll {
  /** The pinecone's way down the lane, bumpers and all, from the start to the lane's end. */
  path: Vec2[];
  /** The pins that fell, by index into BOWL_PINS, in the order they fell. */
  down: number[];
}

/**
 * One roll at `aim` (radians, clamped to the aim's swing): the pinecone rolls down the lane, off the
 * bumpers, and every pin it touches falls; a pin that falls knocks down a standing pin close behind it.
 */
export function bowlRoll(aim: number): BowlRoll {
  const a = Math.max(-BOWL_AIM_MAX, Math.min(BOWL_AIM_MAX, Number.isFinite(aim) ? aim : 0));
  const top = BOWLING_LANE.y + BOWL_BALL_R;
  const bottom = BOWLING_LANE.y + BOWLING_LANE.h - BOWL_BALL_R;
  const step = 4;
  let { x, y } = BOWL_START;
  let dy = Math.sin(a) * step;
  const dx = Math.cos(a) * step;
  const path: Vec2[] = [{ x, y }];
  const down: number[] = [];
  const fell = new Set<number>();
  while (x < END_X - BOWL_BALL_R) {
    x += dx;
    y += dy;
    if (y < top) {
      y = top + (top - y);
      dy = -dy;
    } else if (y > bottom) {
      y = bottom - (y - bottom);
      dy = -dy;
    }
    path.push({ x, y });
    BOWL_PINS.forEach((p, i) => {
      if (!fell.has(i) && Math.hypot(p.x - x, p.y - y) <= BOWL_BALL_R + BOWL_PIN_R) {
        fell.add(i);
        down.push(i);
      }
    });
  }
  // Each pin the pinecone hit knocks over the standing ones close behind it (one row on, no further).
  const hit = down.length;
  for (let k = 0; k < hit; k++) {
    const p = BOWL_PINS[down[k]!]!;
    BOWL_PINS.forEach((q, j) => {
      if (!fell.has(j) && q.x > p.x && Math.hypot(q.x - p.x, q.y - p.y) <= BOWL_KNOCK_ON) {
        fell.add(j);
        down.push(j);
      }
    });
  }
  return { path, down };
}

/** A game: the pins that fell on each roll so far (up to BOWL_ROLLS), and its score. */
export interface BowlGame {
  rolls: number[];
}

export function newBowl(): BowlGame {
  return { rolls: [] };
}

export function bowlScore(g: BowlGame): number {
  return g.rolls.reduce((s, n) => s + n, 0);
}

export function bowlOver(g: BowlGame): boolean {
  return g.rolls.length >= BOWL_ROLLS;
}

/** The game after a roll that knocked down `n` pins; a game already over starts again with it. */
export function bowlAdd(g: BowlGame, n: number): BowlGame {
  const pins = Math.max(0, Math.min(BOWL_PINS.length, Math.floor(n)));
  return { rolls: [...(bowlOver(g) ? [] : g.rolls), pins] };
}

/** Pinecone bowling's words: short, plain, for a ten year old. */
export const BOWL_WORDS = {
  bowl: 'Bowl a pinecone',
  roll: 'Roll it!',
  aiming: 'Watch the arrow, then tap Roll it!',
  rolled: (n: number) => (n === BOWL_PINS.length ? 'All six! A strike!' : n === 0 ? 'So close! Try again' : `${n} down!`),
  rollOf: (k: number) => `Roll ${k} of ${BOWL_ROLLS}`,
  done: (score: number) => `${score} of ${BOWL_ROLLS * BOWL_PINS.length} pins! Bowl again any time`,
} as const;
