import { doorRects, isWalkable, pointInRect, snapToWalkable, type DoorDef, type Polygon, type Rect, type Vec2 } from '@owl-park/shared';

/** How much of a doorway at a room's side the edge strip leaves the owl to walk into (room px). */
const DOOR_LEFT_OPEN = 10;
/** Far enough above and below any room to cover its whole height. */
const TALL = 100_000;

/**
 * The strips along a room's two sides the owl keeps out of, so the whole owl stays on screen where the
 * floor runs to the room's edge (OP-296): the camera stops at the edge, and an owl walked to it stood
 * half past it. `half` is half the owl's width in room px. A doorway at a side narrows that side's
 * strip so the owl can still walk into it (at least DOOR_LEFT_OPEN of it), and so does the rest of
 * that side's edge that takes the owl through it (DoorDef.alsoAt, OP-499).
 */
export function sideEdges(room: { size: { w: number }; doors: readonly Pick<DoorDef, 'rect' | 'alsoAt'>[] }, half: number): Rect[] {
  if (!(half > 0)) return [];
  const w = room.size.w;
  let left = half;
  let right = half;
  for (const rect of room.doors.flatMap(doorRects)) {
    if (rect.x < half) left = Math.min(left, rect.x + rect.w - DOOR_LEFT_OPEN);
    if (rect.x + rect.w > w - half) right = Math.min(right, w - rect.x - DOOR_LEFT_OPEN);
  }
  const out: Rect[] = [];
  if (left > 0) out.push({ x: -TALL, y: -TALL, w: TALL + left, h: 2 * TALL });
  if (right > 0) out.push({ x: w - right, y: -TALL, w: TALL + right, h: 2 * TALL });
  return out;
}

/**
 * Where a walk to `p` heads when `p` lies in one of the side strips (sideEdges): a pixel in from the
 * strip, on the floor the owl may stand on, else `p` itself. A tap's way round what stands between
 * (wayAround) is found only to floor that is open, so a walk aimed into a strip, as the nests' street's
 * way to the park is, its doorway's middle in the strip, had none: the owl walked the straight line and
 * stood at the first thing in it, the log by the bird bath (OP-499).
 */
export function offSideEdges(p: Vec2, edges: readonly Rect[]): Vec2 {
  let x = p.x;
  for (const e of edges) {
    if (!pointInRect({ x, y: p.y }, e)) continue;
    x = e.x < 0 ? e.x + e.w + 1 : e.x - 1;
  }
  return x === p.x ? p : { x, y: p.y };
}

/**
 * Where a walk to `target` heads on `walkable` (the page's walkTo): the target snapped onto the floor,
 * moved in off a side strip (offSideEdges) where that is floor too, so a way round what stands between
 * can be found to it (OP-499).
 */
export function walkAim(target: Vec2, walkable: Polygon[], edges: readonly Rect[]): Vec2 {
  const snapped = snapToWalkable(target, walkable);
  const inside = offSideEdges(snapped, edges);
  return inside !== snapped && isWalkable(inside, walkable) ? inside : snapped;
}
