/**
 * Durable Object adapter around `Room`. Holds the WebSockets with the Hibernation API so an
 * idle park costs nothing, answers heartbeats without waking, and rebuilds every room from
 * the socket attachments when the object wakes up or is moved.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  CLOSE,
  HEARTBEAT_FRAME,
  KIND_RULES,
  NPC_EMOTE_RADIUS,
  NPC_TALK_RADIUS,
  distance,
  filterOwnedWear,
  getInteractable,
  getNpc,
  getQuest,
  isTimeZone,
  leafRespawnMs,
  npcsIn,
  parseClientFrame,
  wearVariants,
  type ClientFrame,
  type OwlLook,
  type QuestBoard,
  type QuestUpdate,
  type ServerFrame,
  type Wear,
} from '@owl-park/shared';
import type { Collections } from './Collections';
import { Room, type Peer, type VisitorState } from './Room';
import { ROOMS, roomCap } from './rooms';
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

export class RoomObject extends DurableObject<Env> {
  private readonly rooms = new Map<string, Room>();
  private lastCounts = '';
  private lastCountsAt = 0;
  private countsDirty = false;
  private readonly owned = new Map<string, OwnedEntry>();
  private readonly ownedLoads = new Map<string, Promise<OwnedEntry | null>>();
  private readonly lastEquipped = new Map<string, string>();
  /** Quest requests run one at a time per visitor, in arrival order. */
  private readonly queues = new Map<string, Promise<void>>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
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
    });
  }

  private counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, r] of this.rooms) out[id] = r.count;
    return out;
  }

  private room(id: string): Room {
    let r = this.rooms.get(id);
    if (!r) {
      const def = Object.hasOwn(ROOMS, id) ? ROOMS[id] : undefined;
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

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/counts') {
      return Response.json(this.counts());
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const roomId = request.headers.get('X-Room') ?? '';
    const id = request.headers.get('X-Visitor-Id') ?? '';
    const ip = request.headers.get('X-Visitor-Ip') ?? 'unknown';
    const cid = request.headers.get('X-Collector-Id');
    const tz = request.headers.get('X-Collector-Tz');
    if (!Object.hasOwn(ROOMS, roomId) || !id) return new Response('bad room', { status: 400 });
    const perIp = Number(this.env.MAX_SOCKETS_PER_IP) || DEFAULT_MAX_SOCKETS_PER_IP;
    if (this.ctx.getWebSockets(`ip:${ip}`).length >= perIp) return new Response('too many connections from this address', { status: 429 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [`id:${id}`, `ip:${ip}`, `room:${roomId}`]);
    const att: Attachment = { room: roomId, id, sid: randomSid(), ip, joinedAt: Date.now(), state: null };
    if (isCollectorId(cid)) att.cid = cid;
    if (isTimeZone(tz)) att.tz = tz;
    server.serializeAttachment(att);
    await this.ensureAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return ws.close(CLOSE.BAD_PROTOCOL, 'no session');
    if (typeof message !== 'string') return ws.close(CLOSE.BAD_PROTOCOL, 'text frames only');
    if (message === HEARTBEAT_FRAME) return; // normally answered by the auto-response without reaching here
    const frame = parseClientFrame(message);
    if (!frame) {
      if (message.length > 1024) return ws.close(CLOSE.TOO_LARGE, 'frame too large');
      return ws.close(CLOSE.BAD_PROTOCOL, 'malformed frame');
    }
    const room = this.room(att.room);

    if (!att.state) {
      if (frame.t !== 'hello') return ws.close(CLOSE.BAD_PROTOCOL, 'hello first');
      if (this.env.GATE === 'ticket' && att.ip !== 'admitted') {
        // v2 hook: the Worker marks admitted passes; guests are refused when the gate is closed.
      }
      // Wear the collector does not own (or is not yet known to own) is left off until checked.
      const { look, recheck } = this.vetLook(att, frame.look);
      const result = room.join(peerOf(ws), att.id, { ...frame, look }, att.sid);
      if (result === 'full') {
        ws.send(JSON.stringify({ t: 'full', room: att.room, cap: room.cap } satisfies ServerFrame));
        return ws.close(CLOSE.ROOM_FULL, 'room full');
      }
      this.emitCounts();
      if (recheck) void this.recheckLook(att, frame.look);
      // Arriving in a room counts for quests that ask to visit it.
      this.serial(att, () => this.pushEvent(ws, att, { kind: 'visit', room: att.room }));
      return;
    }

    switch (frame.t) {
      case 'hello':
        return ws.close(CLOSE.BAD_PROTOCOL, 'duplicate hello');
      case 'move':
        return room.move(att.id, frame);
      case 'look': {
        const { look, recheck } = this.vetLook(att, frame.look);
        room.look(att.id, look);
        if (recheck) void this.recheckLook(att, frame.look);
        else this.rememberEquipped(att, look.wear);
        return;
      }
      case 'bye':
        room.leave(att.id, att.sid);
        ws.serializeAttachment({ ...att, state: null } satisfies Attachment);
        ws.close(1000, 'bye');
        this.emitCounts();
        return;
      case 'emote':
        if (!room.admit(att.id)) return;
        return this.emote(ws, att, room, frame.e);
      case 'quests':
      case 'talk':
      case 'accept':
      case 'abandon':
      case 'handin':
      case 'use':
      case 'gather':
        if (!room.admit(att.id)) return;
        return this.serial(att, () => this.quest(ws, att, room, frame));
    }
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
          const res = await stub.handIn(cid, q.id, giver.id);
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
          if (rules.shared) {
            if (!room.useObject(att.id, it.id, Date.now() + leafRespawnMs(Math.random))) return this.send(ws, { t: 'useResult', r, ok: false, reason: 'gone', feathers: 0, total: -1, updates: [] });
            this.saveObjects();
            const res = await stub.flop(cid, ev, att.room);
            this.send(ws, { t: 'useResult', r, ok: true, feathers: res.feathers, total: res.total, updates: res.updates });
            if (res.board) this.sendBoard(ws, res.board, res.updates);
            return;
          }
          const res = await stub.questEvent(cid, ev, att.room);
          this.send(ws, { t: 'useResult', r, ok: true, feathers: 0, total: res.board?.feathers ?? -1, updates: res.updates });
          if (res.board) this.sendBoard(ws, res.board, res.updates);
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

  private send(ws: WebSocket, frame: ServerFrame): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      /* closed meanwhile */
    }
  }

  /** What a collector owns, read through a small cache (one read in flight per collector). */
  private async loadOwned(cid: string, tz: string | undefined, fresh = false): Promise<OwnedEntry | null> {
    const cached = this.owned.get(cid);
    if (cached && (!fresh || Date.now() - cached.at < OWNED_REFRESH_MS)) return cached;
    let load = this.ownedLoads.get(cid);
    if (!load) {
      load = this.collections()
        .owned(cid, tz)
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
    const entry = await this.loadOwned(att.cid, att.tz, true);
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
    if (!entry?.set.has(e)) entry = await this.loadOwned(att.cid, att.tz, true);
    if (!entry?.set.has(e) || room.sessionOf(att.id) !== att.sid) return;
    if (!room.emote(att.id, e)) return;
    // An emote counts for quests in this room, and "for" any NPC owl standing close enough.
    const pos = room.positionOf(att.id);
    const near = pos ? npcsIn(att.room).filter((n) => distance(n.pos, pos) <= NPC_EMOTE_RADIUS).map((n) => n.id) : [];
    this.serial(att, () => this.pushEvent(ws, att, { kind: 'emote', emote: e, room: att.room, near }));
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.drop(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.drop(ws);
  }

  private drop(ws: WebSocket): void {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return;
    if (att.state) {
      // Only the session that owns the visitor may remove it; a replaced socket's close is ignored.
      this.rooms.get(att.room)?.leave(att.id, att.sid);
    }
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

  /** Every minute while anyone is connected: close silent sockets and refresh counts. */
  override async alarm(): Promise<void> {
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
    if (this.ctx.getWebSockets().length > 0) await this.ctx.storage.setAlarm(now + ALARM_EVERY_MS);
  }
}
