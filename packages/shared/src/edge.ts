/**
 * Protocol v4: the authoritative room server (Durable Object) and its clients.
 * Every client frame is one JSON object (≤ 1 KiB) except the literal heartbeat text frame `hb`.
 * All timestamps (`at`, `now`, `until`, `next...`) are server milliseconds; clients never put their clock on the wire.
 * v3 added collectibles (`wear` on looks, emotes). v4 replaces the half-day finds with quests, NPC
 * owls and interactables: `quests`, `talk`, `accept`, `abandon`, `handin`, `use` and `gather`, each
 * carrying a request number `r` that the answer echoes; looks may carry a `species`. v6 adds the
 * activities (activities.ts): `act` frames for the lanterns, fishing, the copy game and the day's
 * tasks, and the `lanterns`, `quiz`, `paid` and `tasks` frames the room sends. v7 adds the nests
 * (homes.ts, nestbook.ts): `street` asks for the street's nest doors and `nest` carries an owner's
 * change to its nest; the room answers with `street` and `nest`, sends `nest` to everyone in a nest
 * when it changes, and `closed` before closing a socket a nest turns away (4011). v8 adds prewritten
 * chat (phrases.ts): `say` carries a phrase's number, and the room relays it with the owl's id to
 * everyone else in the room (never words). v9 adds the arcade (arcade.ts, arcadebook.ts): the `act`
 * frames `run` (start a run at a cabinet; answered with the run's seed) and `score` (its result;
 * answered with what it paid), and the `wall` frame the room sends a newcomer in the arcade and
 * everyone there whenever a run changes today's best five.
 */
import type { QuizZone, TaskView } from './activities';
import { isArcadeGame, type ArcadeGame, type GameWall, type OwnBests, type RunPaid } from './arcade';
import type { Award } from './book';
import { parseNestEdit, type NestEdit, type NestRefusal, type NestView } from './homes';
import { cleanLook } from './look';
import type { NestGiftState, StreetDoor } from './nestbook';
import { PHRASE_NUMBER_MAX } from './phrases';
import type { RealmsSettings } from './overflow';
import type { OwlLook, Vec2 } from './protocol';
import type { QuestBoard, QuestUpdate } from './quests';
import type { Air } from './flight';
import { isEmoteId, isLook, isObj, isVec2 } from './validate';

/** Raised whenever a page and the room server must agree on something new (5: the wider rooms, 6: the activities, 7: the nests, 8: prewritten chat, 9: the arcade, 10: the stained-glass climb and the realms switch, 11: owls asleep, 12: flight, 13: travel from the map, 14: owls standing on perches), so a stale page reloads. */
export const EDGE_PROTOCOL_VERSION = 14;
// TODO-DOCS: docs/ARCHITECTURE.md section 4 says protocol v8; it is v11 (the arcade, then the climb's `climb` and `ascent` acts, `realms` in the welcome and the `realms` frame, then `rest` both ways and `asleep` on an owl, OP-126).
export const MAX_FRAME_BYTES = 1024;
/** The stained-glass climb's height bands; the sixth is the clouds (climb.ts). Defined here so climb.ts need not be imported. */
export const BAND_COUNT = 6;
export const HEARTBEAT_FRAME = 'hb';
export const HEARTBEAT_INTERVAL_MS = 25_000;
/** Moves the room server accepts from one visitor: a burst, then this many more per second. */
export const MOVE_BURST = 5;
export const MOVE_REFILL_PER_S = 2;
/** Air states the room server takes from one visitor (OP-084): a jump, a flap, a cut, a glide and a landing are five. */
export const AIR_BURST = 8;
export const AIR_REFILL_PER_S = 4;

/** Close codes the server uses; the client reacts to each differently. */
export const CLOSE = {
  BAD_PASS: 4001,
  BAD_PROTOCOL: 4002,
  RATE_LIMITED: 4003,
  NOT_ADMITTED: 4004,
  REPLACED: 4005,
  ROOM_FULL: 4010,
  /** A nest turned the visitor away (closed to visitors, or no such nest), or closed while it was inside. */
  NEST_CLOSED: 4011,
  /** The park has a line (OP-075) and this visitor has not come through it: wait on the home screen. */
  QUEUED: 4012,
  /** A gated realm is closed (the realms setting): turned away at the hello, or sent out when it closed. */
  REALM_CLOSED: 4013,
  /** The owl was restored on another screen (OP-139): this one shows the moved card. */
  MOVED: 4014,
  /** Travel into the park before the owl walked through the front gate (OP-130): the page offers the gate. */
  NOT_THROUGH_GATE: 4015,
  TOO_LARGE: 1009,
} as const;

