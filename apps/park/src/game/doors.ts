import { distanceToRect, type Rect, type Vec2 } from '@owl-park/shared';

/**
 * How near a walk's end must be to a doorway to mean "through it": a tap on the painted arch stops
 * at the floor's edge, just short of the doorway.
 */
export const DOOR_AIM_PX = 48;

/**
 * Whether an owl standing in a doorway goes through it. Walking up to do something (talk, flop,
 * browse) never does, and nor does a walk that only passes the doorway on its way across a wide
 * room. A walk that ends in or at the doorway does, and so do the held keys and an owl standing
 * still in it.
 */
export function takesDoorway(rect: Rect, walkTo: Vec2 | null, fromKeys: boolean, onErrand: boolean): boolean {
  if (onErrand) return false;
  return fromKeys || walkTo === null || distanceToRect(walkTo, rect) <= DOOR_AIM_PX;
}
