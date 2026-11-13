/**
 * The Old Stump's party game (OP-314): two to four owls round the stump, eight rounds of everyone's
 * turn on the board and then a minigame, and the owl with the most Moonstones wins. Pure rules over a
 * game's state, which is plain data: the room server keeps it, moves it on with `partyTick` and
 * `partyInput`, and sends each page `partyView`. Every roll, hop of the Moon Perch, surprise and result
 * is decided here, on the server, from the game's own dice; a page only asks.
 */
import type { OwlLook } from '../protocol';
import { getSpecies } from '../species';
import { owlFactQuestion, OWL_FACTS, type OwlFactQuestion } from '../owlFacts';
import {
  BERRY_GAIN,
  BRAMBLE_LOSS,
  DOWNDRAFT_SPACES,
  FACT_GAIN,
  HOLLOW_COST,
  KNOT_GIFT,
  MOONSTONE_COST,
  PERCH_SPACES,
  START_SPACE,
  UPDRAFT_SPACES,
  hopsBetween,
  space,
} from './board';
import { draw, between, pick, shuffled, type Dice } from './rng';
import { MINI_KEYS, miniBerries, miniWinners, type MiniInput, type MiniKey, type MiniPlayer, type MiniResult, type MinigameDef, type MinigameId } from './minigame';
import { MINIGAMES } from './minigames';
import { PARTY_WORDS } from './words';

export const PARTY_SEATS = 4;
export const PARTY_MIN_OWLS = 2;
export const PARTY_ROUNDS = 8;
/** The minigames the owner picked for the first build (Nov 8), as they come round. */
export const PARTY_MINIGAMES: readonly MinigameId[] = ['updraft-race', 'head-turn', 'feather-fall', 'perch-pairs', 'branch-balance', 'hoot-echo'];

/** How long the owls invited from the stump have to arrive before a park owl takes each missing seat. */
export const GATHER_MS = 20_000;
/** How long a turn waits for its owl to roll, choose a way or answer, before it goes on by itself. */
export const ROLL_WAIT_MS = 15_000;
export const CHOOSE_WAIT_MS = 10_000;
export const FACT_WAIT_MS = 14_000;
/** A park owl rolls and chooses after this little pause, so the page can show it. */
export const BOT_PAUSE_MS = 1_200;
export const BOT_FACT_MS = 2_500;
/** How long a turn's outcome shows: so long, and a little more for each hop. */
export const SHOW_MS = 1_800;
export const BOARD_HOP_MS = 280;
/** The minigame's card before it starts, its results after, the end bonuses and the winner screen. */
export const INTRO_MS = 6_000;
export const SCORES_MS = 6_000;
export const BONUS_MS = 9_000;
/** The winner screen stays this long; then the room is let go. */
export const OVER_MS = 3 * 60_000;
/**
 * The longest a game can take, every turn waiting as long as it may: the stump starts no game that
 * could not finish before the nightly restart (OP-181).
 */
export const PARTY_LONGEST_MS = GATHER_MS + PARTY_ROUNDS * (PARTY_SEATS * (ROLL_WAIT_MS + 2 * CHOOSE_WAIT_MS + FACT_WAIT_MS + SHOW_MS + 12 * BOARD_HOP_MS) + INTRO_MS + 60_000 + SCORES_MS) + BONUS_MS;
/** Feathers a finished game pays its visitors by place (1st to 4th), for the first few games of a park day (the design's section 5). */
export const PARTY_FEATHERS: readonly number[] = [40, 25, 15, 15];
export const PARTY_PAID_GAMES = 3;
/** A park owl answers an Owl Fact right this often. */
const BOT_FACT_RIGHT = 0.7;

/** What an owl shows at the stump: its colours and kind, nothing more. */
export type PartyLook = Pick<OwlLook, 'body' | 'belly' | 'accent' | 'species'>;

export function partyLook(look: OwlLook): PartyLook {
  return { body: look.body, belly: look.belly, accent: look.accent, ...(look.species ? { species: look.species } : {}) };
}

