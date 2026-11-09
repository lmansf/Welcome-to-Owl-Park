import { PARTY_SEATS, isNestRoom, isPaintable, isPartyRoom, type RoomDef } from '@owl-park/shared';
import { ROOMS as PARK_ROOMS, roomFor } from '@owl-park/shared/rooms';
import type { Env } from './env';
import { moduleLog } from './logs';

/** ROOM_CAPS that is not JSON is said once per isolate, not at every join. */
let capsWarned = false;

export const ROOMS: Record<string, RoomDef> = PARK_ROOMS;

/** The room with this id: one of the park's, or a nest made from NEST_ROOM; undefined for anything else. */
export function roomDef(id: string): RoomDef | undefined {
  return roomFor(id);
}

/** Whether a socket may ask for this room: one of the park's, any well-formed nest, or any well-formed party game's room (OP-314). */
export function isRoomId(id: string): boolean {
  return roomDef(id) !== undefined;
}

/** A room the ledge painter keeps a draft for (OP-156): one of the tree's (map 2); null for any other id. */
export function paintableRoom(id: string): RoomDef | null {
  const room = roomDef(id);
  return room && isPaintable(room) ? room : null;
}

/** Owls in one nest at once, its owner aside: the owner always gets into its own nest. */
export const NEST_CAP = 12;

const DEFAULT_CAPS: Record<string, number> = { lobby: 80, hub: 80, grove: 40, market: 40, arcade: 40, homes: 40, nest: NEST_CAP, l1: 80 };

/** A room's cap from ROOM_CAPS or the defaults. Every nest shares the `nest` entry; a party game's room (OP-314) holds its four seats, whatever ROOM_CAPS says. */
export function roomCap(env: Env, roomId: string): number {
  if (isPartyRoom(roomId)) return PARTY_SEATS;
  const key = isNestRoom(roomId) ? 'nest' : roomId;
  try {
    const caps = env.ROOM_CAPS ? (JSON.parse(env.ROOM_CAPS) as Record<string, number>) : {};
    const c = Object.hasOwn(caps, key) ? caps[key] : undefined;
    if (typeof c === 'number' && c >= 1 && c <= 120) return Math.floor(c);
  } catch (e) {
    if (!capsWarned) {
      capsWarned = true;
      moduleLog.error('room.join', 'read_failed', 'ROOM_CAPS is not JSON: the default caps hold.', { error: e });
    }
  }
  return (Object.hasOwn(DEFAULT_CAPS, key) ? DEFAULT_CAPS[key] : undefined) ?? 40;
}

/** SPECTATOR_SHARE when it is not set, or not a number from 0 to 1 (OP-191). */
export const DEFAULT_SPECTATOR_SHARE = 0.75;
/** SPECTATOR_SHARE that is not a share is said once per isolate, not at every join. */
let shareWarned = false;

/** The share of a room's cap spectators may join up to (OP-191), from SPECTATOR_SHARE or the default. */
export function spectatorShare(env: Env): number {
  const raw = env.SPECTATOR_SHARE as string | undefined;
  if (raw === undefined || raw === '') return DEFAULT_SPECTATOR_SHARE;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  if (!shareWarned) {
    shareWarned = true;
    moduleLog.error('room.join', 'read_failed', 'SPECTATOR_SHARE is not a share from 0 to 1: the default holds.', { value: String(raw).slice(0, 40), share: DEFAULT_SPECTATOR_SHARE });
  }
  return DEFAULT_SPECTATOR_SHARE;
}

/**
 * How many owls a room may hold and still let a spectator in (OP-191): its cap times the spectators'
 * share, rounded down. Ticket holders come in up to the full cap; nobody inside is sent out.
 */
export function spectatorLimit(env: Env, roomId: string): number {
  return Math.floor(roomCap(env, roomId) * spectatorShare(env));
}

/** The key all the nests are counted under. */
export const NESTS_COUNT = 'nests';
/** The key all the party games' rooms are counted under (OP-314), so no count names a game. */
export const PARTIES_COUNT = 'parties';

/**
 * Population counts as every visitor may see them: the park's rooms by id, and all the nests
 * summed under one `nests` key, so no count ever names a nest. A page only adds them up.
 */
export function publicCounts(rooms: Iterable<readonly [string, { readonly count: number }]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, r] of rooms) {
    const key = isNestRoom(id) ? NESTS_COUNT : isPartyRoom(id) ? PARTIES_COUNT : id;
    out[key] = (out[key] ?? 0) + r.count;
  }
  return out;
}
