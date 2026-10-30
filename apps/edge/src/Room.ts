/**
 * The authoritative room, written without any platform API so it can be unit-tested in
 * plain Node and ported to any WebSocket host. The Durable Object adapter (RoomObject)
 * owns the sockets; this class owns the rules: spawning, clamping walks, fan-out, caps,
 * rate limits, and the snapshot a newcomer receives.
 */
import {
  MOVE_BURST,
  MOVE_REFILL_PER_S,
  AIR_BURST,
  AIR_REFILL_PER_S,
  GROUNDED,
  MAX_RISE,
  carryOn,
  checkAir,
  footing,
  groundAt,
  highestTop,
  onSomeFooting,
  sameLevel,
  standingHeights,
  USE_COOLDOWN_MS,
  REACH_SLACK,
  SAY_EVERY_MS,
  isPhrase,
  findSpawn,
  isWalkable,
  inExit,
  positionAlongWalk,
  resolveTarget,
  distance,
  WALK_SPEED,
  EDGE_PROTOCOL_VERSION,
  CLOSE,
  type ClientHello,
  type AirAt,
  type Logger,
  type ClientMove,
  type OwlLook,
  type OwlSnapshot,
  type Polygon,
  type Raised,
  type RoomDef,
  type ServerFrame,
  type ServerWalk,
  type ServerWelcome,
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
  /** Asleep where it stands, its visitor idle (OP-126). */
  asleep?: true;
  /** Off the ground (OP-084): its last air state and when the room was told it. */
  air?: AirAt;
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
  /** Air states this visitor may still send now (OP-084), and when they last refilled. */
  airTokens: number;
  airRefilledAt: number;
  /** When this visitor last said a phrase. */
  saidAt: number;
  /** When this visitor last used an interactable (leaf piles, stalls). */
  usedAt: number;
  /** When this visitor, the owner of the nest it is in, last changed it. */
  arrangedAt: number;
  /** When its owl fell asleep (OP-126), on the room's clock: unknown for one asleep before the object woke. */
  sleptAt?: number;
}

export interface RoomOptions {
  now: () => number;
  random?: () => number;
  cap: number;
  /** Provides park-wide counts for welcome frames. */
  counts?: () => Record<string, number>;
  /** Where a frame that could not be sent says so (OP-134). */
  log?: Logger;
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
  /** Air states (OP-084): a burst, then this many more a second; more are dropped quietly, and only those count towards the flood. */
  airBurst: AIR_BURST,
  airRefillPerS: AIR_REFILL_PER_S,
  /** How far above the room's highest perch an owl can be (a jump and a flap at its top, flight.ts). */
  maxRise: MAX_RISE,
  /** One prewritten phrase per visitor this often; faster ones are dropped quietly. */
  sayEveryMs: SAY_EVERY_MS,
  /** One use of an interactable per visitor this often. */
  useEveryMs: USE_COOLDOWN_MS,
  /** One change to its nest per owner this often. */
  arrangeEveryMs: 250,
  /** Extra reach the server allows for talks and uses (the client's owl is drawn a little ahead). */
  reachSlackPx: REACH_SLACK,
} as const;

/** Where an owl left a room, and when: one back soon resumes near there (OP-138). */
export interface Leaver {
  pos: Vec2;
  leftAt: number;
  /** Its connection dropped (it said no goodbye): back soon, it reconnected (OP-134's reconnect_ok). */
  dropped?: true;
}

export class Room {
  readonly def: RoomDef;
  private readonly visitors = new Map<string, Visitor>();
  private readonly leavers = new Map<string, Leaver>();
  private readonly opts: RoomOptions;
  /** Shared interactables used up for now (leaf piles): id -> server ms when they are back. */
  private readonly objects = new Map<string, number>();
  /** The highest an owl can be here, the heights it can stand at, and where it can be at some height (OP-084, perches.ts). */
  private readonly airTop: number;
  private readonly standing: number[];
  private readonly anyFooting: Polygon[];