export interface PartyOwl {
  seat: number;
  /** The owl's id in the room; a park owl's is `bot-<seat>`. */
  owl: string;
  /** A park owl, filling a seat: it plays and earns nothing. */
  bot: boolean;
  /** Its visitor left, or never came: a park owl plays for it from then on, and it earns nothing. */
  away?: true;
  /** Here only for the room server: the owl's collection, and whether it is a free guest. Never in a view. */
  cid?: string;
  spec?: true;
  /** Came into the game's room. */
  here?: true;
  look: PartyLook;
  at: number;
  /** The spaces it stood on last, the latest last: a downdraft takes it back along them. */
  trail: number[];
  berries: number;
  stones: number;
  wins: number;
  facts: number;
  flown: number;
}

export type TurnStep = 'roll' | 'fork' | 'hollow' | 'fact' | 'show';

export interface PartyTurn {
  seat: number;
  step: TurnStep;
  /** When the step goes on by itself. */
  ends: number;
  roll: number;
  left: number;
  /** The spaces it hopped through this turn, in order, for the page to hop it along. */
  path: number[];
  /** What happened, a short line each. */
  notes: string[];
  /** The way chosen at the fork it stands at (0 short, 1 long), until the next hop takes it. */
  way?: number;
  question?: OwlFactQuestion;
  answer?: boolean;
}

export type PartyPhase = 'gather' | 'turn' | 'intro' | 'mini' | 'scores' | 'bonus' | 'over' | 'ended';

export interface PartyMini {
  id: MinigameId;
  /** When it starts (after its card), on the server's clock. */
  at: number;
  state: unknown;
  result?: MiniResult;
  berries?: Record<number, number>;
}

export interface PartyBonus {
  what: 'wins' | 'facts' | 'flown';
  seats: number[];
}

export interface PartyState {
  v: 1;
  /** The game's room (`party-<id>`). */
  room: string;
  dice: number;
  round: number;
  phase: PartyPhase;
  /** When the phase began and ends (ms, the server's clock). */
  at: number;
  ends: number;
  /** When the nightly restart closes the park: the game ends there, finished or not. */
  closesAt: number;
  owls: PartyOwl[];
  perch: number;
  turn: PartyTurn | null;
  minis: MinigameId[];
  mini: PartyMini | null;
  factStart: number;
  facts: number;
  bonuses?: PartyBonus[];
  /** Seats in their final order, and the winners (more than one on a tie that every tie-break keeps). */
  standings?: number[];
  winners?: number[];
  ended?: 'restart' | 'empty';
  /** The room server paid this game's feathers (once). */
  paid?: true;
}

/** Who sits down to a game, seat by seat: a visitor's owl, or a park owl. */
export interface PartySeat {
  owl: string;
  bot: boolean;
  look: PartyLook;
  cid?: string;
  spec?: boolean;
}

/** The park owls' looks: a few real owls' colours. */
export const PARK_OWL_LOOKS: readonly PartyLook[] = (['barn', 'snowy', 'burrowing', 'screech'] as const).map((id) => ({ ...getSpecies(id).natural, species: id }));

/** A new game for these seats (two to four), its dice from the server's random source. */
export function newParty(opts: { room: string; seats: readonly PartySeat[]; seed: number; now: number; closesAt: number; minis?: readonly MinigameId[] }): PartyState {
  const d: Dice = { s: opts.seed };
  const owls: PartyOwl[] = opts.seats.slice(0, PARTY_SEATS).map((s, seat) => ({
    seat,
    owl: s.bot ? `bot-${seat}` : s.owl,
    bot: s.bot,
    ...(s.cid && !s.bot ? { cid: s.cid } : {}),
    ...(s.spec ? { spec: true as const } : {}),
    ...(s.bot ? { here: true as const } : {}),
    look: s.look,
    at: START_SPACE,
    trail: [START_SPACE],
    berries: 0,
    stones: 0,
    wins: 0,
    facts: 0,
    flown: 0,
  }));
  const picked = (opts.minis ?? PARTY_MINIGAMES).filter((id) => Object.hasOwn(MINIGAMES, id));
  // Every picked minigame once before any comes again, and never the same one twice running.
  const minis: MinigameId[] = [];
  while (picked.length && minis.length < PARTY_ROUNDS) {
    const next = shuffled(d, picked);
    if (picked.length > 1 && next[0] === minis.at(-1)) next.push(next.shift()!);
    minis.push(...next);
  }
  minis.length = Math.min(minis.length, PARTY_ROUNDS);
  const perch = PERCH_SPACES[pick(d, PERCH_SPACES.length)]!;
  const factStart = pick(d, OWL_FACTS.length);
  return { v: 1, room: opts.room, dice: d.s, round: 1, phase: 'gather', at: opts.now, ends: opts.now + GATHER_MS, closesAt: opts.closesAt, owls, perch, turn: null, minis, mini: null, factStart, facts: 0 };
}