export interface ServerWalk {
  from: Vec2;
  to: Vec2;
  /** Server ms when the walk started. */
  at: number;
}

export interface OwlSnapshot {
  id: string;
  look: OwlLook;
  pos: Vec2;
  walk: ServerWalk | null;
  /** Its visitor has been idle a while (OP-126): it sleeps where it stands, for everyone. */
  asleep?: true;
  /** Off the ground (OP-084): its last air state and when the room was told it, for a newcomer to carry on. */
  air?: AirAt;
}

/** An owl's air state (flight.ts) and when it began, in server ms. */
export type AirAt = Air & { at: number };

// ---- client -> server ----
export interface ClientHello {
  t: 'hello';
  v: number;
  look: OwlLook;
  spawn?: string;
  /** Resume hint (last drawn position); honoured only when close to the spawn or a recent leave. */
  pos?: Vec2;
  /** Come by travel from the map (OP-130): into the park, only once the owl has walked through the gate. */
  via?: 'travel';
}
export interface ClientMove {
  t: 'move';
  to: Vec2;
  seq: number;
}
export interface ClientLook {
  t: 'look';
  look: OwlLook;
}
export interface ClientBye {
  t: 'bye';
}
/** The owl falls asleep (its visitor idle) or wakes (OP-126). A state of the owl, not an event: nothing logs it. */
export interface ClientRest {
  t: 'rest';
  asleep: boolean;
}
/**
 * The owl's air state changed (OP-084): off the ground, a flap, the cut, a glide begun or ended, the
 * landing. A state of the owl, not an event: the room keeps the last one for newcomers, tells the
 * others, and logs nothing. Read as it comes: the room drops one it cannot believe, and never closes
 * a socket over one (OP-084's rule), so its shape is the room's to check too.
 */
export interface ClientAir {
  t: 'air';
  air: unknown;
}
/** Play an owned emote for everyone in the room. */
export interface ClientEmote {
  t: 'emote';
  e: string;
}
/** Say a prewritten phrase to everyone in the room: its number in the phrase list (phrases.ts). */
export interface ClientSay {
  t: 'say';
  n: number;
}
/** Ask for this collector's quest board (answered with `quests`). */
export interface ClientQuests {
  t: 'quests';
  r: number;
}
/** Talk to an NPC owl in this room; the server checks the owl stands close. Answered with `quests`. */
export interface ClientTalk {
  t: 'talk';
  npc: string;
  r: number;
}
/** Take, drop or hand back a quest (taking and handing back mean standing by its giver). */
export interface ClientQuestAction {
  t: 'accept' | 'abandon' | 'handin';
  quest: string;
  r: number;
}
/** Use an interactable in this room: flop into a leaf pile, browse a stall. Answered with `useResult`. */
export interface ClientUse {
  t: 'use';
  target: string;
  r: number;
}
/** Pick up quest item `n` of an active quest; the server checks the owl stands on it. Answered with `quests`. */
export interface ClientGather {
  t: 'gather';
  quest: string;
  n: number;
  r: number;
}
/**
 * An activity (activities.ts): light a lantern, cast or reel in at the pond, start the robot owl's
 * copy game or play it a note (`e`, an emote the owl owns), or ask for today's tasks. In the arcade
 * (arcade.ts): start a run of a game (`g`) at its cabinet, end the run whose seed is `k` with its
 * score `s` (and for Talon Toss its shots, `n`), or, as the run goes, keep its score so far as the
 * owl's best (`record`, the same fields; OP-137). Answered with `act`.
 */
