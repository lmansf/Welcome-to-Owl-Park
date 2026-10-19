/**
 * The authoritative room, written without any platform API so it can be unit-tested in
 * plain Node and ported to any WebSocket host. The Durable Object adapter (RoomObject)
 * owns the sockets; this class owns the rules: spawning, clamping walks, fan-out, caps,
 * rate limits, and the snapshot a newcomer receives.
 */
import {
  MOVE_BURST,
  MOVE_REFILL_PER_S,
  USE_COOLDOWN_MS,
  REACH_SLACK,
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
  /** Persist the visitor's durable state next to this socket (the adapter writes the attachment). */
  persist?(st: VisitorState): void;
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
  /** Session id of the socket that currently owns this visitor; a replacement gets a new one. */
  sid: string;
  st: VisitorState;
  seq: number;
  tokens: number;
  refilledAt: number;
  strikes: number[];
  frames: number[];
  emotedAt: number;
  /** When this visitor last used an interactable (leaf piles, stalls). */
  usedAt: number;
}

export interface RoomOptions {
  now: () => number;
  random?: () => number;
  cap: number;
  /** Provides park-wide counts for welcome frames. */
  counts?: () => Record<string, number>;
}

export const LIMITS = {
  moveBurst: MOVE_BURST,
  moveRefillPerS: MOVE_REFILL_PER_S,
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
  /** One emote per visitor this often; faster ones are dropped quietly. */
  emoteEveryMs: 1_500,
  /** One use of an interactable per visitor this often. */
  useEveryMs: USE_COOLDOWN_MS,
  /** Extra reach the server allows for talks and uses (the client's owl is drawn a little ahead). */
  reachSlackPx: REACH_SLACK,
} as const;

export class Room {
  readonly def: RoomDef;
  private readonly visitors = new Map<string, Visitor>();
  private readonly leavers = new Map<string, { pos: Vec2; leftAt: number }>();
  private readonly opts: RoomOptions;
  /** Shared interactables used up for now (leaf piles): id -> server ms when they are back. */
  private readonly objects = new Map<string, number>();

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

  /** Inside a doorway that leads somewhere: arriving there would bounce the owl straight back out. */
  private inExit(p: Vec2): boolean {
    return this.def.doors.some((d) => d.to !== undefined && p.x >= d.rect.x && p.x <= d.rect.x + d.rect.w && p.y >= d.rect.y && p.y <= d.rect.y + d.rect.h);
  }

  /** A point the owl may be put on: walkable, not in an exit, not on top of another owl. */
  private free(p: Vec2, except?: string): boolean {
    return isWalkable(p, this.def.walkable) && !this.inExit(p) && !this.occupied(p, except);
  }

  /** Pick a free walkable point near the spawn, shrinking the search each failed attempt. */
  scatter(spawn: Vec2, radius: number, except?: string): Vec2 {
    let r = radius;
    let fallback: Vec2 | null = null; // walkable and outside exits, but possibly on top of someone
    for (let i = 0; i < LIMITS.scatterAttempts && r > 0; i++) {
      const p = { x: Math.round(spawn.x + (this.rnd() * 2 - 1) * r), y: Math.round(spawn.y + (this.rnd() * 2 - 1) * r * 0.5) };
      if (this.free(p, except)) return p;
      if (!fallback && isWalkable(p, this.def.walkable) && !this.inExit(p)) fallback = p;
      r -= LIMITS.scatterShrink;
    }
    if (isWalkable(spawn, this.def.walkable) && !this.inExit(spawn)) return { ...spawn };
    return fallback ?? { ...spawn };
  }

  /**
   * Admit a visitor. Returns 'full' (caller sends `full` and closes 4010) or 'ok' after
   * the welcome and enter frames have been sent. A second session for the same id
   * replaces the first (closed 4005).
   */
  join(peer: Peer, id: string, hello: ClientHello, sid = ''): 'ok' | 'full' {
    const existing = this.visitors.get(id);
    if (existing) {
      // The newer session wins; remember where the old one stood so the newcomer can resume there.
      this.leavers.set(id, { pos: this.currentPos(existing), leftAt: this.now() });
      existing.peer.close(CLOSE.REPLACED, 'replaced by a newer session');
      this.visitors.delete(id);
      this.broadcast({ t: 'leave', id });
    } else if (this.visitors.size >= this.opts.cap) {
      return 'full';
    }
    // An explicit spawn name means the visitor came through a door: keep them close to it.
    const isDoorEntry = hello.spawn !== undefined;
    const spawn = findSpawn(this.def, hello.spawn);
    let pos: Vec2 | null = null;
    if (hello.pos && isWalkable(hello.pos, this.def.walkable) && !this.inExit(hello.pos)) {
      const recent = this.leavers.get(id);
      const nearSpawn = distance(hello.pos, spawn) <= LIMITS.resumeRadius;
      const nearLeave = recent !== undefined && this.now() - recent.leftAt <= LIMITS.leaverMemoryMs && distance(hello.pos, recent.pos) <= LIMITS.resumeRadius;
      if ((nearSpawn || nearLeave) && !this.occupied(hello.pos)) pos = hello.pos;
    }
    if (!pos) pos = this.scatter(spawn, isDoorEntry ? LIMITS.scatterDoor : LIMITS.scatterDefault);

    const now = this.now();
    const v: Visitor = { peer, sid, st: { id, look: hello.look, pos, walk: null }, seq: -1, tokens: LIMITS.moveBurst, refilledAt: now, strikes: [], frames: [], emotedAt: 0, usedAt: 0 };
    this.visitors.set(id, v);
    this.leavers.delete(id);
    peer.persist?.(v.st);

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
    this.send(v, { t: 'objects', until: this.objectStates() });
    this.broadcast({ t: 'enter', owl: { id, look: v.st.look, pos, walk: null } }, id);
    return 'ok';
  }

