/**
 * Durable Object adapter around `Room`. Holds the WebSockets with the Hibernation API so an
 * idle park costs nothing, answers heartbeats without waking, and rebuilds every room from
 * the socket attachments when the object wakes up or is moved.
 */
import { DurableObject } from 'cloudflare:workers';
import { CLOSE, HEARTBEAT_FRAME, parseClientFrame, type ServerFrame } from '@owl-park/shared';
import { Room, type Peer, type VisitorState } from './Room';
import { ROOMS, roomCap } from './rooms';
import type { Env } from './env';

interface Attachment {
  room: string;
  id: string;
  ip: string;
  joinedAt: number;
  state: VisitorState | null;
}

const HELLO_TIMEOUT_MS = 5_000;
const IDLE_CLOSE_MS = 90_000;
const ALARM_EVERY_MS = 60_000;
/** Population counts go out at most this often (welcome frames always carry fresh counts). */
const COUNTS_EVERY_MS = 10_000;
/** Default sockets per address per object; a household or office shares one address. Override with MAX_SOCKETS_PER_IP. */
const DEFAULT_MAX_SOCKETS_PER_IP = 8;

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
  };
}

export class RoomObject extends DurableObject<Env> {
  private readonly rooms = new Map<string, Room>();
  private lastCounts = '';
  private lastCountsAt = 0;
  private countsDirty = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT_FRAME, HEARTBEAT_FRAME));
    // Wake-up: rebuild rooms from the hibernated sockets' attachments.
    for (const ws of ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att?.state) continue;
      this.room(att.room).restore(peerOf(ws), att.state);
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
        onState: (vid, st) => this.persist(vid, st),
      });
      this.rooms.set(id, r);
    }
    return r;
  }

  private socketFor(id: string): WebSocket | undefined {
    return this.ctx.getWebSockets(`id:${id}`)[0];
  }

  private persist(id: string, state: VisitorState): void {
    const ws = this.socketFor(id);
    if (!ws) return;
    const att = ws.deserializeAttachment() as Attachment | null;
    if (att) ws.serializeAttachment({ ...att, state } satisfies Attachment);
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
    if (!Object.hasOwn(ROOMS, roomId) || !id) return new Response('bad room', { status: 400 });
    const perIp = Number(this.env.MAX_SOCKETS_PER_IP) || DEFAULT_MAX_SOCKETS_PER_IP;
    if (this.ctx.getWebSockets(`ip:${ip}`).length >= perIp) return new Response('too many connections from this address', { status: 429 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [`id:${id}`, `ip:${ip}`, `room:${roomId}`]);
    server.serializeAttachment({ room: roomId, id, ip, joinedAt: Date.now(), state: null } satisfies Attachment);
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
      const result = room.join(peerOf(ws), att.id, frame);
      if (result === 'full') {
        ws.send(JSON.stringify({ t: 'full', room: att.room, cap: room.cap } satisfies ServerFrame));
        return ws.close(CLOSE.ROOM_FULL, 'room full');
      }
      this.emitCounts();
      return;
    }

    switch (frame.t) {
      case 'hello':
        return ws.close(CLOSE.BAD_PROTOCOL, 'duplicate hello');
      case 'move':
        return room.move(att.id, frame);
      case 'look':
        return room.look(att.id, frame.look);
      case 'bye':
        room.leave(att.id);
        ws.serializeAttachment({ ...att, state: null } satisfies Attachment);
        ws.close(1000, 'bye');
        this.emitCounts();
        return;
    }
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
      const room = this.rooms.get(att.room);
      // Only remove if this socket is still the one registered for the id (a replacement may have taken over).
      if (room && this.socketFor(att.id) === ws) room.leave(att.id);
      else if (room && !this.socketFor(att.id)) room.leave(att.id);
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