export type ActKind = 'light' | 'cast' | 'reel' | 'copy' | 'note' | 'tasks' | 'run' | 'score' | 'record' | 'climb' | 'ascent';
export const ACT_KINDS: readonly ActKind[] = ['light', 'cast', 'reel', 'copy', 'note', 'tasks', 'run', 'score', 'record', 'climb', 'ascent'];
export interface ClientAct {
  t: 'act';
  a: ActKind;
  e?: string;
  g?: ArcadeGame;
  s?: number;
  n?: number;
  k?: number;
  /** The stained-glass climb: the band an `ascent` reached (1 to BAND_COUNT), with the run's seed in `k`. */
  band?: number;
  r: number;
}
/** The climb's nights by difficulty (climb.ts); which one tonight is the moon's or the keepers' say. */
export type ClimbTier = 'easy' | 'medium' | 'hard';
/** Why an `ascent` added fewer feathers than its bands are worth. */
export type ClimbWhy = 'capped' | 'paid-today' | 'item-already-given';
/** On the street: ask for its nest doors, this visitor's own nest and other owls' open ones. Answered with `street`. */
export interface ClientStreet {
  t: 'street';
  r: number;
}
/** In its own nest, the owner changes it: a piece in a spot (null takes it away), or open or closed to visitors. Answered with `nest`. */
export type ClientNest = { t: 'nest'; r: number } & NestEdit;
export type ClientFrame = ClientHello | ClientMove | ClientLook | ClientBye | ClientRest | ClientAir | ClientEmote | ClientSay | ClientQuests | ClientTalk | ClientQuestAction | ClientUse | ClientGather | ClientAct | ClientStreet | ClientNest;

// ---- server -> client ----
export interface ServerWelcome {
  t: 'welcome';
  v: number;
  id: string;
  room: string;
  now: number;
  cap: number;
  you: { pos: Vec2 };
  owls: OwlSnapshot[];
  counts: Record<string, number>;
  /** Which copy of the room this is (OP-075): 1 is the room itself; copies open only on busy nights. */
  copy?: number;
  /** Lets this visitor back in while the park has a line (OP-075): sent with the next room's socket. */
  entry?: string;
  /** The busy ribbon's words while it is on (OP-075); null or absent while it is off. */
  notice?: string | null;
  /** The realms switch as the room object holds it: which gated rooms are open, whether the climb's portal is live, the special night. */
  realms?: RealmsSettings;
}
export interface ServerEnter {
  t: 'enter';
  owl: OwlSnapshot;
}
export interface ServerMove {
  t: 'move';
  id: string;
  from: Vec2;
  to: Vec2;
  at: number;
  /** Present only on the sender's own copy (the echo is the acknowledgement). */
  seq?: number;
}
export interface ServerLook {
  t: 'look';
  id: string;
  look: OwlLook;
}
export interface ServerLeave {
  t: 'leave';
  id: string;
}
/** Another owl's air state changed (OP-084), with when the room was told it: pages carry it on from there. */
export interface ServerAir {
  t: 'air';
  id: string;
  air: Air;
  at: number;
}
/** Another owl fell asleep or woke (OP-126). */
export interface ServerRest {
  t: 'rest';
  id: string;
  asleep: boolean;
}
export interface ServerCounts {
  t: 'counts';
  rooms: Record<string, number>;
}
export interface ServerFull {
  t: 'full';
  room: string;
  cap: number;
}
export interface ServerEmote {
  t: 'emote';
  id: string;
  e: string;
}
/** An owl said a prewritten phrase (its number; the page shows the phrase in a bubble above the owl). */
export interface ServerSay {
  t: 'say';
  id: string;
  n: number;
}
/**
 * The collector's quest board: the answer to `quests`, `talk`, `accept`, `abandon` and `gather`
 * (with their `r` and, when refused, `ok: false` and a reason), or pushed after a visit or an
 * emote moved a quest along. `updates` lists the steps that just progressed.
 */
