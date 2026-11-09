/**
 * Branch Balance (OP-314): one owl is the wind, the rest perch. Ten times over, each percher picks one
 * of four branches to sit on and the wind picks two branches to blow; then all is shown. A percher on a
 * blown branch is blown off; one on a still branch holds on. The wind scores for every owl it blows
 * off, each percher for every time it holds on. Each round of the party a different owl is the wind.
 * On a phone four branch buttons; on a computer the keys 1 to 4 (or the arrow keys).
 *
 * Picks stay on the room server until the reveal: while owls pick, a page sees only its own.
 */
import { between, pick, shuffled, type Dice } from './rng';
import { miniPlaces, type MiniInput, type MiniPlayer, type MinigameDef } from './minigame';

export const BRANCHES = 4;
/** The wind blows this many branches each time. */
export const BLOWS = 2;
export const BALANCE_TIMES = 10;
export const PICK_MS = 3_000;
export const REVEAL_MS = 1_500;
export const BALANCE_MS = BALANCE_TIMES * (PICK_MS + REVEAL_MS);

export interface BalanceTime {
  blow: number[];
  picks: Record<number, number>;
}

export interface BranchBalanceState {
  players: MiniPlayer[];
  wind: number;
  perchers: number[];
  /** Which time this is (0..9), and whether owls are picking or seeing it. */
  time: number;
  phase: 'pick' | 'reveal' | 'done';
  at: number;
  picks: Record<number, number>;
  blow: number[];
  /** Times blown off (the wind's), and times held on (each percher's). */
  blown: number;
  held: Record<number, number>;
  past: BalanceTime[];
  /** Each park owl's plan for this time: when it picks, and what. */
  plan: Record<number, { at: number; branches: number[] }>;
  dice: number;
}

const isBot = (s: BranchBalanceState, seat: number) => !!s.players.find((p) => p.seat === seat)?.bot;

/** The wind this round of the party: each round the next owl along. */
export function windOf(seats: readonly number[], round: number): number {
  const sorted = [...seats].sort((a, b) => a - b);
  return sorted[(((round - 1) % sorted.length) + sorted.length) % sorted.length]!;
}

function plan(s: BranchBalanceState, d: Dice): void {
  s.plan = {};
  for (const p of s.players) {
    if (!p.bot) continue;
    const at = s.at + between(d, 600, 2_400);
    if (p.seat === s.wind) s.plan[p.seat] = { at, branches: shuffled(d, [0, 1, 2, 3]).slice(0, BLOWS) };
    else s.plan[p.seat] = { at, branches: [pick(d, BRANCHES)] };
  }
}

function reveal(s: BranchBalanceState, d: Dice, at: number): void {
  const blow = [...s.blow];
  // A wind that did not pick both blows somewhere anyway.
  while (blow.length < BLOWS) {
    const b = pick(d, BRANCHES);
    if (!blow.includes(b)) blow.push(b);
  }
  for (const seat of s.perchers) {
    if (blow.includes(s.picks[seat]!)) s.blown++;
    else s.held[seat] = (s.held[seat] ?? 0) + 1;
  }
  s.past.push({ blow, picks: { ...s.picks } });
  s.blow = blow;
  s.phase = 'reveal';
  s.at = at;
}

function step(s: BranchBalanceState, t: number): void {
  const d: Dice = { s: s.dice };
  for (let guard = 0; guard < 50 && s.phase !== 'done'; guard++) {
    if (s.phase === 'pick') {
      for (const [seat, p] of Object.entries(s.plan)) {
        if (p.at > t) continue;
        if (Number(seat) === s.wind) s.blow = [...p.branches];
        else s.picks[Number(seat)] = p.branches[0]!;
        delete s.plan[Number(seat)];
      }
      if (t < s.at + PICK_MS) break;
      reveal(s, d, s.at + PICK_MS);
      continue;
    }
    if (t < s.at + REVEAL_MS) break;
    const at = s.at + REVEAL_MS;
    if (s.time + 1 >= BALANCE_TIMES) {
      s.phase = 'done';
      s.at = at;
      break;
    }
    s.time++;
    s.phase = 'pick';
    s.at = at;
    s.blow = [];
    plan(s, d);
  }
  s.dice = d.s;
}

/** The wind's score and a percher's, on one scale: out of 1000 each, so the wind and the perchers can be placed together. */
export function balanceScores(s: BranchBalanceState): Record<number, number> {
  const scores: Record<number, number> = {};
  scores[s.wind] = Math.round((1000 * s.blown) / Math.max(1, s.perchers.length * BALANCE_TIMES));
  for (const seat of s.perchers) scores[seat] = Math.round((1000 * (s.held[seat] ?? 0)) / BALANCE_TIMES);
  return scores;
}

export const BRANCH_BALANCE: MinigameDef<BranchBalanceState> = {
  id: 'branch-balance',
  name: 'Branch Balance',
  kind: 'one-vs-rest',
  stream: 'view',
  ms: BALANCE_MS,
  how: {
    phone: 'Perchers: tap a branch to sit on. The wind: tap two branches to blow!',
    keys: 'Perchers: press 1 to 4 to pick a branch to sit on. The wind: press two of 1 to 4 to blow!',
  },
  start(players, seed, round) {
    const d: Dice = { s: seed };
    const wind = windOf(
      players.map((p) => p.seat),
      round,
    );
    const perchers = players.map((p) => p.seat).filter((seat) => seat !== wind);
    const picks: Record<number, number> = {};
    perchers.forEach((seat, i) => (picks[seat] = (i + pick(d, BRANCHES)) % BRANCHES));
    const s: BranchBalanceState = { players: [...players], wind, perchers, time: 0, phase: 'pick', at: 0, picks, blow: [], blown: 0, held: {}, past: [], plan: {}, dice: 0 };
    plan(s, d);
    s.dice = d.s;
    return s;
  },
  input(s, seat, input: MiniInput, t) {
    step(s, t);
    if (input.k !== 'tap' || !Number.isInteger(input.v) || input.v < 0 || input.v >= BRANCHES) return false;
    if (s.phase !== 'pick' || isBot(s, seat) || !s.players.some((p) => p.seat === seat)) return false;
    if (seat === s.wind) {
      // A tap on a blown branch takes it back; a third branch takes the place of the first.
      if (s.blow.includes(input.v)) s.blow = s.blow.filter((b) => b !== input.v);
      else s.blow = [...s.blow, input.v].slice(-BLOWS);
    } else s.picks[seat] = input.v;
    return true;
  },
  tick: (s, t) => step(s, t),
  due(s) {
    if (s.phase === 'done') return null;
    if (s.phase === 'reveal') return s.at + REVEAL_MS;
    const bots = Object.values(s.plan).map((p) => p.at);
    return Math.min(s.at + PICK_MS, ...bots);
  },
  over: (s, t) => s.phase === 'done' || t >= BALANCE_MS,
  result(s) {
    const scores = balanceScores(s);
    return { scores, places: miniPlaces(scores) };
  },
  view(s, seat, t) {
    const scores = balanceScores(s);
    const base = { wind: s.wind, perchers: s.perchers, time: s.time, times: BALANCE_TIMES, phase: s.phase, at: s.at, pickMs: PICK_MS, revealMs: REVEAL_MS, scores, t };
    if (s.phase === 'pick') {
      // While owls pick, each sees only its own choice.
      const mine = seat === null ? {} : seat === s.wind ? { blow: s.blow } : { pick: s.picks[seat] };
      return { ...base, ...mine };
    }
    const last = s.past.at(-1);
    return { ...base, ...(last ? { blow: last.blow, picks: last.picks } : {}) };
  },
};
