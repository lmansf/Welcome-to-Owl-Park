import {
  COPY_ROOM,
  COPY_SPOT,
  FISHING_REACH,
  FISHING_ROOM,
  FISHING_SPOT,
  LANTERN_BEAMS,
  LOBBY_ROOM,
  QUIZ_STAGES,
  distance,
  pointInRect,
  type DoorDef,
  type Rect,
  type RoomDef,
  type Vec2,
} from '@owl-park/shared';
import { COMMONS_THERMAL, HALL_ROOM } from '@owl-park/shared/rooms';
import { rootSpots } from './hallTips';

/**
 * The feather trail (OP-307): a faint line of drifting feathers from where the owl stands toward a
 * game of the room's own it has not stood at yet (OP-338), then a doorway it has not been through (one
 * that leads to play first, OP-337, then the nearest), and a small glint on every such spot and doorway. A guest who
 * follows the feathers finds every place without a map; once every doorway of a room has been tried
 * the room shows neither. The doorways tried are kept on this device (localStorage), like the map's
 * lit places. Settings has a switch for it (on by default).
 */

/** This device's doorways tried, as `room#door`. */
export const DOORS_TRIED_KEY = 'owl-park:doors-tried';
/** At most this many doorways are kept: the oldest go first (a park has a few hundred). */
export const DOORS_TRIED_MAX = 800;

/** A doorway's key among those tried. */
export function doorKey(room: string, door: string): string {
  return `${room}#${door}`;
}