export interface ServerQuests {
  t: 'quests';
  r?: number;
  ok?: boolean;
  reason?: string;
  board: QuestBoard;
  updates: QuestUpdate[];
}
/** A hand-in: the quest's thanks, the feathers paid (with any duplicate's), the balance and the collectible. */
export type ServerHandIn = { t: 'handin'; r: number } & (
  | { ok: true; quest: string; title: string; thanks: string; feathers: number; total: number; award: Award | null; board: QuestBoard }
  | { ok: false; reason: string; board?: QuestBoard }
);
/** Shared interactables in this room: id -> server ms when it is back (absent or 0: here now). */
export interface ServerObjects {
  t: 'objects';
  until: Record<string, number>;
}
/** Someone used a shared interactable: everyone plays it; it is back at `until`. */
export interface ServerUsed {
  t: 'used';
  id: string;
  by: string;
  until: number;
}
/** Your own use: feathers found (with the new balance) and any quest progress, or why it failed. */
export interface ServerUseResult {
  t: 'useResult';
  r: number;
  ok: boolean;
  reason?: 'far' | 'gone' | 'busy' | 'unknown';
  feathers: number;
  total: number;
  updates: QuestUpdate[];
}
/** A request refused before it reached the ledger (unknown target, too far, too fast). */
export interface ServerRefused {
  t: 'refused';
  r: number;
  reason: 'far' | 'unknown' | 'busy' | 'offline';
}
/** The hub's lantern beam: lantern id -> when it goes out, and while the whole beam glows, until when. */
export interface ServerLanterns {
  t: 'lanterns';
  lit: Record<string, number>;
  glowUntil: number;
  /** The lantern just lit, and by whom (absent in the snapshot a newcomer gets). */
  id?: string;
  by?: string;
}
/** A stage quiz question closed: the zone of the right answer, and the owls that stood in it. */
export interface ServerQuiz {
  t: 'quiz';
  n: number;
  right: QuizZone;
  winners: string[];
}
/** Feathers from something shared (a full lantern beam, a right quiz answer), with the new balance. */
export interface ServerPaid {
  t: 'paid';
  what: 'beam' | 'quiz';
  feathers: number;
  total: number;
}
/** Progress on today's tasks: the tasks as they stand, the ones just finished, and the feathers they paid. */
export interface ServerTasks {
  t: 'tasks';
  tasks: TaskView;
  finished: string[];
  paid: number;
  total: number;
}
/** The answer to an `act`. */
export type ServerAct = { t: 'act'; r: number } & (
  | { a: 'light'; ok: true; id: string }
  | { a: 'cast'; ok: true; biteAt: number }
  | { a: 'reel'; ok: true; outcome: 'early' | 'late' }
  | { a: 'reel'; ok: true; outcome: 'caught'; fish: string; feathers: number; total: number }
  | { a: 'copy'; ok: true; notes: string[]; tune: string[]; listenUntil: number; deadline: number; level: number }
  | { a: 'note'; ok: true; step: 'note' | 'early'; deadline: number }
  | { a: 'note'; ok: true; step: 'tune'; tune: string[]; listenUntil: number; deadline: number; level: number; feathers: number; total: number }
  | { a: 'note'; ok: true; step: 'won'; level: number; feathers: number; total: number }
  | { a: 'note'; ok: true; step: 'wrong' | 'slow'; level: number; expected: string }
  | { a: 'tasks'; ok: true; tasks: TaskView }
  | { a: 'run'; ok: true; game: ArcadeGame; seed: number; startedAt: number }
  | { a: 'score'; ok: true; paid: RunPaid }
  /** A run's best so far kept: its game's column on the wall and the owl's own bests after it. */
  | { a: 'record'; ok: true; wall: GameWall; mine: OwnBests }
  /** A climb started or resumed (the stained-glass climb, designs/the-stained-glass-climb.md). */
  | { a: 'climb'; ok: true; seed: number; startedAt: number; night: string; tier: ClimbTier; banked: number; remainingCap: number; bestBandToday: number; resumed: boolean; previousForgotten: boolean }
  /** A band reached: the run's banked band after it, what this frame added and the balance, and the first-time item when the clouds grant it. */
  | { a: 'ascent'; ok: true; banked: number; added: number; feathers: number; total: number; brisk: number; why?: ClimbWhy; item?: { variant: string; first: true }; ref: string }
  | { a: ActKind; ok: false; reason: 'far' | 'busy' | 'lit' | 'glowing' | 'idle' | 'emote' | 'offline' | 'unknown' | 'closed' | 'too-fast' | 'forgotten' }
);
/**
 * The arcade's score wall: today's best five per game (portraits and scores, no names). A newcomer
 * in the arcade gets every column and its own bests; everyone there gets a column again when a run
 * changes it.
 */