const dice = (s: PartyState): Dice => ({ s: s.dice });
const keep = (s: PartyState, d: Dice) => void (s.dice = d.s);
/** A park owl plays this seat: one from the start, or one standing in for an owl whose visitor left. */
const botty = (o: PartyOwl) => o.bot || o.away === true;

export function owlOf(s: PartyState, owl: string): PartyOwl | undefined {
  return s.owls.find((o) => o.owl === owl);
}

/** An invited owl came into the game's room (again, after a dropped line). */
export function partyArrive(s: PartyState, owl: string, now: number): boolean {
  const o = owlOf(s, owl);
  if (!o || o.bot) return false;
  o.here = true;
  // Back after a dropped line: it takes its seat again from the park owl that played it meanwhile.
  if (o.away && !partyDone(s)) delete o.away;
  if (s.phase === 'gather' && s.owls.every((x) => x.here)) begin(s, now);
  return true;
}

/** An owl's visitor left the game: a park owl plays its seat from then on. */
export function partyLeave(s: PartyState, owl: string, now: number): void {
  const o = owlOf(s, owl);
  if (!o || o.bot || partyDone(s)) return;
  o.away = true;
  if (s.owls.every(botty) && s.phase !== 'over' && s.phase !== 'ended') return end(s, 'empty', now);
  // Its turn waiting on it goes on after a park owl's pause, not the visitor's whole wait.
  const t = s.turn;
  if (s.phase === 'turn' && t && t.seat === o.seat && t.step !== 'show') {
    t.ends = Math.min(t.ends, now + BOT_PAUSE_MS);
    s.ends = t.ends;
  }
  partyTick(s, now);
}

function end(s: PartyState, why: 'restart' | 'empty', now: number): void {
  s.phase = 'ended';
  s.ended = why;
  s.turn = null;
  s.at = now;
  s.ends = now + OVER_MS;
}

function begin(s: PartyState, now: number): void {
  for (const o of s.owls) if (!o.here) o.away = true;
  if (s.owls.every(botty)) return end(s, 'empty', now);
  s.phase = 'turn';
  s.at = now;
  startTurn(s, 0, now);
}

function startTurn(s: PartyState, seat: number, now: number): void {
  const o = s.owls[seat]!;
  const wait = botty(o) ? BOT_PAUSE_MS : ROLL_WAIT_MS;
  s.turn = { seat, step: 'roll', ends: now + wait, roll: 0, left: 0, path: [], notes: [] };
  s.ends = s.turn.ends;
}

function hopPerch(s: PartyState, d: Dice): void {
  const others = PERCH_SPACES.filter((n) => n !== s.perch);
  s.perch = others[pick(d, others.length)]!;
}

function hopTo(s: PartyState, o: PartyOwl, n: number, d: Dice): void {
  o.at = n;
  o.trail = [...o.trail, n].slice(-8);
  s.turn?.path.push(n);
  // Passing the Moon Perch, or landing on it, with 10 Glowberries trades them for a Moonstone.
  if (n === s.perch && o.berries >= MOONSTONE_COST) {
    o.berries -= MOONSTONE_COST;
    o.stones += 1;
    s.turn?.notes.push(PARTY_WORDS.stone);
    hopPerch(s, d);
  }
}

/** A park owl's way at a fork: the short way when it is short of berries to lose... half the time. */
function botWay(o: PartyOwl, d: Dice): number {
  return o.berries < BRAMBLE_LOSS ? 0 : draw(d) < 0.5 ? 0 : 1;
}

