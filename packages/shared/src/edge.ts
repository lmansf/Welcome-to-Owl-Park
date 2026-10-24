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
 * everyone else in the room (never words).
 */
import type { QuizZone, TaskView } from './activities';
import type { Award } from './book';
import { parseNestEdit, type NestEdit, type NestRefusal, type NestView } from './homes';
import { cleanLook } from './look';
import type { NestGiftState, StreetDoor } from './nestbook';
import { PHRASE_NUMBER_MAX } from './phrases';
import type { OwlLook, Vec2 } from './protocol';
import type { QuestBoard, QuestUpdate } from './quests';
import { isEmoteId, isLook, isObj, isPlayableEmote, isVec2 } from './validate';

/** Raised whenever a page and the room server must agree on something new (5: the wider rooms, 6: the activities, 7: the nests, 8: prewritten chat), so a stale page reloads. */
export const EDGE_PROTOCOL_VERSION = 8;
export const MAX_FRAME_BYTES = 1024;
export const HEARTBEAT_FRAME = 'hb';
export const HEARTBEAT_INTERVAL_MS = 25_000;
/** Moves the room server accepts from one visitor: a burst, then this many more per second. */
export const MOVE_BURST = 5;
export const MOVE_REFILL_PER_S = 2;

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
}

// ---- client -> server ----
export interface ClientHello {
  t: 'hello';
  v: number;
  look: OwlLook;
  spawn?: string;
  /** Resume hint (last drawn position); honoured only when close to the spawn or a recent leave. */
  pos?: Vec2;
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
/** Play an owned emote for everyone in the room, or the hop every owl has (JUMP_EMOTE). */
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
 * copy game or play it a note (`e`, an emote the owl owns), or ask for today's tasks. Answered with `act`.
 */
export type ActKind = 'light' | 'cast' | 'reel' | 'copy' | 'note' | 'tasks';
export const ACT_KINDS: readonly ActKind[] = ['light', 'cast', 'reel', 'copy', 'note', 'tasks'];
export interface ClientAct {
  t: 'act';
  a: ActKind;
  e?: string;
  r: number;
}
/** On the street: ask for its nest doors, this visitor's own nest and other owls' open ones. Answered with `street`. */
export interface ClientStreet {
  t: 'street';
  r: number;
}
/** In its own nest, the owner changes it: a piece in a spot (null takes it away), or open or closed to visitors. Answered with `nest`. */
export type ClientNest = { t: 'nest'; r: number } & NestEdit;
export type ClientFrame = ClientHello | ClientMove | ClientLook | ClientBye | ClientEmote | ClientSay | ClientQuests | ClientTalk | ClientQuestAction | ClientUse | ClientGather | ClientAct | ClientStreet | ClientNest;

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
  | { a: ActKind; ok: false; reason: 'far' | 'busy' | 'lit' | 'glowing' | 'idle' | 'emote' | 'offline' | 'unknown' }
);
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
/** A nest turned this visitor away (closed to visitors, or no such nest) or closed while it was inside; the socket closes with 4011 next. */
export interface ServerClosed {
  t: 'closed';
  room: string;
  why: 'closed' | 'gone';
}
export type ServerFrame =
  | ServerWelcome
  | ServerEnter
  | ServerMove
  | ServerLook
  | ServerLeave
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
  | ServerClosed;

// ---- validation (server side, strict) ----

const SPAWN_NAME = /^[a-z][a-z0-9-]{0,23}$/;
const OBJECT_ID = /^[a-z][a-z0-9-]{0,47}$/;

const isRequest = (r: unknown): r is number => typeof r === 'number' && Number.isInteger(r) && r >= 0 && r <= 1e9;

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
    case 'emote':
      return isPlayableEmote(v['e']) ? { t: 'emote', e: v['e'] } : null;
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

const SERVER_FRAME_TYPES = new Set(['welcome', 'enter', 'move', 'look', 'leave', 'counts', 'full', 'emote', 'say', 'quests', 'handin', 'objects', 'used', 'useResult', 'refused', 'lanterns', 'quiz', 'paid', 'tasks', 'act', 'nest', 'street', 'closed']);

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
