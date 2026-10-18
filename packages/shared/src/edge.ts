/**
 * Protocol v3: the authoritative room server (Durable Object) and its clients.
 * Every client frame is one JSON object (≤ 1 KiB) except the literal heartbeat text frame `hb`.
 * All timestamps (`at`, `now`, `next`) are server milliseconds; clients never put their clock on the wire.
 * v3 adds collectibles: looks may carry `wear`, and the `drops`, `pickup` and `emote` frames.
 */
import type { DropView } from './collectibles';
import { cleanLook } from './look';
import type { OwlLook, Vec2 } from './protocol';
import { isEmoteId, isLook, isObj, isVec2 } from './validate';

export const EDGE_PROTOCOL_VERSION = 3;
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
/** Ask for this window's unclaimed drops (answered with `drops`). */
export interface ClientDrops {
  t: 'drops';
}
/** Pick up drop `n` of the current window; the server checks the owl stands on it. */
export interface ClientPickup {
  t: 'pickup';
  n: number;
}
/** Play an owned emote for everyone in the room. */
export interface ClientEmote {
  t: 'emote';
  e: string;
}
export type ClientFrame = ClientHello | ClientMove | ClientLook | ClientBye | ClientDrops | ClientPickup | ClientEmote;

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
/** This window's unclaimed drops across the park (only the finder ever sees them). */
export interface ServerDrops {
  t: 'drops';
  window: string;
  /** Server ms when the next window starts. */
  next: number;
  drops: DropView[];
  feathers: number;
}
/** A pickup succeeded: the variant found, whether it was a duplicate (paid in feathers), the new balance. */
export interface ServerFound {
  t: 'found';
  n: number;
  variant: string;
  dup: boolean;
  feathers: number;
}
/** A pickup was refused: too far from the drop, already taken or from a window that has ended. */
export interface ServerMissed {
  t: 'missed';
  n: number;
  reason: 'far' | 'gone' | 'busy';
}
export interface ServerEmote {
  t: 'emote';
  id: string;
  e: string;
}
export type ServerFrame = ServerWelcome | ServerEnter | ServerMove | ServerLook | ServerLeave | ServerCounts | ServerFull | ServerDrops | ServerFound | ServerMissed | ServerEmote;

// ---- validation (server side, strict) ----

const SPAWN_NAME = /^[a-z][a-z0-9-]{0,23}$/;

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
    case 'drops':
      return { t: 'drops' };
    case 'pickup': {
      const n = v['n'];
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 15) return null;
      return { t: 'pickup', n };
    }
    case 'emote':
      return isEmoteId(v['e']) ? { t: 'emote', e: v['e'] } : null;
    default:
      return null;
  }
}

const SERVER_FRAME_TYPES = new Set(['welcome', 'enter', 'move', 'look', 'leave', 'counts', 'full', 'drops', 'found', 'missed', 'emote']);

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