function botHollow(s: PartyState, o: PartyOwl): boolean {
  const through = space(o.at).hollowTo;
  return through !== undefined && o.berries >= HOLLOW_COST + MOONSTONE_COST - 2 && hopsBetween(through, s.perch) < hopsBetween(o.at, s.perch);
}

function waitFor(s: PartyState, step: TurnStep, ms: number, now: number): void {
  const t = s.turn!;
  t.step = step;
  t.ends = now + ms;
  s.ends = t.ends;
}

/** Hops the rest of the roll, stopping where the owl has to choose. */
function move(s: PartyState, now: number): void {
  const t = s.turn!;
  const o = s.owls[t.seat]!;
  const d = dice(s);
  while (t.left > 0) {
    const here = space(o.at);
    if (here.next.length > 1 && t.way === undefined) {
      if (botty(o)) t.way = botWay(o, d);
      else {
        keep(s, d);
        return waitFor(s, 'fork', CHOOSE_WAIT_MS, now);
      }
    }
    const to = here.next.length > 1 ? here.next[t.way ?? 1]! : here.next[0]!;
    delete t.way;
    hopTo(s, o, to, d);
    t.left--;
  }
  keep(s, d);
  land(s, now);
}

function land(s: PartyState, now: number): void {
  const t = s.turn!;
  const o = s.owls[t.seat]!;
  const d = dice(s);
  const here = space(o.at);
  switch (here.kind) {
    case 'berry':
      o.berries += BERRY_GAIN;
      t.notes.push(PARTY_WORDS.berries);
      break;
    case 'bramble':
      o.berries = Math.max(0, o.berries - BRAMBLE_LOSS);
      t.notes.push(PARTY_WORDS.bramble);
      break;
    case 'updraft':
      t.notes.push(PARTY_WORDS.updraft);
      for (let i = 0; i < UPDRAFT_SPACES; i++) {
        const next = space(o.at).next;
        hopTo(s, o, next[next.length - 1]!, d);
        o.flown++;
      }
      break;
    case 'downdraft': {
      t.notes.push(PARTY_WORDS.downdraft);
      const back = o.trail.length > DOWNDRAFT_SPACES ? o.trail[o.trail.length - 1 - DOWNDRAFT_SPACES]! : START_SPACE;
      o.trail = o.trail.slice(0, Math.max(1, o.trail.length - DOWNDRAFT_SPACES));
      o.at = back;
      t.path.push(back);
      break;
    }
    case 'fact':
      t.question = owlFactQuestion(s.factStart, s.facts++);
      keep(s, d);
      return waitFor(s, 'fact', botty(o) ? BOT_FACT_MS : FACT_WAIT_MS, now);
    case 'knot': {
      const others = s.owls.filter((x) => x.seat !== o.seat);
      const what = pick(d, 3);
      if (what === 0 && others.length) {
        const other = others[pick(d, others.length)]!;
        [o.at, other.at] = [other.at, o.at];
        o.trail = [o.at];
        other.trail = [other.at];
        t.path.push(o.at);
        t.notes.push(PARTY_WORDS.knotSwap);
      } else if (what === 1) {
        for (const x of s.owls) x.berries += KNOT_GIFT;
        t.notes.push(PARTY_WORDS.knotGift);
      } else {
        hopPerch(s, d);
        t.notes.push(PARTY_WORDS.knotHop);
      }
      break;
    }
    case 'hollow':
      if (o.berries >= HOLLOW_COST && here.hollowTo !== undefined) {
        keep(s, d);
        if (botty(o)) return hollow(s, botHollow(s, o), now);
        return waitFor(s, 'hollow', CHOOSE_WAIT_MS, now);
      }
      break;
  }
  keep(s, d);
  show(s, now);
}

function hollow(s: PartyState, take: boolean, now: number): void {
  const t = s.turn!;
  const o = s.owls[t.seat]!;
  const to = space(o.at).hollowTo;
  if (take && to !== undefined && o.berries >= HOLLOW_COST) {
    o.berries -= HOLLOW_COST;
    t.notes.push(PARTY_WORDS.throughHollow);
    const d = dice(s);
    hopTo(s, o, to, d);
    keep(s, d);
  }
  show(s, now);
}

