import type { Polygon, Rect } from './geometry';
import type { Vec2 } from './protocol';

/**
 * Data-driven room definition. Art is swappable: point `background` and
 * `foreground` at new images, redraw `walkable`, and the room works unchanged.
 *
 * Room ids are neutral words so that nothing in this public repository leaks
 * unreleased realm names. Visitors see no names in the park (per canon).
 */
export interface RoomDef {
  id: string;
  /** Logical size in room pixels. Every room is 1600 x 900 for v1. */
  size: { w: number; h: number };
  /** Image drawn behind the owls. */
  background: string;
  /** Optional image drawn in front of the owls (railings, lantern posts). */
  foreground?: string;
  /** Union of polygons the owl may stand on. */
  walkable: Polygon[];
  /** Named spawn points; `default` is required. */
  spawns: Record<string, Vec2>;
  /** Doorways. Walking into one changes room (or shows a closed sign). */
  doors: DoorDef[];
  /** Ambient mood used by the scene for lighting and particles. */
  mood: 'hub' | 'dusk' | 'neon';
}

export interface DoorDef {
  id: string;
  /** Trigger area in room pixels. */
  rect: Rect;
  /** Open doors lead somewhere. Closed doors show an under-construction sign. */
  to?: { room: string; spawn: string };
  /** Public sign wording for closed realms (approved phrases only). */
  closedSign?: string;
  /** Where to place a visual hint (sign, glow) for the door. */
  marker?: Vec2;
}

export const ROOM_W = 1600;
export const ROOM_H = 900;

export function findSpawn(room: RoomDef, name: string | undefined): Vec2 {
  const key = name ?? 'default';
  return (Object.hasOwn(room.spawns, key) ? room.spawns[key] : undefined) ?? room.spawns['default'] ?? { x: room.size.w / 2, y: room.size.h / 2 };
}
