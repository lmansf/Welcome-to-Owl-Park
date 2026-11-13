/**
 * Hoot Echo (OP-314): the elder owl hoots a pattern on four calls, and every owl hoots it back. The
 * pattern grows by one call each round; a wrong hoot, or running out of time, sits an owl out. The last
 * owl hooting wins. On a phone four big buttons; on a computer the four arrow keys. The server checks
 * every hoot as it comes.
 */
import { draw, pick, type Dice } from './rng';
import { miniPlaces, type MiniPlayer, type MinigameDef } from './minigame';

export const ECHO_CALLS = 4;
/** The first round's pattern is this long; each round adds one. */
export const ECHO_FIRST = 3;
/** How long the elder takes over each call it hoots, and the pause before it starts. */
export const ECHO_CALL_MS = 650;
const ECHO_LEAD_MS = 500;
/** Time to hoot back: so long per call, and a little more. */
const ECHO_PER_CALL_MS = 1_000;
const ECHO_SPARE_MS = 2_500;
/** The longest a game of Hoot Echo goes on, however many owls are still hooting. */
export const ECHO_MS = 60_000;
/** A park owl hoots a call this long after the last. */
const BOT_GAP_MS = 620;
const PATTERN_MAX = 14;

export interface HootEchoState {
  players: MiniPlayer[];
  pattern: number[];
  round: number;
  phase: 'show' | 'answer' | 'done';
  /** When the phase began and ends (ms from the start). */
  at: number;
  ends: number;
  /** Still hooting. */
  alive: number[];
  /** Calls hooted back right this round, and when each seat finished the round. */
  got: Record<number, number>;
  doneAt: Record<number, number>;
  /** Rounds hooted back whole, and the time taken over them. */
  cleared: Record<number, number>;
  took: Record<number, number>;
  /** How far each owl that sat out got in its last round. */
  partial: Record<number, number>;
  /** Each park owl's plan for this round: the call it gets wrong (null: none). */
  slip: Record<number, number | null>;
  dice: number;
}

const lengthOf = (round: number) => ECHO_FIRST + round - 1;
const showMs = (round: number) => ECHO_LEAD_MS + lengthOf(round) * ECHO_CALL_MS;
const answerMs = (round: number) => lengthOf(round) * ECHO_PER_CALL_MS + ECHO_SPARE_MS;

function newRound(s: HootEchoState, round: number, at: number): void {
  s.round = round;
  s.phase = 'show';
  s.at = at;
  s.ends = at + showMs(round);
  s.got = {};
  s.doneAt = {};
  const d: Dice = { s: s.dice };
  const len = lengthOf(round);
  for (const seat of s.alive) {
    if (!s.players.find((p) => p.seat === seat)?.bot) continue;
    // A park owl slips now and then, more often as the pattern grows.
    const each = 0.01 + 0.03 * (len - 2);
    let slip: number | null = null;
    for (let i = 0; i < len && slip === null; i++) if (draw(d) < each) slip = i;
    s.slip[seat] = slip;
  }
  s.dice = d.s;
}

function sitOut(s: HootEchoState, seat: number): void {
  s.alive = s.alive.filter((a) => a !== seat);
  s.partial[seat] = s.got[seat] ?? 0;
}

function finishRound(s: HootEchoState, t: number): void {
  for (const seat of [...s.alive]) if (s.doneAt[seat] === undefined) sitOut(s, seat);
  for (const seat of s.alive) {
    s.cleared[seat] = (s.cleared[seat] ?? 0) + 1;
    s.took[seat] = (s.took[seat] ?? 0) + (s.doneAt[seat]! - s.at);
  }
  const next = s.round + 1;
  const fits = s.ends + showMs(next) + answerMs(next) <= ECHO_MS && lengthOf(next) <= PATTERN_MAX;
  if (s.alive.length <= 1 || !fits) {
    s.phase = 'done';
    s.at = t;
    s.ends = t;
    return;
  }
  newRound(s, next, s.ends);
}

/** A hoot back from a seat: right, it counts; wrong, the seat sits out. */
function hoot(s: HootEchoState, seat: number, call: number, t: number): void {
  const got = s.got[seat] ?? 0;
  if (s.pattern[got] !== call) return sitOut(s, seat);
  s.got[seat] = got + 1;
  if (got + 1 === lengthOf(s.round)) s.doneAt[seat] = t;
}