export interface ServerWall {
  t: 'wall';
  walls: GameWall[];
  mine?: OwnBests;
}
/** Why an owner's change to its nest was refused: the rules' reason, not the owner's nest, too fast, or the collections were away. */
export type NestEditRefusal = NestRefusal | 'not-owner' | 'busy' | 'offline';
/**
 * A nest as it stands. A newcomer gets it right after its welcome, with `mine`, and the owner also
 * the furniture it owns and today's furniture gift. Everyone else inside gets it whenever the owner
 * changes it, and the owner's change is answered with it (`r` and `ok`; `reason` when refused).
 */
export interface ServerNest {
  t: 'nest';
  nest?: NestView;
  mine?: boolean;
  owned?: string[];
  gift?: NestGiftState;
  r?: number;
  ok?: boolean;
  reason?: NestEditRefusal;
}
/**
 * The street's nest doors for this visitor: `own` is door 0, its own nest (made on its first visit;
 * null only for a page without a collection, which the room server refuses instead), and `doors` are
 * doors 1 to 5, always five, each another owl's open nest with its owner's colours for the flag
 * (null: no nest behind that door this time).
 */
export interface ServerStreet {
  t: 'street';
  r: number;
  own: { nestId: string; open: boolean } | null;
  doors: Array<StreetDoor | null>;
}
/** The busy ribbon (OP-075) came on, changed its words or went off (null). */
export interface ServerNotice {
  t: 'notice';
  words: string | null;
}
/** A nest turned this visitor away (closed to visitors, or no such nest) or closed while it was inside; the socket closes with 4011 next. */
export interface ServerClosed {
  t: 'closed';
  room: string;
  /**
   * `realm`: a gated realm is closed; the socket closes with 4013 next, and `sign` is its approved phrase.
   * `gate`: travel into the park before the owl walked through the front gate (OP-130); 4015 next.
   */
  why: 'closed' | 'gone' | 'realm' | 'gate';
  sign?: string;
}
/** The realms switch changed (a keeper opened or closed a realm, lit the portal, or named a night). */
export interface ServerRealms {
  t: 'realms';
  realms: RealmsSettings;
}
export type ServerFrame =
  | ServerWelcome
  | ServerEnter
  | ServerMove
  | ServerLook
  | ServerLeave
  | ServerRest
  | ServerAir
  | ServerCounts
  | ServerFull
  | ServerEmote
  | ServerSay
  | ServerQuests
  | ServerHandIn
  | ServerObjects
  | ServerUsed
  | ServerUseResult
  | ServerRefused
  | ServerLanterns
  | ServerQuiz
  | ServerPaid
  | ServerTasks
  | ServerAct
  | ServerNest
  | ServerStreet
  | ServerWall
  | ServerClosed
  | ServerNotice
  | ServerRealms;

// ---- validation (server side, strict) ----

const SPAWN_NAME = /^[a-z][a-z0-9-]{0,23}$/;
const OBJECT_ID = /^[a-z][a-z0-9-]{0,47}$/;

const isRequest = (r: unknown): r is number => typeof r === 'number' && Number.isInteger(r) && r >= 0 && r <= 1e9;
/** A whole number from 0 to `max`. */
const isCount = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;

