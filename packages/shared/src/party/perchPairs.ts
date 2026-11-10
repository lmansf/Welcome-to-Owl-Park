/**
 * Perch Pairs (OP-314): twelve knot holes in the old tree, each hiding one of six pairs of things. Two
 * teams take turns: the owl whose turn it is peeks in two holes; a pair stays found for its team and
 * that owl goes again, otherwise both close and the other team goes. The team that finds more pairs
 * wins. On a phone a tap on a hole; on a computer the arrow keys and Space.
 *
 * What a hole hides stays on the room server until an owl peeks: a page is only ever sent the holes
 * that are open.
 */
import { PUZZLE_SYMBOLS, type PuzzleSymbol } from '../puzzles';
import { between, draw, shuffled, type Dice } from './rng';
import { teamPlaces, twoTeams, type MiniInput, type MiniPlayer, type MinigameDef } from './minigame';

export const PAIRS_HOLES = 12;
export const PAIRS_MS = 60_000;
/** An owl has so long to peek, each time. */
export const PEEK_MS = 8_000;
/** Two holes that are no pair stay open this long before they close. */
export const PAIR_SHOW_MS = 1_200;
/** A park owl peeks this long after its turn comes, and remembers what it sees this often. */
const BOT_PEEK_MS = 900;
const BOT_MEMORY = 0.7;

export interface PerchPairsState {
  players: MiniPlayer[];
  /** What each hole hides (never sent to a page). */
  holes: PuzzleSymbol[];
  /** Which team found each hole's pair, or null while it is still hidden. */
  found: (number | null)[];
  teams: number[][];
  /** Pairs found by each team. */
  pairs: number[];
  /** Holes peeked into this turn (one or two). */
  open: number[];
  /** Whose turn: the team, its seat, and each team's next owl in turn. */
  team: number;
  seat: number;
  next: number[];
  /** When the owl must peek by, or when two open holes close (then `closing`). */
  ends: number;
  closing: boolean;
  /** What each park owl remembers seeing in the holes. */
  memory: Record<number, Record<number, PuzzleSymbol>>;
  done: boolean;
  dice: number;
}

const isBot = (s: PerchPairsState, seat: number) => !!s.players.find((p) => p.seat === seat)?.bot;

function seen(s: PerchPairsState, d: Dice, hole: number): void {
  for (const p of s.players) if (p.bot && draw(d) < BOT_MEMORY) (s.memory[p.seat] ??= {})[hole] = s.holes[hole]!;
}

function turnTo(s: PerchPairsState, team: number, t: number): void {
  const members = s.teams[team]!;
  s.team = team;
  s.seat = members[s.next[team]! % members.length]!;
  s.next[team] = (s.next[team]! + 1) % members.length;
  s.open = [];
  s.closing = false;
  s.ends = t + PEEK_MS;
}

function peek(s: PerchPairsState, d: Dice, hole: number, t: number): void {
  s.open.push(hole);
  seen(s, d, hole);
  if (s.open.length < 2) return;
  const [a, b] = s.open as [number, number];
  if (s.holes[a] === s.holes[b]) {
    s.found[a] = s.team;
    s.found[b] = s.team;
    s.pairs[s.team]!++;
    s.open = [];
    s.ends = t + PEEK_MS;
    if (s.found.every((f) => f !== null)) s.done = true;
    return;
  }
  s.closing = true;
  s.ends = t + PAIR_SHOW_MS;
}

/** A park owl's peek: a pair it remembers, the match to a hole just opened, or a hole it has not seen. */
function botPeek(s: PerchPairsState, d: Dice): number {
  const mem = s.memory[s.seat] ?? {};
  const hidden = s.found.map((f, i) => (f === null && !s.open.includes(i) ? i : -1)).filter((i) => i >= 0);
  const known = hidden.filter((i) => mem[i] !== undefined);
  if (s.open.length === 1) {
    const sym = s.holes[s.open[0]!]!;
    const match = known.find((i) => mem[i] === sym);
    if (match !== undefined) return match;
  } else {
    for (const i of known) {
      const j = known.find((k) => k !== i && mem[k] === mem[i]);
      if (j !== undefined) return i;
    }
  }
  const fresh = hidden.filter((i) => mem[i] === undefined);
  const from = fresh.length ? fresh : hidden;
  return from[Math.min(from.length - 1, Math.floor(draw(d) * from.length))]!;
}