function answer(s: PartyState, said: boolean, now: number): void {
  const t = s.turn!;
  const o = s.owls[t.seat]!;
  t.answer = said;
  if (t.question && said === t.question.truth) {
    o.berries += FACT_GAIN;
    o.facts++;
    t.notes.push(PARTY_WORDS.right);
  } else t.notes.push(PARTY_WORDS.wrong);
  show(s, now);
}

function show(s: PartyState, now: number): void {
  const t = s.turn!;
  waitFor(s, 'show', SHOW_MS + BOARD_HOP_MS * t.path.length, now);
}

function roll(s: PartyState, now: number): void {
  const t = s.turn!;
  const d = dice(s);
  t.roll = between(d, 1, 6);
  t.left = t.roll;
  keep(s, d);
  move(s, now);
}

function players(s: PartyState): MiniPlayer[] {
  return s.owls.map((o) => ({ seat: o.seat, bot: botty(o) }));
}

function defOf(s: PartyState): MinigameDef | null {
  return s.mini ? ((MINIGAMES as Record<string, MinigameDef>)[s.mini.id] ?? null) : null;
}

function nextTurn(s: PartyState, now: number): void {
  const seat = s.turn!.seat + 1;
  if (seat < s.owls.length) return startTurn(s, seat, now);
  s.turn = null;
  const id = s.minis[s.round - 1] ?? s.minis[0]!;
  const def = (MINIGAMES as Record<string, MinigameDef>)[id]!;
  const d = dice(s);
  const seed = Math.floor(draw(d) * 4294967296) | 0;
  keep(s, d);
  s.phase = 'intro';
  s.at = now;
  s.ends = now + INTRO_MS;
  s.mini = { id, at: s.ends, state: def.start(players(s), seed, s.round) };
}

function finishMini(s: PartyState, now: number): void {
  const def = defOf(s)!;
  const mini = s.mini!;
  const result = def.result(mini.state);
  const berries = miniBerries(def.kind, result);
  for (const o of s.owls) o.berries += berries[o.seat] ?? 0;
  for (const seat of miniWinners(def.kind, result)) s.owls[seat]!.wins++;
  mini.result = result;
  mini.berries = berries;
  s.phase = 'scores';
  s.at = now;
  s.ends = now + SCORES_MS;
}

function most(s: PartyState, what: PartyBonus['what']): number[] {
  const best = Math.max(...s.owls.map((o) => o[what]));
  return best > 0 ? s.owls.filter((o) => o[what] === best).map((o) => o.seat) : [];
}

/** Seats in their final order: most Moonstones, then Glowberries, then minigame wins. */
export function standingsOf(owls: readonly PartyOwl[]): { order: number[]; winners: number[] } {
  const key = (o: PartyOwl) => [o.stones, o.berries, o.wins] as const;
  const better = (a: PartyOwl, b: PartyOwl) => {
    const [x, y] = [key(a), key(b)];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i]! - x[i]!;
    return a.seat - b.seat;
  };
  const order = [...owls].sort(better);
  const top = order[0]!;
  const winners = order.filter((o) => key(o).every((v, i) => v === key(top)[i])).map((o) => o.seat);
  return { order: order.map((o) => o.seat), winners };
}

/** An owl's final place (1 the best; owls level on every tie-break share it). */
export function placeOf(s: PartyState, seat: number): number {
  const o = s.owls[seat]!;
  return 1 + s.owls.filter((x) => x.stones > o.stones || (x.stones === o.stones && (x.berries > o.berries || (x.berries === o.berries && x.wins > o.wins)))).length;
}

function bonuses(s: PartyState, now: number): void {
  s.bonuses = (['wins', 'facts', 'flown'] as const).map((what) => ({ what, seats: most(s, what) }));
  for (const b of s.bonuses) for (const seat of b.seats) s.owls[seat]!.stones++;
  const { order, winners } = standingsOf(s.owls);
  s.standings = order;
  s.winners = winners;
  s.phase = 'bonus';
  s.at = now;
  s.ends = now + BONUS_MS;
}