/** Parse and validate one client frame. Returns null for anything malformed. */
export function parseClientFrame(text: string, maxBytes = MAX_FRAME_BYTES): ClientFrame | null {
  if (typeof text !== 'string' || text.length > maxBytes) return null;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(v)) return null;
  switch (v['t']) {
    case 'hello': {
      if (v['v'] !== EDGE_PROTOCOL_VERSION || !isLook(v['look'])) return null;
      const out: ClientHello = { t: 'hello', v: EDGE_PROTOCOL_VERSION, look: cleanLook(v['look']) };
      if (v['spawn'] !== undefined) {
        if (typeof v['spawn'] !== 'string' || !SPAWN_NAME.test(v['spawn'])) return null;
        out.spawn = v['spawn'];
      }
      if (v['pos'] !== undefined) {
        if (!isVec2(v['pos'])) return null;
        out.pos = { x: Math.round(v['pos'].x), y: Math.round(v['pos'].y) };
      }
      if (v['via'] !== undefined) {
        if (v['via'] !== 'travel') return null;
        out.via = 'travel';
      }
      return out;
    }
    case 'move': {
      if (!isVec2(v['to']) || typeof v['seq'] !== 'number' || !Number.isInteger(v['seq']) || v['seq'] < 0 || v['seq'] > 1e9) return null;
      return { t: 'move', to: { x: Math.round(v['to'].x), y: Math.round(v['to'].y) }, seq: v['seq'] };
    }
    case 'look': {
      if (!isLook(v['look'])) return null;
      return { t: 'look', look: cleanLook(v['look']) };
    }
    case 'bye':
      return { t: 'bye' };
    case 'rest':
      return typeof v['asleep'] === 'boolean' ? { t: 'rest', asleep: v['asleep'] } : null;
    case 'air':
      // Never a broken page's frame: whether the room can believe it is the room's to decide, and it drops it quietly.
      return { t: 'air', air: v['air'] };
    case 'emote':
      return isEmoteId(v['e']) ? { t: 'emote', e: v['e'] } : null;
    case 'say': {
      // A whole number in range; whether the phrase list has it is the room's to decide.
      const n = v['n'];
      return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= PHRASE_NUMBER_MAX ? { t: 'say', n } : null;
    }
    case 'quests':
      return isRequest(v['r']) ? { t: 'quests', r: v['r'] } : null;
    case 'talk':
      return isRequest(v['r']) && typeof v['npc'] === 'string' && OBJECT_ID.test(v['npc']) ? { t: 'talk', npc: v['npc'], r: v['r'] } : null;
    case 'accept':
    case 'abandon':
    case 'handin':
      return isRequest(v['r']) && typeof v['quest'] === 'string' && OBJECT_ID.test(v['quest']) ? { t: v['t'], quest: v['quest'], r: v['r'] } : null;
    case 'use':
      return isRequest(v['r']) && typeof v['target'] === 'string' && OBJECT_ID.test(v['target']) ? { t: 'use', target: v['target'], r: v['r'] } : null;
    case 'gather': {
      const n = v['n'];
      if (!isRequest(v['r']) || typeof v['quest'] !== 'string' || !OBJECT_ID.test(v['quest']) || typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 31) return null;
      return { t: 'gather', quest: v['quest'], n, r: v['r'] };
    }
    case 'act': {
      const a = v['a'];
      if (!isRequest(v['r']) || !(ACT_KINDS as readonly unknown[]).includes(a)) return null;
      if (a === 'note') return isEmoteId(v['e']) ? { t: 'act', a, e: v['e'], r: v['r'] } : null;
      if (a === 'run') return isArcadeGame(v['g']) ? { t: 'act', a, g: v['g'], r: v['r'] } : null;
      if (a === 'ascent') {
        const { k, band } = v;
        if (!isCount(k, 2 ** 32 - 1) || !isCount(band, BAND_COUNT) || band < 1) return null;
        return { t: 'act', a, k, band, r: v['r'] };
      }
      if (a === 'score' || a === 'record') {
        const { g, s, n, k } = v;
        if (!isArcadeGame(g) || !isCount(s, 1e6) || !isCount(k, 2 ** 32 - 1) || (n !== undefined && !isCount(n, 1000))) return null;
        return n === undefined ? { t: 'act', a, g, s, k, r: v['r'] } : { t: 'act', a, g, s, n, k, r: v['r'] };
      }
      return { t: 'act', a: a as ActKind, r: v['r'] };
    }
    case 'street':
      return isRequest(v['r']) ? { t: 'street', r: v['r'] } : null;
    case 'nest': {
      const r = v['r'];
      const edit = parseNestEdit(v);
      return isRequest(r) && edit ? { t: 'nest', r, ...edit } : null;
    }
    default:
      return null;
  }
}

const SERVER_FRAME_TYPES = new Set(['welcome', 'enter', 'move', 'look', 'leave', 'counts', 'full', 'emote', 'say', 'quests', 'handin', 'objects', 'used', 'useResult', 'refused', 'lanterns', 'quiz', 'paid', 'tasks', 'act', 'nest', 'street', 'wall', 'closed', 'notice', 'realms', 'rest', 'air']);

/** Loose check for server frames on the client (a trusted source, but never crash on garbage). */
export function parseServerFrame(text: string): ServerFrame | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(v) || typeof v['t'] !== 'string') return null;
  const t = v['t'];
  if (SERVER_FRAME_TYPES.has(t)) return v as unknown as ServerFrame;
  return null;
}