  /** Re-attach a visitor after the host process was recycled (no frames are sent). */
  restore(peer: Peer, st: VisitorState, sid = ''): void {
    const now = this.now();
    this.visitors.set(st.id, { peer, sid, st, seq: -1, tokens: LIMITS.moveBurst, refilledAt: now, strikes: [], frames: [], emotedAt: 0, usedAt: 0 });
  }

  /** Which session currently owns a visitor id (used by the adapter to ignore stale closes). */
  sessionOf(id: string): string | undefined {
    return this.visitors.get(id)?.sid;
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
    if (distance(from, target) < LIMITS.minMovePx) {
      // Asking to walk to where the owl already is means stop (letting go of the arrow keys): a walk
      // under way ends here for everyone. A standing owl has nothing to stop.
      if (v.st.walk) this.halt(id, v, msg.seq);
      return;
    }
    const at = this.now();
    v.st.walk = { from, to: target, at };
    v.st.pos = from;
    v.peer.persist?.(v.st);
    const frame: ServerFrame = { t: 'move', id, from, to: target, at };
    this.broadcast(frame, id);
    this.send(v, { ...frame, seq: msg.seq });
  }

  /** End a visitor's walk where it stands now, for everyone (the sender's copy carries its seq). */
  private halt(id: string, v: Visitor, seq: number): void {
    const from = this.currentPos(v);
    const at = this.now();
    v.st.walk = null;
    v.st.pos = from;
    v.peer.persist?.(v.st);
    const frame: ServerFrame = { t: 'move', id, from, to: from, at };
    this.broadcast(frame, id);
    this.send(v, { ...frame, seq });
  }

  /**
   * A new look for a visitor. `admitted` is for looks the adapter applies later (after checking
   * collectible ownership): the frame that asked for it was already counted.
   */
  look(id: string, look: OwlLook, admitted = false): void {
    const v = this.visitors.get(id);
    if (!v) return;
    if (!admitted && !this.admitFrame(v)) return void v.peer.close(CLOSE.RATE_LIMITED, 'too many frames');
    v.st.look = look;
    v.peer.persist?.(v.st);
    this.broadcast({ t: 'look', id, look }, id);
  }

  /** The visitor's current look (what everyone else sees), if present. */
  lookOf(id: string): OwlLook | null {
    return this.visitors.get(id)?.st.look ?? null;
  }

  /** Where a visitor stands right now on the server clock (mid-walk positions included). */
  positionOf(id: string): Vec2 | null {
    const v = this.visitors.get(id);
    return v ? this.currentPos(v) : null;
  }

  /**
   * Count a frame the adapter handles itself (quests, uses, emotes) against the flood limit.
   * Returns false, and closes the socket, when the visitor is sending too much.
   */
  admit(id: string): boolean {
    const v = this.visitors.get(id);
    if (!v) return false;
    if (this.admitFrame(v)) return true;
    v.peer.close(CLOSE.RATE_LIMITED, 'too many frames');
    return false;
  }

  /** Play an emote for everyone else in the room (ownership is the adapter's check). Rate limited. */
  emote(id: string, e: string): boolean {
    const v = this.visitors.get(id);
    if (!v) return false;
    const now = this.now();
    if (now - v.emotedAt < LIMITS.emoteEveryMs) return false;
    v.emotedAt = now;
    this.broadcast({ t: 'emote', id, e }, id);
    return true;
  }

  /** Whether a visitor stands within `radius` (plus the latency slack) of a point, on the server clock. */
  near(id: string, p: Vec2, radius: number): boolean {
    const v = this.visitors.get(id);
    return !!v && distance(this.currentPos(v), p) <= radius + LIMITS.reachSlackPx;
  }

  /** Count a use of an interactable against the visitor's cooldown. False when too soon. */
  takeUse(id: string): boolean {
    const v = this.visitors.get(id);
    if (!v) return false;
    const now = this.now();
    if (now - v.usedAt < LIMITS.useEveryMs) return false;
    v.usedAt = now;
    return true;
  }

  /** Shared interactables that are used up right now: id -> server ms when they are back. */
  objectStates(): Record<string, number> {
    const now = this.now();
    const out: Record<string, number> = {};
    for (const [id, until] of this.objects) {
      if (until > now) out[id] = until;
      else this.objects.delete(id);
    }
    return out;
  }

  /** Put back used-up objects saved before the object was evicted (those already back are skipped). */
  restoreObjects(until: Record<string, number>): void {
    const now = this.now();
    for (const [id, t] of Object.entries(until)) if (typeof t === 'number' && t > now) this.objects.set(id, t);
  }

  /**
   * Use up a shared interactable until `until` and tell everyone (the user included), who play
   * it on visitor `by`'s owl. False when it is already used up.
   */
  useObject(by: string, objectId: string, until: number): boolean {
    if ((this.objects.get(objectId) ?? 0) > this.now()) return false;
    this.objects.set(objectId, until);
    this.broadcast({ t: 'used', id: objectId, by, until });
    return true;
  }

  /** Remove a visitor (graceful bye, socket close, or idle reap). A stale session's close is ignored. */
  leave(id: string, sid?: string): void {
    const v = this.visitors.get(id);
    if (!v) return;
    if (sid !== undefined && v.sid !== sid) return;
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
