/**
 * Feather tag across the whole Great Hollow (OP-434; OP-403 and OP-426 before it). Logan's word, Nov 20:
 * "I think feather tag should be something anyone in the hollow can start, maybe from the menu or a
 * specific station, and it spans the full size of the room, with games lasting around 30 seconds. If the
 * player with the feather leaves, the game ends with no rewards. But for every unique player that held
 * the feather, you get a score multiplier and everyone that joined in gets rewards depending on the tier
 * of points."
 *
 * A game is one round, and it goes like this:
 *  - Anyone in the hollow starts it, from the Feather tag button on the screen or at the feather station on
 *    the floor. A call goes out to the whole room for TAG_CALL_MS: anyone in the hollow joins from the
 *    same button or the station, up to TAG_MAX_OWLS. Only owls who joined can be handed the feather,
 *    so owls just passing through are left alone.
 *  - The owl that started it starts with the feather. A short countdown, then TAG_ROUND_MS of play over
 *    the whole floor: touch another owl in the game to pass it on (walk into them, or tap them). The owl
 *    that just passed it can't be handed it straight back.
 *  - Every pass by an owl is a point, and the points are multiplied by how many different owls held the
 *    feather in the round (tagScore). The score's tier (tagPrize.ts) is what everyone who joined earns.
 *  - If the owl holding the feather leaves the hollow (or its page closes), the game ends at once and no
 *    one earns anything.
 *  - After the result has shown for TAG_REST_MS, the hollow is free for the next game.
 *
 * Never a one-owl game (OP-426): if the call ends with one owl in, Pip, the lantern keeper, joins as the
 * second player, running round the feather station's ground at half an owl's walk, on the clock alone
 * (standInAt), so any owl catches Pip in a few tries; handed the feather, Pip gives it back after
 * TAG_STANDIN_HOLD_MS. Pip's passes earn no points and Pip never counts toward the multiplier. Pip joins
 * too if everyone else leaves a game but one owl.
 *
 * Every step is plain data and time, the same on the room server and on the page: the server keeps the
 * state and checks every join and pass (where the owls stand, who holds the feather), and both read it
 * with tagAt, which moves it on by the clock alone (the call closing, the round's end, the hollow free
 * again). So the room server needs no timer of its own for the game, and a page shows the same moment
 * as everyone else.
 */
import { distance } from '../geometry';
import type { Vec2 } from '../protocol';
import { STUMP_ROOM } from './ids';

/** The room feather tag is played in: the Great Hollow, with the Old Stump (ids.ts; the Party Grove until Nov 19). */
export const TAG_ROOM = STUMP_ROOM;

/**
 * The feather station's ground on the hollow's floor, its middle and its half-widths (an oval, seen from
 * above): at the front's east side, in front of the roots and in from the trunk's door, off the walk from
 * where owls land to the doorways (it was OP-403's tag ring). The feather station stands in its middle,
 * and Pip runs round inside it when filling in for a lone owl. The game itself spans the whole floor.
 */
export const TAG_RING = { x: 3330, y: 1530, rx: 240, ry: 120 } as const;

/** The feather station (OP-434): a size box until its art is painted, its foot at the ground's middle. */
export const TAG_STATION = { x: TAG_RING.x, y: TAG_RING.y, w: 160, h: 110 } as const;
/** How close to the station's foot an owl's feet must be for its Start or Join button (room px). */
export const TAG_STATION_REACH = 150;

/**
 * Pinecone bowling's lane (D5's second game): along the front of the floor, in front of the leaves blown
 * in there, from the hatch's side toward the trunk's door, so the pinecone rolls the way the party came
 * in. Drawn only behind its flag.
 */
export const BOWLING_LANE = { x: 2340, y: 1960, w: 800, h: 70 } as const;

export const TAG_MIN_OWLS = 2;
/** The most owls in one game (the ticket's default; the hollow holds 80). */
export const TAG_MAX_OWLS = 20;
/** The call to join, from the owl that starts a game (ms). */
export const TAG_CALL_MS = 10_000;
/** The countdown before the round, the feather already shown on who starts with it. */
export const TAG_COUNTDOWN_MS = 3000;
/** The round, from the feather being live to the time running out (Logan: "around 30 seconds"). */
export const TAG_ROUND_MS = 30_000;
/** The result shown after the round, before the hollow is free for the next game. */
export const TAG_REST_MS = 6000;
/** How close two owls' feet must be for the feather to pass (room px). */
export const TAG_REACH = 90;
/** How far the room server lets a page be ahead of it on a walk when it checks a pass or a join (room px). */
export const TAG_SLACK = 60;
/** How long the owl that just passed the feather can't be handed it straight back (ms). */
export const TAG_BACK_MS = 2000;

