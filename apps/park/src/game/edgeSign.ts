import type { DoorDef, RoomDef } from '@owl-park/shared';

/**
 * How far in from the room's own end a sign at a doorway on that end keeps (room px). The nests'
 * street's "To the park" stood at the room's very edge, over its doorway, so the screen's edge cut its
 * arrow off and the owl stepping into the doorway stood over its words (OP-461, the Nov 25 cleanup walk).
 */
export const EDGE_SIGN_IN = 96;

/**
 * Where a sign by a doorway at one end of a room stands (street.ts, edgeSign): its end nearest the
 * doorway at `x`, and which end that is (`west`: the sign runs east from x). Kept EDGE_SIGN_IN in from
 * the room's end, so its words and arrow are whole on screen with the camera at that end.
 */
export function edgeSignAt(room: Pick<RoomDef, 'size'>, d: Pick<DoorDef, 'rect' | 'marker'>): { x: number; y: number; west: boolean } {
  const m = d.marker ?? { x: d.rect.x + d.rect.w / 2, y: d.rect.y };
  const west = m.x < room.size.w / 2;
  const x = west ? Math.max(EDGE_SIGN_IN, d.rect.x + 16) : Math.min(room.size.w - EDGE_SIGN_IN, d.rect.x + d.rect.w - 16);
  return { x, y: m.y - 12, west };
}