/** Moves the game on to `now`: waits run out, park owls act, minigames go on and end, rounds turn. */
export function partyTick(s: PartyState, now: number): void {
  for (let guard = 0; guard < 200; guard++) {
    if (s.phase === 'ended' || s.phase === 'over') return;
    if (now >= s.closesAt) return end(s, 'restart', now);
    if (s.phase === 'mini') {
      const def = defOf(s)!;
      const t = now - s.mini!.at;
      def.tick(s.mini!.state, Math.min(t, def.ms));
      if (!def.over(s.mini!.state, t) && t < def.ms) return;
      finishMini(s, now);
      continue;
    }
    if (now < s.ends) return;
    const at = s.ends;
    switch (s.phase) {
      case 'gather':
        begin(s, at);
        break;
      case 'turn':
        turnTimeout(s, at);
        break;
      case 'intro':
        s.phase = 'mini';
        s.at = at;
        s.ends = at + defOf(s)!.ms;
        break;
      case 'scores':
        s.mini = null;
        if (s.round >= PARTY_ROUNDS) bonuses(s, at);
        else {
          s.round++;
          s.phase = 'turn';
          s.at = at;
          startTurn(s, 0, at);
        }
        break;
      case 'bonus':
        s.phase = 'over';
        s.at = at;
        s.ends = at + OVER_MS;
        return;
    }
  }
}

/** A turn's wait ran out (or a park owl's pause): it goes on as the owl would, or as a sleepy owl's does. */
function turnTimeout(s: PartyState, now: number): void {
  const t = s.turn!;
  const o = s.owls[t.seat]!;
  const d = dice(s);
  switch (t.step) {
    case 'roll':
      keep(s, d);
      return roll(s, now);
    case 'fork':
      t.way = botty(o) ? botWay(o, d) : 1;
      keep(s, d);
      return move(s, now);
    case 'hollow':
      keep(s, d);
      return hollow(s, botty(o) && botHollow(s, o), now);
    case 'fact': {
      const right = draw(d) < BOT_FACT_RIGHT;
      keep(s, d);
      // A seat whose wait ran out did not answer: that is not right.
      return botty(o) ? answer(s, right ? t.question!.truth : !t.question!.truth, now) : answer(s, !t.question!.truth, now);
    }
    case 'show':
      return nextTurn(s, now);
  }
}

/** What a page may send: the board's choices, or a minigame's input. */
export type PartyKey = 'roll' | 'way' | 'hollow' | 'fact' | MiniKey;
export const PARTY_KEYS: readonly PartyKey[] = ['roll', 'way', 'hollow', 'fact', ...MINI_KEYS];
export interface PartyInput {
  k: PartyKey;
  v: number;
}

/** What a seat's owl asks: taken (true) when it is that owl's to do now. */
export function partyInput(s: PartyState, owl: string, input: PartyInput, now: number): boolean {
  partyTick(s, now);
  const o = owlOf(s, owl);
  if (!o || botty(o)) return false;
  if (s.phase === 'mini') {
    if (!(MINI_KEYS as readonly string[]).includes(input.k)) return false;
    const def = defOf(s)!;
    const t = now - s.mini!.at;
    const ok = def.input(s.mini!.state, o.seat, input as MiniInput, t);
    partyTick(s, now);
    return ok;
  }
  const t = s.turn;
  if (s.phase !== 'turn' || !t || t.seat !== o.seat) return false;
  if (input.k === 'roll' && t.step === 'roll') roll(s, now);
  else if (input.k === 'way' && t.step === 'fork' && (input.v === 0 || input.v === 1)) {
    t.way = input.v;
    move(s, now);
  } else if (input.k === 'hollow' && t.step === 'hollow' && (input.v === 0 || input.v === 1)) hollow(s, input.v === 1, now);
  else if (input.k === 'fact' && t.step === 'fact' && (input.v === 0 || input.v === 1)) answer(s, input.v === 1, now);
  else return false;
  return true;
}

