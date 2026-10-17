import {
  CLOSE,
  EDGE_PROTOCOL_VERSION,
  HEARTBEAT_FRAME,
  HEARTBEAT_INTERVAL_MS,
  parseServerFrame,
  positionAlongWalk,
  type ClientFrame,
  type OwlSnapshot,
  type ParkMessage,
  type PlayerState,
  type ServerFrame,
  type Vec2,
  type Walk,
} from '@owl-park/shared';
import type { ParkTransport, RoomConnection, RoomHandlers } from './transport';

/** Remote owls are drawn this far behind the server clock so network jitter never shows. */
const RENDER_DELAY_MS = 100;
const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 8_000;
/** A move with no echo by then is assumed dropped (rate limited) and re-sent once. */
const ECHO_TIMEOUT_MS = 1_500;
/** No frame at all for this long (heartbeat replies included) means the socket is dead. */
const DEAD_AFTER_MS = HEARTBEAT_INTERVAL_MS * 2 + 10_000;
const SPAWN_NAME = /^[a-z][a-z0-9-]{0,23}$/;
const RELOAD_GUARD_KEY = 'owl-park:reloaded';

interface Pass {
  pass: string;
  exp: number;
}

/**
 * Internet multiplayer through the authoritative room server (a Cloudflare Durable Object
 * reached over one WebSocket per visitor). The server owns positions and the clock; this
 * transport converts server time to local time so the scene's time-based walks work unchanged.
 */
export class EdgeTransport implements ParkTransport {
  readonly kind = 'edge' as const;
  private readonly base: string;

  constructor(baseUrl: string) {
    this.base = baseUrl.replace(/\/$/, '');
  }

  /** The pass lives in memory only: one visitor identity per page load, never shared by a duplicated tab. */
  private pass: Pass | null = null;

  private async getPass(force = false): Promise<Pass> {
    if (!force && this.pass && this.pass.exp * 1000 > Date.now() + 60_000) return this.pass;
    const res = await fetch(`${this.base}/api/pass`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`pass refused (${res.status})`);
    this.pass = (await res.json()) as Pass;
    return this.pass;
  }