function botsTo(s: HootEchoState, t: number): void {
  if (s.phase !== 'answer') return;
  for (const seat of [...s.alive]) {
    if (!s.players.find((p) => p.seat === seat)?.bot || s.doneAt[seat] !== undefined) continue;
    const due = Math.min(lengthOf(s.round), Math.floor((t - s.at) / BOT_GAP_MS));
    while ((s.got[seat] ?? 0) < due && s.alive.includes(seat) && s.doneAt[seat] === undefined) {
      const i = s.got[seat] ?? 0;
      const at = s.at + (i + 1) * BOT_GAP_MS;
      hoot(s, seat, s.slip[seat] === i ? (s.pattern[i]! + 1) % ECHO_CALLS : s.pattern[i]!, at);
    }
  }
}

function step(s: HootEchoState, t: number): void {
  while (s.phase !== 'done' && t >= s.ends) {
    if (s.phase === 'show') {
      s.phase = 'answer';
      s.at = s.ends;
      s.ends = s.at + answerMs(s.round);
    } else {
      botsTo(s, s.ends);
      finishRound(s, s.ends);
    }
  }
  botsTo(s, t);
  // Everyone still hooting has hooted the round back: on to the next at once.
  if (s.phase === 'answer' && s.alive.every((seat) => s.doneAt[seat] !== undefined)) {
    s.ends = t;
    finishRound(s, t);
  }
  if (s.phase === 'answer' && s.alive.length <= 1 && s.players.length > 1) {
    s.phase = 'done';
    s.ends = t;
  }
}

export const HOOT_ECHO: MinigameDef<HootEchoState> = {
  id: 'hoot-echo',
  name: 'Hoot Echo',
  kind: 'all',
  stream: 'view',
  ms: ECHO_MS,
  how: { phone: 'Listen to the elder, then tap the calls back in the same order.', keys: 'Listen to the elder, then press the arrow keys back in the same order.' },
  start(players, seed) {
    const d: Dice = { s: seed };
    const pattern = Array.from({ length: PATTERN_MAX }, () => pick(d, ECHO_CALLS));
    const s: HootEchoState = { players: [...players], pattern, round: 1, phase: 'show', at: 0, ends: 0, alive: players.map((p) => p.seat), got: {}, doneAt: {}, cleared: {}, took: {}, partial: {}, slip: {}, dice: d.s };
    newRound(s, 1, 0);
    return s;
  },
  input(s, seat, input, t) {
    step(s, t);
    if (input.k !== 'tap' || !Number.isInteger(input.v) || input.v < 0 || input.v >= ECHO_CALLS) return false;
    if (s.phase !== 'answer' || !s.alive.includes(seat) || s.doneAt[seat] !== undefined) return false;
    if (s.players.find((p) => p.seat === seat)?.bot) return false;
    hoot(s, seat, input.v, t);
    step(s, t);
    return true;
  },
  tick: (s, t) => step(s, t),
  due(s, t) {
    if (s.phase === 'done') return null;
    if (s.phase === 'answer') {
      const next = s.at + (Math.floor((t - s.at) / BOT_GAP_MS) + 1) * BOT_GAP_MS;
      const bots = s.alive.some((seat) => s.players.find((p) => p.seat === seat)?.bot && s.doneAt[seat] === undefined);
      return bots ? Math.min(next, s.ends) : s.ends;
    }
    return s.ends;
  },
  over: (s, t) => s.phase === 'done' || t >= ECHO_MS,
  result(s) {
    const scores: Record<number, number> = {};
    for (const p of s.players) {
      const alive = s.alive.includes(p.seat);
      const took = Math.floor((s.took[p.seat] ?? 0) / 1000);
      scores[p.seat] = (s.cleared[p.seat] ?? 0) * 10_000 + (alive ? 0 : (s.partial[p.seat] ?? 0)) * 100 + Math.max(0, 99 - took) + (alive ? 5_000 : 0);
    }
    return { scores, places: miniPlaces(scores) };
  },
  view(s, _seat, t) {
    const len = lengthOf(s.round);
    return {
      round: s.round,
      phase: s.phase,
      at: s.at,
      ends: s.ends,
      length: len,
      // The pattern only while the elder hoots it: afterwards it is each owl's to remember.
      ...(s.phase === 'show' ? { pattern: s.pattern.slice(0, len), callMs: ECHO_CALL_MS, leadMs: ECHO_LEAD_MS } : {}),
      alive: s.alive,
      got: s.got,
      cleared: s.cleared,
      t,
    };
  },
};
