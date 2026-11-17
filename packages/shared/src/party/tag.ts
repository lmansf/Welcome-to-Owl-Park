/**
 * Feather tag in the Party Grove (OP-403, Dec 1 plan D5), behind the park's `tag` flag: the grove seen
 * from above has two game spaces marked on its plaza's floor, drawn as size boxes until their art is
 * painted (Logan's ask, Nov 7: a box with its dimensions on it). The tag ring is where feather tag is
 * played; the bowling lane is where pinecone bowling will be (D5's second game, built after this one).
 *
 * The game, for 2 to 8 owls: step into the ring and you are in. With two in, a short countdown, then one
 * owl holds the feather. Touch another owl in the ring to pass it on (walk into them, or tap them). The
 * owl that just passed it can't be handed it straight back. When the time is up, whoever holds the
 * feather was left holding it; everyone else got away. A few seconds later the next round starts, and
 * the owl left holding it starts with it. No feathers are paid and nothing is lost: it is only a game.
 *
 * Every step is plain data and time, the same on the room server and on the page: the server keeps the
 * state and checks every join and pass (where the owls stand, who holds the feather), and both read it
 * with tagAt, which moves it on by the clock alone (the end of a round, the next one starting). So the
 * room server needs no timer of its own for the game, and a page shows the same moment as everyone else.
 */
import { distance } from '../geometry';
import type { Vec2 } from '../protocol';
import { STUMP_ROOM } from './ids';

/** The room feather tag is played in: the Party Grove (still called `hub`). */
export const TAG_ROOM = STUMP_ROOM;

/**
 * The tag ring on the plaza's floor, its middle and its half-widths (an oval, seen from above): on the
 * grove's quiet east side, between the east moonbeam and the telescope, away from the way back into the
 * Great Hollow, so an owl only passing through never finds itself in a game. Room for eight to run round.
 */
export const TAG_RING = { x: 3950, y: 1085, rx: 240, ry: 120 } as const;

/**
 * Where pinecone bowling will be (D5's second game): a lane along the plaza's front, between the Old
 * Stump and the way back into the Great Hollow. Laid out now so the grove's layout is whole; nothing is
 * played there yet, and it is drawn only behind the same flag.
 */
export const BOWLING_LANE = { x: 1250, y: 1135, w: 800, h: 70 } as const;

export const TAG_MIN_OWLS = 2;
export const TAG_MAX_OWLS = 8;
/** The countdown before a round, the feather already shown on who will start with it. */
export const TAG_COUNTDOWN_MS = 3000;
/** A round, from the feather being live to the time running out. */
export const TAG_ROUND_MS = 40_000;
/** The result shown between rounds, before the next one's countdown. */
export const TAG_REST_MS = 6000;
/** How close two owls' feet must be for the feather to pass (room px). */
export const TAG_REACH = 90;
/** How far the room server lets a page be ahead of it on a walk when it checks a pass or a join (room px). */
export const TAG_SLACK = 60;
/** How long the owl that just passed the feather can't be handed it straight back (ms). */
export const TAG_BACK_MS = 2000;

/**
 * The game as the room server keeps it and sends it. `startsAt` is when the feather goes live (the
 * countdown runs in the TAG_COUNTDOWN_MS before it) and `endsAt` when the round's time runs out; both 0
 * while there is no round. `from` is the owl that last passed the feather and `passedAt` when. `left` is
 * who was left holding it at the end of the last round over (null before any).
 */
export interface TagState {
  players: string[];
  holder: string | null;
  round: number;
  startsAt: number;
  endsAt: number;
  from: string | null;
  passedAt: number;
  left: string | null;
}

export type TagPhase = 'waiting' | 'countdown' | 'live' | 'over';

export function newTag(): TagState {
  return { players: [], holder: null, round: 0, startsAt: 0, endsAt: 0, from: null, passedAt: 0, left: null };
}

/** Whether a point on the floor is in the tag ring, give or take `slack` room px. */
export function inTagRing(p: Vec2, slack = 0): boolean {
  const dx = (p.x - TAG_RING.x) / (TAG_RING.rx + slack);
  const dy = (p.y - TAG_RING.y) / (TAG_RING.ry + slack);
  return dx * dx + dy * dy <= 1;
}

/** Where the game stands at `now`. */
export function tagPhase(s: TagState, now: number): TagPhase {
  if (s.startsAt === 0) return 'waiting';
  if (now < s.startsAt) return 'countdown';
  if (now < s.endsAt) return 'live';
  return 'over';
}

/** A round starting at `now` with `holder` holding the feather. */
function startRound(s: TagState, holder: string, now: number): TagState {
  return { ...s, holder, round: s.round + 1, startsAt: now + TAG_COUNTDOWN_MS, endsAt: now + TAG_COUNTDOWN_MS + TAG_ROUND_MS, from: null, passedAt: 0 };
}

/** No round: waiting for owls. Who was left holding the feather last stays said. */
function stop(s: TagState): TagState {
  return { ...s, holder: null, startsAt: 0, endsAt: 0, from: null, passedAt: 0 };
}

/**
 * The game moved on to `now` by the clock alone: a round whose time ran out is over, who held the
 * feather then left holding it; once its result has been shown, the next round's countdown starts (that
 * owl starting with the feather) if two or more are still in, else the ring waits for owls.
 */