/** The doorways tried, from what storage holds: strings only, anything else dropped. */
export function parseTried(raw: string | null): string[] {
  let v: unknown = null;
  try {
    v = raw ? JSON.parse(raw) : null;
  } catch {
    v = null;
  }
  return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string').slice(-DOORS_TRIED_MAX) : [];
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** The doorways this device has been through, kept as the owl goes through each. */
export class TriedDoors {
  private readonly keys: string[];
  private readonly set: Set<string>;

  constructor(private readonly storage: Store | null) {
    let raw: string | null = null;
    try {
      raw = storage?.getItem(DOORS_TRIED_KEY) ?? null;
    } catch {
      raw = null;
    }
    this.keys = parseTried(raw);
    this.set = new Set(this.keys);
  }

  has(room: string, door: string): boolean {
    return this.set.has(doorKey(room, door));
  }

  /** The owl went through a doorway (or came in by it): true when that is news. */
  add(room: string, door: string): boolean {
    const k = doorKey(room, door);
    if (this.set.has(k)) return false;
    this.set.add(k);
    this.keys.push(k);
    while (this.keys.length > DOORS_TRIED_MAX) this.set.delete(this.keys.shift()!);
    try {
      this.storage?.setItem(DOORS_TRIED_KEY, JSON.stringify(this.keys));
    } catch {
      /* private mode: kept for this visit only */
    }
    return true;
  }
}

/** Where a doorway's trail ends and its glint shines: its sign's spot, else the middle of its floor. */
export function doorSpot(door: Pick<DoorDef, 'rect' | 'marker' | 'markAt'>): Vec2 {
  return door.marker ?? door.markAt ?? { x: door.rect.x + door.rect.w / 2, y: door.rect.y + door.rect.h / 2 };
}

/** The doorway nearest `from` among `doors`, or null for none. */
export function nearestDoor<D extends Pick<DoorDef, 'rect' | 'marker' | 'markAt'>>(from: Vec2, doors: readonly D[]): D | null {
  let best: D | null = null;
  let bestAt = Infinity;
  for (const d of doors) {
    const at = distance(from, doorSpot(d));
    if (at < bestAt) {
      best = d;
      bestAt = at;
    }
  }
  return best;
}

/** The arcade: its cabinets are games to play at once. */
const ARCADE_ROOM = 'arcade';

/**
 * Whether a room is somewhere to play straight away (OP-337): a parkour course's room, or the arcade.
 * Of the first visits that reached the Great Hollow, the ones that stayed were the ones that found a
 * course or the arcade; the realm rooms' own things to do take finding.
 */
export function leadsToPlay(room: Pick<RoomDef, 'id' | 'course'> | undefined): boolean {
  return room !== undefined && (room.course !== undefined || room.id === ARCADE_ROOM);
}

/**
 * The doorway the trail leads to (OP-337): the nearest of those not tried yet that lead to play, while
 * there is one, and after that the nearest of the rest. Every doorway not tried keeps its glint.
 */
export function trailDoor<D extends Pick<DoorDef, 'rect' | 'marker' | 'markAt'>>(from: Vec2, doors: readonly D[], toPlay: (door: D) => boolean): D | null {
  return nearestDoor(from, doors.filter(toPlay)) ?? nearestDoor(from, doors);
}

/**
 * A game of a room's own (OP-338): the floor an owl stands on to play it. The trail leads there before
 * it leads to any doorway, and the spot glints, until the owl has stood on it once (kept with the
 * doorways tried, under the spot's id).
 */
export interface PlaySpot {
  id: string;
  rect: Rect;
}

/** Half the side of the square that fits inside the fishing spot's reach. */
const FISH_HALF = Math.floor(FISHING_REACH / Math.SQRT2);

/** The floor before a quiz's stage: its three answer zones, side by side. */
function quizFloor(stage: (typeof QUIZ_STAGES)[string]): Rect {
  const zones = Object.values(stage.zones);
  const x = Math.min(...zones.map((z) => z.x));
  const y = Math.min(...zones.map((z) => z.y));
  return { x, y, w: Math.max(...zones.map((z) => z.x + z.w)) - x, h: Math.max(...zones.map((z) => z.y + z.h)) - y };
}

/**
 * TODO-DOCS (OP-338): docs/ARCHITECTURE.md's note on the feather trail gains its order: a room's own
 * games, then doorways into play, then the rest.
 *
 * Each room's own games, where an owl stands to play them (activities.ts in @owl-park/shared has their
 * rules). The Party Grove's job is playing together, and both its games are a few seconds' walk off
 * screen either side of where an owl lands: the lanterns to light along the beam in the west bay, the
 * quiz before the stump stage in the east. The first visits to reach it found neither (two visits, 35
 * seconds between them). The treehouse clearing has its fishing jetty and the neon street the robot
 * owl's copy game, as easy to miss.
 */
/** The Great Hollow's roots as a place to play (OP-347, hallTips.ts): both inner runs are the one find, so the trail leads on from whichever an owl comes to. */
export const ROOTS_SPOT = 'play-roots';

/** The Treetop Commons' rising air as a place to play (OP-363, firstRise.ts): the square that fits inside its column, where Jump held rides it up. */
export const RISE_SPOT = 'play-rise';
const RISE_HALF = Math.floor(COMMONS_THERMAL.r / Math.SQRT2);

export const PLAY_SPOTS: Readonly<Record<string, readonly PlaySpot[]>> = (() => {
  const all: Array<[string, PlaySpot]> = [
    // The lanterns and the quiz: the plaza's, and the Great Hollow's since the Party Grove was folded into it (Dec 1 plan D5).
    ...Object.entries(LANTERN_BEAMS).map(([room, beam]): [string, PlaySpot] => [room, { id: 'play-lanterns', rect: beam.floor }]),
    ...Object.entries(QUIZ_STAGES).map(([room, stage]): [string, PlaySpot] => [room, { id: 'play-quiz', rect: quizFloor(stage) }]),
    // The square that fits inside the fishing spot's reach: anywhere in it the jetty's Fish is there to press.
    [FISHING_ROOM, { id: 'play-fishing', rect: { x: FISHING_SPOT.x - FISH_HALF, y: FISHING_SPOT.y - FISH_HALF, w: FISH_HALF * 2, h: FISH_HALF * 2 } }],
    [COPY_ROOM, { id: 'play-copy', rect: COPY_SPOT }],
    // The Great Hollow's roots (OP-347): the floor before each inner run's first root, one find between them.
    ...rootSpots(HALL_ROOM).map((rect): [string, PlaySpot] => [HALL_ROOM.id, { id: ROOTS_SPOT, rect }]),
    // The Treetop Commons' moonbeam (OP-363): a first flight before the turnstiles.
    [LOBBY_ROOM, { id: RISE_SPOT, rect: { x: COMMONS_THERMAL.pos.x - RISE_HALF, y: COMMONS_THERMAL.pos.y - RISE_HALF, w: RISE_HALF * 2, h: RISE_HALF * 2 } }],
  ];
  const by: Record<string, PlaySpot[]> = {};
  for (const [room, spot] of all) (by[room] ??= []).push(spot);
  return by;
})();

/** The games of `room` an owl at `pos` is standing at now. */
export function playSpotsAt(room: string, pos: Vec2): PlaySpot[] {
  return (PLAY_SPOTS[room] ?? []).filter((s) => pointInRect(pos, s.rect));
}

/**
 * Where the trail leads (OP-338): the nearest of the room's own games not stood at yet, while there is
 * one; after that a doorway, as trailDoor picks it.
 */
export function trailTo<D extends Pick<DoorDef, 'rect' | 'marker' | 'markAt'>>(from: Vec2, spots: readonly PlaySpot[], doors: readonly D[], toPlay: (door: D) => boolean): PlaySpot | D | null {
  return nearestDoor(from, spots) ?? trailDoor(from, doors, toPlay);
}

/** A feather about as long as an owl's foot to its knee: big enough to spot on a phone (the symbol is 32 px). */
export const FEATHER_SCALE = 1.7;

/**
 * How far a feather of the trail is drawn above and below its spot (room px): drawn 18 over it and bobbing
 * 8 higher, the symbol (32 px) at FEATHER_SCALE with its dark edge a quarter bigger again, tipped up to a
 * third of a turn. What lies over a feather (an NPC's name, OP-454) is drawn deeper than this reach.
 */
export const FEATHER_DRAWN = { up: 18 + 8 + Math.ceil((32 * FEATHER_SCALE * 1.25) / 2) + 6, down: Math.ceil((32 * FEATHER_SCALE * 1.25) / 2) - 18 + 6 } as const;

/** How deep a feather lying at `spot` is drawn: just in front of what stands at its spot. */
export function featherDepth(spot: Vec2): number {
  return spot.y + 1;
}

/** How a trail is laid: a feather every `gap` px along the way, none nearer the owl than `start` or the doorway than `end`, at most `most`. */
export const TRAIL = { gap: 110, start: 80, end: 60, most: 10 } as const;

/** The feathers' spots along a way (the owl, then each bend, then the doorway). */
export function trailPoints(way: readonly Vec2[], t: { gap: number; start: number; end: number; most: number } = TRAIL): Vec2[] {
  let total = 0;
  for (let i = 1; i < way.length; i++) total += distance(way[i - 1]!, way[i]!);
  const out: Vec2[] = [];
  for (let at = t.start; at <= total - t.end && out.length < t.most; at += t.gap) {
    let left = at;
    for (let i = 1; i < way.length; i++) {
      const a = way[i - 1]!;
      const b = way[i]!;
      const len = distance(a, b);
      if (left <= len) {
        const k = len === 0 ? 0 : left / len;
        out.push({ x: Math.round(a.x + (b.x - a.x) * k), y: Math.round(a.y + (b.y - a.y) * k) });
        break;
      }
      left -= len;
    }
  }
  return out;
}

/** How far down a feather may be moved to lie whole on the floor (room px), and in what steps. */
export const TRAIL_DROP = { most: 90, step: 6 } as const;

/**
 * The trail's feathers each moved down, where need be, so the whole feather as drawn lies over floor
 * (OP-474): a way that runs close along the foot of something standing in the floor (the ink garden's
 * idol plinth) laid its feathers up over it, the quill drawn on the stone. A feather whose top would be
 * off the floor goes down in TRAIL_DROP steps until its top and its spot are both on the floor; one
 * that finds no such place within TRAIL_DROP.most stays where it was. `onFloor` is the room's own test
 * of where an owl may stand.
 */
export function onTheFloor(points: readonly Vec2[], onFloor: (p: Vec2) => boolean, reach = FEATHER_DRAWN.up): Vec2[] {
  return points.map((p) => {
    const whole = (y: number) => onFloor({ x: p.x, y }) && onFloor({ x: p.x, y: y - reach });
    if (whole(p.y)) return p;
    for (let dy = TRAIL_DROP.step; dy <= TRAIL_DROP.most; dy += TRAIL_DROP.step) if (whole(p.y + dy)) return { x: p.x, y: p.y + dy };
    return p;
  });
}
