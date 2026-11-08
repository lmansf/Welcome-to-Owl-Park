import type { DoorDef, Rect } from '@owl-park/shared';

/** How much of a doorway at a room's side the edge strip leaves the owl to walk into (room px). */
const DOOR_LEFT_OPEN = 10;
/** Far enough above and below any room to cover its whole height. */
const TALL = 100_000;

/**
 * The strips along a room's two sides the owl keeps out of, so the whole owl stays on screen where the
 * floor runs to the room's edge (OP-296): the camera stops at the edge, and an owl walked to it stood
 * half past it. `half` is half the owl's width in room px. A doorway at a side narrows that side's
 * strip so the owl can still walk into it (at least DOOR_LEFT_OPEN of it).
 */
export function sideEdges(room: { size: { w: number }; doors: readonly Pick<DoorDef, 'rect'>[] }, half: number): Rect[] {
  if (!(half > 0)) return [];
  const w = room.size.w;
  let left = half;
  let right = half;
  for (const { rect } of room.doors) {
    if (rect.x < half) left = Math.min(left, rect.x + rect.w - DOOR_LEFT_OPEN);
    if (rect.x + rect.w > w - half) right = Math.min(right, w - rect.x - DOOR_LEFT_OPEN);
  }
  const out: Rect[] = [];
  if (left > 0) out.push({ x: -TALL, y: -TALL, w: TALL + left, h: 2 * TALL });
  if (right > 0) out.push({ x: w - right, y: -TALL, w: TALL + right, h: 2 * TALL });
  return out;
}