  constructor(def: RoomDef, opts: RoomOptions) {
    this.def = def;
    this.opts = opts;
    this.airTop = highestTop(def) + LIMITS.maxRise;
    this.standing = standingHeights(def);
    this.anyFooting = footing(def, Number.POSITIVE_INFINITY).walkable;
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

  /** A frame to one visitor. A socket that has died meanwhile is the adapter's to clean up; the miss is logged (OP-134). */
  private send(v: Visitor, frame: ServerFrame): void {
    try {
      v.peer.send(JSON.stringify(frame));
    } catch (e) {
      this.sendFailed(frame, e);
    }
  }

  broadcast(frame: ServerFrame, except?: string): void {
    const text = JSON.stringify(frame);
    for (const [id, v] of this.visitors) {
      if (id === except) continue;
      try {
        v.peer.send(text);
      } catch (e) {
        this.sendFailed(frame, e);
      }
    }
  }

  private sendFailed(frame: ServerFrame, e: unknown): void {
    this.opts.log?.warn('room.tick', 'send_failed', 'A frame could not be sent to an owl in the room: its socket is cleaned up when it closes.', { room: this.id, frame: frame.t, error: e });
  }

  snapshot(except?: string): OwlSnapshot[] {
    const out: OwlSnapshot[] = [];
    for (const [id, v] of this.visitors) {
      if (id === except) continue;
      const air = this.airOf(v);
      out.push({ id, look: v.st.look, pos: v.st.pos, walk: v.st.walk, ...(v.st.asleep ? { asleep: true as const } : {}), ...(air ? { air } : {}) });
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

  /** A point the owl may be put on: walkable, not in an exit, not on top of another owl. */
  private free(p: Vec2, except?: string): boolean {
    return isWalkable(p, this.def.walkable) && !inExit(this.def, p) && !this.occupied(p, except);
  }

  /**
   * Pick a free walkable point near the spawn, shrinking the search each failed attempt. `toward` is
   * where the page has its owl when the room will not let it in there: a point whose straight walk
   * reaches it comes first, so the room's copy walks over to the owl and the page never has to move
   * its owl back to the room's spot (OP-138).
   *
   * TODO-DOCS (OP-138): docs/ARCHITECTURE.md's "Entering a room" row: a page's hello says where its
   * owl is as the socket opens (RoomHandlers.here), and an arrival the room will not have there is
   * scattered where its copy can walk straight to that spot.
   */
  scatter(spawn: Vec2, radius: number, except?: string, toward?: Vec2): Vec2 {
    let r = radius;
    let fallback: Vec2 | null = null; // walkable and outside exits, but possibly on top of someone
    let walled: Vec2 | null = null; // free, but its straight walk to `toward` meets a wall
    // The straight walk from a spot on the floor, as the page asks it of an owl on the ground (OP-084: a solid perch is a wall below its top).
    const ground = toward ? footing(this.def, 0) : null;
    for (let i = 0; i < LIMITS.scatterAttempts && r > 0; i++) {
      const p = { x: Math.round(spawn.x + (this.rnd() * 2 - 1) * r), y: Math.round(spawn.y + (this.rnd() * 2 - 1) * r * 0.5) };
      if (this.free(p, except)) {
        if (!toward || !ground || distance(resolveTarget(p, toward, ground.walkable, ground.shut), toward) < 3) return p;
        walled ??= p;
      } else if (!fallback && isWalkable(p, this.def.walkable) && !inExit(this.def, p)) fallback = p;
      r -= LIMITS.scatterShrink;
    }
    if (walled) return walled;
    if (isWalkable(spawn, this.def.walkable) && !inExit(this.def, spawn)) return { ...spawn };
    return fallback ?? { ...spawn };
  }

  /**
   * Admit a visitor. Returns 'full' (caller sends `full` and closes 4010) or 'ok' after
   * the welcome and enter frames have been sent. A second session for the same id
   * replaces the first (closed 4005). `overCap` lets a nest's owner into its own nest however full.
   */
  /**
   * Put a visitor in the room and send its welcome. `welcome` adds what the room object knows beyond
   * the room: which copy it is, the visitor's entry, the busy ribbon (OP-075) and the realms switch.
   */
  join(peer: Peer, id: string, hello: ClientHello, sid = '', opts: { overCap?: boolean; welcome?: Pick<ServerWelcome, 'copy' | 'entry' | 'notice' | 'realms'> } = {}): 'ok' | 'full' {
    const existing = this.visitors.get(id);
    if (existing) {
      // The newer session wins; remember where the old one stood so the newcomer can resume there.
      this.leavers.set(id, { pos: this.currentPos(existing), leftAt: this.now() });
      existing.peer.close(CLOSE.REPLACED, 'replaced by a newer session');
      this.visitors.delete(id);
      this.broadcast({ t: 'leave', id });
    } else if (this.visitors.size >= this.opts.cap && !opts.overCap) {
      return 'full';
    }
    // An explicit spawn name means the visitor came through a door: keep them close to it.
    const isDoorEntry = hello.spawn !== undefined;
    const spawn = findSpawn(this.def, hello.spawn);
    let pos: Vec2 | null = null;
    // Where the page has its owl, when that is on this room's floor or a perch (back on a perch it
    // stood on is back where it was: its page tells the room the height, OP-084).
    const told = hello.pos && onSomeFooting(this.def, hello.pos) && !inExit(this.def, hello.pos) ? hello.pos : undefined;
    if (told) {
      const recent = this.leavers.get(id);
      const nearSpawn = distance(told, spawn) <= LIMITS.resumeRadius;
      // Back soon after it left: near where it left, or as far from there as it could have walked
      // since (a page walks on while its connection is down, and comes back where its owl is, OP-138).
      const away = recent === undefined ? Infinity : this.now() - recent.leftAt;
      const nearLeave = recent !== undefined && away <= LIMITS.leaverMemoryMs && distance(told, recent.pos) <= LIMITS.resumeRadius + (WALK_SPEED * away) / 1000;
      if ((nearSpawn || nearLeave) && !this.occupied(told)) pos = told;
    }
    if (!pos) pos = this.scatter(spawn, isDoorEntry ? LIMITS.scatterDoor : LIMITS.scatterDefault, undefined, told);

    const now = this.now();
    const v: Visitor = { peer, sid, st: { id, look: hello.look, pos, walk: null }, seq: -1, tokens: LIMITS.moveBurst, refilledAt: now, strikes: [], frames: [], emotedAt: 0, airTokens: LIMITS.airBurst, airRefilledAt: now, saidAt: 0, usedAt: 0, arrangedAt: 0 };
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
      ...opts.welcome,
    });
    this.send(v, { t: 'objects', until: this.objectStates() });
    this.broadcast({ t: 'enter', owl: { id, look: v.st.look, pos, walk: null } }, id);
    return 'ok';
  }

  /** Re-attach a visitor after the host process was recycled (no frames are sent). */
  restore(peer: Peer, st: VisitorState, sid = ''): void {
    const now = this.now();
    this.visitors.set(st.id, { peer, sid, st, seq: -1, tokens: LIMITS.moveBurst, refilledAt: now, strikes: [], frames: [], emotedAt: 0, airTokens: LIMITS.airBurst, airRefilledAt: now, saidAt: 0, usedAt: 0, arrangedAt: 0 });
  }

  /**
   * The owls that left within the memory window, for the room object to keep past this room: an empty
   * nest is let go, and the object itself sleeps once no socket is left (OP-138).
   */
  leaversNow(): Record<string, Leaver> {
    const now = this.now();
    const out: Record<string, Leaver> = {};
    for (const [id, l] of this.leavers) if (now - l.leftAt <= LIMITS.leaverMemoryMs) out[id] = { pos: { ...l.pos }, leftAt: l.leftAt, ...(l.dropped ? { dropped: true as const } : {}) };
    return out;
  }

  /** Where and when an owl left this room lately (within the memory window), and whether its connection dropped. */
  leaverOf(id: string): Leaver | undefined {
    const l = this.leavers.get(id);
    return l && this.now() - l.leftAt <= LIMITS.leaverMemoryMs ? { pos: { ...l.pos }, leftAt: l.leftAt, ...(l.dropped ? { dropped: true as const } : {}) } : undefined;
  }

  /** Owls that left lately as the room object kept them: an owl in the room now, or one this room saw leave later, keeps its own. */
  restoreLeavers(kept: Record<string, Leaver>): void {
    const now = this.now();
    for (const [id, l] of Object.entries(kept)) {
      if (this.visitors.has(id) || now - l.leftAt > LIMITS.leaverMemoryMs) continue;
      const mine = this.leavers.get(id);
      if (!mine || mine.leftAt < l.leftAt) this.leavers.set(id, { pos: { ...l.pos }, leftAt: l.leftAt, ...(l.dropped ? { dropped: true as const } : {}) });
    }
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
    // The page has the owl's height and the footing for it (OP-084): a walk may go wherever an owl can be at some height.
    const to = resolveTarget(from, msg.to, this.anyFooting);
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
    // An owl that walks is awake, for everyone, whatever its page said last (OP-126).
    const woke = v.st.asleep === true;
    delete v.st.asleep;
    delete v.sleptAt;
    v.peer.persist?.(v.st);
    if (woke) this.broadcast({ t: 'rest', id, asleep: false }, id);
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

  /**
   * The owl falls asleep or wakes (OP-126): kept on the visitor, so a newcomer sees it too, and told to
   * the others. True when that changed how it stands.
   */
  rest(id: string, asleep: boolean): boolean {
    const v = this.visitors.get(id);
    if (!v) return false;
    if (!this.admitFrame(v)) {
      v.peer.close(CLOSE.RATE_LIMITED, 'too many frames');
      return false;
    }
    if (asleep === (v.st.asleep === true)) return false;
    if (asleep) {
      v.st.asleep = true;
      v.sleptAt = this.now();
    } else {
      delete v.st.asleep;
      delete v.sleptAt;
    }
    v.peer.persist?.(v.st);
    this.broadcast({ t: 'rest', id, asleep }, id);
    return true;
  }

  /** Whether a visitor's owl is asleep now (OP-126), and since when on the room's clock (null: asleep before the object woke). */
  sleepOf(id: string): { since: number | null } | null {
    const v = this.visitors.get(id);
    return v?.st.asleep ? { since: v.sleptAt ?? null } : null;
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

  /**
   * The owl's air state changed (OP-084): kept on the visitor, so a newcomer carries it on, and told
   * to the others with the room's time. Movement is state, not events: nothing is logged, and the
   * landing is never sent, since every page reckons it. Air the room cannot believe (not an air state,
   * past the room's top, on the ground above the floor) is dropped, never a reason to close the socket
   * (OP-084), and so is air beyond the visitor's allowance; only that excess counts towards the flood
   * limit, so jumping never closes a socket.
   */
  air(id: string, a: unknown): boolean {
    const v = this.visitors.get(id);
    if (!v) return false;
    const now = this.now();
    const refill = ((now - v.airRefilledAt) / 1000) * LIMITS.airRefillPerS;
    if (refill >= 1) {
      v.airTokens = Math.min(LIMITS.airBurst, v.airTokens + Math.floor(refill));
      v.airRefilledAt = now;
    }
    if (v.airTokens <= 0) {
      if (!this.admitFrame(v)) v.peer.close(CLOSE.RATE_LIMITED, 'too many frames');
      return false;
    }
    v.airTokens -= 1;
    const air = checkAir(a, this.airTop, this.standing);
    if (!air) return false;
    // On the floor the owl has no air to keep; on a perch it is told, and kept, as standing up there.
    if (air.s === GROUNDED && air.z === 0) delete v.st.air;
    else v.st.air = { ...air, at: now };
    // An owl that jumps is awake, for everyone (OP-126).
    const woke = v.st.asleep === true;
    delete v.st.asleep;
    delete v.sleptAt;
    v.peer.persist?.(v.st);
    if (woke) this.broadcast({ t: 'rest', id, asleep: false }, id);
    this.broadcast({ t: 'air', id, air, at: now }, id);
    return true;
  }

  /**
   * A visitor's air state as a newcomer should have it: none once its last state has come down to the
   * floor, and standing on a perch until its page says otherwise (OP-084).
   */
  private airOf(v: Visitor): AirAt | undefined {
    const a = v.st.air;
    if (!a) return undefined;
    if (a.s === GROUNDED || carryOn(a, this.now() - a.at).s !== GROUNDED) return a;
    delete v.st.air;
    return undefined;
  }

  /**
   * Say a prewritten phrase to everyone else in the room: only its number goes out, and only a
   * number the phrase list has (an unknown one is dropped). One phrase every `sayEveryMs` per owl.
   */
  say(id: string, n: number): boolean {
    const v = this.visitors.get(id);
    if (!v || !isPhrase(n)) return false;
    const now = this.now();
    if (now - v.saidAt < LIMITS.sayEveryMs) return false;
    v.saidAt = now;
    this.broadcast({ t: 'say', id, n }, id);
    return true;
  }

  /** Whether a visitor stands within `radius` (plus the latency slack) of a point, on the server clock. */
  near(id: string, p: Vec2, radius: number): boolean {
    const v = this.visitors.get(id);
    return !!v && distance(this.currentPos(v), p) <= radius + LIMITS.reachSlackPx;
  }

  /**
   * What a visitor stands on, or would come down on, now (OP-084): the top of the perch under it at
   * its height (its air as its page last told it, carried on), else the floor (0).
   */
  groundOf(id: string): number {
    const v = this.visitors.get(id);
    if (!v) return 0;
    const a = this.airOf(v);
    return groundAt(this.def.perches, this.currentPos(v), a ? carryOn(a, this.now() - a.at).z : 0);
  }

  /** Whether a visitor can reach a thing that may sit up on a perch: near it, and on the same perch (or both on the floor). */
  reaches(id: string, p: Vec2, radius: number, thing: Raised): boolean {
    return this.near(id, p, radius) && sameLevel(this.groundOf(id), thing);
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

  /** Count a change to its nest against the owner's cooldown. False when too soon. */
  takeArrange(id: string): boolean {
    const v = this.visitors.get(id);
    if (!v) return false;
    const now = this.now();
    if (now - v.arrangedAt < LIMITS.arrangeEveryMs) return false;
    v.arrangedAt = now;
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

  /**
   * Remove a visitor (graceful bye, socket close, or idle reap). A stale session's close is ignored.
   * `dropped`: its connection went without a goodbye, so one back soon reconnected (OP-134).
   */
  leave(id: string, sid?: string, dropped = false): void {
    const v = this.visitors.get(id);
    if (!v) return;
    if (sid !== undefined && v.sid !== sid) return;
    const pos = this.currentPos(v);
    this.visitors.delete(id);
    this.leavers.set(id, { pos, leftAt: this.now(), ...(dropped ? { dropped: true as const } : {}) });
    if (this.leavers.size > 200) {
      const oldest = this.leavers.keys().next().value;
      if (oldest !== undefined) this.leavers.delete(oldest);
    }
    this.broadcast({ t: 'leave', id });
  }
}