/** The park's own owl who stands in for a missing second player (OP-426): Pip, by the id the page draws NPC owls under. */
export const TAG_STANDIN = 'npc:pip';
/** How long Pip holds the feather before giving it back (ms): longer than TAG_BACK_MS, so it can go back to the owl that passed it. */
export const TAG_STANDIN_HOLD_MS = 5000;
/** How fast Pip runs round the station (room px a second): half an owl's walk, so a ten year old catches up in a few tries. */
export const TAG_STANDIN_SPEED = 130;
/** Pip's path: an oval inside the station's ground. */
const STANDIN_PATH = { rx: TAG_RING.rx - 60, ry: TAG_RING.ry - 35 } as const;

/** How the last round ended: its time ran out, or the owl with the feather left (no rewards). */
export type TagEnd = 'time' | 'left';

/**
 * The game as the room server keeps it and sends it. `callEndsAt` is when the call to join closes (0
 * while there is none). `startsAt` is when the feather goes live (the countdown runs in the
 * TAG_COUNTDOWN_MS before it) and `endsAt` when the round's time runs out (or when it ended early); both
 * 0 while there is no round. `from` is the owl that last passed the feather and `passedAt` when.
 * `passes` counts the owls' passes this round (Pip's give-backs not) and `holders` every owl that held
 * the feather this round (Pip not). `ended` says how the round ended, null until it has; `left` who was
 * left holding the feather when the time ran out.
 */
export interface TagState {
  players: string[];
  holder: string | null;
  round: number;
  callEndsAt: number;
  startsAt: number;
  endsAt: number;
  from: string | null;
  passedAt: number;
  left: string | null;
  passes: number;
  holders: string[];
  ended: TagEnd | null;
}

export type TagPhase = 'waiting' | 'call' | 'countdown' | 'live' | 'over';

export function newTag(): TagState {
  return { players: [], holder: null, round: 0, callEndsAt: 0, startsAt: 0, endsAt: 0, from: null, passedAt: 0, left: null, passes: 0, holders: [], ended: null };
}

/** Whether a point on the floor is on the feather station's ground, give or take `slack` room px. */
export function inTagRing(p: Vec2, slack = 0): boolean {
  const dx = (p.x - TAG_RING.x) / (TAG_RING.rx + slack);
  const dy = (p.y - TAG_RING.y) / (TAG_RING.ry + slack);
  return dx * dx + dy * dy <= 1;
}

/** Whether an owl's feet are close enough to the feather station for its button. */
export function atTagStation(p: Vec2, slack = 0): boolean {
  return distance(p, TAG_STATION) <= TAG_STATION_REACH + slack;
}

/** Where the game stands at `now`. */
export function tagPhase(s0: TagState, now: number): TagPhase {
  const s = tagAt(s0, now);
  if (s.callEndsAt !== 0) return 'call';
  if (s.startsAt === 0 && s.ended === null) return 'waiting';
  if (s.ended !== null) return 'over';
  return now < s.startsAt ? 'countdown' : 'live';
}

/** Whether a player is the park's stand-in (OP-426), not a real owl. */
export function isStandIn(id: string | null): boolean {
  return id === TAG_STANDIN;
}

/** The real owls in the game: everyone but the stand-in. */
export function realPlayers(s: TagState): string[] {
  return s.players.filter((p) => !isStandIn(p));
}

/** The round's score: the owls' passes, times how many different owls held the feather (Pip not). */
export function tagScore(s: Pick<TagState, 'passes' | 'holders'>): number {
  return s.passes * s.holders.length;
}

/**
 * Where Pip stands at `now` (OP-426), the same on every page and on the room server: round the oval
 * inside the station's ground, anticlockwise from its east end, from when Pip's round began.
 */
export function standInAt(s: TagState, now: number): Vec2 {
  const since = s.startsAt === 0 ? 0 : Math.max(0, now - (s.startsAt - TAG_COUNTDOWN_MS));
  const mean = Math.sqrt((STANDIN_PATH.rx * STANDIN_PATH.rx + STANDIN_PATH.ry * STANDIN_PATH.ry) / 2);
  const a = ((since / 1000) * TAG_STANDIN_SPEED) / mean;
  return { x: TAG_RING.x + STANDIN_PATH.rx * Math.cos(a), y: TAG_RING.y - STANDIN_PATH.ry * Math.sin(a) };
}

/** When Pip, holding the feather, gives it back: TAG_STANDIN_HOLD_MS after it was handed it (or the feather went live in its hold). */
function standInGivesAt(s: TagState): number {
  return Math.max(s.passedAt, s.startsAt) + TAG_STANDIN_HOLD_MS;
}

