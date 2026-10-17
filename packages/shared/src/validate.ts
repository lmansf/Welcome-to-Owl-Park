/**
 * Structural validation for anything that arrives from another visitor. Peers share public
 * channels, so every field is untrusted until it has the expected shape and range.
 */
import { isHexColour, isPledge } from './look';
import type { OwlLook, ParkMessage, PlayerState, Vec2, Walk } from './protocol';
import { ROOM_H, ROOM_W } from './room';

export const MAX_ID_LENGTH = 64;

export function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function isId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LENGTH;
}

export function isVec2(v: unknown, maxX = ROOM_W, maxY = ROOM_H): v is Vec2 {
  return (
    isObj(v) &&
    typeof v['x'] === 'number' &&
    typeof v['y'] === 'number' &&
    Number.isFinite(v['x']) &&
    Number.isFinite(v['y']) &&
    v['x'] >= 0 &&
    v['x'] <= maxX &&
    v['y'] >= 0 &&
    v['y'] <= maxY
  );
}

export function isLook(v: unknown): v is OwlLook {
  return isObj(v) && isHexColour(v['body']) && isHexColour(v['belly']) && isHexColour(v['accent']) && (v['pledge'] === undefined || isPledge(v['pledge']));
}

export function isWalk(v: unknown): v is Walk {
  return isObj(v) && isVec2(v['from']) && isVec2(v['to']) && typeof v['startedAt'] === 'number' && Number.isFinite(v['startedAt']);
}

export function isPlayerState(v: unknown): v is PlayerState {
  return isObj(v) && isId(v['id']) && isLook(v['look']) && isVec2(v['pos']) && (v['walk'] === null || isWalk(v['walk']));
}

export function isParkMessage(value: unknown): value is ParkMessage {
  if (!isObj(value)) return false;
  switch (value['t']) {
    case 'hello':
    case 'state':
      return isPlayerState(value['state']);
    case 'move':
      return isId(value['id']) && isWalk(value['walk']);
    case 'bye':
      return isId(value['id']);
    default:
      return false;
  }
}