function step(s: PerchPairsState, t: number): void {
  const d: Dice = { s: s.dice };
  for (let guard = 0; guard < 200 && !s.done && t < PAIRS_MS; guard++) {
    if (t >= s.ends) {
      // Out of time, or two holes that were no pair: they close, and the other team goes.
      const at = s.ends;
      turnTo(s, 1 - s.team, at);
      continue;
    }
    if (!s.closing && isBot(s, s.seat)) {
      const at = s.ends - PEEK_MS + BOT_PEEK_MS * (s.open.length + 1);
      if (t < at) break;
      peek(s, d, botPeek(s, d), at);
      continue;
    }
    break;
  }
  if (t >= PAIRS_MS) s.done = true;
  s.dice = d.s;
}

export const PERCH_PAIRS: MinigameDef<PerchPairsState> = {
  id: 'perch-pairs',
  name: 'Perch Pairs',
  kind: 'team',
  stream: 'view',
  ms: PAIRS_MS,
  how: {
    phone: 'On your turn, tap two knot holes. Find a pair and go again! Remember what your team sees.',
    keys: 'On your turn, pick two knot holes with the arrow keys and Space. Find a pair and go again!',
  },
  start(players, seed) {
    const d: Dice = { s: seed };
    const holes = shuffled(d, [...PUZZLE_SYMBOLS, ...PUZZLE_SYMBOLS].slice(0, PAIRS_HOLES));
    const teams = twoTeams(players.map((p) => p.seat));
    const s: PerchPairsState = {
      players: [...players],
      holes,
      found: holes.map(() => null),
      teams,
      pairs: teams.map(() => 0),
      open: [],
      team: 0,
      seat: teams[0]![0]!,
      next: teams.map(() => 0),
      ends: PEEK_MS,
      closing: false,
      memory: {},
      done: false,
      dice: 0,
    };
    turnTo(s, between(d, 0, 1), 0);
    s.dice = d.s;
    return s;
  },
  input(s, seat, input: MiniInput, t) {
    step(s, t);
    if (input.k !== 'tap' || !Number.isInteger(input.v) || input.v < 0 || input.v >= PAIRS_HOLES) return false;
    if (s.done || s.closing || seat !== s.seat || isBot(s, seat)) return false;
    if (s.found[input.v] !== null || s.open.includes(input.v)) return false;
    const d: Dice = { s: s.dice };
    peek(s, d, input.v, t);
    s.dice = d.s;
    step(s, t);
    return true;
  },
  tick: (s, t) => step(s, t),
  due(s) {
    if (s.done) return null;
    const bot = !s.closing && isBot(s, s.seat) ? s.ends - PEEK_MS + BOT_PEEK_MS * (s.open.length + 1) : Infinity;
    return Math.min(s.ends, bot, PAIRS_MS);
  },
  over: (s, t) => s.done || t >= PAIRS_MS,
  result(s) {
    const scores: Record<number, number> = {};
    s.teams.forEach((team, i) => team.forEach((seat) => (scores[seat] = s.pairs[i]!)));
    const [a, b] = s.pairs as [number, number];
    const winningTeam = a === b ? null : a > b ? 0 : 1;
    return { scores, places: teamPlaces(s.teams, winningTeam), teams: s.teams, winningTeam };
  },
  view(s, _seat, t) {
    // A hole's thing only once it is found or open: what the others hid stays on the server.
    const holes = s.holes.map((sym, i) => (s.found[i] !== null || s.open.includes(i) ? sym : null));
    return { holes, found: s.found, open: s.open, teams: s.teams, pairs: s.pairs, team: s.team, seat: s.seat, ends: s.ends, closing: s.closing, t };
  },
};
