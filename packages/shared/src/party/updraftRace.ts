/**
 * Updraft Race (OP-314): every owl flies up the same sky, six columns of air wide, to the top of the
 * old tree. Each column's air changes every few seconds: a warm updraft lifts an owl, a cold one pulls
 * it down. Holding flaps (and tires the owl); letting go glides (and it gets its breath back). The
 * first owl to the top wins. The air is the same for every owl and shown a little ahead, so the race
 * is fair. On a phone a hold button and two steer buttons; on a computer Space and the arrow keys.
 *
 * The room server stamps every input, and each owl's flight is worked out from its inputs, step by
 * step, on the server and the page alike.
 */
import { between, draw, pick, shuffled, type Dice } from './rng';
import { inputsOf, miniPlaces, type MiniInput, type MiniPlayer, type MinigameDef, type StampedInput } from './minigame';

export const UPDRAFT_COLUMNS = 6;
/** How high the top of the tree is (sky px), and how long the race lasts at most. */
export const UPDRAFT_GOAL = 3000;
export const UPDRAFT_MS = 45_000;
/** The air in every column changes this often. */
export const AIR_MS = 3_000;
/** The flight is worked out in steps this long. */
export const UPDRAFT_STEP_MS = 50;
/** Climb (sky px/s) from flapping, and the sink from gliding. */
const FLAP_LIFT = 90;
const GLIDE_SINK = 40;
/** What each kind of air does (sky px/s): -1 cold, 0 still, 1 warm, 2 a strong updraft. */
export const AIR_LIFT: Record<number, number> = { [-1]: -90, 0: 0, 1: 60, 2: 130 };
/** Breath: flapping spends it, gliding gets it back; an owl out of breath only glides until it has this much back. */
export const BREATH_MAX = 100;
export const BREATH_AGAIN = 30;
const BREATH_SPEND = 30;
const BREATH_BACK = 20;
/** An owl moves one column at a time, no quicker than this. */
const MOVE_GAP_MS = 220;
/** Inputs a seat may send: no faster than this, and no more than so many in one race. */
const MIN_GAP_MS = 100;
const MAX_INPUTS = 400;
/** Where each seat's owl starts, across the columns. */
const START_COLUMN = [1, 4, 2, 3];

export interface UpdraftState {
  players: MiniPlayer[];
  /** The air: one row per AIR_MS, one number per column. */
  air: number[][];
  inputs: StampedInput[];
}

/** One owl's flight at a moment. */
export interface Flight {
  alt: number;
  col: number;
  breath: number;
  flapping: boolean;
  /** Out of breath: it glides, flapping or not, until it has BREATH_AGAIN back. */
  winded: boolean;
  /** When it reached the top (ms from the start), or null. */
  doneAt: number | null;
  /** When it last moved a column. */
  movedAt: number;
}

export function airAt(air: readonly (readonly number[])[], t: number, col: number): number {
  const row = air[Math.min(air.length - 1, Math.max(0, Math.floor(t / AIR_MS)))];
  return row?.[col] ?? 0;
}

function newFlight(seat: number): Flight {
  return { alt: 0, col: START_COLUMN[seat] ?? 2, breath: BREATH_MAX, flapping: false, winded: false, doneAt: null, movedAt: -1e9 };
}

/** One step of flight from `t` for UPDRAFT_STEP_MS. */
function stepFlight(f: Flight, air: readonly (readonly number[])[], t: number): void {
  if (f.doneAt !== null) return;
  const dt = UPDRAFT_STEP_MS / 1000;
  if (f.winded && f.breath >= BREATH_AGAIN) f.winded = false;
  const flaps = f.flapping && !f.winded;
  const lift = (flaps ? FLAP_LIFT : -GLIDE_SINK) + (AIR_LIFT[airAt(air, t, f.col)] ?? 0);
  f.breath = Math.max(0, Math.min(BREATH_MAX, f.breath + (flaps ? -BREATH_SPEND : BREATH_BACK) * dt));
  if (f.breath === 0) f.winded = true;
  f.alt = Math.max(0, f.alt + lift * dt);
  if (f.alt >= UPDRAFT_GOAL) {
    f.alt = UPDRAFT_GOAL;
    f.doneAt = t + UPDRAFT_STEP_MS;
  }
}

function apply(f: Flight, i: StampedInput): void {
  if (i.k === 'hold') f.flapping = i.v === 1;
  else if (i.k === 'dir' && i.t - f.movedAt >= MOVE_GAP_MS) {
    const col = Math.max(0, Math.min(UPDRAFT_COLUMNS - 1, f.col + i.v));
    if (col !== f.col) {
      f.col = col;
      f.movedAt = i.t;
    }
  }
}

/** A seat's flight at `t`, flown from the start through each of its inputs. */
export function flightAt(s: Pick<UpdraftState, 'air' | 'inputs'>, seat: number, t: number): Flight {
  const f = newFlight(seat);
  const mine = inputsOf(s.inputs, seat);
  let n = 0;
  const end = Math.min(t, UPDRAFT_MS);
  for (let at = 0; at < end && f.doneAt === null; at += UPDRAFT_STEP_MS) {
    while (n < mine.length && mine[n]!.t <= at) apply(f, mine[n++]!);
    stepFlight(f, s.air, at);
  }
  while (n < mine.length && mine[n]!.t <= end) apply(f, mine[n++]!);
  return f;
}

