/**
 * Durable Object adapter around `Room`. Holds the WebSockets with the Hibernation API so an
 * idle park costs nothing, answers heartbeats without waking, and rebuilds every room from
 * the socket attachments when the object wakes up or is moved. Besides the park's rooms it
 * holds the street of nests and every nest with owls in it, each nest a room of its own made
 * from NEST_ROOM; whose nest it is and how it stands come from the collections object. An arcade
 * run lives in the collections object, keyed by the collector, like the climb's: it outlasts the
 * object's sleep and the visitor's socket (OP-137). With accounts on (OP-139) a socket from a
 * screen its owl has moved from is sent the moved card, at its hello or at once when the Worker
 * says the owl was restored elsewhere.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  ARCADE_ROOM,
  Activities,
  CLOSE,
  COPY_BASE_EMOTES,
  DEFAULT_LOOK,
  HEARTBEAT_FRAME,
  KIND_RULES,
  LANTERN_ROOM,
  QUIZ_FEATHERS,
  QUIZ_ROOM,
  NPC_EMOTE_RADIUS,
  NPC_TALK_RADIUS,
  REALMS_DEFAULTS,
  RIBBON_MAX_CHARS,
  STREET_DOORS,
  STREET_ROOM,
  distance,
  filterOwnedWear,
  getInteractable,
  getNpc,
  getQuest,
  hashForLog,
  isDeviceId,
  isEmoteId,
  insidePark,
  isNestRoom,
  isTimeZone,
  lanternFeathers,
  leafRespawnMs,
  nestIdOf,
  nestLook,
  npcsIn,
  parseClientFrame,
  pointInRect,
  portraitLook,
  cleanRealms,
  climbRef,
  sameRealms,
  startRun,
  wearVariants,
  type ClientAct,
  type ClientFrame,
  type ClientHello,
  type ClientNest,
  type LanternState,
  type LogFields,
  type Logger,
  type NestEditRefusal,
  type NestEditResult,
  type NestView,
  type NestVisit,
  type OwlLook,
  type PlayResult,
  type QuestBoard,
  type QuestUpdate,
  type RealmsSettings,
  type RunResult,
  type ServerFrame,
  type ServerNest,
  type Wear,
} from '@owl-park/shared';
import { accountsOn } from './accounts';
import type { Collections } from './Collections';
import { deviceClass, logConfig, type DeviceClass, type Visit } from './collectLog';
import { loggerFor, moduleLog, runIdOf } from './logs';
import type { Sighting } from './parkStats';
import { LIMITS, Room, type Leaver, type Peer, type PositionRejection, type VisitorState } from './Room';
import { ROOMS, isRoomId, publicCounts, roomCap, roomDef } from './rooms';
import { isCollectorId, signingSecret, verifyKeeper } from './pass';
import type { Env } from './env';

interface Attachment {
  room: string;
  id: string;
  /** Random per-socket session id, so a replaced socket's close never removes its successor. */
  sid: string;
  ip: string;
  joinedAt: number;
  state: VisitorState | null;
  /** The collector behind this page (from the pass), if any: owns the quests, wear and emotes. */
  cid?: string;
  tz?: string;
  /** In a nest: this owl is its owner (the collections object said so at its hello). Only the owner changes a nest. */
  owner?: boolean;
  /** Which copy of its room this object is (OP-075), when it is not the room itself. */
  copy?: number;
  /** The entry the Worker gave this socket, handed over in the welcome and then let go (OP-075). */
  entry?: string;
  /** Phone or desktop, from the browser's own words at the upgrade: for the collection log (OP-107), nothing else. */
  device?: DeviceClass;
  /** The device the pass's collector token names (OP-139): the owl's other screens are sent the moved card. */
  dev?: string;
  /** The chaos run the socket was opened under (its X-Chaos-Run header, OP-132): on every line about it (OP-134). */
  run?: string;
  /** Why the room server closed the socket, when it did (rate limits, a bad frame): its leave is a kick (OP-134). */
  kicked?: string;
}

/** Why an owl leaves its room, as the log tells it (OP-134); `afk` is told for a goodbye said asleep. */
interface LeaveWhy {
  reason: 'user' | 'dropped' | 'timeout' | 'kick';
  detail?: string;
}

/** The visit a socket's owl is on, as the collection log takes it: its pass's id, its device and its room. */
function visitOf(att: Attachment): Visit {
  return { pass: att.id, device: att.device ?? null, room: att.room };
}

/** A socket's owl as the player stats see it (OP-111): its collector and its visit. Null without a collector. */
function sightingOf(att: Attachment | null): Sighting | null {
  return att?.cid ? { cid: att.cid, ...visitOf(att) } : null;
}

/** What a collector owns, as last read from the collections object. */
interface OwnedEntry {
  set: Set<string>;
  at: number;
}

const HELLO_TIMEOUT_MS = 5_000;
const IDLE_CLOSE_MS = 90_000;
const ALARM_EVERY_MS = 60_000;
/** Population counts go out at most this often (welcome frames always carry fresh counts). */
const COUNTS_EVERY_MS = 10_000;
/** Default sockets per address per object; a household or office shares one address. Override with MAX_SOCKETS_PER_IP. */
const DEFAULT_MAX_SOCKETS_PER_IP = 8;
/** Re-read a collector's collection when a look or emote names something the cache lacks, at most this often. */
const OWNED_REFRESH_MS = 2_000;
const OWNED_CACHE_MAX = 1_000;
/** Storage key for used-up shared objects (leaf piles): room id -> object id -> when it is back. */
const OBJECTS_KEY = 'objects';
/** Storage keys for the hub's lantern beam and the last stage quiz round settled. */
const LANTERNS_KEY = 'lanterns';
const QUIZ_KEY = 'quiz';
/** The busy ribbon (OP-075) is asked of the overflow object at most this often; it also tells the rooms when it changes. */
const NOTICE_FRESH_MS = 60_000;
/** Storage key for the realms switch as last heard (the stained-glass climb): a woken object starts from it, not from closed. */
const REALMS_KEY = 'realms';
/**
 * Storage key for where owls left each room lately (room id -> owl id -> where and when), so an owl back
 * from a dropped connection resumes where it was though its empty nest was let go or this object slept
 * meanwhile (OP-138). Only the room's memory window is kept.
 */
const LEAVERS_KEY = 'leavers';
/** The most owls kept there, the latest to leave first: the stored value stays small on a busy night. */
const LEAVERS_KEPT = 500;

/** Stored leavers as they should be: anything else is dropped. */
function cleanLeavers(v: unknown): Record<string, Record<string, Leaver>> {
  const out: Record<string, Record<string, Leaver>> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [room, owls] of Object.entries(v as Record<string, unknown>)) {
    if (!owls || typeof owls !== 'object') continue;
    for (const [id, l] of Object.entries(owls as Record<string, unknown>)) {
      const { pos, leftAt, dropped } = (l ?? {}) as Partial<Leaver>;
      if (typeof leftAt !== 'number' || typeof pos?.x !== 'number' || typeof pos.y !== 'number') continue;
      (out[room] ??= {})[id] = { pos: { x: pos.x, y: pos.y }, leftAt, ...(dropped === true ? { dropped: true as const } : {}) };
    }
  }
  return out;
}
/** The phrase a closed realm's door shows when none is set on it. */
const REALM_CLOSED_SIGN = 'Pardon Our Feathers';

function withoutWear(look: OwlLook): OwlLook {
  const { wear: _wear, ...rest } = look;
  return rest;
}

function withWear(look: OwlLook, wear: Wear | undefined): OwlLook {
  const base = withoutWear(look);
  return wear ? { ...base, wear } : base;
}

function peerOf(ws: WebSocket): Peer {
  return {
    // A socket closed meanwhile is the close handler's to clean up: a send to it failing is no news,
    // and one that fails on an open socket goes on to the room, which logs it.
    send: (text) => {
      try {
        ws.send(text);
      } catch (e) {
        if (ws.readyState === WebSocket.READY_STATE_OPEN) throw e;
      }
    },
    close: (code, reason) => {
      // The room closes a socket for its rate limits; a replaced session's owl stays, on its new socket.
      if (code !== CLOSE.REPLACED) kickedFor(ws, reason);
      closeSocket(ws, code, reason);
    },
    persist: (state) => {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att) ws.serializeAttachment({ ...att, state } satisfies Attachment);
    },
  };
}

function randomSid(): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Close a socket that may be closed already (the page went first: nothing to tell). One still open that will not close is logged. */
function closeSocket(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch (e) {
    if (ws.readyState === WebSocket.READY_STATE_OPEN) moduleLog.warn('room.leave', 'send_failed', 'A socket could not be closed.', { code, reason, error: e });
  }
}

/** The room server is closing this socket: its owl's leave is logged as a kick, with why (OP-134). */
function kickedFor(ws: WebSocket, why: string): void {
  const att = ws.deserializeAttachment() as Attachment | null;
  if (att && !att.kicked) ws.serializeAttachment({ ...att, kicked: why } satisfies Attachment);
}