  /** POST a vote with this visitor's pass; the server decides admission and the daily limit. */
  async vote(realm: string): Promise<Response> {
    const pass = await this.getPass();
    return fetch(`${this.base}/api/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pass.pass}` },
      body: JSON.stringify({ realm }),
    });
  }

  async join(roomId: string, self: PlayerState, handlers: RoomHandlers): Promise<RoomConnection> {
    handlers.onStatus('connecting');
    const wsBase = this.base ? this.base.replace(/^http/, 'ws') : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
    let ws: WebSocket | null = null;
    let closed = false;
    let seq = 0;
    let offset = 0; // serverNow - localNow
    let offsetKnown = false;
    let current = self;
    const requestedSpawn = (self as PlayerState & { spawn?: string }).spawn;
    let spawn = requestedSpawn && SPAWN_NAME.test(requestedSpawn) ? requestedSpawn : undefined;
    let backoff = BACKOFF_MIN_MS;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let welcomed = false;
    let opened = false;
    let lastRx = Date.now();
    /** Our id as the server knows it (from the pass), which differs from the scene's local id. */
    let selfId: string | null = null;
    const knownPeers = new Set<string>();
    const pending = new Map<number, { to: Vec2; timer: ReturnType<typeof setTimeout>; resent: boolean }>();

    const toLocalWalk = (w: { from: Vec2; to: Vec2; at: number }): Walk => ({ from: w.from, to: w.to, startedAt: w.at - offset + RENDER_DELAY_MS });
    const sendFrame = (f: ClientFrame) => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(f));
    };
    /** Where our owl is right now according to the last tracked state (a walk may be in progress). */
    const currentPos = (): Vec2 => (current.walk ? positionAlongWalk(current.walk, Date.now()).pos : current.pos);
    const clearPending = (upTo?: number) => {
      for (const [k, p] of pending) {
        if (upTo === undefined || k <= upTo) {
          clearTimeout(p.timer);
          pending.delete(k);
        }
      }
    };

    const onFrame = (f: ServerFrame) => {
      switch (f.t) {
        case 'welcome': {
          const localNow = Date.now();
          offset = f.now - localNow;
          offsetKnown = true;
          welcomed = true;
          selfId = f.id;
          backoff = BACKOFF_MIN_MS;
          clearPending();
          handlers.onSelf?.(f.you.pos);
          current = { ...current, pos: f.you.pos, walk: null };
          const seen = new Set<string>();
          for (const o of f.owls) {
            seen.add(o.id);
            knownPeers.add(o.id);
            handlers.onPeerState(fromSnapshot(o, toLocalWalk));
          }
          for (const id of [...knownPeers]) {
            if (!seen.has(id)) {
              knownPeers.delete(id);
              handlers.onPeerLeave(id);
            }
          }
          handlers.onCounts?.(f.counts);
          handlers.onStatus('online');
          break;
        }
        case 'enter':
          if (f.owl.id === selfId) break;
          knownPeers.add(f.owl.id);
          handlers.onPeerState(fromSnapshot(f.owl, toLocalWalk));
          break;
        case 'move': {
          // Refine the clock: (at - receive time) is the skew minus one-way latency, so the
          // largest value seen is the closest to the true skew.
          if (offsetKnown) offset = Math.max(offset, f.at - Date.now());
          if (f.id === selfId) {
            if (f.seq !== undefined) {
              const predicted = pending.get(f.seq)?.to;
              clearPending(f.seq);
              const differs = !predicted || Math.hypot(predicted.x - f.to.x, predicted.y - f.to.y) > 2;
              if (differs) handlers.onSelfWalk?.({ from: f.from, to: f.to, startedAt: Date.now() });
            }
            break;
          }
          knownPeers.add(f.id);
          handlers.onPeerMove(f.id, toLocalWalk(f));
          break;
        }
        case 'look':
          if (f.id !== selfId) handlers.onPeerLook?.(f.id, f.look);
          break;
        case 'leave':
          if (f.id === selfId) break;
          knownPeers.delete(f.id);
          handlers.onPeerLeave(f.id);
          break;
        case 'counts':
          handlers.onCounts?.(f.rooms);
          break;
        case 'full':
          handlers.onFull?.(f.room);
          break;
      }
    };

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) return;
      const wait = backoff + Math.random() * backoff * 0.5;
      backoff = Math.min(BACKOFF_MAX_MS, backoff * 2);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, wait);
    };

    const connect = async (forcePass = false): Promise<void> => {
      if (closed) return;
      let pass: Pass;
      try {
        pass = await this.getPass(forcePass);
      } catch {
        handlers.onStatus('offline');
        scheduleReconnect();
        return;
      }
      if (closed) return;
      welcomed = false;
      opened = false;
      const socket = new WebSocket(`${wsBase}/ws/${encodeURIComponent(roomId)}?pass=${encodeURIComponent(pass.pass)}`);
      ws = socket;
      socket.onopen = () => {
        opened = true;
        lastRx = Date.now();
        const hello: ClientFrame = { t: 'hello', v: EDGE_PROTOCOL_VERSION, look: current.look };
        if (spawn) hello.spawn = spawn;
        const pos = currentPos();
        hello.pos = { x: Math.round(pos.x), y: Math.round(pos.y) };
        socket.send(JSON.stringify(hello));
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = setInterval(() => {
          if (socket.readyState !== WebSocket.OPEN) return;
          if (Date.now() - lastRx > DEAD_AFTER_MS) {
            socket.close(4000, 'no reply'); // a dead connection: onclose schedules the reconnect
            return;
          }
          socket.send(HEARTBEAT_FRAME);
        }, HEARTBEAT_INTERVAL_MS);
      };
      socket.onmessage = (ev: MessageEvent<unknown>) => {
        lastRx = Date.now();
        if (typeof ev.data !== 'string' || ev.data === HEARTBEAT_FRAME) return;
        const f = parseServerFrame(ev.data);
        if (f) onFrame(f);
      };
      socket.onclose = (ev: CloseEvent) => {
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        if (ws === socket) ws = null;
        if (closed) return;
        if (ev.code === CLOSE.ROOM_FULL || ev.code === CLOSE.REPLACED || ev.code === CLOSE.NOT_ADMITTED) {
          handlers.onStatus('offline');
          return; // the scene decides what to do; no reconnect loop
        }
        if (ev.code === CLOSE.BAD_PROTOCOL && !welcomed) {
          // A stale bundle speaking an old protocol reloads itself, once.
          let already = false;
          try {
            already = sessionStorage.getItem(RELOAD_GUARD_KEY) === '1';
            sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
          } catch {
            already = true;
          }
          if (!already) {
            location.reload();
            return;
          }
        }
        handlers.onStatus('offline');
        // A refused handshake (bad pass, too many connections) surfaces as 1006 before open:
        // fetch a fresh pass for the next attempt rather than retrying a rejected one for hours.
        if (ev.code === CLOSE.BAD_PASS || !opened) this.pass = null;
        scheduleReconnect();
      };
      socket.onerror = () => {
        /* onclose follows */
      };
    };

    const onPageHide = () => sendFrame({ t: 'bye' });
    window.addEventListener('pagehide', onPageHide);

    await connect();

    return {
      send(msg: ParkMessage) {
        switch (msg.t) {
          case 'move': {
            seq += 1;
            const mine = seq;
            const frame: ClientFrame = { t: 'move', to: { x: Math.round(msg.walk.to.x), y: Math.round(msg.walk.to.y) }, seq: mine };
            const arm = (resent: boolean) =>
              setTimeout(() => {
                const p = pending.get(mine);
                if (!p) return;
                if (p.resent) {
                  pending.delete(mine); // dropped twice: the server refused it; the echo-less walk stays local
                  return;
                }
                p.resent = true;
                p.timer = arm(true);
                sendFrame(frame);
              }, ECHO_TIMEOUT_MS);
            pending.set(mine, { to: msg.walk.to, timer: arm(false), resent: false });
            sendFrame(frame);
            break;
          }
          case 'state':
            sendFrame({ t: 'look', look: msg.state.look });
            break;
          case 'bye':
            sendFrame({ t: 'bye' });
            break;
          case 'hello':
            break;
        }
      },
      track(state: PlayerState) {
        current = state;
        spawn = undefined;
      },
      async leave() {
        closed = true;
        window.removeEventListener('pagehide', onPageHide);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (heartbeat) clearInterval(heartbeat);
        clearPending();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ t: 'bye' } satisfies ClientFrame));
          ws.close(1000, 'leaving');
        } else ws?.close();
        ws = null;
      },
    };
  }
}

function fromSnapshot(o: OwlSnapshot, toLocalWalk: (w: { from: Vec2; to: Vec2; at: number }) => Walk): PlayerState {
  return { id: o.id, look: o.look, pos: o.pos, walk: o.walk ? toLocalWalk(o.walk) : null, v: 1 };
}
