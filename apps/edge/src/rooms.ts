import type { RoomDef } from '@owl-park/shared';
import { ROOMS as PARK_ROOMS } from '@owl-park/shared/rooms';
import type { Env } from './env';

export const ROOMS: Record<string, RoomDef> = PARK_ROOMS;

const DEFAULT_CAPS: Record<string, number> = { hub: 80, grove: 40, market: 40 };

export function roomCap(env: Env, roomId: string): number {
  try {
    const caps = env.ROOM_CAPS ? (JSON.parse(env.ROOM_CAPS) as Record<string, number>) : {};
    const c = caps[roomId];
    if (typeof c === 'number' && c >= 1 && c <= 120) return Math.floor(c);
  } catch {
    /* fall through */
  }
  return DEFAULT_CAPS[roomId] ?? 40;
}