/** Frames' handling time is told per room this often (OP-134's tick_latency_p95), from a sample of at most so many frames. */
const TICK_EVERY_MS = 10_000;
const TICK_SAMPLE_MAX = 2_000;
/** Emotes dropped for coming too fast are told at most this often per socket, with how many (OP-134). */
const THROTTLE_TELL_MS = 10_000;
/** Places the room would not take as a page asked are told at most this often per socket, with how many (OP-149). */
const REJECTED_TELL_MS = 60_000;

/** The nearest-rank 95th percentile of some times (ms); 0 for none. */
export function p95(ms: readonly number[]): number {
  if (!ms.length) return 0;
  const sorted = [...ms].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]!;
}

export class RoomObject extends DurableObject<Env> {
  private readonly rooms = new Map<string, Room>();
  /** The activities of each room (activities.ts): lanterns, the quiz, fishing, the copy game. */
  private readonly acts = new Map<string, Activities>();
  private lastCounts = '';
  private lastCountsAt = 0;
  private countsDirty = false;
  private readonly owned = new Map<string, OwnedEntry>();
  private readonly ownedLoads = new Map<string, Promise<OwnedEntry | null>>();
  private readonly lastEquipped = new Map<string, string>();
  /** Quest requests run one at a time per visitor, in arrival order. */
  private readonly queues = new Map<string, Promise<void>>();
  /**
   * Nest hellos still waiting on the collections object, by socket session, with their room. Frames
   * that arrive from that socket meanwhile wait behind its hello.
   */
  private readonly admitting = new Map<string, { room: string; done: Promise<void> }>();
  /** The latest view of each nest with owls in it or at its door, by nest id: the owner's changes land here first. */
  private readonly nestViews = new Map<string, NestView>();
  /** Each owl's colours and kind as last sent to its account (OP-139), so an unchanged look is not sent again. */
  private readonly looksSent = new Map<string, string>();
  /** The busy ribbon's words (OP-075), null while it is off, and when they were last asked for. */
  private notice: string | null = null;
  /** The realms switch as last heard from the overflow object (its notice, its poll, or this object's storage). */
  private realms: RealmsSettings = REALMS_DEFAULTS;
  /** The player stats are kept only while the analytics log is set up (OP-111): without it, no calls for them. */
  private readonly statsOn: boolean;
  private noticeAt = 0;
  /** Where owls left each room lately, kept past the rooms themselves (OP-138). */
  private readonly leftBehind = new Map<string, Record<string, Leaver>>();
  /** The room server's log (OP-134), at the deployment's level. */
  private readonly log: Logger;
  /** Each room's frames' handling times since its window began (OP-134's tick_latency_p95). */
  private readonly ticks = new Map<string, { since: number; n: number; ms: number[] }>();
  /** Emotes dropped for coming too fast, by socket session, since last told (OP-134's emote_throttled). */
  private readonly throttled = new Map<string, { n: number; toldAt: number }>();
  /** Places the room would not take as asked, by socket session, since last told (OP-149's position_rejected). */
  private readonly rejected = new Map<string, { n: number; toldAt: number; why: PositionRejection }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.log = loggerFor(env);
    this.statsOn = logConfig(env) !== null;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT_FRAME, HEARTBEAT_FRAME));
    // Wake-up: rebuild rooms from the hibernated sockets' attachments. A socket whose
    // attachment no longer makes sense (room removed, corrupt data) is closed, not fatal.
    for (const ws of ctx.getWebSockets()) {
      try {
        const att = ws.deserializeAttachment() as Attachment | null;
        if (!att?.state) continue;
        this.room(att.room).restore(peerOf(ws), att.state, att.sid);
      } catch (e) {
        this.log.error('room.join', 'unhandled_error', 'A socket’s owl could not be put back in its room after the object woke: the socket is closed.', { error: e });
        closeSocket(ws, 1011, 'room unavailable');
      }
    }
    // An idle object can be evicted while a leaf pile is still gone: bring those back from storage.
    void ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<Record<string, Record<string, number>>>(OBJECTS_KEY);
      for (const [id, until] of Object.entries(saved ?? {})) if (Object.hasOwn(ROOMS, id)) this.room(id).restoreObjects(until);
      // A lantern beam still burning, and the last quiz round paid, so a round is never paid twice.
      const lanterns = await ctx.storage.get<LanternState>(LANTERNS_KEY);
      if (lanterns && Object.hasOwn(ROOMS, LANTERN_ROOM)) this.activities(LANTERN_ROOM).restoreLanterns(lanterns);
      const settled = await ctx.storage.get<number>(QUIZ_KEY);
      if (typeof settled === 'number' && Object.hasOwn(ROOMS, QUIZ_ROOM)) this.activities(QUIZ_ROOM).quizSettled = settled;
      // The realms switch as last heard, so a wake from hibernation does not close an open realm.
      const realms = await ctx.storage.get<unknown>(REALMS_KEY);
      if (realms) this.realms = cleanRealms(realms);
      // Where owls left lately, so one back from a dropped connection resumes where it was (OP-138).
      for (const [id, kept] of Object.entries(cleanLeavers(await ctx.storage.get<unknown>(LEAVERS_KEY)))) {
        if (!roomDef(id)) continue;
        this.leftBehind.set(id, kept);
        this.rooms.get(id)?.restoreLeavers(kept);
      }
    });
  }

  /** Every visitor sees these: the nests are summed under one key, so no count names a nest. */
  private counts(): Record<string, number> {
    return publicCounts(this.rooms);
  }

  private room(id: string): Room {
    let r = this.rooms.get(id);
    if (!r) {
      const def = roomDef(id);
      if (!def) throw new Error(`unknown room ${id}`);
      r = new Room(def, {
        now: () => Date.now(),
        cap: roomCap(this.env, id),
        counts: () => this.counts(),
        log: this.log,
        rejected: (owl, why) => this.positionRejected(id, owl, why),
      });
      this.rooms.set(id, r);
      const kept = this.leftBehind.get(id);
      if (kept) r.restoreLeavers(kept);
    }
    return r;
  }

  private activities(id: string): Activities {
    let a = this.acts.get(id);
    if (!a) {
      a = new Activities(this.room(id), () => Date.now());
      this.acts.set(id, a);
    }
    return a;
  }

  // ---------- the log (OP-134) ----------

  /** The lines about one socket's owl: its room, its hashed ids, and its chaos run when it came with one. */
  private logOf(att: Attachment): Logger {
    const fields: LogFields = { room: att.room, session_id: hashForLog(att.id) };
    if (att.cid) fields.collector_hash = hashForLog(att.cid);
    if (att.run) fields.run_id = att.run;
    return this.log.with(fields);
  }

  /** A frame's handling time in a room (every nest together): once its window has run TICK_EVERY_MS, the window's 95th percentile is logged. */
  private sampleTick(roomId: string, ms: number): void {
    const room = isNestRoom(roomId) ? 'nest' : roomId;
    const now = Date.now();
    let w = this.ticks.get(room);
    if (!w) this.ticks.set(room, (w = { since: now, n: 0, ms: [] }));
    w.n += 1;
    if (w.ms.length < TICK_SAMPLE_MAX) w.ms.push(ms);
    if (now - w.since < TICK_EVERY_MS) return;
    this.log.info('room.tick', 'tick_latency_p95', 'How long a room’s frames took to handle over the last window.', { room, p95_ms: p95(w.ms), frames: w.n, window_ms: now - w.since });
    this.ticks.set(room, { since: now, n: 0, ms: [] });
  }

  /** An emote dropped for coming too fast: told at once, then at most every THROTTLE_TELL_MS per socket with how many since. */
  private emoteThrottled(att: Attachment): void {
    const now = Date.now();
    const t = this.throttled.get(att.sid) ?? { n: 0, toldAt: Number.NEGATIVE_INFINITY };
    t.n += 1;
    if (now - t.toldAt >= THROTTLE_TELL_MS) {
      this.logOf(att).info('room.emote', 'emote_throttled', 'Emotes came too fast and were dropped.', { count: t.n });
      t.n = 0;
      t.toldAt = now;
    }
    // Kept per socket until it goes; a flood of sockets never grows it past this.
    if (this.throttled.size >= 2_000 && !this.throttled.has(att.sid)) this.throttled.clear();
    this.throttled.set(att.sid, t);
  }

  /** A socket is done: the emotes it had dropped since last told are told now, and the places the room would not take. */
  private flushThrottled(att: Attachment): void {
    const t = this.throttled.get(att.sid);
    this.throttled.delete(att.sid);
    if (t?.n) this.logOf(att).info('room.emote', 'emote_throttled', 'Emotes came too fast and were dropped.', { count: t.n });
    const r = this.rejected.get(att.sid);
    this.rejected.delete(att.sid);
    if (r?.n) this.tellRejected(att, r);
  }

  /**
   * A place or a stance the room would not take as an owl's page asked for it (OP-149, Room.ts
   * PositionRejection): told at once, then at most every REJECTED_TELL_MS per socket with how many
   * since and the last reason. An honest page asks for one now and then (an older copy of a room, a
   * page back after the room server restarted); a page that keeps asking is in the log once a minute.
   *
   * TODO-DOCS (OP-149): docs/LOGGING.md: position_rejected (component room.move), its reason (room,
   * floor, perch or arrival, Room.ts PositionRejection) and count; docs/ARCHITECTURE.md's room server
   * rules: a page's word is never an owl's place for the others.
   */
  private positionRejected(roomId: string, id: string, why: PositionRejection): void {
    const att = this.attachmentOf(roomId, id);
    if (!att) return;
    const now = Date.now();
    const r = this.rejected.get(att.sid) ?? { n: 0, toldAt: Number.NEGATIVE_INFINITY, why };
    r.n += 1;
    r.why = why;
    if (now - r.toldAt >= REJECTED_TELL_MS) {
      this.tellRejected(att, r);
      r.n = 0;
      r.toldAt = now;
    }
    // Kept per socket until it goes; a flood of sockets never grows it past this.
    if (this.rejected.size >= 2_000 && !this.rejected.has(att.sid)) this.rejected.clear();
    this.rejected.set(att.sid, r);
  }

  private tellRejected(att: Attachment, r: { n: number; why: PositionRejection }): void {
    this.logOf(att).info('room.move', 'position_rejected', 'The room would not take a place or a stance as an owl’s page asked for it.', { reason: r.why, count: r.n });
  }

  /** The attachment of a visitor's socket in a room, said hello or not (its first frame may be the one refused). */
  private attachmentOf(roomId: string, id: string): Attachment | null {
    for (const ws of this.ctx.getWebSockets(`id:${id}`)) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att?.room === roomId) return att;
    }
    return null;
  }

  /** An owl's leave (OP-134): why, how long it stayed, and for a goodbye said asleep how long it slept (afk). Before the room lets it go. */
  private logLeave(att: Attachment, room: Room, why: LeaveWhy): void {
    const log = this.logOf(att);
    const sleep = room.sleepOf(att.id);
    const reason = att.kicked ? 'kick' : why.reason === 'user' && sleep ? 'afk' : why.reason;
    const detail = att.kicked ?? why.detail;
    const now = Date.now();
    log.info('room.leave', 'room_leave', 'An owl left a room.', { reason, ...(detail ? { detail } : {}), stayed_ms: now - att.joinedAt });
    if (reason === 'afk') log.info('room.rest', 'afk_leave', 'An owl left its room asleep, its visitor away.', sleep?.since != null ? { asleep_ms: now - sleep.since } : {});
  }

  /** The busy ribbon now: asked of the overflow object when last asked more than a minute ago. */
  private async freshNotice(): Promise<void> {
    if (Date.now() - this.noticeAt < NOTICE_FRESH_MS) return;
    this.noticeAt = Date.now();
    // A room object without the overflow object (a test's stand-in env) simply shows no ribbon.
    const ns = this.env.OVERFLOW as Env['OVERFLOW'] | undefined;
    if (!ns) return;
    try {
      const r = await ns.get(ns.idFromName('park')).fetch('https://park/notice');
      if (r.ok) {
        const body = (await r.json()) as { words?: unknown; realms?: unknown };
        this.setNotice(body.words);
        if (body.realms !== undefined) this.setRealms(body.realms);
      } else this.log.warn('overflow', 'read_failed', 'The overflow object did not say the busy ribbon: it stays as it was until the next ask.', { status: r.status });
    } catch (e) {
      this.log.warn('overflow', 'read_failed', 'The overflow object did not say the busy ribbon: it stays as it was until the next ask.', { error: e });
    }
  }

  /**
   * The ribbon changed: everyone in this object's rooms sees it (or sees it go). `told`: the overflow
   * object says it changed, so it goes out even when it matches what this object holds, since an object
   * woken from hibernation holds no words while its owls still show the old ones.
   */
  private setNotice(words: unknown, told = false): void {
    const w = typeof words === 'string' && words ? words.slice(0, RIBBON_MAX_CHARS) : null;
    if (w === this.notice && !told) return;
    this.notice = w;
    for (const room of this.rooms.values()) room.broadcast({ t: 'notice', words: w });
  }

  /** A gated room not in the switch's `open` (the stained-glass climb). Rooms without `gated` are never closed this way. */
  private realmClosed(roomId: string): boolean {
    return roomDef(roomId)?.gated === true && !this.realms.open.includes(roomId);
  }

  /** The approved phrase the hub's door into `roomId` shows while it is closed. */
  private realmSign(roomId: string): string {
    return ROOMS['hub']?.doors.find((d) => d.to?.room === roomId)?.closedSign ?? REALM_CLOSED_SIGN;
  }

  /**
   * The realms switch changed (the overflow object's notice or poll): keep it, in memory and in storage,
   * tell every owl so the hub's arch draws open or closed, and send the owls out of a realm that closed.
   */
  private setRealms(v: unknown): void {
    const next = cleanRealms(v);
    if (sameRealms(next, this.realms)) return;
    const before = this.realms;
    this.realms = next;
    this.log.debug('room.realms', 'realms_set', 'The realms switch reached this room object.', { open: next.open, portal: next.portal, ...(next.night ? { night: next.night } : {}) });
    void this.ctx.storage.put(REALMS_KEY, next);
    for (const room of this.rooms.values()) room.broadcast({ t: 'realms', realms: next });
    for (const roomId of before.open) if (!next.open.includes(roomId) && roomDef(roomId)?.gated) this.sendRealmAway(roomId);
  }

  // ---------- accounts (OP-139) ----------

  /** A socket whose owl is on another screen now: closed with the code that shows the moved card. */
  private sendMoved(ws: WebSocket): void {
    closeSocket(ws, CLOSE.MOVED, 'moved');
    this.drop(ws, { reason: 'kick', detail: 'moved' });
  }

  /** An owl restored on another screen: its sockets here from every other device are sent the moved card. */
  private sendMovedAway(cid: string, dev: string): void {
    for (const ws of this.ctx.getWebSockets(`cid:${cid}`)) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att && att.dev !== dev) this.sendMoved(ws);
    }
  }

  /** At a hello, with accounts on: a page on a screen its owl has moved from is sent the moved card (the owl walks in meanwhile). */
  private checkDevice(ws: WebSocket, att: Attachment): void {
    if (!att.cid || !accountsOn(this.env)) return;
    const sid = att.sid;
    this.ctx.waitUntil(
      this.collections()
        .accountHolds(att.cid, att.dev ?? null)
        .then((holds) => {
          if (!holds && (ws.deserializeAttachment() as Attachment | null)?.sid === sid) this.sendMoved(ws);
        })
        .catch((e: unknown) => this.logOf(att).warn('room.join', 'read_failed', 'The collections object did not say which screen holds the owl: it stays on this one.', { error: e })),
    );
  }

  /** With accounts on: the owl's colours and kind, for its picture when it is restored on another screen (sent only when they changed). */
  private accountLook(att: Attachment, look: OwlLook): void {
    if (!att.cid || !accountsOn(this.env)) return;
    const cid = att.cid;
    const portrait = portraitLook(look);
    const key = JSON.stringify(portrait);
    if (this.looksSent.get(cid) === key) return;
    if (this.looksSent.size >= 2000) this.looksSent.clear();
    this.looksSent.set(cid, key);
    this.ctx.waitUntil(
      this.collections()
        .accountLook(cid, portrait)
        .catch((e: unknown) => {
          // Sent again with the next look.
          this.looksSent.delete(cid);
          this.logOf(att).warn('room.join', 'write_failed', 'The owl’s picture for its account was not kept: it goes again with its next look.', { error: e });
        }),
    );
  }

  /** A realm just closed: every owl in it is told so and sent back to the hub by its own page. */
  private sendRealmAway(roomId: string): void {
    const sign = this.realmSign(roomId);
    for (const ws of this.ctx.getWebSockets(`room:${roomId}`)) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att?.state) continue;
      this.send(ws, { t: 'closed', room: roomId, why: 'realm', sign });
      closeSocket(ws, CLOSE.REALM_CLOSED, 'realm closed');
      this.drop(ws, { reason: 'kick', detail: 'realm-closed' });
    }
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/counts') {
      return Response.json(this.counts());
    }
    if (url.pathname === '/notice' && request.method === 'POST') {
      // The overflow object's word that the ribbon or the realms switch changed.
      const body = (await request.json().catch(() => null)) as { words?: unknown; realms?: unknown } | null;
      this.noticeAt = Date.now();
      this.setNotice(body?.words, true);
      if (body?.realms !== undefined) this.setRealms(body.realms);
      return Response.json({ ok: true });
    }
    if (url.pathname === '/moved' && request.method === 'POST') {
      // The Worker's word that an owl was restored on another screen (OP-139).
      const body = (await request.json().catch(() => null)) as { cid?: unknown; dev?: unknown } | null;
      if (isCollectorId(body?.cid) && isDeviceId(body?.dev)) this.sendMovedAway(body.cid, body.dev);
      return Response.json({ ok: true });
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const roomId = request.headers.get('X-Room') ?? '';
    const id = request.headers.get('X-Visitor-Id') ?? '';
    const ip = request.headers.get('X-Visitor-Ip') ?? 'unknown';
    const cid = request.headers.get('X-Collector-Id');
    const dev = request.headers.get('X-Collector-Dev');
    const tz = request.headers.get('X-Collector-Tz');
    if (!isRoomId(roomId) || !id) return new Response('bad room', { status: 400 });
    const perIp = Number(this.env.MAX_SOCKETS_PER_IP) || DEFAULT_MAX_SOCKETS_PER_IP;
    const run = runIdOf(request);
    if (this.ctx.getWebSockets(`ip:${ip}`).length >= perIp) {
      (run ? this.log.with({ run_id: run }) : this.log).warn('room.join', 'room_join_refused', 'A room socket was refused: too many from one address.', { room: roomId, session_id: hashForLog(id), reason: 'address', limit: perIp });
      return new Response('too many connections from this address', { status: 429 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [`id:${id}`, `ip:${ip}`, `room:${roomId}`, ...(isCollectorId(cid) ? [`cid:${cid}`] : [])]);
    const att: Attachment = { room: roomId, id, sid: randomSid(), ip, joinedAt: Date.now(), state: null };
    if (run) att.run = run;
    if (isCollectorId(cid)) att.cid = cid;
    if (isDeviceId(dev)) att.dev = dev;
    if (isTimeZone(tz)) att.tz = tz;
    // Which copy of the room this is, and the entry for the welcome (OP-075): the Worker's word only.
    const copy = Number(request.headers.get('X-Room-Copy'));
    if (Number.isInteger(copy) && copy > 1) att.copy = copy;
    const entry = request.headers.get('X-Entry');
    if (entry && entry.length <= 512) att.entry = entry;
    const device = deviceClass(request.headers.get('User-Agent'), request.headers.get('Sec-CH-UA-Mobile'));
    if (device) att.device = device;
    server.serializeAttachment(att);
    await this.freshNotice();
    await this.ensureAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * A frame from a socket. How long each takes to handle is sampled per room (tick_latency_p95), and an
   * error nothing handled is logged before it goes on as before (OP-134).
   */
  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const at = ws.deserializeAttachment() as Attachment | null;
    const t0 = Date.now();
    try {
      await this.frame(ws, message, at);
    } catch (e) {
      (at ? this.logOf(at) : this.log).error('room.tick', 'unhandled_error', 'A frame failed with an error nothing handled.', { error: e });
      throw e;
    } finally {
      if (at) this.sampleTick(at.room, Date.now() - t0);
    }
  }

  /** The room server is closing this socket for what it sent: its owl's leave is a kick (OP-134). */
  private kick(ws: WebSocket, code: number, reason: string): void {
    kickedFor(ws, reason);
    closeSocket(ws, code, reason);
  }

  private async frame(ws: WebSocket, message: string | ArrayBuffer, first: Attachment | null): Promise<void> {
    let att = first;
    // A nest's hello waits on the collections object: frames that arrive meanwhile wait behind it, in order.
    const waiting = att ? this.admitting.get(att.sid) : undefined;
    if (waiting) {
      await waiting.done;
      if (ws.readyState !== WebSocket.READY_STATE_OPEN) return; // turned away
      att = ws.deserializeAttachment() as Attachment | null; // the hello put its owl in the room
    }
    if (!att) return closeSocket(ws, CLOSE.BAD_PROTOCOL, 'no session');
    if (typeof message !== 'string') return this.kick(ws, CLOSE.BAD_PROTOCOL, 'text frames only');
    if (message === HEARTBEAT_FRAME) return; // normally answered by the auto-response without reaching here
    const frame = parseClientFrame(message);
    if (!frame) {
      if (message.length > 1024) return this.kick(ws, CLOSE.TOO_LARGE, 'frame too large');
      return this.kick(ws, CLOSE.BAD_PROTOCOL, 'malformed frame');
    }

    if (!att.state) {
      if (frame.t !== 'hello') return this.kick(ws, CLOSE.BAD_PROTOCOL, 'hello first');
      if (this.env.GATE === 'ticket' && att.ip !== 'admitted') {
        // v2 hook: the Worker marks admitted passes; guests are refused when the gate is closed.
      }
      if (!isNestRoom(att.room)) {
        // A gated realm the keepers have not opened: the page walks the owl back to the hub. A keeper's
        // token (OP-156) lets its owl in, to walk the tree (map 2) while it is dark.
        if (this.realmClosed(att.room) && !(await verifyKeeper(signingSecret(this.env), frame.keeper))) {
          this.logOf(att).info('room.join', 'room_join_refused', 'An owl was turned away from a realm the keepers have not opened.', { reason: 'realm' });
          this.send(ws, { t: 'closed', room: att.room, why: 'realm', sign: this.realmSign(att.room) });
          return closeSocket(ws, CLOSE.REALM_CLOSED, 'realm closed');
        }
        if (!(frame.via === 'travel' && insidePark(att.room) && att.cid)) {
          await this.join(ws, att, frame);
          return;
        }
      }
      // A nest asks the collections object whose it is and how it stands before letting anyone in; a
      // travel into the park (OP-130) whether the owl has walked through the front gate.
      const room = att.room;
      const sid = att.sid;
      const me = att;
      const done = (isNestRoom(att.room) ? this.helloNest(ws, att, frame) : this.helloTravel(ws, att, frame))
        .catch((e: unknown) => {
          this.logOf(me).error('room.join', 'room_join_refused', 'An owl’s hello failed: the page is asked to try again.', { reason: 'offline', error: e });
          closeSocket(ws, 1011, 'try again');
        })
        .finally(() => {
          this.admitting.delete(sid);
          this.forget(room);
        });
      this.admitting.set(sid, { room, done });
      return done;
    }

    const room = this.room(att.room);
    switch (frame.t) {
      case 'hello':
        return this.kick(ws, CLOSE.BAD_PROTOCOL, 'duplicate hello');
      case 'move':
        return room.move(att.id, frame);
      case 'rest':
        if (room.rest(att.id, frame.asleep) && frame.asleep) this.logOf(att).info('room.rest', 'afk_sleep', 'An owl fell asleep, its visitor idle.');
        return;
      case 'air':
        // Flight (OP-084): a state of the owl, counted against its own allowance, never logged.
        return void room.air(att.id, frame.air);
      case 'look': {
        const { look, recheck } = this.vetLook(att, frame.look);
        room.look(att.id, look);
        this.statsSeen(att, look);
        this.accountLook(att, look);
        if (recheck) void this.recheckLook(att, frame.look);
        else this.rememberEquipped(att, look.wear);
        return;
      }
      case 'bye':
        if (room.sessionOf(att.id) === att.sid) this.logLeave(att, room, { reason: 'user' });
        this.flushThrottled(att);
        room.leave(att.id, att.sid);
        this.keepLeavers(att.room);
        this.acts.get(att.room)?.forget(att.id);
        ws.serializeAttachment({ ...att, state: null } satisfies Attachment);
        ws.close(1000, 'bye');
        this.forget(att.room);
        this.emitCounts();
        return;
      case 'emote':
        if (!room.admit(att.id)) return;
        return this.emote(ws, att, room, frame.e);
      case 'say':
        // Every phrase is everyone's: no collection is needed to say one.
        if (!room.admit(att.id)) return;
        room.say(att.id, frame.n);
        return;
      case 'quests':
      case 'talk':
      case 'accept':
      case 'abandon':
      case 'handin':
      case 'use':
      case 'gather':
        if (!room.admit(att.id)) return;
        return this.serial(att, () => this.quest(ws, att, room, frame));
      case 'act':
        if (!room.admit(att.id)) return;
        return this.serial(att, () => this.act(ws, att, room, frame));
      case 'street':
        if (!room.admit(att.id)) return;
        return this.serial(att, () => this.streetDoors(ws, att, room, frame.r));
      case 'nest':
        if (!room.admit(att.id)) return;
        return this.serial(att, () => this.arrange(ws, att, room, frame));
    }
  }

  /** Put a visitor whose hello arrived in its room and tell everyone. False when the room is full (the socket closes 4010). */
  private async join(ws: WebSocket, att: Attachment, hello: ClientHello, opts: { overCap?: boolean } = {}): Promise<boolean> {
    const room = this.room(att.room);
    // Wear the collector does not own (or is not yet known to own) is left off until checked.
    const { look, recheck } = this.vetLook(att, hello.look);
    const welcome = { ...(att.copy ? { copy: att.copy } : {}), ...(att.entry ? { entry: att.entry } : {}), notice: this.notice, realms: this.realms };
    // Back on a new socket (OP-134): before the room saw its old one go, or soon after its connection dropped.
    const replaced = room.has(att.id);
    const back = room.leaverOf(att.id);
    const result = room.join(peerOf(ws), att.id, { ...hello, look }, att.sid, { ...opts, welcome });
    const log = this.logOf(att);
    if (result === 'full') {
      log.info('room.join', 'room_join_refused', 'An owl was turned away from a full room.', { reason: 'cap', cap: room.cap });
      this.send(ws, { t: 'full', room: att.room, cap: room.cap });
      closeSocket(ws, CLOSE.ROOM_FULL, 'room full');
      return false;
    }
    log.info('room.join', 'room_join_ok', 'An owl joined a room.', { owls: room.count, ...(hello.via ? { via: hello.via } : {}), ...(att.copy ? { copy: att.copy } : {}), ...(att.owner ? { owner: true } : {}) });
    if (replaced) log.info('room.join', 'reconnect_ok', 'An owl came back on a new socket before the room saw its old one go.', { gap_ms: 0, replaced: true });
    else if (back?.dropped) log.info('room.join', 'reconnect_ok', 'An owl came back after its connection dropped.', { gap_ms: Date.now() - back.leftAt });
    // The entry went out with the welcome: the socket need not keep it.
    const kept = ws.deserializeAttachment() as Attachment | null;
    if (kept?.entry) {
      delete kept.entry;
      ws.serializeAttachment(kept);
    }
    this.emitCounts();
    this.statsSeen(att, look, true, hello.via === 'travel');
    this.travelNote(att, hello.spawn);
    this.accountLook(att, look);
    this.checkDevice(ws, att);
    if (recheck) void this.recheckLook(att, hello.look);
    // The lantern beam as it burns now; and the hub wakes when its next quiz question closes.
    if (att.room === LANTERN_ROOM) this.send(ws, this.activities(att.room).lanternFrame());
    if (att.room === QUIZ_ROOM) await this.scheduleAlarm();
    // The arcade's score wall as it stands, with this owl's own bests.
    if (att.room === ARCADE_ROOM) this.serial(att, () => this.sendWall(ws, att));
    // Arriving in a room counts for quests that ask to visit it (none asks for a nest).
    if (!isNestRoom(att.room)) this.serial(att, () => this.pushEvent(ws, att, { kind: 'visit', room: att.room }));
    return true;
  }

  // ---------- travel from the map (OP-130) ----------

  /**
   * A travel into the park: let in only once the owl has walked through the front gate since it was
   * last outside (the collections object keeps that); turned away with the reason otherwise, and the
   * page offers the gate. Should the collections object not answer, the owl is let in: the gate is
   * the park's welcome, not its lock.
   */
  private async helloTravel(ws: WebSocket, att: Attachment, hello: ClientHello): Promise<void> {
    const through = await this.collections()
      .travelThroughGate(att.cid!)
      .catch((e: unknown) => {
        this.logOf(att).warn('collections.travel', 'read_failed', 'The collections object did not say whether the owl walked through the gate: it is let in.', { error: e });
        return true;
      });
    if (ws.readyState !== WebSocket.READY_STATE_OPEN) return;
    if (!through) {
      this.logOf(att).info('room.join', 'room_join_refused', 'A travel into the park was turned away: the owl has not walked through the front gate.', { reason: 'gate' });
      this.send(ws, { t: 'closed', room: att.room, why: 'gate' });
      return closeSocket(ws, CLOSE.NOT_THROUGH_GATE, 'not through the gate');
    }
    await this.join(ws, att, hello);
  }

  /** An owl joined a room: the collections object keeps the places it walks into and whether it is through the gate. */
  private travelNote(att: Attachment, spawn: string | undefined): void {
    const cid = att.cid;
    if (!cid) return;
    this.ctx.waitUntil(
      this.collections()
        .travelEntered(cid, att.room, spawn ?? null)
        .then((gate) => {
          if (gate === 'crossed') this.logOf(att).info('collections.travel', 'gate_crossed', 'An owl walked through the front gate into the park.');
          else if (gate === 'cleared') this.logOf(att).info('collections.travel', 'gate_flag_cleared', 'An owl is outside the park again: into it is through the front gate next time.');
        })
        .catch((e: unknown) => this.logOf(att).error('collections.travel', 'write_failed', 'Where the owl walked was not kept: the map and the gate rule miss this room.', { error: e })),
    );
  }

  // ---------- the nests ----------

  /**
   * A nest's hello. The collections object says whose nest it is and how it stands, though a view
   * this object holds is newer (the owner's changes land here first). A closed nest lets only its
   * owner in, and its owner always gets in, however full it is. The newcomer gets the nest right
   * after its welcome; its owner also the furniture it owns and today's furniture gift.
   */
  private async helloNest(ws: WebSocket, att: Attachment, hello: ClientHello): Promise<void> {
    const nestId = nestIdOf(att.room);
    if (!nestId) return;
    let visit: NestVisit | null;
    try {
      visit = await this.collections().nestById(nestId, att.cid);
    } catch (e) {
      this.logOf(att).error('room.join', 'room_join_refused', 'The collections object did not say how the nest stands: the page is asked to try again.', { reason: 'offline', error: e });
      return closeSocket(ws, 1011, 'try again');
    }
    if (ws.readyState !== WebSocket.READY_STATE_OPEN) return;
    const view = visit ? (this.nestViews.get(nestId) ?? visit.nest) : null;
    const mine = visit?.mine === true;
    if (!view || (!view.open && !mine)) {
      const why = view ? 'closed' : 'gone';
      this.logOf(att).info('room.join', 'room_join_refused', 'An owl was turned away from a nest that is closed or gone.', { reason: 'nest', detail: why });
      this.send(ws, { t: 'closed', room: att.room, why });
      return closeSocket(ws, CLOSE.NEST_CLOSED, why);
    }
    const me: Attachment = { ...att, owner: mine };
    ws.serializeAttachment(me);
    if (!(await this.join(ws, me, hello, { overCap: mine }))) return;
    this.nestViews.set(nestId, view);
    const frame: ServerNest = { t: 'nest', nest: view, mine };
    if (mine && visit?.owned && visit.gift) {
      frame.owned = visit.owned;
      frame.gift = visit.gift;
    }
    this.send(ws, frame);
  }

  /**
   * The owner changes its nest: a piece in a spot, or open or closed to visitors. The answer goes to
   * the owner and the nest as it now stands to everyone else inside; closing it sends every visitor
   * out to the street.
   */
  private async arrange(ws: WebSocket, att: Attachment, room: Room, frame: ClientNest): Promise<void> {
    const r = frame.r;
    const no = (reason: NestEditRefusal) => this.send(ws, { t: 'nest', r, ok: false, reason });
    const nestId = nestIdOf(att.room);
    if (!nestId || !att.cid || !att.owner || room.sessionOf(att.id) !== att.sid) return no('not-owner');
    if (!room.takeArrange(att.id)) return no('busy');
    const stub = this.collections();
    let res: NestEditResult;
    try {
      res = 'open' in frame ? await stub.setNestOpen(att.cid, frame.open) : await stub.setNestSpot(att.cid, frame.spot, frame.item);
    } catch (e) {
      this.logOf(att).error('room.nest', 'write_failed', 'An owner’s change to its nest did not reach the collections object: the page is told to try again.', { error: e });
      return no('offline');
    }
    if (!res.ok) return no(res.reason);
    // The owner's own nest is this room's; any other would be a mix-up, shown to nobody.
    if (res.nest.nestId !== nestId) return no('not-owner');
    const nest = res.nest;
    if (room.count) this.nestViews.set(nestId, nest);
    this.send(ws, { t: 'nest', r, ok: true, nest });
    if (!nest.open) this.sendVisitorsAway(att.room);
    room.broadcast({ t: 'nest', nest }, att.id);
  }

  /** A nest just closed: every visitor in it is told so and sent out; only its owner stays. */
  private sendVisitorsAway(roomId: string): void {
    for (const ws of this.ctx.getWebSockets(`room:${roomId}`)) {
      const att = ws.deserializeAttachment() as Attachment | null;
      // An owl still at the door is turned away by its own hello, which finds the nest closed.
      if (!att?.state || att.owner) continue;
      this.send(ws, { t: 'closed', room: roomId, why: 'closed' });
      closeSocket(ws, CLOSE.NEST_CLOSED, 'closed');
      this.drop(ws, { reason: 'kick', detail: 'nest-closed' });
    }
  }

  /** The street's nest doors for this visitor: its own nest behind door 0, and up to five other owls' open nests. */
  private async streetDoors(ws: WebSocket, att: Attachment, room: Room, r: number): Promise<void> {
    const refuse = (reason: 'unknown' | 'busy' | 'offline') => this.send(ws, { t: 'refused', r, reason });
    if (att.room !== STREET_ROOM || !att.cid) return refuse('unknown');
    if (room.sessionOf(att.id) !== att.sid) return;
    if (!room.takeUse(att.id)) return refuse('busy');
    const look = room.lookOf(att.id);
    const stub = this.collections();
    try {
      // The owner's colours go on its own door's flag, as it comes by.
      const [own, others] = await Promise.all([stub.myNest(att.cid, look ? nestLook(look) : null, visitOf(att)), stub.streetNests(att.cid, STREET_DOORS - 1)]);
      const doors = Array.from({ length: STREET_DOORS - 1 }, (_, i) => others[i] ?? null);
      this.send(ws, { t: 'street', r, own: { nestId: own.nest.nestId, open: own.nest.open }, doors });
    } catch (e) {
      this.logOf(att).error('room.nest', 'read_failed', 'The collections object did not say the street’s doors: the page is told to try again.', { error: e });
      refuse('offline');
    }
  }

  /**
   * Keep where owls left a room past the room (an empty nest is let go below) and past this object's
   * sleep, in storage: the room's memory window only (OP-138).
   */
  private keepLeavers(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) this.leftBehind.set(roomId, room.leaversNow());
    const now = Date.now();
    const fresh: Array<[string, string, Leaver]> = [];
    for (const [id, kept] of this.leftBehind) for (const [owl, l] of Object.entries(kept)) if (now - l.leftAt <= LIMITS.leaverMemoryMs) fresh.push([id, owl, l]);
    fresh.sort((a, b) => b[2].leftAt - a[2].leftAt);
    const all: Record<string, Record<string, Leaver>> = {};
    for (const [id, owl, l] of fresh.slice(0, LEAVERS_KEPT)) (all[id] ??= {})[owl] = l;
    this.leftBehind.clear();
    for (const [id, kept] of Object.entries(all)) this.leftBehind.set(id, kept);
    void this.ctx.storage.put(LEAVERS_KEY, all);
  }

  /** A nest nobody is in or at the door of is let go: its room, and the view kept while owls were there. */
  private forget(roomId: string): void {
    const nestId = nestIdOf(roomId);
    if (!nestId || this.rooms.get(roomId)?.count) return;
    for (const a of this.admitting.values()) if (a.room === roomId) return;
    this.rooms.delete(roomId);
    this.acts.delete(roomId);
    this.nestViews.delete(nestId);
  }

  // ---------- quests, NPC owls and interactables ----------

  /** Run quest work for one visitor after the previous one finished (no interleaving per visitor). */
  private serial(att: Attachment, fn: () => Promise<void>): void {
    const prev = this.queues.get(att.id) ?? Promise.resolve();
    // Each piece of work answers its own failures; one that throws anyway is logged, and the next still runs.
    const next = prev.then(fn, fn).catch((e: unknown) => this.logOf(att).error('room.play', 'unhandled_error', 'A visitor’s quest or game work failed with an error nothing handled.', { error: e }));
    this.queues.set(att.id, next);
    void next.finally(() => {
      if (this.queues.get(att.id) === next) this.queues.delete(att.id);
    });
  }

  private sendBoard(ws: WebSocket, board: QuestBoard, updates: QuestUpdate[], extra: { r?: number; ok?: boolean; reason?: string } = {}): void {
    this.send(ws, { t: 'quests', ...extra, board, updates });
  }

  /** Count an event toward the visitor's quests and push the board when something moved. */
  private async pushEvent(ws: WebSocket, att: Attachment, ev: Parameters<Collections['questEvent']>[1]): Promise<void> {
    if (!att.cid) return;
    try {
      const res = await this.collections().questEvent(att.cid, ev, att.room);
      if (res.updates.length && res.board) this.sendBoard(ws, res.board, res.updates);
    } catch (e) {
      // Quests are best effort for pushes: the next request returns the true board.
      this.logOf(att).warn('room.play', 'write_failed', 'A quest event was not counted: the collections object did not answer.', { kind: ev.kind, error: e });
    }
  }

  private async quest(ws: WebSocket, att: Attachment, room: Room, frame: Extract<ClientFrame, { r: number }>): Promise<void> {
    const r = frame.r;
    const refuse = (reason: 'far' | 'unknown' | 'busy' | 'offline') => this.send(ws, { t: 'refused', r, reason });
    if (!att.cid) return refuse('unknown');
    if (room.sessionOf(att.id) !== att.sid) return;
    const cid = att.cid;
    const stub = this.collections();
    try {
      switch (frame.t) {
        case 'quests':
          return this.sendBoard(ws, await stub.board(cid), [], { r });
        case 'talk': {
          const npc = getNpc(frame.npc);
          if (!npc || npc.room !== att.room) return refuse('unknown');
          if (!room.near(att.id, npc.pos, NPC_TALK_RADIUS)) return refuse('far');
          const res = await stub.questEvent(cid, { kind: 'talk', npc: npc.id }, att.room);
          return this.sendBoard(ws, res.board ?? (await stub.board(cid)), res.updates, { r });
        }
        case 'accept':
        case 'handin': {
          const q = getQuest(frame.quest);
          const giver = q ? getNpc(q.giver) : undefined;
          if (!q || !giver || giver.room !== att.room) return refuse('unknown');
          if (!room.near(att.id, giver.pos, NPC_TALK_RADIUS)) return refuse('far');
          if (frame.t === 'accept') {
            const res = await stub.accept(cid, q.id, att.room);
            return this.sendBoard(ws, res.board, [], { r, ok: res.ok, ...(res.ok ? {} : { reason: res.reason }) });
          }
          const res = await stub.handIn(cid, q.id, giver.id, visitOf(att));
          if (res.ok && res.award && !res.award.dup) this.owned.get(cid)?.set.add(res.award.variant);
          return this.send(ws, { t: 'handin', r, ...res });
        }
        case 'abandon': {
          const res = await stub.abandon(cid, frame.quest);
          return this.sendBoard(ws, res.board, [], { r, ok: res.ok });
        }
        case 'use': {
          const it = getInteractable(frame.target);
          if (!it || it.room !== att.room) return refuse('unknown');
          const rules = KIND_RULES[it.kind];
          if (!room.reaches(att.id, it.pos, rules.reach, it)) return refuse('far');
          if (!room.takeUse(att.id)) return refuse('busy');
          const ev = { kind: 'interact' as const, what: it.kind, id: it.id, room: att.room };
          // Leaf piles and stalls count toward today's tasks too.
          const task = it.kind === 'leaf-pile' ? 'flop' : it.kind === 'stall' ? 'browse' : null;
          if (rules.shared) {
            if (!room.useObject(att.id, it.id, Date.now() + leafRespawnMs(Math.random))) return this.send(ws, { t: 'useResult', r, ok: false, reason: 'gone', feathers: 0, total: -1, updates: [] });
            this.saveObjects();
            const res = await stub.flop(cid, ev, att.room);
            this.send(ws, { t: 'useResult', r, ok: true, feathers: res.feathers, total: res.total, updates: res.updates });
            if (res.board) this.sendBoard(ws, res.board, res.updates);
          } else {
            const res = await stub.questEvent(cid, ev, att.room);
            this.send(ws, { t: 'useResult', r, ok: true, feathers: 0, total: res.board?.feathers ?? -1, updates: res.updates });
            if (res.board) this.sendBoard(ws, res.board, res.updates);
          }
          if (task) this.pushTasks(ws, await stub.play(cid, 0, { kind: task }));
          return;
        }
        case 'gather': {
          const pos = room.positionOf(att.id);
          if (!pos) return refuse('unknown');
          const res = await stub.gather(cid, frame.quest, frame.n, att.room, pos, room.groundOf(att.id));
          if (res.ok) return this.sendBoard(ws, res.board, res.updates, { r, ok: true });
          return this.sendBoard(ws, await stub.board(cid), [], { r, ok: false, reason: res.reason });
        }
      }
    } catch (e) {
      this.logOf(att).error('room.play', 'write_failed', 'A quest step did not reach the collections object: the page is told to try again.', { frame: frame.t, error: e });
      return refuse('offline');
    }
  }

  // ---------- activities: lanterns, fishing, the copy game, the stage quiz ----------

  private async act(ws: WebSocket, att: Attachment, room: Room, frame: ClientAct): Promise<void> {
    const { r, a } = frame;
    const no = (reason: 'far' | 'busy' | 'lit' | 'glowing' | 'idle' | 'emote' | 'offline' | 'unknown' | 'closed' | 'too-fast' | 'forgotten') => this.send(ws, { t: 'act', r, a, ok: false, reason });
    if (!att.cid) return no('unknown');
    if (room.sessionOf(att.id) !== att.sid) return;
    const cid = att.cid;
    const stub = this.collections();
    try {
      if (a === 'tasks') return this.send(ws, { t: 'act', r, a, ok: true, tasks: await stub.tasks(cid) });
      // The nests have no activities: today's tasks are all that is asked for there.
      if (isNestRoom(att.room)) return no('unknown');
      // The climb's run lives in the collections object, keyed by the collector: no state on the socket.
      if (a === 'climb') {
        const portal = roomDef(att.room)?.doors.find((d) => d.id === 'portal');
        const pos = room.positionOf(att.id);
        const atPortal = !!portal && !!pos && pointInRect(pos, portal.rect);
        const res = await stub.climbStart(cid, { atPortal, portalLive: this.realms.portal, special: this.realms.night });
        if (!res.ok) return no(res.reason);
        const { ok: _ok, ...started } = res;
        return this.send(ws, { t: 'act', r, a, ok: true, ...started });
      }
      if (a === 'ascent') {
        const res = await stub.climbBand(cid, frame.k!, frame.band!, visitOf(att));
        if (!res.ok) {
          this.logOf(att).info('collections.climb', 'climb_band_refused', 'A band of the climb was refused.', { climb_ref: climbRef(cid, frame.k!), band: frame.band, reason: res.reason });
          return no(res.reason);
        }
        const { ok: _ok, ...settled } = res;
        return this.send(ws, { t: 'act', r, a, ok: true, ...settled });
      }
      const acts = this.activities(att.room);
      switch (a) {
        case 'light': {
          const res = acts.light(att.id);
          if (!res.ok) return no(res.reason);
          this.send(ws, { t: 'act', r, a, ok: true, id: res.id });
          room.broadcast(acts.lanternFrame({ id: res.id, by: att.id }));
          this.saveLanterns(acts);
          this.pushTasks(ws, await stub.play(cid, 0, { kind: 'light' }));
          if (res.full) await this.payBeam(res.full);
          return;
        }
        case 'cast': {
          const res = acts.cast(att.id);
          return res.ok ? this.send(ws, { t: 'act', r, a, ok: true, biteAt: res.biteAt }) : no(res.reason);
        }
        case 'reel': {
          const res = acts.reel(att.id);
          if (!res.ok) return no(res.reason);
          if (res.outcome !== 'caught') return this.send(ws, { t: 'act', r, a, ok: true, outcome: res.outcome });
          const played = await stub.play(cid, res.fish.feathers, { kind: 'fish' });
          this.send(ws, { t: 'act', r, a, ok: true, outcome: 'caught', fish: res.fish.id, feathers: played.added, total: played.total });
          return this.pushTasks(ws, played);
        }
        case 'copy': {
          // The robot plays tunes of the emotes this owl owns (the starter pair at least).
          const owned = await this.loadOwned(cid, att.tz, false, visitOf(att));
          const emotes = owned ? [...owned.set].filter((v) => isEmoteId(v)) : [...COPY_BASE_EMOTES];
          const res = acts.startCopy(att.id, emotes);
          if (!res.ok) return no(res.reason);
          const g = res.game;
          return this.send(ws, { t: 'act', r, a, ok: true, notes: g.notes, tune: g.tune, listenUntil: g.listenUntil, deadline: g.deadline, level: g.level });
        }
        case 'note': {
          const e = frame.e ?? '';
          const step = acts.note(att.id, e);
          if (step.kind === 'idle' || step.kind === 'busy') return no(step.kind);
          // A right note is danced for everyone in the room (the owl owns it: the robot only plays owned emotes).
          if (step.kind === 'note' || step.kind === 'tune' || step.kind === 'won') room.broadcast({ t: 'emote', id: att.id, e }, att.id);
          switch (step.kind) {
            case 'early':
            case 'note':
              return this.send(ws, { t: 'act', r, a, ok: true, step: step.kind, deadline: step.game.deadline });
            case 'wrong':
            case 'slow':
              return this.send(ws, { t: 'act', r, a, ok: true, step: step.kind, level: step.level, expected: step.expected });
            case 'tune': {
              const played = await stub.play(cid, step.feathers, { kind: 'copy' });
              const g = step.game;
              this.send(ws, { t: 'act', r, a, ok: true, step: 'tune', tune: g.tune, listenUntil: g.listenUntil, deadline: g.deadline, level: g.level, feathers: played.added, total: played.total });
              return this.pushTasks(ws, played);
            }
            case 'won': {
              const played = await stub.play(cid, step.feathers, { kind: 'copy' });
              this.send(ws, { t: 'act', r, a, ok: true, step: 'won', level: step.level, feathers: played.added, total: played.total });
              return this.pushTasks(ws, played);
            }
          }
        }
        // The run lives in the collections object, keyed by the collector (OP-137): a page back from a
        // dropped connection still has it, and the best it reaches is kept as it goes.
        case 'run': {
          const res = startRun(att.room, room.positionOf(att.id), frame.g!, crypto.getRandomValues(new Uint32Array(1))[0]!, Date.now());
          if (!res.ok) return no(res.reason);
          const { startedAt } = await stub.arcadeStart(cid, res.run.game, res.run.seed);
          return this.send(ws, { t: 'act', r, a, ok: true, game: res.run.game, seed: res.run.seed, startedAt });
        }
        case 'record': {
          const result: RunResult = frame.n === undefined ? { game: frame.g!, score: frame.s! } : { game: frame.g!, score: frame.s!, shots: frame.n };
          const kept = await stub.arcadeRecord(cid, result, frame.k!, portraitLook(room.lookOf(att.id) ?? DEFAULT_LOOK));
          if (!kept.ok) return no(kept.reason);
          this.send(ws, { t: 'act', r, a, ok: true, wall: kept.wall, mine: kept.mine });
          if (kept.changed) room.broadcast({ t: 'wall', walls: [kept.wall] }, att.id);
          return;
        }
        case 'score': {
          const result: RunResult = frame.n === undefined ? { game: frame.g!, score: frame.s! } : { game: frame.g!, score: frame.s!, shots: frame.n };
          // One result per run, whether or not it holds up.
          const settled = await stub.arcadeRun(cid, result, frame.k!, portraitLook(room.lookOf(att.id) ?? DEFAULT_LOOK));
          if (!settled.ok) return no(settled.reason);
          this.send(ws, { t: 'act', r, a, ok: true, paid: settled.paid });
          // Everyone else in the arcade sees the wall change; the player has it in the answer.
          if (settled.changed) room.broadcast({ t: 'wall', walls: [settled.paid.wall] }, att.id);
          if (settled.tasks) this.send(ws, { t: 'tasks', ...settled.tasks });
          return;
        }
      }
    } catch (e) {
      this.logOf(att).error('room.play', 'write_failed', 'An activity or game step did not reach the collections object: the page is told to try again.', { error: e });
      return no('offline');
    }
  }

  /** The arcade's score wall for a newcomer, with its own bests (the wall fills in with the next run if the collections are away). */
  private async sendWall(ws: WebSocket, att: Attachment): Promise<void> {
    try {
      const { walls, mine } = await this.collections().arcadeWalls(att.cid ?? null);
      this.send(ws, { t: 'wall', walls, mine });
    } catch (e) {
      // The wall fills in with the next run.
      this.logOf(att).warn('room.play', 'read_failed', 'The collections object did not say the arcade’s score wall: it fills in with the next run.', { error: e });
    }
  }

  /** Tell a visitor their tasks moved (and what finishing them paid). */
  private pushTasks(ws: WebSocket, played: PlayResult): void {
    if (played.tasks) this.send(ws, { t: 'tasks', ...played.tasks });
  }

  /** The visitors' sockets in this object, by visitor id. */
  private socketOf(id: string): WebSocket | null {
    for (const ws of this.ctx.getWebSockets(`id:${id}`)) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att?.state) return ws;
    }
    return null;
  }

  /** A full lantern beam: every owl that helped light it, and is still here, is paid. */
  private async payBeam(helpers: string[]): Promise<void> {
    const each = lanternFeathers(helpers.length);
    for (const id of helpers) {
      const ws = this.socketOf(id);
      const att = ws?.deserializeAttachment() as Attachment | null | undefined;
      if (!ws || !att?.cid) continue;
      try {
        const played = await this.collections().play(att.cid, each, { kind: 'beam' });
        this.send(ws, { t: 'paid', what: 'beam', feathers: played.added, total: played.total });
        this.pushTasks(ws, played);
      } catch (e) {
        // The beam still glows; pay is best effort.
        this.logOf(att).error('room.play', 'write_failed', 'An owl that helped light the lantern beam was not paid: the collections object did not answer.', { feathers: each, error: e });
      }
    }
  }

  /** A stage quiz question that just closed: the answer for everyone in the hub, and pay for the owls in its zone. */
  private async settleQuiz(): Promise<void> {
    const hub = this.rooms.get(QUIZ_ROOM);
    if (!hub?.count) return;
    const acts = this.activities(QUIZ_ROOM);
    const due = acts.quizDue();
    if (!due) return;
    const { right, winners } = acts.settleQuiz(due);
    await this.ctx.storage.put(QUIZ_KEY, due.n);
    hub.broadcast({ t: 'quiz', n: due.n, right, winners });
    for (const id of winners) {
      const ws = this.socketOf(id);
      const att = ws?.deserializeAttachment() as Attachment | null | undefined;
      if (!ws || !att?.cid) continue;
      try {
        const played = await this.collections().play(att.cid, QUIZ_FEATHERS, { kind: 'quiz' });
        this.send(ws, { t: 'paid', what: 'quiz', feathers: played.added, total: played.total });
        this.pushTasks(ws, played);
      } catch (e) {
        this.logOf(att).error('room.play', 'write_failed', 'An owl that answered the stage quiz right was not paid: the collections object did not answer.', { feathers: QUIZ_FEATHERS, error: e });
      }
    }
  }

  private saveLanterns(acts: Activities): void {
    this.ctx.waitUntil(this.ctx.storage.put(LANTERNS_KEY, acts.lanternState()));
  }

  /** When the object should wake next: the housekeeping minute, or sooner when a hub quiz question closes. */
  private nextWake(now: number): number {
    let next = now + ALARM_EVERY_MS;
    if (this.rooms.get(QUIZ_ROOM)?.count) next = Math.min(next, this.activities(QUIZ_ROOM).nextQuizClose());
    return next;
  }

  /** Wake no later than the next quiz question's close while owls are in the hub. */
  private async scheduleAlarm(): Promise<void> {
    const next = this.nextWake(Date.now());
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > next) await this.ctx.storage.setAlarm(next);
  }

  /** Keep the used-up shared objects in storage as well as in memory (see the constructor). */
  private saveObjects(): void {
    const all: Record<string, Record<string, number>> = {};
    for (const [id, r] of this.rooms) {
      const until = r.objectStates();
      if (Object.keys(until).length) all[id] = until;
    }
    this.ctx.waitUntil(this.ctx.storage.put(OBJECTS_KEY, all));
  }

  // ---------- collectibles ----------

  private collections(): DurableObjectStub<Collections> {
    return this.env.COLLECTIONS.getByName('park');
  }

  /**
   * An owl in a room, for the player stats (OP-111): its visit goes on, and its kind and colour as it
   * shows them. At its hello (`entered`) its time in the room begins (OP-113), in its own nest or not.
   */
  private statsSeen(att: Attachment, look: OwlLook, entered = false, travel = false): void {
    const s = sightingOf(att);
    if (!this.statsOn || !s) return;
    const sighting: Sighting = entered ? { ...s, entered: true, ...(att.owner ? { own: true } : {}), ...(travel ? { travel: true } : {}) } : s;
    this.ctx.waitUntil(
      this.collections()
        .seen(sighting, { body: look.body, ...(look.species ? { species: look.species } : {}) })
        .catch((e: unknown) => this.logOf(att).warn('collections', 'write_failed', 'The player stats missed a sighting of an owl.', { error: e })),
    );
  }

  /** These owls' visits are still going (the minute heartbeat, a socket's close), for the player stats. */
  private statsAlive(sightings: Sighting[]): Promise<void> {
    if (!this.statsOn || !sightings.length) return Promise.resolve();
    return this.collections()
      .alive(sightings)
      .catch((e: unknown) => this.log.warn('collections', 'write_failed', 'The player stats missed a heartbeat of the owls still here.', { owls: sightings.length, error: e }));
  }

  private send(ws: WebSocket, frame: ServerFrame): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch (e) {
      // A socket closed meanwhile is its close handler's to clean up; one that is open and still refuses is news.
      if (ws.readyState === WebSocket.READY_STATE_OPEN) this.log.warn('room.tick', 'send_failed', 'A frame could not be sent to an open socket.', { frame: frame.t, error: e });
    }
  }

  /** What a collector owns, read through a small cache (one read in flight per collector). `visit`: for anything the read grants (a present). */
  private async loadOwned(cid: string, tz: string | undefined, fresh = false, visit?: Visit): Promise<OwnedEntry | null> {
    const cached = this.owned.get(cid);
    if (cached && (!fresh || Date.now() - cached.at < OWNED_REFRESH_MS)) return cached;
    let load = this.ownedLoads.get(cid);
    if (!load) {
      load = this.collections()
        .owned(cid, tz, visit)
        .then((list) => {
          const entry: OwnedEntry = { set: new Set(list), at: Date.now() };
          this.owned.delete(cid);
          this.owned.set(cid, entry);
          if (this.owned.size > OWNED_CACHE_MAX) {
            const oldest = this.owned.keys().next().value;
            if (oldest !== undefined) this.owned.delete(oldest);
          }
          return entry;
        })
        .catch((e: unknown) => {
          this.log.warn('room.join', 'read_failed', 'The collections object did not say what an owl owns: its wear stays off until the next read.', { collector_hash: hashForLog(cid), error: e });
          return null;
        })
        .finally(() => this.ownedLoads.delete(cid));
      this.ownedLoads.set(cid, load);
    }
    return load;
  }

  /**
   * The look to show others now: wear limited to what the cache says the collector owns.
   * `recheck` asks for a fresh read when the look names something the cache does not know.
   */
  private vetLook(att: Attachment, look: OwlLook): { look: OwlLook; recheck: boolean } {
    if (!look.wear) return { look, recheck: false };
    if (!att.cid) return { look: withoutWear(look), recheck: false };
    const cached = this.owned.get(att.cid);
    const kept = cached ? filterOwnedWear(look.wear, cached.set) : undefined;
    const complete = !!cached && wearVariants(look.wear).every((v) => cached.set.has(v));
    return { look: withWear(look, kept), recheck: !complete };
  }

  /** Re-read the collection, then apply the requested look (owned wear only) if the visitor is still here. */
  private async recheckLook(att: Attachment, requested: OwlLook): Promise<void> {
    if (!att.cid) return;
    const entry = await this.loadOwned(att.cid, att.tz, true, visitOf(att));
    if (!entry) return;
    const room = this.rooms.get(att.room);
    if (!room || room.sessionOf(att.id) !== att.sid) return;
    const look = withWear(requested, filterOwnedWear(requested.wear, entry.set));
    const current = room.lookOf(att.id);
    if (current && JSON.stringify(current) !== JSON.stringify(look)) room.look(att.id, look, true);
    this.rememberEquipped(att, look.wear);
  }

  /** Keep the collector's equipped wear in its record (fire and forget; once per change). */
  private rememberEquipped(att: Attachment, wear: Wear | undefined): void {
    if (!att.cid) return;
    const text = JSON.stringify(wear ?? null);
    if (this.lastEquipped.get(att.cid) === text) return;
    this.lastEquipped.delete(att.cid);
    this.lastEquipped.set(att.cid, text);
    if (this.lastEquipped.size > OWNED_CACHE_MAX) {
      const oldest = this.lastEquipped.keys().next().value;
      if (oldest !== undefined) this.lastEquipped.delete(oldest);
    }
    this.ctx.waitUntil(
      this.collections()
        .setEquipped(att.cid, att.tz, wear ?? null)
        .then(() => undefined)
        .catch((e: unknown) => this.logOf(att).warn('room.join', 'write_failed', 'What the owl wears was not kept in its collection: the next change sends it again.', { error: e })),
    );
  }

  private async emote(ws: WebSocket, att: Attachment, room: Room, e: string): Promise<void> {
    if (!att.cid) return;
    let entry: OwnedEntry | null | undefined = this.owned.get(att.cid);
    if (!entry?.set.has(e)) entry = await this.loadOwned(att.cid, att.tz, true, visitOf(att));
    if (!entry?.set.has(e) || room.sessionOf(att.id) !== att.sid) return;
    if (!room.emote(att.id, e)) return this.emoteThrottled(att);
    // An emote counts for quests in this room, and "for" any NPC owl standing close enough.
    const pos = room.positionOf(att.id);
    const near = pos ? npcsIn(att.room).filter((n) => distance(n.pos, pos) <= NPC_EMOTE_RADIUS).map((n) => n.id) : [];
    this.serial(att, () => this.pushEvent(ws, att, { kind: 'emote', emote: e, room: att.room, near }));
  }

  override async webSocketClose(ws: WebSocket, code?: number): Promise<void> {
    // The visit was here until now: it ends here unless the owl comes back in (another room, a dropped line).
    const att = ws.deserializeAttachment() as Attachment | null;
    const s = att?.state ? sightingOf(att) : null;
    // Closed by the page (1000, or 1001 as it goes away), or a connection that dropped.
    this.drop(ws, code === 1000 || code === 1001 ? { reason: 'user' } : { reason: 'dropped', ...(code ? { detail: `code ${code}` } : {}) });
    if (s) this.ctx.waitUntil(this.statsAlive([s]));
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.drop(ws, { reason: 'dropped', detail: 'error' });
  }

  /** A socket is gone or sent away: its owl leaves its room (when this socket still holds it), logged once with why (OP-134). */
  private drop(ws: WebSocket, why: LeaveWhy): void {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return;
    if (att.state) {
      // Only the session that owns the visitor may remove it; a replaced socket's close is ignored.
      const room = this.rooms.get(att.room);
      const owns = room?.sessionOf(att.id) === att.sid;
      if (owns) {
        this.logLeave(att, room!, why);
        this.acts.get(att.room)?.forget(att.id);
      }
      // A connection lost (not a goodbye, not sent away): one back soon has reconnected.
      room?.leave(att.id, att.sid, !att.kicked && (why.reason === 'dropped' || why.reason === 'timeout'));
      if (owns) this.keepLeavers(att.room);
    }
    this.flushThrottled(att);
    this.forget(att.room);
    this.emitCounts();
  }

  /** Broadcast populations when they changed, at most once per COUNTS_EVERY_MS; the alarm flushes the rest. */
  private emitCounts(force = false): void {
    const counts = this.counts();
    const text = JSON.stringify(counts);
    if (text === this.lastCounts) {
      this.countsDirty = false;
      return;
    }
    const now = Date.now();
    if (!force && now - this.lastCountsAt < COUNTS_EVERY_MS) {
      this.countsDirty = true;
      return;
    }
    this.lastCounts = text;
    this.lastCountsAt = now;
    this.countsDirty = false;
    for (const room of this.rooms.values()) room.broadcast({ t: 'counts', rooms: counts });
  }

  private async ensureAlarm(): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + ALARM_EVERY_MS);
  }

  /** Every minute while anyone is connected: close silent sockets and refresh counts; and when a hub quiz question closes. */
  override async alarm(): Promise<void> {
    await this.settleQuiz();
    await this.freshNotice();
    const now = Date.now();
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      const lastBeat = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? att.joinedAt;
      const idleFor = now - Math.max(lastBeat, att.joinedAt);
      const limit = att.state ? IDLE_CLOSE_MS : HELLO_TIMEOUT_MS;
      if (idleFor > limit) {
        if (!att.state) this.logOf(att).info('room.join', 'room_join_refused', 'A socket said no hello in time and was closed.', { reason: 'no-hello' });
        closeSocket(ws, att.state ? 1001 : CLOSE.BAD_PROTOCOL, att.state ? 'idle' : 'no hello');
        this.drop(ws, { reason: 'timeout' });
      }
    }
    this.emitCounts(true);
    // The player stats' heartbeat: every owl still here, at once (OP-111).
    const here = this.ctx
      .getWebSockets()
      .map((ws) => ws.deserializeAttachment() as Attachment | null)
      .filter((att) => !!att?.state)
      .map(sightingOf)
      .filter((s): s is Sighting => s !== null);
    await this.statsAlive(here);
    if (this.ctx.getWebSockets().length > 0) await this.ctx.storage.setAlarm(this.nextWake(Date.now()));
  }
}
