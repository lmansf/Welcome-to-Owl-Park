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
  EMOTE_EVERY_MS,
  GROUNDED,
  MAX_RISE,
  carryOn,
  checkAir,
  footing,
  groundAt,
  highestTop,
  onSomeFooting,
  sameLevel,
  standingRanges,
  topAt,
  SLOPE_STEEP,
  type Standing,
  type Updraft,
  USE_COOLDOWN_MS,
  REACH_SLACK,
  SAY_EVERY_MS,
  isPhrase,
  findSpawn,
  isWalkable,
  inExit,
  walkCrossesExit,
  positionAlongWalk,
  resolveTarget,
  snapToWalkable,
  closestPointOnPolygon,
  pointInPolygon,
  distance,
  WALK_SPEED,
  EDGE_PROTOCOL_VERSION,
  CLOSE,
  DASH_LAND_SLACK_MS,
  FRESH_DASH,
  dashRefusal,
  holdsDash,
  liftColumns,
  liftHolds,
  thermalHolds,
  thermalTop,
  laneHolds,
  laneTop,
  LIFTED,
  landDash,
  roomDashEnd,
  spendDash,
  type ClientDash,
  type DashCharge,
  type DashRefusal,
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
  /** The way it came into the room (the spawn its page named on arriving through a doorway, OP-343); unknown for one re-attached after the host was recycled. */
  cameIn?: string;
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
  /** The dash as the room has it (OP-224, dash.ts): spent this jump, and when it last set off. */
  dash: DashCharge;
}

export interface RoomOptions {
  now: () => number;
  random?: () => number;
  cap: number;
  /**
   * Spectators (OP-191) come in only while the room holds fewer owls than this (its cap times the
   * spectators' share); ticket holders come in up to the cap. Unset: the cap.
   */
  spectatorLimit?: number;
  /** Provides park-wide counts for welcome frames. */
  counts?: () => Record<string, number>;
  /** Where a frame that could not be sent says so (OP-134). */
  log?: Logger;
  /** Told each place or stance a page asked for that the room would not take as asked (OP-149): the room object logs it. */
  rejected?: (id: string, why: PositionRejection) => void;
  /** Told each dash the room would not take (OP-224), with why: for the tests and the room object. */
  dashRefused?: (id: string, why: DashRefusal) => void;
}

/**
 * Why the room would not take a place as a page asked for it (OP-149). The room never takes an owl's
 * place from its page while it plays: a walk is a target, walked from where the room has the owl at
 * walking pace, and the others are told the room's walk. These are what a page can still ask for:
 *  - `room`: a walk to a point outside the room altogether, which no tap or key makes: dropped, and
 *    struck like a burst of moves (three in ten seconds close the socket);
 *  - `floor`: a walk to a point on no floor the room has: walked as far as the floor goes, as any
 *    walk is (a page with an older copy of the room, from before a deploy, may ask for one);
 *  - `perch`: standing at a perch's height with no perch of that height under the owl, nor by it on
 *    the rest of its walk: dropped, so the others never see an owl standing in mid-air;
 *  - `arrival`: a hello from a place the room will not have the owl come in at (far from the spawn
 *    and from where it left): it comes in by the spawn;
 *  - `dash`: a dash the owl could not make (OP-224: no course here, on the ground, spent this jump, too
 *    soon after the last): the owl walks on as the room had it, and its page is told so.
 */
/** The turns (degrees) around another owl tried, in order, for where a walk aimed on them ends (OP-248). */
const SPACING_TURNS = [0, 45, -45, 90, -90, 135, -135, 180] as const;

export type PositionRejection = 'room' | 'floor' | 'perch' | 'arrival' | 'dash' | 'lift';

