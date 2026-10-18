/**
 * Durable Object adapter around `Room`. Holds the WebSockets with the Hibernation API so an
 * idle park costs nothing, answers heartbeats without waking, and rebuilds every room from
 * the socket attachments when the object wakes up or is moved.
 */
import { DurableObject } from 'cloudflare:workers';
import { CLOSE, HEARTBEAT_FRAME, filterOwnedWear, isTimeZone, parseClientFrame, wearVariants, type OwlLook, type ServerFrame, type Wear } from '@owl-park/shared';
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
  /** The collector behind this page (from the pass), if any: owns the drops, wear and emotes. */
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
  /** Pickups in flight per visitor: one at a time. */
  private readonly picking = new Set<string>();

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
      case 'drops':
        if (!room.admit(att.id)) return;
        return this.sendDrops(ws, att);
      case 'pickup':
        if (!room.admit(att.id)) return;
        return this.pickup(ws, att, room, frame.n);
      case 'emote':
        if (!room.admit(att.id)) return;
        return this.emote(att, room, frame.e);
    }
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

  private async sendDrops(ws: WebSocket, att: Attachment): Promise<void> {
    const none: ServerFrame = { t: 'drops', window: '', next: 0, drops: [], feathers: 0 };
    if (!att.cid) return this.send(ws, none);
    try {
      const info = await this.collections().drops(att.cid, att.tz);
      this.send(ws, { t: 'drops', window: info.window, next: info.next, drops: info.drops, feathers: info.feathers });
    } catch {
      this.send(ws, none);
    }
  }

  private async pickup(ws: WebSocket, att: Attachment, room: Room, n: number): Promise<void> {
    const pos = room.positionOf(att.id);
    if (!att.cid || !pos) return this.send(ws, { t: 'missed', n, reason: 'gone' });
    if (this.picking.has(att.id)) return this.send(ws, { t: 'missed', n, reason: 'busy' });
    this.picking.add(att.id);
    try {
      const res = await this.collections().claim(att.cid, att.tz, n, att.room, pos);
      if (res.ok) {
        this.owned.get(att.cid)?.set.add(res.variant);
        this.send(ws, { t: 'found', n, variant: res.variant, dup: res.dup, feathers: res.feathers });
      } else {
        this.send(ws, { t: 'missed', n, reason: res.reason });
      }
    } catch {
      this.send(ws, { t: 'missed', n, reason: 'busy' });
    } finally {
      this.picking.delete(att.id);
    }
  }

  private async emote(att: Attachment, room: Room, e: string): Promise<void> {
    if (!att.cid) return;
    let entry: OwnedEntry | null | undefined = this.owned.get(att.cid);
    if (!entry?.set.has(e)) entry = await this.loadOwned(att.cid, att.tz, true);
    if (!entry?.set.has(e) || room.sessionOf(att.id) !== att.sid) return;
    room.emote(att.id, e);
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