/** Pip gives the feather back, if Pip holds it and its hold is over before `until` and by `now`: to the owl that passed it, else the first real owl in. */
function standInGives(s: TagState, now: number, until: number): TagState {
  if (!isStandIn(s.holder) || s.startsAt === 0 || s.ended) return s;
  const at = standInGivesAt(s);
  if (at >= until || now < at) return s;
  const real = realPlayers(s);
  const to = s.from && real.includes(s.from) ? s.from : real[0];
  return to ? { ...s, holder: to, from: TAG_STANDIN, passedAt: at } : s;
}

/** No game: the hollow is free. The last round's number stays, so a page and the room never mix two games up. */
function idle(s: TagState): TagState {
  return { ...newTag(), round: s.round };
}

/** The call closed at `at`: the round's countdown starts, the owl that started it holding the feather; Pip joins a lone owl. */
function callOver(s: TagState, at: number): TagState {
  const real = realPlayers(s);
  if (real.length === 0) return idle(s);
  const players = real.length === 1 ? [real[0]!, TAG_STANDIN] : real;
  const holder = real[0]!;
  const startsAt = at + TAG_COUNTDOWN_MS;
  return { ...s, players, holder, round: s.round + 1, callEndsAt: 0, startsAt, endsAt: startsAt + TAG_ROUND_MS, from: null, passedAt: 0, left: null, passes: 0, holders: [holder], ended: null };
}

/**
 * The game moved on to `now` by the clock alone: the call closes and the round's countdown starts; a
 * round whose time ran out is over, who held the feather then left holding it; once its result has
 * shown, the hollow is free.
 */
export function tagAt(s: TagState, now: number): TagState {
  let t = s;
  if (t.callEndsAt !== 0 && now >= t.callEndsAt) t = callOver(t, t.callEndsAt);
  if (t.startsAt === 0 && t.ended === null) return t;
  if (t.ended === null && now >= t.endsAt) {
    t = standInGives(t, now, t.endsAt);
    t = { ...t, ended: 'time', left: t.holder };
  }
  if (t.ended !== null) return now >= t.endsAt + TAG_REST_MS ? idle(t) : t;
  return standInGives(t, now, t.endsAt);
}

/** What a finished round earned: its number, the owls in it at its end (Pip not) and its score. */
export interface TagRoundResult {
  round: number;
  players: string[];
  score: number;
}

/**
 * The result of the round `s` describes, if its time has run out by `now` (whether or not the result
 * is still showing): null while it is on, when there was none, or when the owl holding the feather left
 * (no rewards). The room server pays it once, by its round number.
 */
export function tagResult(s0: TagState, now: number): TagRoundResult | null {
  // A game stored as its call (no frame came while it played) is read as the round the call opened.
  const s = s0.callEndsAt !== 0 && now >= s0.callEndsAt ? callOver(s0, s0.callEndsAt) : s0;
  if (s.startsAt === 0 || s.ended === 'left' || s.callEndsAt !== 0) return null;
  if (s.ended === null && now < s.endsAt) return null;
  const t = s.ended === null ? { ...standInGives(s, now, s.endsAt), ended: 'time' as const } : s;
  return { round: t.round, players: realPlayers(t), score: tagScore(t) };
}

export type TagRefusal = 'full' | 'far' | 'not-holder' | 'not-live' | 'not-player' | 'back' | 'self' | 'closed';

export type TagResult = { ok: true; state: TagState } | { ok: false; reason: TagRefusal; state: TagState };

/**
 * An owl in the hollow asks to play (the room server has checked it is in the hollow). With no game on,
 * it starts one: the call goes out, this owl in. During the call it joins. Once the call has closed, the
 * game is closed to new owls until it is over.
 */
export function tagJoin(s0: TagState, id: string, now: number): TagResult {
  const s = tagAt(s0, now);
  if (s.players.includes(id)) return { ok: true, state: s };
  const phase = tagPhase(s, now);
  if (phase === 'waiting') return { ok: true, state: { ...idle(s), players: [id], callEndsAt: now + TAG_CALL_MS } };
  if (phase !== 'call') return { ok: false, reason: 'closed', state: s };
  if (realPlayers(s).length >= TAG_MAX_OWLS) return { ok: false, reason: 'full', state: s };
  return { ok: true, state: { ...s, players: [...s.players, id] } };
}

/**
 * An owl leaves the game (it left the hollow, or its page closed). Holding the feather in the round's
 * countdown or play, the game ends at once with no rewards. Otherwise it is just out; with one owl left
 * in a round, Pip joins it, and with none the hollow is free.
 */
