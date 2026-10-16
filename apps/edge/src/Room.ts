/**
 * The authoritative room, written without any platform API so it can be unit-tested in
 * plain Node and ported to any WebSocket host. The Durable Object adapter (RoomObject)
 * owns the sockets; this class owns the rules: spawning, clamping walks, fan-out, caps,
 * rate limits, and the snapshot a newcomer receives.
 */
import {
  findSpawn,
  isWalkable,
  positionAlongWalk,
  resolveTarget,
  distance,
  EDGE_PROTOCOL_VERSION,
  CLOSE,
  type ClientHello,
  type ClientMove,
  type OwlLook,
  type OwlSnapshot,
  type RoomDef,
  type ServerFrame,
  type ServerWalk,
  type Vec2,
} from '@owl-park/shared';

export interface Peer {
  send(text: string): void;
  close(code: number, reason: string): void;
}

/** Everything about one visitor that must survive hibernation (kept ≤ 2 KiB by design). */
export interface VisitorState {
  id: string;
  look: OwlLook;
  pos: Vec2;
  walk: ServerWalk | null;
}

interface Visitor {
  peer: Peer;
  st: VisitorState;
  seq: number;
  tokens: number;
  refilledAt: number;
  strikes: number[];
  frames: number[];
}

export interface RoomOptions {
  now: () => number;
  random?: () => number;
  cap: number;
  /** Called whenever a visitor's durable state changes (the adapter persists it). */
  onState?: (id: string, st: VisitorState) => void;
  /** Provides park-wide counts for welcome frames. */
  counts?: () => Record<string, number>;
}

export const LIMITS = {
  moveBurst: 5,
  moveRefillPerS: 2,
  strikeWindowMs: 10_000,
  strikesToClose: 3,
  frameWindowMs: 5_000,
  framesPerWindow: 40,
  minMovePx: 4,
  minSpacingPx: 24,
  scatterDefault: 220,
  scatterDoor: 60,
  scatterAttempts: 11,
  scatterShrink: 20,
  resumeRadius: 240,
  leaverMemoryMs: 120_000,
} as const;

export class Room {
  readonly def: RoomDef;
  private readonly visitors = new Map<string, Visitor>();
  private readonly leavers = new Map<string, { pos: Vec2; leftAt: number }>();
  private readonly opts: RoomOptions;

  constructor(def: RoomDef, opts: RoomOptions) {
    this.def = def;
    this.opts = opts;
  }

  get id(): string {
    return this.def.id;
  }
  get count(): number {
    return this.visitors.size;
  }
  get cap(): number {
    return this.opts.cap;
  }
  has(id: string): boolean {
    return this.visitors.has(id);
  }
  ids(): string[] {
    return [...this.visitors.keys()];
  }

  private now(): number {
    return this.opts.now();
  }
  private rnd(): number {
    return (this.opts.random ?? Math.random)();
  }

  private send(v: Visitor, frame: ServerFrame): void {
    try {
      v.peer.send(JSON.stringify(frame));
    } catch {
      /* a dead socket is cleaned up by the adapter's close handler */
    }
  }

  broadcast(frame: ServerFrame, except?: string): void {
    const text = JSON.stringify(frame);
    for (const [id, v] of this.visitors) {
      if (id === except) continue;
      try {
        v.peer.send(text);
      } catch {
        /* ignore */
      }
    }
  }

  snapshot(except?: string): OwlSnapshot[] {
    const out: OwlSnapshot[] = [];
    for (const [id, v] of this.visitors) {
      if (id === except) continue;
      out.push({ id, look: v.st.look, pos: v.st.pos, walk: v.st.walk });
    }
    return out;
  }

  /** Where the visitor is right now, finishing any walk that has run its course. */
  private currentPos(v: Visitor): Vec2 {
    if (!v.st.walk) return v.st.pos;
    const { pos, done } = positionAlongWalk({ from: v.st.walk.from, to: v.st.walk.to, startedAt: v.st.walk.at }, this.now());
    if (done) {
      v.st.pos = v.st.walk.to;
      v.st.walk = null;
      return v.st.pos;
    }
    return { x: Math.round(pos.x), y: Math.round(pos.y) };
  }

  private occupied(p: Vec2, except?: string): boolean {
    for (const [id, v] of this.visitors) {
      if (id === except) continue;
      if (distance(this.currentPos(v), p) < LIMITS.minSpacingPx) return true;
    }
    return false;
  }

  /** Pick a free walkable point near the spawn, shrinking the search each failed attempt. */
  scatter(spawn: Vec2, radius: number, except?: string): Vec2 {
    let r = radius;
    for (let i = 0; i < LIMITS.scatterAttempts && r > 0; i++) {
      const p = { x: Math.round(spawn.x + (this.rnd() * 2 - 1) * r), y: Math.round(spawn.y + (this.rnd() * 2 - 1) * r * 0.5) };
      if (isWalkable(p, this.def.walkable) && !this.occupied(p, except)) return p;
      r -= LIMITS.scatterShrink;
    }
    return { ...spawn };
  }