/** When the game next needs moving on by itself (ms, the server's clock); null once it is over. */
export function partyDue(s: PartyState, now: number): number | null {
  if (s.phase === 'ended' || s.phase === 'over') return null;
  let due = Math.min(s.ends, s.closesAt);
  if (s.phase === 'mini') {
    const def = defOf(s)!;
    const t = now - s.mini!.at;
    const next = def.due(s.mini!.state, t);
    if (next !== null) due = Math.min(due, s.mini!.at + next);
  }
  return Math.max(now, due);
}

/** Whether the game is over (finished, or ended early) and its room can be let go at `ends`. */
export function partyDone(s: PartyState): boolean {
  return s.phase === 'over' || s.phase === 'ended';
}

/** An owl as every page sees it: no collection, no free-guest mark. */
export interface PartyOwlView {
  seat: number;
  owl: string;
  bot: boolean;
  away?: true;
  look: PartyLook;
  at: number;
  berries: number;
  stones: number;
  wins: number;
  facts: number;
  flown: number;
}

export interface PartyView {
  room: string;
  round: number;
  rounds: number;
  phase: PartyPhase;
  at: number;
  ends: number;
  /** The server's clock when the view was made. */
  now: number;
  /** This page's seat; null for a page that only watches. */
  you: number | null;
  owls: PartyOwlView[];
  perch: number;
  turn: (Omit<PartyTurn, 'question' | 'way'> & { question?: string; truth?: boolean }) | null;
  mini: { id: MinigameId; name: string; kind: MinigameDef['kind']; stream: MinigameDef['stream']; how: MinigameDef['how']; ms: number; at: number; view: unknown; result?: MiniResult; berries?: Record<number, number> } | null;
  bonuses?: PartyBonus[];
  standings?: number[];
  winners?: number[];
  ended?: 'restart' | 'empty';
}

/** What a page is shown: the board as it stands, its own seat, and the minigame as that seat may see it. */
export function partyView(s: PartyState, owl: string | null, now: number): PartyView {
  const you = owl === null ? null : (owlOf(s, owl)?.seat ?? null);
  const def = defOf(s);
  const t = s.turn;
  return {
    room: s.room,
    round: s.round,
    rounds: PARTY_ROUNDS,
    phase: s.phase,
    at: s.at,
    ends: s.ends,
    now,
    you,
    owls: s.owls.map((o) => ({ seat: o.seat, owl: o.owl, bot: o.bot, ...(o.away ? { away: true as const } : {}), look: o.look, at: o.at, berries: o.berries, stones: o.stones, wins: o.wins, facts: o.facts, flown: o.flown })),
    perch: s.perch,
    turn: t
      ? {
          seat: t.seat,
          step: t.step,
          ends: t.ends,
          roll: t.roll,
          left: t.left,
          path: t.path,
          notes: t.notes,
          ...(t.question ? { question: t.question.text } : {}),
          // Whether the fact was true only once it is answered.
          ...(t.question && t.step === 'show' ? { truth: t.question.truth } : {}),
          ...(t.answer !== undefined ? { answer: t.answer } : {}),
        }
      : null,
    mini:
      s.mini && def
        ? {
            id: s.mini.id,
            name: def.name,
            kind: def.kind,
            stream: def.stream,
            how: def.how,
            ms: def.ms,
            at: s.mini.at,
            view: def.view(s.mini.state, you, Math.max(0, Math.min(now - s.mini.at, def.ms))),
            ...(s.mini.result ? { result: s.mini.result } : {}),
            ...(s.mini.berries ? { berries: s.mini.berries } : {}),
          }
        : null,
    ...(s.bonuses ? { bonuses: s.bonuses } : {}),
    ...(s.standings ? { standings: s.standings } : {}),
    ...(s.winners ? { winners: s.winners } : {}),
    ...(s.ended ? { ended: s.ended } : {}),
  };
}

/** The humans who finished the game and earn from it: present at the end, with a collection, not free guests, not park owls. */
export function partyEarners(s: PartyState): PartyOwl[] {
  if (s.phase !== 'over') return [];
  return s.owls.filter((o) => !o.bot && !o.away && !o.spec && o.cid !== undefined);
}
