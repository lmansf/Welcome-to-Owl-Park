import { isNestRoom, type RoomDef } from '@owl-park/shared';
import { ROOMS as PARK_ROOMS, roomFor } from '@owl-park/shared/rooms';
import type { Env } from './env';

export const ROOMS: Record<string, RoomDef> = PARK_ROOMS;

/** The room with this id: one of the park's, or a nest made from NEST_ROOM; undefined for anything else. */
export function roomDef(id: string): RoomDef | undefined {
  return roomFor(id);
}

/** Whether a socket may ask for this room: one of the park's, or any well-formed nest. */
export function isRoomId(id: string): boolean {
  return roomDef(id) !== undefined;
}

/** Owls in one nest at once, its owner aside: the owner always gets into its own nest. */
export const NEST_CAP = 12;

const DEFAULT_CAPS: Record<string, number> = { lobby: 80, hub: 80, grove: 40, market: 40, homes: 40, nest: NEST_CAP };

/** A room's cap from ROOM_CAPS or the defaults. Every nest shares the `nest` entry. */
export function roomCap(env: Env, roomId: string): number {
  const key = isNestRoom(roomId) ? 'nest' : roomId;
  try {
    const caps = env.ROOM_CAPS ? (JSON.parse(env.ROOM_CAPS) as Record<string, number>) : {};
    const c = Object.hasOwn(caps, key) ? caps[key] : undefined;
    if (typeof c === 'number' && c >= 1 && c <= 120) return Math.floor(c);
  } catch {
    /* fall through */
  }
  return (Object.hasOwn(DEFAULT_CAPS, key) ? DEFAULT_CAPS[key] : undefined) ?? 40;
}

/** The key all the nests are counted under. */
export const NESTS_COUNT = 'nests';

/**
 * Population counts as every visitor may see them: the park's rooms by id, and all the nests
 * summed under one `nests` key, so no count ever names a nest. A page only adds them up.
 */
export function publicCounts(rooms: Iterable<readonly [string, { readonly count: number }]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, r] of rooms) {
    const key = isNestRoom(id) ? NESTS_COUNT : id;
    out[key] = (out[key] ?? 0) + r.count;
  }
  return out;
}