  /**
   * Admit a visitor. Returns 'full' (caller sends `full` and closes 4010) or 'ok' after
   * the welcome and enter frames have been sent. A second session for the same id
   * replaces the first (closed 4005).
   */
  join(peer: Peer, id: string, hello: ClientHello): 'ok' | 'full' {
    const existing = this.visitors.get(id);
    if (existing) {
      existing.peer.close(CLOSE.REPLACED, 'replaced by a newer session');
      this.visitors.delete(id);
      this.broadcast({ t: 'leave', id });
    } else if (this.visitors.size >= this.opts.cap) {
      return 'full';
    }
    const spawnName = hello.spawn ?? 'default';
    const spawn = findSpawn(this.def, spawnName);
    const isDoorEntry = spawnName !== 'default' && this.def.spawns[spawnName] !== undefined;
    let pos: Vec2 | null = null;
    if (hello.pos && isWalkable(hello.pos, this.def.walkable)) {
      const recent = this.leavers.get(id);
      const nearSpawn = distance(hello.pos, spawn) <= LIMITS.resumeRadius;
      const nearLeave = recent !== undefined && this.now() - recent.leftAt <= LIMITS.leaverMemoryMs && distance(hello.pos, recent.pos) <= LIMITS.resumeRadius;
      if ((nearSpawn || nearLeave) && !this.occupied(hello.pos)) pos = hello.pos;
    }
    if (!pos) pos = this.scatter(spawn, isDoorEntry ? LIMITS.scatterDoor : LIMITS.scatterDefault);

    const now = this.now();
    const v: Visitor = { peer, st: { id, look: hello.look, pos, walk: null }, seq: -1, tokens: LIMITS.moveBurst, refilledAt: now, strikes: [], frames: [] };
    this.visitors.set(id, v);
    this.leavers.delete(id);
    this.opts.onState?.(id, v.st);

    this.send(v, {
      t: 'welcome',
      v: EDGE_PROTOCOL_VERSION,
      id,
      room: this.def.id,
      now,
      cap: this.opts.cap,
      you: { pos },
      owls: this.snapshot(id),
      counts: this.opts.counts?.() ?? { [this.def.id]: this.visitors.size },
    });
    this.broadcast({ t: 'enter', owl: { id, look: v.st.look, pos, walk: null } }, id);
    return 'ok';
  }

  /** Re-attach a visitor after the host process was recycled (no frames are sent). */
  restore(peer: Peer, st: VisitorState): void {
    const now = this.now();
    this.visitors.set(st.id, { peer, st, seq: -1, tokens: LIMITS.moveBurst, refilledAt: now, strikes: [], frames: [] });
  }

  /** Count a frame against the per-socket flood limit. Returns false when the socket must go. */
  private admitFrame(v: Visitor): boolean {
    const now = this.now();
    v.frames = v.frames.filter((t) => now - t < LIMITS.frameWindowMs);
    v.frames.push(now);
    return v.frames.length <= LIMITS.framesPerWindow;
  }

  private strike(v: Visitor): boolean {
    const now = this.now();
    v.strikes = v.strikes.filter((t) => now - t < LIMITS.strikeWindowMs);
    v.strikes.push(now);
    return v.strikes.length >= LIMITS.strikesToClose;
  }

  private takeToken(v: Visitor): boolean {
    const now = this.now();
    const refill = ((now - v.refilledAt) / 1000) * LIMITS.moveRefillPerS;
    if (refill >= 1) {
      v.tokens = Math.min(LIMITS.moveBurst, v.tokens + Math.floor(refill));
      v.refilledAt = now;
    }
    if (v.tokens <= 0) return false;
    v.tokens -= 1;
    return true;
  }

  /** Validate and apply a walk request; echoes to the sender with its seq. */
  move(id: string, msg: ClientMove): void {
    const v = this.visitors.get(id);
    if (!v) return;
    if (!this.admitFrame(v)) return void v.peer.close(CLOSE.RATE_LIMITED, 'too many frames');
    if (!this.takeToken(v)) {
      if (this.strike(v)) v.peer.close(CLOSE.RATE_LIMITED, 'too many moves');
      return;
    }
    if (msg.seq <= v.seq) return; // stale or replayed
    v.seq = msg.seq;
    const from = this.currentPos(v);
    const to = resolveTarget(from, msg.to, this.def.walkable);
    const target = { x: Math.round(to.x), y: Math.round(to.y) };
    if (distance(from, target) < LIMITS.minMovePx) return;
    const at = this.now();
    v.st.walk = { from, to: target, at };
    v.st.pos = from;
    this.opts.onState?.(id, v.st);
    const frame: ServerFrame = { t: 'move', id, from, to: target, at };
    this.broadcast(frame, id);
    this.send(v, { ...frame, seq: msg.seq });
  }

  look(id: string, look: OwlLook): void {
    const v = this.visitors.get(id);
    if (!v) return;
    if (!this.admitFrame(v)) return void v.peer.close(CLOSE.RATE_LIMITED, 'too many frames');
    v.st.look = look;
    this.opts.onState?.(id, v.st);
    this.broadcast({ t: 'look', id, look }, id);
  }

  /** Remove a visitor (graceful bye, socket close, or idle reap). */
  leave(id: string): void {
    const v = this.visitors.get(id);
    if (!v) return;
    const pos = this.currentPos(v);
    this.visitors.delete(id);
    this.leavers.set(id, { pos, leftAt: this.now() });
    if (this.leavers.size > 200) {
      const oldest = this.leavers.keys().next().value;
      if (oldest !== undefined) this.leavers.delete(oldest);
    }
    this.broadcast({ t: 'leave', id });
  }
}