function makeAir(d: Dice): number[][] {
  const rows: number[][] = [];
  for (let r = 0; r * AIR_MS < UPDRAFT_MS; r++) {
    const row = Array.from({ length: UPDRAFT_COLUMNS }, () => 0);
    const cols = shuffled(
      d,
      Array.from({ length: UPDRAFT_COLUMNS }, (_, i) => i),
    );
    row[cols[0]!] = 2;
    row[cols[1]!] = 1;
    if (draw(d) < 0.6) row[cols[2]!] = 1;
    row[cols[3]!] = -1;
    if (draw(d) < 0.5) row[cols[4]!] = -1;
    rows.push(row);
  }
  return rows;
}

/** A park owl's flight: it heads for the best air it sees, a little late and now and then for the second best, and flaps in bursts. */
function botInputs(d: Dice, seat: number, air: readonly (readonly number[])[]): StampedInput[] {
  const out: StampedInput[] = [];
  const f = newFlight(seat);
  let lastSent = -1e9;
  const send = (k: 'hold' | 'dir', v: number, t: number) => {
    const i: StampedInput = { seat, k, v, t };
    out.push(i);
    apply(f, i);
    lastSent = t;
  };
  let target = f.col;
  let row = -1;
  let heedAt = 0;
  let stopAt = 15 + pick(d, 20);
  let goAt = 60 + pick(d, 30);
  for (let t = 0; t < UPDRAFT_MS && f.doneAt === null; t += UPDRAFT_STEP_MS) {
    const r = Math.floor(t / AIR_MS);
    if (r !== row) {
      row = r;
      const cols = air[r]!.map((a, c) => ({ a, c })).sort((x, y) => y.a - x.a || Math.abs(x.c - f.col) - Math.abs(y.c - f.col));
      target = (draw(d) < 0.25 ? cols[1] : cols[0])!.c;
      heedAt = t + between(d, 300, 800);
    }
    if (t - lastSent >= MIN_GAP_MS + 30) {
      if (t >= heedAt && f.col !== target && t - f.movedAt >= MOVE_GAP_MS) send('dir', Math.sign(target - f.col), t);
      else if (!f.flapping && f.breath >= goAt) {
        send('hold', 1, t);
        stopAt = 10 + pick(d, 25);
      } else if (f.flapping && f.breath <= stopAt) {
        send('hold', 0, t);
        goAt = 55 + pick(d, 40);
      }
    }
    stepFlight(f, air, t);
  }
  return out;
}

const allUp = (s: UpdraftState, t: number) => s.players.every((p) => flightAt(s, p.seat, t).doneAt !== null);

export const UPDRAFT_RACE: MinigameDef<UpdraftState> = {
  id: 'updraft-race',
  name: 'Updraft Race',
  kind: 'all',
  stream: 'inputs',
  ms: UPDRAFT_MS,
  how: {
    phone: 'Hold Flap to climb, let go to get your breath back. Steer into the warm air!',
    keys: 'Hold Space to flap, let go to get your breath back. Left and right arrows steer into the warm air!',
  },
  start(players, seed) {
    const d: Dice = { s: seed };
    const air = makeAir(d);
    const inputs = players.filter((p) => p.bot).flatMap((p) => botInputs(d, p.seat, air));
    return { players: [...players], air, inputs: inputs.sort((a, b) => a.t - b.t) };
  },
  input(s, seat, input: MiniInput, t) {
    if (t < 0 || t > UPDRAFT_MS) return false;
    if (input.k === 'hold' ? input.v !== 0 && input.v !== 1 : input.k !== 'dir' || (input.v !== -1 && input.v !== 1)) return false;
    const player = s.players.find((p) => p.seat === seat);
    if (!player || player.bot) return false;
    const mine = inputsOf(s.inputs, seat);
    if (mine.length >= MAX_INPUTS || (mine.length && t - mine.at(-1)!.t < MIN_GAP_MS)) return false;
    if (flightAt(s, seat, t).doneAt !== null) return false;
    const stamped: StampedInput = { seat, k: input.k, v: input.v, t };
    let i = s.inputs.length;
    while (i > 0 && s.inputs[i - 1]!.t > t) i--;
    s.inputs.splice(i, 0, stamped);
    return true;
  },
  tick() {},
  // Checked twice a second, so the race ends as soon as every owl is up.
  due: (_s, t) => Math.min(UPDRAFT_MS, (Math.floor(t / 500) + 1) * 500),
  over: (s, t) => t >= UPDRAFT_MS || allUp(s, t),
  result(s) {
    const scores: Record<number, number> = {};
    for (const p of s.players) {
      const f = flightAt(s, p.seat, UPDRAFT_MS);
      scores[p.seat] = f.doneAt !== null ? 100_000 - f.doneAt : Math.floor(f.alt);
    }
    return { scores, places: miniPlaces(scores) };
  },
  view(s, _seat, t) {
    return { air: s.air, inputs: s.inputs, goal: UPDRAFT_GOAL, t };
  },
};
