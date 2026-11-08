/**
 * A bot owl in a room seen from the side, stepped as the page steps its own owl (RoomScene's `fly` and
 * its walks), with nothing drawn: the same flight (stepFlier), the same ground under it (groundAt), the
 * same footing for walking at a height (footing), the room's updrafts and wind currents, its brush
 * stones' ink (painted by a landing on a stone, livePerches) and its neon signs lit by park time
 * (litPerches), its pits and thorns, and the dash. Everything comes from packages/shared, so a change to
 * the game's movement rules is a change to the bots' too; only the walk is the bots' own: a held way,
 * moved at the walk's pace and stopped where the footing ends, as a held key moves the owl.
 */
import {
  AIR_DASH_MS,
  AIR_DASH_SPEED,
  GROUNDED,
  LIFTED,
  WALK_SPEED,
  FLIGHT_STEP_MS,
  flightFor,
  footing,
  footingLevel,
  inkLeft,
  signLit,
  groundAt,
  inPit,
  inThorns,
  isWalkable,
  liftAt,
  litPerches,
  livePerches,
  newFlier,
  shutShortcuts,
  stepFlier,
  stoneUnder,
  windAt,
  windEnd,
  type Flier,
  type FlightAbilities,
  type Perch,
  type RoomDef,
} from '@owl-park/shared';
import { groundOf } from '@owl-park/shared/rooms';

export const DT = FLIGHT_STEP_MS / 1000;
export const STEPS_PER_S = Math.round(1000 / FLIGHT_STEP_MS);
const DASH_STEPS = Math.round(AIR_DASH_MS / FLIGHT_STEP_MS);

/** A room as the bots walk it: the room, its ground line, and what never changes while it is walked. */
export interface BotRoom {
  room: RoomDef;
  /** The ground line: an owl's spot on the plan is always on it in a room seen from the side. */
  y: number;
  can: Readonly<FlightAbilities>;
  /** A course's act: the owl holds the dash here. */
  dash: boolean;
  /** The perches and footings by which strokes are painted and which signs lit (they repeat). */
  cache: Map<string, { perches: Perch[]; footings: Map<number, ReturnType<typeof footing>> }>;
}

export function botRoom(room: RoomDef): BotRoom {
  return { room, y: groundOf(room), can: flightFor(room.map === 2 ? 2 : 1), dash: room.course !== undefined, cache: new Map() };
}

/** The bot owl as it stands: where across, its flight, the park time (ms), the stones it has painted and when, and its dash. */
export interface Owl {
  x: number;
  fl: Flier;
  t: number;
  painted: Map<string, number>;
  onStone: string | null;
  dashSpent: boolean;
  /** Steps of a dash left, and its way. */
  dashLeft: number;
  dashDir: -1 | 1;
}

/** What the bot presses this step: the way held (-1 west, 1 east, 0 none), Jump pressed now and held, and Dash. */
export interface Press {
  way: -1 | 0 | 1;
  pressed: boolean;
  held: boolean;
  dash?: boolean;
}

export function owlAt(x: number, z: number, t: number, painted: Map<string, number> = new Map()): Owl {
  const fl = newFlier();
  return { x, fl: { ...fl, air: { ...fl.air, z } }, t, painted, onStone: null, dashSpent: false, dashLeft: 0, dashDir: 1 };
}

/** The room's perches at park time `t` with this owl's ink: what the page's standPerches gives it. */
export function perchesNow(br: BotRoom, painted: ReadonlyMap<string, number>, t: number): Perch[] {
  return standNow(br, painted, t).perches;
}

/** The room as it stands at `t`: its perches, and a cache of the footing at each level. */
function standNow(br: BotRoom, painted: ReadonlyMap<string, number>, t: number) {
  const r = br.room;
  let key = '';
  for (const s of r.brushStones ?? []) key += inkLeft(s, painted.get(s.id), t) > 0 ? '1' : '0';
  key += '|';
  for (const s of r.neonSigns ?? []) key += signLit(s, t) ? '1' : '0';
  let hit = br.cache.get(key);
  if (!hit) {
    let perches: Perch[] = r.perches ?? [];
    if (r.brushStones?.length) perches = livePerches(perches, r.brushStones, painted, t);
    if (r.neonSigns?.length) perches = litPerches(perches, r.neonSigns, t);
    hit = { perches, footings: new Map() };
    br.cache.set(key, hit);
  }
  return hit;
}

/** The footing at height `z` (footing), from the cache: it changes only when the perches under `z` do. */
function footingNow(br: BotRoom, stand: ReturnType<typeof standNow>, z: number) {
  const level = footingLevel({ perches: stand.perches }, z);
  let f = stand.footings.get(level);
  if (!f) {
    f = footing({ walkable: br.room.walkable, perches: stand.perches }, z, shutShortcuts(br.room, new Set()));
    stand.footings.set(level, f);
  }
  return f;
}

export type StepEvent = 'fall' | null;

/**
 * One step of the bot owl (FLIGHT_STEP_MS), in place. Returns 'fall' when it is in a pit or the thorns,
 * where the page puts it back at its last bench.
 */
export function stepOwl(br: BotRoom, o: Owl, p: Press): StepEvent {
  const r = br.room;
  const stand = standNow(br, o.painted, o.t);
  const perches = stand.perches;
  const here = { x: o.x, y: br.y };
  const z0 = o.fl.air.z;
  const column = r.updrafts ? (liftAt(r.updrafts, o.x, z0, o.t)?.top ?? null) : null;
  const gust = column === null ? windAt(r.winds, o.x, z0) : undefined;
  const lift = column ?? gust?.z ?? null;
  const wasGrounded = o.fl.air.s === GROUNDED;
  o.fl = stepFlier(o.fl, { pressed: p.pressed, held: p.held }, groundAt(perches, here, z0), br.can, lift);
  const air = o.fl.air;
  if (air.s === GROUNDED) o.dashSpent = false;
  // The dash: in a course, in the air, once a jump.
  if (p.dash && br.dash && !wasGrounded && air.s !== GROUNDED && !o.dashSpent && o.dashLeft === 0) {
    o.dashSpent = true;
    o.dashLeft = DASH_STEPS;
    o.dashDir = p.way === 0 ? o.dashDir : p.way;
  }
  let v = p.way * WALK_SPEED;
  if (p.way !== 0) o.dashDir = p.way;
  if (o.dashLeft > 0) {
    v = o.dashDir * AIR_DASH_SPEED;
    o.dashLeft -= 1;
  } else if (gust && air.s === LIFTED && air.h === gust.z && Math.sign(p.way) !== -gust.dir) {
    const end = windEnd(gust);
    v = Math.sign(end - o.x) * WALK_SPEED;
  }
  if (v !== 0) {
    const f = footingNow(br, stand, air.z);
    const nx = o.x + v * DT;
    if (isWalkable({ x: nx, y: br.y }, f.walkable, f.shut)) o.x = nx;
  }
  o.t += FLIGHT_STEP_MS;
  // A landing on a stone paints it afresh (brushInk.ts).
  if (r.brushStones?.length) {
    const stone = o.fl.air.s === GROUNDED ? (stoneUnder(r.brushStones, o.x, o.fl.air.z)?.id ?? null) : null;
    if (stone && o.onStone !== stone) o.painted.set(stone, o.t);
    o.onStone = stone;
  }
  if (inThorns(r, o.x, o.fl.air.z)) return 'fall';
  if (o.fl.air.s === GROUNDED && o.fl.air.z === 0 && inPit(r, { x: o.x, y: br.y })) return 'fall';
  return null;
}