export const LIMITS = {
  moveBurst: MOVE_BURST,
  moveRefillPerS: MOVE_REFILL_PER_S,
  strikeWindowMs: 10_000,
  strikesToClose: 3,
  frameWindowMs: 5_000,
  framesPerWindow: 40,
  minMovePx: 4,
  minSpacingPx: 24,
  /** How far past the spacing a walk that would end on another owl stops (OP-248), so rounding keeps it clear. */
  spacingSlackPx: 2,
  scatterDefault: 220,
  scatterDoor: 60,
  scatterAttempts: 11,
  scatterShrink: 20,
  resumeRadius: 240,
  leaverMemoryMs: 120_000,
  /** One emote per visitor this often; faster ones are dropped quietly. */
  emoteEveryMs: EMOTE_EVERY_MS,
  /** Air states (OP-084): a burst, then this many more a second; more are dropped quietly, and only those count towards the flood. */
  airBurst: AIR_BURST,
  airRefillPerS: AIR_REFILL_PER_S,
  /** How far above the room's highest perch an owl can be (a jump and both flaps, each at the top of the last, flight.ts). */
  maxRise: MAX_RISE,
  /** One prewritten phrase per visitor this often; faster ones are dropped quietly. */
  sayEveryMs: SAY_EVERY_MS,
  /** One use of an interactable per visitor this often. */
  useEveryMs: USE_COOLDOWN_MS,
  /** One change to its nest per owner this often. */
  arrangeEveryMs: 250,
  /** Extra reach the server allows for talks and uses (the client's owl is drawn a little ahead). */
  reachSlackPx: REACH_SLACK,
  /** How far off a perch's edge an owl the room has there may be and still be standing up on it (OP-149). */
  perchReachPx: 32,
  /** How far off every floor a walk's target may be before the room says so (a rounding, an edge). */
  offFloorPx: 2,
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
  private readonly standing: Standing[];
  /** The air that holds an owl up here: the updrafts, and the wind currents at their heights (wind.ts). */
  private readonly lifts: Updraft[];
  private readonly anyFooting: Polygon[];

  constructor(def: RoomDef, opts: RoomOptions) {
    this.def = def;
    this.opts = opts;
    // The highest an owl stands or is lifted here, and a jump and its flaps over that: a perch's top, a thermal's (OP-340) or a glide lane's height (OP-287).
    this.airTop = Math.max(highestTop(def), thermalTop(def), laneTop(def)) + LIMITS.maxRise;
    this.standing = standingRanges(def);
    this.lifts = liftColumns(def);
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
  /** Owls the room may hold and still let a spectator in (OP-191). */
  get spectatorLimit(): number {
    return Math.min(this.opts.cap, this.opts.spectatorLimit ?? this.opts.cap);
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
    const { pos, done } = positionAlongWalk({ from: v.st.walk.from, to: v.st.walk.to, startedAt: v.st.walk.at, ...(v.st.walk.dash ? { dash: true as const } : {}) }, this.now());
    if (done) {
      v.st.pos = v.st.walk.to;
      v.st.walk = null;
      return v.st.pos;
    }
    return { x: Math.round(pos.x), y: Math.round(pos.y) };
  }

  /** Whether a point is in the room at all (OP-149): a frame can say any point in the biggest room there is. */
  private inRoom(p: Vec2): boolean {
    return p.x >= 0 && p.y >= 0 && p.x <= this.def.size.w && p.y <= this.def.size.h;
  }

  /**
   * Whether a perch `z` high is where the visitor stands (OP-149): under the owl, or within
   * `perchReachPx` of where the room has it now or of the rest of its walk. Its page is a moment ahead
   * of the room on a walk, and after a welcome the room's copy walks over to where its page has it.
   */
  private perchFor(v: Visitor, z: number): boolean {
    // A flat perch that high, or a sloped one (OP-238) whose range holds the height: on the slope, the
    // height must be its height where the owl is, give or take the slope over the reach.
    const slack = 0.5 + LIMITS.perchReachPx / SLOPE_STEEP;
    const perches = (this.def.perches ?? []).filter((p) => (p.profile ? z >= Math.min(...p.profile.map((q) => q.top)) - slack && z <= p.top + slack : Math.abs(p.top - z) <= 0.5));
    if (perches.length === 0) return false;
    const here = this.currentPos(v);
    const end = v.st.walk?.to ?? here;
    const steps = Math.max(1, Math.ceil(distance(here, end) / (LIMITS.perchReachPx / 2)));
    const atHeight = (perch: (typeof perches)[number], p: Vec2) => !perch.profile || Math.abs(topAt(perch, p.x) - z) <= slack;
    for (let i = 0; i <= steps; i++) {
      const p = { x: here.x + ((end.x - here.x) * i) / steps, y: here.y + ((end.y - here.y) * i) / steps };
      if (perches.some((perch) => atHeight(perch, p) && (pointInPolygon(p, perch.area) || distance(p, closestPointOnPolygon(p, perch.area)) <= LIMITS.perchReachPx))) return true;
    }
    return false;
  }

  private occupied(p: Vec2, except?: string): boolean {
    for (const [id, v] of this.visitors) {
      if (id === except) continue;
      if (distance(this.currentPos(v), p) < LIMITS.minSpacingPx) return true;
    }
    return false;
  }

  /**
   * Where another owl than `except` stands or will stand within the minimum spacing of `p` (OP-248):
   * the end of its walk if it is walking, as that is where it stops.
   */
  private restingNear(p: Vec2, except: string): Vec2 | null {
    for (const [id, v] of this.visitors) {
      if (id === except) continue;
      const end = v.st.walk?.to ?? this.currentPos(v);
      if (distance(end, p) < LIMITS.minSpacingPx) return end;
    }
    return null;
  }

  /**
   * Where a walk from `from` aimed at `target` ends (OP-248). Aimed within the minimum spacing of another
   * owl, it ends just outside that owl: on the side it was aimed at (aimed dead on them, the side the
   * walker comes from), else around them a step at a time, wherever this walk gets to on the way that no
   * other owl has. With no such spot around them, the walk ends where it was aimed, as before.
   */
  private spaced(id: string, from: Vec2, target: Vec2): Vec2 {
    const other = this.restingNear(target, id);
    if (!other) return target;
    const side = target.x === other.x && target.y === other.y ? from : target;
    const base = Math.atan2(side.y - other.y, side.x - other.x);
    const r = LIMITS.minSpacingPx + LIMITS.spacingSlackPx;
    for (const turn of SPACING_TURNS) {
      const a = base + (turn * Math.PI) / 180;
      const reached = resolveTarget(from, { x: other.x + r * Math.cos(a), y: other.y + r * Math.sin(a) }, this.anyFooting);
      const q = { x: Math.round(reached.x), y: Math.round(reached.y) };
      if (!this.restingNear(q, id)) return q;
    }
    return target;
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
   * No point is picked whose straight walk from where the owl stands (`toward`, else the spawn) passes
   * through a way out. The page walks its owl over to the room's spot (its step aside), and that walk
   * took it through the doorway and out of the room it had only just come into: in the grove, one
   * arrival in fifteen of those that come in beside another owl with no doorway named (OP-342).
   *
   * TODO-DOCS (OP-342): docs/ARCHITECTURE.md, "Entering a room": the scatter also passes over any spot
   * whose straight walk from where the owl stands would go through a way out.
   */
  scatter(spawn: Vec2, radius: number, except?: string, toward?: Vec2): Vec2 {
    let r = radius;
    let fallback: Vec2 | null = null; // walkable and outside exits, but possibly on top of someone
    let walled: Vec2 | null = null; // free, but its straight walk to `toward` meets a wall
    // The straight walk from a spot on the floor, as the page asks it of an owl on the ground (OP-084: a solid perch is a wall below its top).
    const ground = toward ? footing(this.def, 0) : null;
    const stands = toward ?? spawn;
    for (let i = 0; i < LIMITS.scatterAttempts && r > 0; i++, r -= LIMITS.scatterShrink) {
      const p = { x: Math.round(spawn.x + (this.rnd() * 2 - 1) * r), y: Math.round(spawn.y + (this.rnd() * 2 - 1) * r * 0.5) };
      if (walkCrossesExit(this.def, stands, p)) continue;
      if (this.free(p, except)) {
        if (!toward || !ground || distance(resolveTarget(p, toward, ground.walkable, ground.shut), toward) < 3) return p;
        walled ??= p;
      } else if (!fallback && isWalkable(p, this.def.walkable) && !inExit(this.def, p)) fallback = p;
    }
    if (walled) return walled;
    if (isWalkable(spawn, this.def.walkable) && !inExit(this.def, spawn)) return { ...spawn };
    return fallback ?? { ...spawn };
  }

  /**
   * Put a visitor in the room and send its welcome. Returns 'full' (caller sends `full` and closes 4010)
   * or 'ok' after the welcome and enter frames have been sent. A second session for the same id
   * replaces the first (closed 4005). `overCap` lets a nest's owner into its own nest however full;
   * a `spectator` (OP-191) comes in only below the spectators' limit, and its welcome says so.
   * `welcome` adds what the room object knows beyond the room: which copy it is, the visitor's entry,
   * the busy ribbon (OP-075) and the realms switch.
   */
  join(peer: Peer, id: string, hello: ClientHello, sid = '', opts: { overCap?: boolean; spectator?: boolean; welcome?: Pick<ServerWelcome, 'copy' | 'entry' | 'notice' | 'realms'> } = {}): 'ok' | 'full' {
    const existing = this.visitors.get(id);
    if (existing) {
      // The newer session wins; remember where the old one stood so the newcomer can resume there.
      this.leavers.set(id, { pos: this.currentPos(existing), leftAt: this.now() });
      existing.peer.close(CLOSE.REPLACED, 'replaced by a newer session');
      this.visitors.delete(id);
      this.broadcast({ t: 'leave', id });
    } else if (this.visitors.size >= this.opts.cap && !opts.overCap) {
      return 'full';
    } else if (opts.spectator && this.visitors.size >= this.spectatorLimit) {
      return 'full';
    }
    // An explicit spawn name means the visitor came through a door: keep them close to it.
    const isDoorEntry = hello.spawn !== undefined;
    const spawn = findSpawn(this.def, hello.spawn);
    let pos: Vec2 | null = null;
    // Where the page has its owl, when that is on this room's floor or a perch (back on a perch it
    // stood on is back where it was: its page tells the room the height, OP-084).
    const told = hello.pos && onSomeFooting(this.def, hello.pos) && !inExit(this.def, hello.pos) ? hello.pos : undefined;
    // A place the room will not have the owl come in at (OP-149); another owl standing there is no reason to say so.
    let refused = hello.pos !== undefined;
    if (told) {
      const recent = this.leavers.get(id);
      const nearSpawn = distance(told, spawn) <= LIMITS.resumeRadius;
      // Back soon after it left: near where it left, or as far from there as it could have walked
      // since (a page walks on while its connection is down, and comes back where its owl is, OP-138).
      const away = recent === undefined ? Infinity : this.now() - recent.leftAt;
      const nearLeave = recent !== undefined && away <= LIMITS.leaverMemoryMs && distance(told, recent.pos) <= LIMITS.resumeRadius + (WALK_SPEED * away) / 1000;
      if (nearSpawn || nearLeave) {
        refused = false;
        if (!this.occupied(told)) pos = told;
      }
    }
    if (refused) this.opts.rejected?.(id, 'arrival');
    if (!pos) pos = this.scatter(spawn, isDoorEntry ? LIMITS.scatterDoor : LIMITS.scatterDefault, undefined, told);

    const now = this.now();
    const v: Visitor = { peer, sid, st: { id, look: hello.look, pos, walk: null }, seq: -1, tokens: LIMITS.moveBurst, refilledAt: now, strikes: [], frames: [], emotedAt: 0, airTokens: LIMITS.airBurst, airRefilledAt: now, saidAt: 0, usedAt: 0, arrangedAt: 0, dash: { ...FRESH_DASH } };
    if (hello.spawn !== undefined && Object.hasOwn(this.def.spawns, hello.spawn)) v.cameIn = hello.spawn;
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
      ...(opts.spectator ? { spectator: true as const } : {}),
    });
    this.send(v, { t: 'objects', until: this.objectStates() });
    this.broadcast({ t: 'enter', owl: { id, look: v.st.look, pos, walk: null } }, id);
    return 'ok';
  }

  /** Re-attach a visitor after the host process was recycled (no frames are sent). */
  restore(peer: Peer, st: VisitorState, sid = ''): void {
    const now = this.now();
    this.visitors.set(st.id, { peer, sid, st, seq: -1, tokens: LIMITS.moveBurst, refilledAt: now, strikes: [], frames: [], emotedAt: 0, airTokens: LIMITS.airBurst, airRefilledAt: now, saidAt: 0, usedAt: 0, arrangedAt: 0, dash: { ...FRESH_DASH } });
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

  /**
   * Where each owl in the room stands now, kept by the room object as if each had just dropped (OP-321):
   * a room server that stops without a goodbye (killed, or a deploy) sends nobody off, so without this
   * an owl back after it returns has no place left to resume at and is let in by the door.
   */
  standingNow(): Record<string, Leaver> {
    const now = this.now();
    const out: Record<string, Leaver> = {};
    for (const [id, v] of this.visitors) out[id] = { pos: this.currentPos(v), leftAt: now, dropped: true };
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
    // No tap or key aims outside the room (OP-149): dropped, and struck like a burst of moves.
    if (!this.inRoom(msg.to)) {
      this.opts.rejected?.(id, 'room');
      if (this.strike(v)) v.peer.close(CLOSE.RATE_LIMITED, 'too many moves');
      return;
    }
    const from = this.currentPos(v);
    // The page has the owl's height and the footing for it (OP-084): a walk may go wherever an owl can be at some height.
    const to = resolveTarget(from, msg.to, this.anyFooting);
    // Aimed off every floor here: walked as far as the floor goes, as any walk is, and said (OP-149).
    if (distance(msg.to, snapToWalkable(msg.to, this.anyFooting)) > LIMITS.offFloorPx) this.opts.rejected?.(id, 'floor');
    const aimed = { x: Math.round(to.x), y: Math.round(to.y) };
    if (distance(from, aimed) < LIMITS.minMovePx) {
      // Asking to walk to where the owl already is means stop (letting go of the arrow keys): a walk
      // under way ends here for everyone. A standing owl has nothing to stop.
      if (v.st.walk) this.halt(id, v, msg.seq);
      return;
    }
    // No walk ends on top of another owl (OP-248): it ends just beside them instead.
    const target = this.spaced(id, from, aimed);
    if (distance(from, target) < LIMITS.minMovePx) {
      // Beside them is where the owl already is: it stays, and its page is told so even standing, as its
      // owl set off towards the other owl there.
      this.halt(id, v, msg.seq);
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

  /**
   * A dash (OP-224, dash.ts), checked as a walk is (from where the room has the owl, no further than a
   * dash goes, as far as the floor goes) and as flight is (the owl holds the dash in this room, and is up
   * in the air as the room reckons its last air state, within DASH_LAND_SLACK_MS of coming down; once a
   * jump, never sooner than the cooldown). Taken, it is the owl's walk at the dash's pace, told to the
   * others and echoed with its seq. Refused, the owl walks on as the room had it, and its page is told
   * that walk (echoed with the seq, so its page puts its owl right), and the room object hears why.
   */
  dash(id: string, msg: ClientDash): void {
    const v = this.visitors.get(id);
    if (!v) return;
    if (!this.admitFrame(v)) return void v.peer.close(CLOSE.RATE_LIMITED, 'too many frames');
    if (msg.seq <= v.seq) return; // stale or replayed
    v.seq = msg.seq;
    if (!this.inRoom(msg.to)) {
      this.opts.rejected?.(id, 'room');
      if (this.strike(v)) v.peer.close(CLOSE.RATE_LIMITED, 'too many moves');
      return;
    }
    const now = this.now();
    const from = this.currentPos(v);
    const why = dashRefusal(v.dash, holdsDash(this.def), this.upAt(v, now - DASH_LAND_SLACK_MS), now);
    if (why) {
      this.opts.rejected?.(id, 'dash');
      this.opts.dashRefused?.(id, why);
      // The walk under way goes on from here at the walk's pace; the page's dash is put right.
      const to = v.st.walk && !v.st.walk.dash ? v.st.walk.to : from;
      v.st.walk = distance(from, to) < LIMITS.minMovePx ? null : { from, to, at: now };
      v.st.pos = from;
      v.peer.persist?.(v.st);
      const frame: ServerFrame = { t: 'move', id, from, to, at: now };
      this.broadcast(frame, id);
      this.send(v, { ...frame, seq: msg.seq });
      return;
    }
    const to = roomDashEnd(from, msg.to, this.anyFooting);
    v.dash = spendDash(v.dash, now);
    v.st.walk = { from, to, at: now, dash: true };
    v.st.pos = from;
    delete v.st.asleep;
    delete v.sleptAt;
    v.peer.persist?.(v.st);
    const frame: ServerFrame = { t: 'move', id, from, to, at: now, dash: true };
    this.broadcast(frame, id);
    this.send(v, { ...frame, seq: msg.seq });
  }

  /**
   * Put a visitor down at a point, standing (OP-224: a fall in a course, back at its last bench): the
   * one move of an owl that is not a walk the page asked for. The others are told it as a walk that
   * starts and ends there, as a halt is; the owl's page put its own owl there already.
   */
  place(id: string, at: Vec2, top = 0): boolean {
    const v = this.visitors.get(id);
    if (!v || !isWalkable(at, this.anyFooting)) return false;
    const now = this.now();
    const p = { x: Math.round(at.x), y: Math.round(at.y) };
    // Up on a ledge (a bench over a pit): standing on it, as the room has its perches; else on the floor.
    const up = top > 0 && groundAt(this.def.perches, p, top) === top;
    v.st.pos = p;
    v.st.walk = null;
    if (up) v.st.air = { z: top, vz: 0, s: GROUNDED, f: 0, at: now };
    else delete v.st.air;
    v.dash = landDash(v.dash);
    v.peer.persist?.(v.st);
    this.broadcast({ t: 'move', id, from: p, to: p, at: now }, id);
    if (up) this.broadcast({ t: 'air', id, air: { z: top, vz: 0, s: GROUNDED, f: 0 }, at: now }, id);
    return true;
  }

  /** Whether the owl is up in the air at `at` (room ms) as the room reckons its last air state (OP-084): off the ground and not yet come down. */
  private upAt(v: Visitor, at: number): boolean {
    const a = v.st.air;
    if (!a || a.s === GROUNDED) return false;
    return carryOn(a, Math.max(0, at - a.at)).s !== GROUNDED;
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

  /** The way a visitor came into the room (a spawn of the room), when the room saw it arrive by one (OP-343: a course's fall goes back there). */
  cameInBy(id: string): string | undefined {
    return this.visitors.get(id)?.cameIn;
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
    // Lifted only inside a column of this room that is on, rising to its top (updraft.ts), held in a wind current
    // at its height (wind.ts), inside a thermal of a room seen from above, rising to its top (thermal.ts), or
    // beside a glide lane of such a room, held at its height (movers.ts, OP-287).
    const at = air.s === LIFTED ? this.currentPos(v) : null;
    if (
      at &&
      !liftHolds(this.lifts, at.x, air.h!, now, LIMITS.reachSlackPx) &&
      !thermalHolds(this.def.thermals, at, air.h!, LIMITS.reachSlackPx) &&
      !laneHolds(this.def.movers?.lanes, at, air.h!, LIMITS.reachSlackPx)
    ) {
      this.opts.rejected?.(id, 'lift');
      return false;
    }
    // Off the ground from standing (the floor or a perch): it landed since its last dash, which is back (OP-224).
    if (air.s !== GROUNDED && !this.upAt(v, now)) v.dash = landDash(v.dash);
    // Standing up there only where a perch that high is (OP-149): the others never see an owl standing in mid-air.
    if (air.s === GROUNDED && air.z > 0 && !this.perchFor(v, air.z)) {
      this.opts.rejected?.(id, 'perch');
      return false;
    }
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

  /** How high a visitor is now (room px over the floor), its air as its page last told it, carried on. */
  heightOf(id: string): number {
    const v = this.visitors.get(id);
    const a = v ? this.airOf(v) : undefined;
    return a ? carryOn(a, this.now() - a.at).z : 0;
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
