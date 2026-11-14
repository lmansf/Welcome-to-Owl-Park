/**
 * Movers (OP-287): how an owl gets about where a hatch, a stair, a ladder or a door used to be. Three
 * of them, for a room seen from above, beside the thermal (thermal.ts):
 *
 * - A downdraft: sinking air over a knot hole in the floor. An owl in the air inside it is pulled
 *   down, wings folded, and one that comes down inside it dives through the hole, which is the doorway
 *   the downdraft stands for.
 * - A glide lane: a stream of air along a line over the floor. It holds a glide level at its height
 *   and carries it along to one of its ends: a long crossing ridden, not walked.
 * - A knot-hole tunnel: a doorway taken as a tunnel. The owl is carried in at its mouth and comes out
 *   of the mouth at the other end, in the room the doorway leads to.
 *
 * A room lists its movers (RoomDef.movers) beside the doorways they stand for, and those doorways stay
 * in its data. A page shows and plays the movers only behind its flag (apps/park/src/flags.ts, `movers`);
 * without it every doorway is as it was. The rules here are what the page, the room server and the
 * tests share.
 *
 * What the room server has to know of each. Of a dive, nothing: an owl falling is an air state the room
 * takes anywhere (flight.ts, checkAir), and DIVE_SPEED is under the fastest fall it takes. Of a tunnel,
 * nothing: a change of room is a new hello. A lane holds an owl up, so, as with a thermal, the room
 * takes a lifted owl at a lane's height only inside one (laneHolds, Room.ts), and the carry is the owl's
 * own walk at the walk's pace, checked as any walk: the wind's way (wind.ts).
 *
 * TODO-DOCS (OP-287): docs/ARCHITECTURE.md's flight notes gain the three movers beside the updraft, the
 * wind and the thermal, and that a lane's lifted owl is held to the lane by the room; docs/MAP.md's
 * Great Hollow and arcade gain the knot hole, the tunnel and the lane once the flag is on for everyone.
 */
import { AIRBORNE, JUMP_RISE, type Air } from './flight';
import { closestPointOnSegment, distance, isWalkable, pointInRect, type Polygon, type Rect } from './geometry';
import { MAX_FALL } from './jump';
import type { Vec2 } from './protocol';
import { WIND_CATCH_ABOVE, WIND_CATCH_BELOW } from './wind';

/** Sinking air over a knot hole in the floor: the doorway `door`, taken as a dive. */
export interface Downdraft {
  id: string;
  /** The doorway of the room it stands for: an owl that comes down inside the column goes through it. */
  door: string;
  /** The middle of the column on the room's plan, the knot hole's mouth (room px). */
  pos: Vec2;
  /** How far out from the middle it pulls an owl down (room px). */
  r: number;
  /** How high over the floor it reaches (room px): an owl over that flies on above it. */
  top: number;
  /**
   * The spawn of the room below that an owl which dived comes down at, where that is not the doorway's
   * own (a spot under a glide lane, so a dive held on into a glide is carried on). The room server sets
   * an arrival down a little off its spawn, so the spot has to be well inside what it is meant to reach.
   */
  lands?: string;
  /** The room's set pieces (RoomPiece ids) it stands in place of: not drawn where the movers show. */
  hides?: string[];
}

/** A stream of air along a line over the floor that holds a glide level and carries it to one of its ends. */
export interface GlideLane {
  id: string;
  /** Its two ends on the room's plan (room px). An owl is carried to the end it is heading for. */
  a: Vec2;
  b: Vec2;
  /** The height it holds a glide at, over the floor (room px). */
  z: number;
  /** How far to either side of its line it catches a glide (room px). */
  r: number;
}

/** A doorway taken as a tunnel through the wood: in at the mouth here, out of the mouth at the other end. */
export interface KnotTunnel {
  id: string;
  /** The doorway of the room it stands for. */
  door: string;
  /** Where its mouth stands on the room's plan (room px). */
  mouth: Vec2;
  /** The room's set pieces (RoomPiece ids) it stands in place of: not drawn where the movers show. */
  hides?: string[];
}

/** A room's movers (RoomDef.movers). */
export interface Movers {
  downdrafts?: Downdraft[];
  lanes?: GlideLane[];
  tunnels?: KnotTunnel[];
}

