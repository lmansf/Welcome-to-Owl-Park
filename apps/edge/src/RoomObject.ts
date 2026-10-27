/**
 * Durable Object adapter around `Room`. Holds the WebSockets with the Hibernation API so an
 * idle park costs nothing, answers heartbeats without waking, and rebuilds every room from
 * the socket attachments when the object wakes up or is moved. Besides the park's rooms it
 * holds the street of nests and every nest with owls in it, each nest a room of its own made
 * from NEST_ROOM; whose nest it is and how it stands come from the collections object. An arcade
 * run lives on its visitor's socket from start to score, so it outlasts the object's sleep.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  ARCADE_ROOM,
  Activities,
  CLOSE,
  COPY_BASE_EMOTES,
  DEFAULT_LOOK,
  HEARTBEAT_FRAME,
  JUMP_EMOTE,
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
  endRun,
  filterOwnedWear,
  getInteractable,
  getNpc,
  getQuest,
  isEmoteId,
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
  sameRealms,
  startRun,
  wearVariants,
  type ArcadeRun,
  type ClientAct,
  type ClientFrame,
  type ClientHello,
  type ClientNest,
  type LanternState,
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
import type { Collections } from './Collections';
import { deviceClass, logConfig, type DeviceClass, type Visit } from './collectLog';
import type { Sighting } from './parkStats';
import { Room, type Peer, type VisitorState } from './Room';
import { ROOMS, isRoomId, publicCounts, roomCap, roomDef } from './rooms';
import { isCollectorId } from './pass';
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
  /** In the arcade: the run this owl started and has not scored yet. */
  run?: ArcadeRun;
  /** Which copy of its room this object is (OP-075), when it is not the room itself. */
  copy?: number;
  /** The entry the Worker gave this socket, handed over in the welcome and then let go (OP-075). */
  entry?: string;
  /** Phone or desktop, from the browser's own words at the upgrade: for the collection log (OP-107), nothing else. */
  device?: DeviceClass;
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
    send: (text) => ws.send(text),
    close: (code, reason) => {
      try {
        ws.close(code, reason);
      } catch {
        /* already closed */
      }
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

/** Close a socket that may be closed already. */
function closeSocket(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    /* already closed */
  }
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
  /** The busy ribbon's words (OP-075), null while it is off, and when they were last asked for. */
  private notice: string | null = null;
  /** The realms switch as last heard from the overflow object (its notice, its poll, or this object's storage). */
  private realms: RealmsSettings = REALMS_DEFAULTS;
  /** The player stats are kept only while the analytics log is set up (OP-111): without it, no calls for them. */
  private readonly statsOn: boolean;
  private noticeAt = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.statsOn = logConfig(env) !== null;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT_FRAME, HEARTBEAT_FRAME));
    // Wake-up: rebuild rooms from the hibernated sockets' attachments. A socket whose
    // attachment no longer makes sense (room removed, corrupt data) is closed, not fatal.
    for (const ws of ctx.getWebSockets()) {
      try {
        const att = ws.deserializeAttachment() as Attachment | null;
        if (!att?.state) continue;
        this.room(att.room).restore(peerOf(ws), att.state, att.sid);
      } catch {
        try {
          ws.close(1011, 'room unavailable');
        } catch {
          /* ignore */
        }
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
      });
      this.rooms.set(id, r);
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
      }
    } catch {
      /* the ribbon stays as it was until the next ask */
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
    void this.ctx.storage.put(REALMS_KEY, next);
    for (const room of this.rooms.values()) room.broadcast({ t: 'realms', realms: next });
    for (const roomId of before.open) if (!next.open.includes(roomId) && roomDef(roomId)?.gated) this.sendRealmAway(roomId);
  }

  /** A realm just closed: every owl in it is told so and sent back to the hub by its own page. */
  private sendRealmAway(roomId: string): void {
    const sign = this.realmSign(roomId);
    for (const ws of this.ctx.getWebSockets(`room:${roomId}`)) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att?.state) continue;
      this.send(ws, { t: 'closed', room: roomId, why: 'realm', sign });
      closeSocket(ws, CLOSE.REALM_CLOSED, 'realm closed');
      this.drop(ws);
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
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const roomId = request.headers.get('X-Room') ?? '';
    const id = request.headers.get('X-Visitor-Id') ?? '';
    const ip = request.headers.get('X-Visitor-Ip') ?? 'unknown';
    const cid = request.headers.get('X-Collector-Id');
    const tz = request.headers.get('X-Collector-Tz');
    if (!isRoomId(roomId) || !id) return new Response('bad room', { status: 400 });
    const perIp = Number(this.env.MAX_SOCKETS_PER_IP) || DEFAULT_MAX_SOCKETS_PER_IP;
    if (this.ctx.getWebSockets(`ip:${ip}`).length >= perIp) return new Response('too many connections from this address', { status: 429 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [`id:${id}`, `ip:${ip}`, `room:${roomId}`]);
    const att: Attachment = { room: roomId, id, sid: randomSid(), ip, joinedAt: Date.now(), state: null };
    if (isCollectorId(cid)) att.cid = cid;
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

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let att = ws.deserializeAttachment() as Attachment | null;
    // A nest's hello waits on the collections object: frames that arrive meanwhile wait behind it, in order.
    const waiting = att ? this.admitting.get(att.sid) : undefined;
    if (waiting) {
      await waiting.done;
      if (ws.readyState !== WebSocket.READY_STATE_OPEN) return; // turned away
      att = ws.deserializeAttachment() as Attachment | null; // the hello put its owl in the room
    }
    if (!att) return ws.close(CLOSE.BAD_PROTOCOL, 'no session');
    if (typeof message !== 'string') return ws.close(CLOSE.BAD_PROTOCOL, 'text frames only');
    if (message === HEARTBEAT_FRAME) return; // normally answered by the auto-response without reaching here
    const frame = parseClientFrame(message);
    if (!frame) {
      if (message.length > 1024) return ws.close(CLOSE.TOO_LARGE, 'frame too large');
      return ws.close(CLOSE.BAD_PROTOCOL, 'malformed frame');
    }

    if (!att.state) {
      if (frame.t !== 'hello') return ws.close(CLOSE.BAD_PROTOCOL, 'hello first');
      if (this.env.GATE === 'ticket' && att.ip !== 'admitted') {
        // v2 hook: the Worker marks admitted passes; guests are refused when the gate is closed.
      }
      if (!isNestRoom(att.room)) {
        if (this.realmClosed(att.room)) {
          // A gated realm the keepers have not opened: the page walks the owl back to the hub.
          this.send(ws, { t: 'closed', room: att.room, why: 'realm', sign: this.realmSign(att.room) });
          return closeSocket(ws, CLOSE.REALM_CLOSED, 'realm closed');
        }
        await this.join(ws, att, frame);
        return;
      }
      // A nest asks the collections object whose it is and how it stands before letting anyone in.
      const room = att.room;
      const sid = att.sid;
      const done = this.helloNest(ws, att, frame)
        .catch(() => closeSocket(ws, 1011, 'try again'))
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
        return ws.close(CLOSE.BAD_PROTOCOL, 'duplicate hello');
      case 'move':
        return room.move(att.id, frame);
      case 'rest':
        return room.rest(att.id, frame.asleep);
      case 'look': {
        const { look, recheck } = this.vetLook(att, frame.look);
        room.look(att.id, look);
        this.statsSeen(att, look);
        if (recheck) void this.recheckLook(att, frame.look);
        else this.rememberEquipped(att, look.wear);
        return;
      }
      case 'bye':
        room.leave(att.id, att.sid);
        this.acts.get(att.room)?.forget(att.id);
        ws.serializeAttachment({ ...att, state: null } satisfies Attachment);
        ws.close(1000, 'bye');
        this.forget(att.room);
        this.emitCounts();
        return;
      case 'emote':
        if (!room.admit(att.id)) return;
        // The hop is every owl's: no collection is asked, and no quest counts it.
        if (frame.e === JUMP_EMOTE) return void room.jump(att.id);
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
    const result = room.join(peerOf(ws), att.id, { ...hello, look }, att.sid, { ...opts, welcome });
    if (result === 'full') {
      this.send(ws, { t: 'full', room: att.room, cap: room.cap });
      closeSocket(ws, CLOSE.ROOM_FULL, 'room full');
      return false;
    }
    // The entry went out with the welcome: the socket need not keep it.
    const kept = ws.deserializeAttachment() as Attachment | null;
    if (kept?.entry) {
      delete kept.entry;
      ws.serializeAttachment(kept);
    }
    this.emitCounts();
    this.statsSeen(att, look, true);
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
    } catch {
      return closeSocket(ws, 1011, 'try again');
    }
    if (ws.readyState !== WebSocket.READY_STATE_OPEN) return;
    const view = visit ? (this.nestViews.get(nestId) ?? visit.nest) : null;
    const mine = visit?.mine === true;
    if (!view || (!view.open && !mine)) {
      const why = view ? 'closed' : 'gone';
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
    } catch {
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
      this.drop(ws);
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
    } catch {
      refuse('offline');
    }
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
    const next = prev.then(fn, fn).catch(() => undefined);
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
    } catch {
      /* quests are best effort for pushes: the next request returns the true board */
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
          if (!room.near(att.id, it.pos, rules.reach)) return refuse('far');
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
          const res = await stub.gather(cid, frame.quest, frame.n, att.room, pos);
          if (res.ok) return this.sendBoard(ws, res.board, res.updates, { r, ok: true });
          return this.sendBoard(ws, await stub.board(cid), [], { r, ok: false, reason: res.reason });
        }
      }
    } catch {
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
        if (!res.ok) return no(res.reason);
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
        case 'run': {
          const res = startRun(att.room, room.positionOf(att.id), frame.g!, crypto.getRandomValues(new Uint32Array(1))[0]!, Date.now());
          if (!res.ok) return no(res.reason);
          this.keepRun(ws, res.run);
          return this.send(ws, { t: 'act', r, a, ok: true, game: res.run.game, seed: res.run.seed, startedAt: res.run.startedAt });
        }
        case 'score': {
          const result: RunResult = frame.n === undefined ? { game: frame.g!, score: frame.s! } : { game: frame.g!, score: frame.s!, shots: frame.n };
          const verdict = endRun((ws.deserializeAttachment() as Attachment | null)?.run, result, frame.k!, Date.now());
          if (verdict === 'idle') return no('idle');
          // One result per run, whether or not it holds up.
          this.keepRun(ws, undefined);
          if (verdict === 'unknown') return no('unknown');
          const settled = await stub.arcadeRun(cid, result, portraitLook(room.lookOf(att.id) ?? DEFAULT_LOOK));
          this.send(ws, { t: 'act', r, a, ok: true, paid: settled.paid });
          // Everyone else in the arcade sees the wall change; the player has it in the answer.
          if (settled.changed) room.broadcast({ t: 'wall', walls: [settled.paid.wall] }, att.id);
          if (settled.tasks) this.send(ws, { t: 'tasks', ...settled.tasks });
          return;
        }
      }
    } catch {
      return no('offline');
    }
  }

  /** Keep the visitor's arcade run on its socket (or, with none, drop it). */
  private keepRun(ws: WebSocket, run: ArcadeRun | undefined): void {
    const cur = ws.deserializeAttachment() as Attachment | null;
    if (!cur) return;
    const { run: _done, ...rest } = cur;
    ws.serializeAttachment((run ? { ...rest, run } : rest) satisfies Attachment);
  }

  /** The arcade's score wall for a newcomer, with its own bests (the wall fills in with the next run if the collections are away). */
  private async sendWall(ws: WebSocket, att: Attachment): Promise<void> {
    try {
      const { walls, mine } = await this.collections().arcadeWalls(att.cid ?? null);
      this.send(ws, { t: 'wall', walls, mine });
    } catch {
      /* best effort */
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
      } catch {
        /* the beam still glows; pay is best effort */
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
      } catch {
        /* best effort */
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
  private statsSeen(att: Attachment, look: OwlLook, entered = false): void {
    const s = sightingOf(att);
    if (!this.statsOn || !s) return;
    const sighting: Sighting = entered ? { ...s, entered: true, ...(att.owner ? { own: true } : {}) } : s;
    this.ctx.waitUntil(this.collections().seen(sighting, { body: look.body, ...(look.species ? { species: look.species } : {}) }).catch(() => undefined));
  }

  /** These owls' visits are still going (the minute heartbeat, a socket's close), for the player stats. */
  private statsAlive(sightings: Sighting[]): Promise<void> {
    if (!this.statsOn || !sightings.length) return Promise.resolve();
    return this.collections()
      .alive(sightings)
      .catch(() => undefined);
  }

  private send(ws: WebSocket, frame: ServerFrame): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      /* closed meanwhile */
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
        .catch(() => null)
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
        .catch(() => undefined),
    );
  }

  private async emote(ws: WebSocket, att: Attachment, room: Room, e: string): Promise<void> {
    if (!att.cid) return;
    let entry: OwnedEntry | null | undefined = this.owned.get(att.cid);
    if (!entry?.set.has(e)) entry = await this.loadOwned(att.cid, att.tz, true, visitOf(att));
    if (!entry?.set.has(e) || room.sessionOf(att.id) !== att.sid) return;
    if (!room.emote(att.id, e)) return;
    // An emote counts for quests in this room, and "for" any NPC owl standing close enough.
    const pos = room.positionOf(att.id);
    const near = pos ? npcsIn(att.room).filter((n) => distance(n.pos, pos) <= NPC_EMOTE_RADIUS).map((n) => n.id) : [];
    this.serial(att, () => this.pushEvent(ws, att, { kind: 'emote', emote: e, room: att.room, near }));
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    // The visit was here until now: it ends here unless the owl comes back in (another room, a dropped line).
    const att = ws.deserializeAttachment() as Attachment | null;
    const s = att?.state ? sightingOf(att) : null;
    this.drop(ws);
    if (s) this.ctx.waitUntil(this.statsAlive([s]));
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.drop(ws);
  }

  private drop(ws: WebSocket): void {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return;
    if (att.state) {
      // Only the session that owns the visitor may remove it; a replaced socket's close is ignored.
      const room = this.rooms.get(att.room);
      if (room?.sessionOf(att.id) === att.sid) this.acts.get(att.room)?.forget(att.id);
      room?.leave(att.id, att.sid);
    }
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
        try {
          ws.close(att.state ? 1001 : CLOSE.BAD_PROTOCOL, att.state ? 'idle' : 'no hello');
        } catch {
          /* ignore */
        }
        this.drop(ws);
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