export function tagLeave(s0: TagState, id: string, now: number): TagState {
  const s = tagAt(s0, now);
  if (!s.players.includes(id)) return s;
  const phase = tagPhase(s, now);
  let players = s.players.filter((p) => p !== id);
  const real = players.filter((p) => !isStandIn(p));
  if (phase === 'call') return real.length ? { ...s, players } : idle(s);
  if (phase === 'countdown' || phase === 'live') {
    if (real.length === 0) return idle(s);
    if (s.holder === id) return { ...s, players, holder: null, from: null, endsAt: now, ended: 'left', left: null };
    if (real.length === 1 && !players.includes(TAG_STANDIN)) players = [...players, TAG_STANDIN];
    return { ...s, players, ...(s.from === id ? { from: null } : {}) };
  }
  return { ...s, players };
}

/**
 * The owl holding the feather touches another owl in the game (the room server has checked they stand
 * within TAG_REACH): it passes, unless that owl handed it over less than TAG_BACK_MS ago. An owl's pass
 * is a point; the owl it goes to counts toward the multiplier the first time it holds it.
 */
export function tagPass(s0: TagState, from: string, to: string, now: number): TagResult {
  const s = tagAt(s0, now);
  if (tagPhase(s, now) !== 'live') return { ok: false, reason: 'not-live', state: s };
  if (s.holder !== from) return { ok: false, reason: 'not-holder', state: s };
  if (to === from) return { ok: false, reason: 'self', state: s };
  if (!s.players.includes(to)) return { ok: false, reason: 'not-player', state: s };
  if (s.from === to && now - s.passedAt < TAG_BACK_MS) return { ok: false, reason: 'back', state: s };
  const passes = s.passes + (isStandIn(from) ? 0 : 1);
  const holders = isStandIn(to) || s.holders.includes(to) ? s.holders : [...s.holders, to];
  return { ok: true, state: { ...s, holder: to, from, passedAt: now, passes, holders } };
}

/** Whether two owls' feet are close enough for the feather to pass, with the room server's slack. */
export function tagTouches(a: Vec2, b: Vec2, slack = 0): boolean {
  return distance(a, b) <= TAG_REACH + slack;
}

/** Whether a state sent by the room server looks like one: a page never crashes on a bad frame. */
export function isTagState(v: unknown): v is TagState {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const id = (x: unknown) => typeof x === 'string' && x.length > 0 && x.length <= 64;
  const idOrNull = (x: unknown) => x === null || id(x);
  const time = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  const count = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 0;
  const ids = (x: unknown) => Array.isArray(x) && x.length <= TAG_MAX_OWLS + 1 && x.every(id);
  return (
    ids(o['players']) &&
    idOrNull(o['holder']) &&
    count(o['round']) &&
    time(o['callEndsAt']) &&
    time(o['startsAt']) &&
    time(o['endsAt']) &&
    idOrNull(o['from']) &&
    time(o['passedAt']) &&
    idOrNull(o['left']) &&
    count(o['passes']) &&
    ids(o['holders']) &&
    (o['ended'] === null || o['ended'] === 'time' || o['ended'] === 'left')
  );
}

/** Feather tag's words: short, plain, for a ten year old. */
export const TAG_WORDS = {
  ring: 'Feather tag',
  station: 'Feather station',
  lane: 'Pinecone bowling',
  start: 'Start feather tag',
  join: 'Join feather tag',
  calling: (n: number) => `Feather tag starts in ${n}s. Tap Join to play!`,
  joined: (n: number, owls: number) => `You're in! Starting in ${n}s · ${owls} ${owls === 1 ? 'owl' : 'owls'}`,
  closed: 'A game of feather tag is on. Join the next one!',
  full: 'This game is full. Join the next one!',
  noServer: 'Feather tag needs the park’s server: open the park online to play.',
  countdown: (n: number) => `Get ready… ${n}`,
  youStart: 'You start with the feather!',
  youHave: 'You have the feather! Touch another owl to pass it',
  theyHave: 'Run! Don’t get handed the feather',
  pass: 'Pass the feather',
  score: (passes: number, holders: number) => `${passes} ${passes === 1 ? 'pass' : 'passes'} × ${holders}`,
  standIn: 'Pip the lantern keeper is joining you!',
  pipHas: 'Pip has it and gives it back soon. Catch Pip again!',
  holderLeft: 'The owl with the feather left the hollow. No prizes this time.',
  over: (score: number) => `Time! Score ${score}`,
  noPoints: 'Time! No passes, so no prize this time.',
  next: 'Next game soon',
} as const;