export function tagAt(s: TagState, now: number): TagState {
  let t = s;
  // Each pass round the loop ends a round or starts one; a long quiet gap is a few rounds at most, but never loop for ever.
  for (let i = 0; i < 1000 && t.startsAt !== 0 && now >= t.endsAt; i++) {
    const left = t.holder;
    const restUntil = t.endsAt + TAG_REST_MS;
    if (now < restUntil) return { ...t, left };
    const next = left && t.players.includes(left) ? left : t.players[0];
    t = t.players.length >= TAG_MIN_OWLS && next ? startRound({ ...t, left }, next, restUntil) : stop({ ...t, left });
  }
  return t;
}

export type TagRefusal = 'full' | 'far' | 'not-holder' | 'not-live' | 'not-player' | 'back' | 'self';

export type TagResult = { ok: true; state: TagState } | { ok: false; reason: TagRefusal; state: TagState };

/**
 * An owl steps into the ring (the room server has checked it stands there). With two or more in and no
 * round going, the countdown starts, `pick` choosing who starts with the feather. An owl joining a
 * round already going just plays on in it.
 */
export function tagJoin(s0: TagState, id: string, now: number, pick: (n: number) => number): TagResult {
  const s = tagAt(s0, now);
  if (s.players.includes(id)) return { ok: true, state: s };
  if (s.players.length >= TAG_MAX_OWLS) return { ok: false, reason: 'full', state: s };
  const players = [...s.players, id];
  let t: TagState = { ...s, players };
  if (t.startsAt === 0 && players.length >= TAG_MIN_OWLS) {
    const i = Math.max(0, Math.min(players.length - 1, pick(players.length)));
    t = startRound(t, players[i]!, now);
  }
  return { ok: true, state: t };
}

/**
 * An owl steps out of the ring or leaves the room: out of the game. Holding the feather in a round, it
 * passes to the next owl in; with fewer than two left the round stops (a round already over keeps its
 * result on show).
 */
export function tagLeave(s0: TagState, id: string, now: number): TagState {
  const s = tagAt(s0, now);
  if (!s.players.includes(id)) return s;
  const players = s.players.filter((p) => p !== id);
  const phase = tagPhase(s, now);
  let t: TagState = { ...s, players, ...(s.from === id ? { from: null } : {}) };
  if (phase === 'countdown' || phase === 'live') {
    if (players.length < TAG_MIN_OWLS) return stop(t);
    if (t.holder === id) {
      const i = s.players.indexOf(id);
      t = { ...t, holder: players[i % players.length]!, from: null, passedAt: 0 };
    }
  }
  return t;
}

/**
 * The owl holding the feather touches another owl in the ring (the room server has checked they stand
 * within TAG_REACH): it passes, unless that owl handed it over less than TAG_BACK_MS ago.
 */
export function tagPass(s0: TagState, from: string, to: string, now: number): TagResult {
  const s = tagAt(s0, now);
  if (tagPhase(s, now) !== 'live') return { ok: false, reason: 'not-live', state: s };
  if (s.holder !== from) return { ok: false, reason: 'not-holder', state: s };
  if (to === from) return { ok: false, reason: 'self', state: s };
  if (!s.players.includes(to)) return { ok: false, reason: 'not-player', state: s };
  if (s.from === to && now - s.passedAt < TAG_BACK_MS) return { ok: false, reason: 'back', state: s };
  return { ok: true, state: { ...s, holder: to, from, passedAt: now } };
}

/** Whether two owls' feet are close enough for the feather to pass, with the room server's slack. */
export function tagTouches(a: Vec2, b: Vec2, slack = 0): boolean {
  return distance(a, b) <= TAG_REACH + slack;
}

/** Whether a state sent by the room server looks like one: a page never crashes on a bad frame. */
export function isTagState(v: unknown): v is TagState {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const idOrNull = (x: unknown) => x === null || (typeof x === 'string' && x.length > 0 && x.length <= 64);
  const time = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  return (
    Array.isArray(o['players']) &&
    o['players'].length <= TAG_MAX_OWLS &&
    o['players'].every((p) => typeof p === 'string' && p.length > 0 && p.length <= 64) &&
    idOrNull(o['holder']) &&
    typeof o['round'] === 'number' &&
    Number.isInteger(o['round']) &&
    o['round'] >= 0 &&
    time(o['startsAt']) &&
    time(o['endsAt']) &&
    idOrNull(o['from']) &&
    time(o['passedAt']) &&
    idOrNull(o['left'])
  );
}

/** Feather tag's words: short, plain, for a ten year old. */
export const TAG_WORDS = {
  ring: 'Feather tag',
  lane: 'Pinecone bowling',
  stepIn: 'Step into the ring to play feather tag',
  waiting: 'Waiting for one more owl to step in',
  full: 'The ring is full. Watch, or step in when someone leaves!',
  noServer: 'Feather tag needs the park’s server: open the park online to play.',
  countdown: (n: number) => `Get ready… ${n}`,
  youHave: 'You have the feather! Touch another owl to pass it',
  theyHave: 'Run! Don’t get handed the feather',
  pass: 'Pass the feather',
  youLeft: 'You were left holding the feather! You start with it next round',
  theyLeft: 'You got away!',
  next: 'Next round soon',
} as const;