/** How fast a downdraft takes an owl down (px/s): a dive, and under the fastest fall the room takes (jump.ts, MAX_FALL). */
export const DIVE_SPEED = 900;
/**
 * How an owl that dived into a room comes in: this high over where it lands (px), and dropping from rest
 * (px/s), so the fall is seen as the room comes up and takes about half a second. Under any room's
 * ceiling for an owl in the air (flight.ts, MAX_RISE). Jump held on the way down spreads its wings.
 */
export const DIVE_ARRIVAL = { z: 380, vz: 0 } as const;
/** How far under and over a lane's height a glide is caught by it (room px): the wind's catch (wind.ts). */
export const LANE_CATCH_BELOW = WIND_CATCH_BELOW;
export const LANE_CATCH_ABOVE = WIND_CATCH_ABOVE;

/** Whether a point of the plan is inside a downdraft's column, `slack` px past its edge at most. */
export function inDowndraft(d: Downdraft, p: Vec2, slack = 0): boolean {
  return distance(p, d.pos) <= d.r + slack;
}

/** The downdraft that pulls down an owl at `p`, `z` up: one it is inside, off the floor and under the top of. */
export function downdraftAt(downdrafts: readonly Downdraft[] | undefined, p: Vec2, z: number): Downdraft | undefined {
  return (downdrafts ?? []).find((d) => z > 0 && z <= d.top && inDowndraft(d, p));
}

/** An owl's air as a downdraft has it: falling at the dive's pace, wings folded (no glide, no flap spent). */
export function dive(air: Air): Air {
  return { z: air.z, vz: -DIVE_SPEED, s: AIRBORNE, f: air.f };
}

/** The downdraft a doorway is taken as, if the room has one for it. */
export function downdraftFor(movers: Movers | undefined, door: string): Downdraft | undefined {
  return movers?.downdrafts?.find((d) => d.door === door);
}

/** The tunnel a doorway is taken as, if the room has one for it. */
export function tunnelFor(movers: Movers | undefined, door: string): KnotTunnel | undefined {
  return movers?.tunnels?.find((t) => t.door === door);
}

/** How far a point of the plan is from a lane's line (room px). */
export function laneOff(lane: GlideLane, p: Vec2): number {
  return distance(p, closestPointOnSegment(p, lane.a, lane.b));
}

/** The lane a gliding owl at `p`, `z` up is caught by: one whose line it is beside, within its catch of its height. */
export function laneAt(lanes: readonly GlideLane[] | undefined, p: Vec2, z: number): GlideLane | undefined {
  return (lanes ?? []).find((l) => z >= l.z - LANE_CATCH_BELOW && z <= l.z + LANE_CATCH_ABOVE && laneOff(l, p) <= l.r);
}

/**
 * The end a lane carries an owl to from `p`: the one it is heading for (`heading`, the way it walks or
 * is pushed, any length), and with no heading the farther one, so a lane always carries an owl somewhere.
 */
export function laneEnd(lane: GlideLane, p: Vec2, heading: Vec2 | null): Vec2 {
  const along = { x: lane.b.x - lane.a.x, y: lane.b.y - lane.a.y };
  const dot = heading ? heading.x * along.x + heading.y * along.y : 0;
  if (dot > 0) return lane.b;
  if (dot < 0) return lane.a;
  return distance(p, lane.a) > distance(p, lane.b) ? lane.a : lane.b;
}

/** Whether a lifted owl at `p`, held at `top`, is in a lane of that height (the room server's check, with its slack for latency). */
export function laneHolds(lanes: readonly GlideLane[] | undefined, p: Vec2, top: number, slack = 0): boolean {
  return (lanes ?? []).some((l) => l.z === top && laneOff(l, p) <= l.r + slack);
}

/** The highest any lane of a room holds an owl: 0 for a room with none. */
export function laneTop(room: { movers?: Movers | undefined }): number {
  return Math.max(0, ...(room.movers?.lanes ?? []).map((l) => l.z));
}

/** The set pieces a room's movers stand in place of (RoomPiece ids). */
export function hiddenPieces(movers: Movers | undefined): string[] {
  return [...(movers?.downdrafts ?? []), ...(movers?.tunnels ?? [])].flatMap((m) => m.hides ?? []);
}

