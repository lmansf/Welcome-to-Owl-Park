/**
 * Where the party game lives (OP-314): the Old Stump in the Great Hollow, with its four seats,
 * and the game's own private room, one for each game, `party-<id>`, made from PARTY_ROOM (../rooms)
 * as a nest is from NEST_ROOM. At most four owls are ever in one.
 */
import type { Vec2 } from '../protocol';

/**
 * The Great Hollow (rooms/hollowHall.ts, HALL_ID; a test holds the two the same). Until Nov 19 the stump
 * stood in the Party Grove, the room still called `hub`; the owner's word that day: "The party grove
 * doesn't make sense. We already have a central hub", and "Fold into the hub". The party came in through
 * the trunk's door and set up across the front of the hollow, round where owls land: the tag ring just in
 * from the trunk's door, the bowling lane along the front between the trunk's door and the hatch, and the
 * Old Stump on the ink-wash side, where four can sit out of the way of the games that run about.
 */
export const STUMP_ROOM = 'm3-hall';
/** The stump's middle on the hollow's floor: on the front's west side, in front of the ink-wash roots, between that Commons' plaza and the vote desk. */
export const STUMP_AT: Vec2 = { x: 1880, y: 1540 };
/** The stump as drawn (size box): its width and height in room px, its foot at STUMP_AT. */
export const STUMP_SIZE = { w: 300, h: 150 } as const;
/** The four seats round the stump: west, north, east, south. */
export const STUMP_SEATS: readonly Vec2[] = [
  { x: STUMP_AT.x - 210, y: STUMP_AT.y },
  { x: STUMP_AT.x, y: STUMP_AT.y - 95 },
  { x: STUMP_AT.x + 210, y: STUMP_AT.y },
  { x: STUMP_AT.x, y: STUMP_AT.y + 95 },
];
export const SEAT_SIZE = { w: 80, h: 40 } as const;
/** How close to the stump's middle an owl's feet must be to sit (room px; the room allows its slack too). */
export const STUMP_REACH = 280;
/** Where an owl back from a game comes out in the Great Hollow: in front of the stump. */
export const FROM_STUMP_SPAWN = 'from-stump';
export const FROM_STUMP_AT: Vec2 = { x: STUMP_AT.x, y: STUMP_AT.y + 170 };

export const PARTY_ID_LENGTH = 8;
const PARTY_ROOM_ID = /^party-([a-z0-9]{8})$/;

/** Whether a room id is one of the party game's private rooms. */
export function isPartyRoom(id: unknown): id is string {
  return typeof id === 'string' && PARTY_ROOM_ID.test(id);
}

/** A new game's room id, from a uniform source (the server's cryptographic one). */
export function newPartyRoomId(random: () => number): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < PARTY_ID_LENGTH; i++) id += abc[Math.min(abc.length - 1, Math.floor(random() * abc.length))];
  return `party-${id}`;
}

/** The nightly restart (OP-181, apps/edge/src/crons.ts RESTART_CRON): every day at this hour, UTC. */
export const RESTART_HOUR_UTC = 9;

/** When the park next restarts for the night (ms), after `now`. */
export function nextRestartAt(now: number): number {
  const d = new Date(now);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), RESTART_HOUR_UTC);
  return today > now ? today : today + 24 * 3600_000;
}
