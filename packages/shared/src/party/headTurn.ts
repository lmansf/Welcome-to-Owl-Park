/**
 * Head-Turn Freeze (OP-314): the owls creep along a branch towards the watcher, an old owl at its far
 * end. While the watcher looks away they may creep; a rustle warns the watcher is about to turn; once
 * it looks, any owl still creeping is caught and goes back to the start of the branch. The first owl to
 * the watcher wins. On a phone a hold button; on a computer Space (or the up arrow).
 *
 * The watcher's turns are planned on the room server and never sent ahead: a page only hears how the
 * watcher is looking now. Every hold is stamped by the server, which works out where each owl is.
 */
import { between, draw, type Dice } from './rng';
import { inputsOf, miniPlaces, type MiniInput, type MiniPlayer, type MinigameDef, type StampedInput } from './minigame';

/** How long the branch is (branch px), and how fast an owl creeps along it (px/s). */
export const BRANCH_LENGTH = 1000;
export const CREEP_SPEED = 120;
export const HEAD_MS = 45_000;
/** The rustle before the watcher turns. */
export const RUSTLE_MS = 500;
/** Once the watcher looks, an owl that lets go this soon is not caught (nobody stops at once). */
export const GRACE_MS = 300;
/** Worked out in steps this long. */
export const HEAD_STEP_MS = 25;
const MIN_GAP_MS = 80;
const MAX_INPUTS = 400;

export type WatcherLook = 'watch' | 'away' | 'rustle';

/** One turn of the watcher's: looking away from `away`, rustling from `rustle`, watching from `watch` until `until`. */
export interface WatchTurn {
  away: number;
  rustle: number;
  watch: number;
  until: number;
}

export interface HeadTurnState {
  players: MiniPlayer[];
  turns: WatchTurn[];
  inputs: StampedInput[];
}

export interface Creep {
  pos: number;
  holding: boolean;
  caught: number;
  /** Frozen after a catch until the watcher looks away again. */
  frozen: boolean;
  doneAt: number | null;
}

/** How the watcher is looking at `t`, and since when. */
export function watcherAt(turns: readonly WatchTurn[], t: number): { look: WatcherLook; since: number } {
  for (const w of turns) {
    if (t < w.away) return { look: 'watch', since: 0 };
    if (t < w.rustle) return { look: 'away', since: w.away };
    if (t < w.watch) return { look: 'rustle', since: w.rustle };
    if (t < w.until) return { look: 'watch', since: w.watch };
  }
  return { look: 'watch', since: turns.at(-1)?.until ?? 0 };
}

/** Where a seat's owl is at `t`, crept through each of its holds. */
export function creepAt(s: Pick<HeadTurnState, 'turns' | 'inputs'>, seat: number, t: number): Creep {
  const c: Creep = { pos: 0, holding: false, caught: 0, frozen: false, doneAt: null };
  const mine = inputsOf(s.inputs, seat, 'hold');
  let n = 0;
  const end = Math.min(t, HEAD_MS);
  for (let at = 0; at < end && c.doneAt === null; at += HEAD_STEP_MS) {
    while (n < mine.length && mine[n]!.t <= at) c.holding = mine[n++]!.v === 1;
    const w = watcherAt(s.turns, at);
    if (w.look !== 'watch') c.frozen = false;
    // Before the watcher first looks away nobody may creep; once it has turned (and the grace is over), a creeping owl is caught.
    const opening = w.look === 'watch' && w.since === 0;
    if (w.look === 'watch' && !opening && at - w.since >= GRACE_MS) {
      if (c.holding && !c.frozen) {
        if (c.pos > 0) c.caught++;
        c.pos = 0;
        c.frozen = true;
      }
      continue;
    }
    if (opening || !c.holding || c.frozen) continue;
    c.pos += (CREEP_SPEED * HEAD_STEP_MS) / 1000;
    if (c.pos >= BRANCH_LENGTH) {
      c.pos = BRANCH_LENGTH;
      c.doneAt = at + HEAD_STEP_MS;
    }
  }
  while (n < mine.length && mine[n]!.t <= end) c.holding = mine[n++]!.v === 1;
  return c;
}