/** What moverProblems reads of a room. */
export interface MoverRoom {
  id: string;
  size: { w: number; h: number };
  walkable: Polygon[];
  doors: ReadonlyArray<{ id: string; rect: Rect; to?: { room: string; spawn: string } | undefined; toNew?: { room: string; spawn: string } | undefined }>;
  pieces?: ReadonlyArray<{ id: string }> | undefined;
  movers?: Movers | undefined;
}

/** How far apart the points along a lane's line are checked for floor (room px): under the room server's own step along a walk. */
const LANE_SAMPLE = 20;

/**
 * Whether a room's movers make sense, each problem in words: a downdraft over a doorway that leads
 * somewhere, wide enough to stand in, its dive under the room's fastest fall; a lane long enough to be
 * worth riding, over floor all its length (its carry is a walk), at a height a held jump from the floor
 * is caught at; a tunnel at a doorway that leads somewhere, its mouth by that doorway; and each piece a
 * mover hides one the room has.
 */
export function moverProblems(room: MoverRoom): string[] {
  const out: string[] = [];
  const movers = room.movers;
  if (!movers) return out;
  const leads = (id: string) => {
    const door = room.doors.find((d) => d.id === id);
    return door && (door.to || door.toNew) ? door : undefined;
  };
  const pieces = new Set((room.pieces ?? []).map((p) => p.id));
  const seen = new Set<string>();
  const once = (id: string) => {
    if (seen.has(id)) out.push(`${room.id}: two movers called ${id}`);
    seen.add(id);
  };
  const taken = new Set<string>();
  const oneEach = (kind: string, id: string, door: string) => {
    if (taken.has(door)) out.push(`${room.id}/${id}: the doorway ${door} already has a mover`);
    taken.add(door);
    if (!leads(door)) out.push(`${room.id}/${id}: a ${kind} needs a doorway that leads somewhere (${door})`);
  };
  for (const d of movers.downdrafts ?? []) {
    once(d.id);
    oneEach('downdraft', d.id, d.door);
    const door = leads(d.door);
    if (door && !pointInRect(d.pos, door.rect)) out.push(`${room.id}/${d.id}: its middle is not on its doorway`);
    if (!(d.r >= 60)) out.push(`${room.id}/${d.id}: narrower than an owl can stand in (60 px out)`);
    if (!(d.top > 0)) out.push(`${room.id}/${d.id}: no height`);
    for (const id of d.hides ?? []) if (!pieces.has(id)) out.push(`${room.id}/${d.id}: hides a piece the room has not (${id})`);
  }
  if (!(DIVE_SPEED < MAX_FALL)) out.push('a dive is faster than the fastest fall the room takes');
  for (const l of movers.lanes ?? []) {
    once(l.id);
    const length = distance(l.a, l.b);
    if (!(length >= 300)) out.push(`${room.id}/${l.id}: shorter than 300 px`);
    if (!(l.r >= 40)) out.push(`${room.id}/${l.id}: narrower than 40 px to a side`);
    if (!(l.z >= LANE_CATCH_BELOW)) out.push(`${room.id}/${l.id}: lower than its catch (${LANE_CATCH_BELOW})`);
    if (!(l.z - LANE_CATCH_BELOW <= JUMP_RISE - 10)) out.push(`${room.id}/${l.id}: too high for a held jump from the floor to be caught`);
    const steps = Math.max(1, Math.ceil(length / LANE_SAMPLE));
    for (let i = 0; i <= steps; i++) {
      const p = { x: l.a.x + ((l.b.x - l.a.x) * i) / steps, y: l.a.y + ((l.b.y - l.a.y) * i) / steps };
      if (!isWalkable(p, room.walkable)) {
        out.push(`${room.id}/${l.id}: off the floor at ${Math.round(p.x)},${Math.round(p.y)}`);
        break;
      }
    }
  }
  for (const t of movers.tunnels ?? []) {
    once(t.id);
    oneEach('tunnel', t.id, t.door);
    const door = leads(t.door);
    if (door) {
      const mid = { x: door.rect.x + door.rect.w / 2, y: door.rect.y + door.rect.h / 2 };
      if (distance(t.mouth, mid) > 200) out.push(`${room.id}/${t.id}: its mouth is far from its doorway`);
    }
    for (const id of t.hides ?? []) if (!pieces.has(id)) out.push(`${room.id}/${t.id}: hides a piece the room has not (${id})`);
  }
  return out;
}