function makeTurns(d: Dice): WatchTurn[] {
  const turns: WatchTurn[] = [];
  let t = 1_500;
  while (t < HEAD_MS) {
    const away = t;
    const rustle = away + between(d, 1_500, 4_500);
    const watch = rustle + RUSTLE_MS;
    const until = watch + between(d, 1_200, 2_600);
    turns.push({ away, rustle, watch, until });
    t = until;
  }
  return turns;
}

/** A park owl's creeping: it sets off soon after the watcher looks away and stops at the rustle, a little late, and now and then too late. */
function botInputs(d: Dice, seat: number, turns: readonly WatchTurn[]): StampedInput[] {
  const out: StampedInput[] = [];
  for (const w of turns) {
    const go = w.away + between(d, 250, 600);
    const greedy = draw(d) < 0.12;
    const stop = greedy ? w.watch + between(d, 320, 700) : w.rustle + between(d, 120, 420);
    if (go >= HEAD_MS) break;
    out.push({ seat, k: 'hold', v: 1, t: go }, { seat, k: 'hold', v: 0, t: Math.min(HEAD_MS, stop) });
  }
  return out;
}

const allThere = (s: HeadTurnState, t: number) => s.players.every((p) => creepAt(s, p.seat, t).doneAt !== null);

/** The next moment the view changes on its own: the watcher's next look, or a park owl's next hold. */
function nextChange(s: HeadTurnState, t: number): number {
  let next = HEAD_MS;
  for (const w of s.turns) for (const at of [w.away, w.rustle, w.watch, w.watch + GRACE_MS, w.until]) if (at > t && at < next) next = at;
  for (const i of s.inputs) if (i.t > t && i.t < next && s.players.find((p) => p.seat === i.seat)?.bot) next = i.t;
  return next;
}

export const HEAD_TURN: MinigameDef<HeadTurnState> = {
  id: 'head-turn',
  name: 'Head-Turn Freeze',
  kind: 'all',
  stream: 'view',
  ms: HEAD_MS,
  how: {
    phone: 'Hold Creep to sneak up while the watcher looks away. Let go at the rustle, or back you go!',
    keys: 'Hold Space to sneak up while the watcher looks away. Let go at the rustle, or back you go!',
  },
  start(players, seed) {
    const d: Dice = { s: seed };
    const turns = makeTurns(d);
    const inputs = players.filter((p) => p.bot).flatMap((p) => botInputs(d, p.seat, turns));
    return { players: [...players], turns, inputs: inputs.sort((a, b) => a.t - b.t) };
  },
  input(s, seat, input: MiniInput, t) {
    if (input.k !== 'hold' || (input.v !== 0 && input.v !== 1) || t < 0 || t > HEAD_MS) return false;
    const player = s.players.find((p) => p.seat === seat);
    if (!player || player.bot) return false;
    const mine = inputsOf(s.inputs, seat);
    if (mine.length >= MAX_INPUTS || (mine.length && t - mine.at(-1)!.t < MIN_GAP_MS)) return false;
    if (creepAt(s, seat, t).doneAt !== null) return false;
    let i = s.inputs.length;
    while (i > 0 && s.inputs[i - 1]!.t > t) i--;
    s.inputs.splice(i, 0, { seat, k: 'hold', v: input.v, t });
    return true;
  },
  tick() {},
  due: (s, t) => nextChange(s, t),
  over: (s, t) => t >= HEAD_MS || allThere(s, t),
  result(s) {
    const scores: Record<number, number> = {};
    for (const p of s.players) {
      const c = creepAt(s, p.seat, HEAD_MS);
      scores[p.seat] = c.doneAt !== null ? 100_000 - c.doneAt : Math.floor(c.pos);
    }
    return { scores, places: miniPlaces(scores) };
  },
  view(s, _seat, t) {
    const w = watcherAt(s.turns, t);
    const owls: Record<number, { pos: number; holding: boolean; caught: number; frozen: boolean; done: boolean }> = {};
    for (const p of s.players) {
      const c = creepAt(s, p.seat, t);
      owls[p.seat] = { pos: Math.round(c.pos), holding: c.holding, caught: c.caught, frozen: c.frozen, done: c.doneAt !== null };
    }
    // Only how the watcher looks now, and since when: never when it turns next.
    return { look: w.look, since: w.since, owls, length: BRANCH_LENGTH, speed: CREEP_SPEED, grace: GRACE_MS, t };
  },
};
