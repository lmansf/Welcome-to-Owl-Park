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
  /**
   * Logical size in room pixels: one screen is ROOM_W x ROOM_H, and a room may be wider or taller,
   * up to ROOM_MAX_W x ROOM_MAX_H. The camera follows the owl across anything bigger than the screen.
   */
  size: { w: number; h: number };
  /** Image drawn behind the owls, for a room of one tile. A bigger room lists `backgrounds`. */
  background: string;
  /** Optional image drawn in front of the owls (railings, lantern posts), for a room of one tile. */
  foreground?: string;
  /**
   * A room bigger than one screen is painted in tiles: each tile is ROOM_W x ROOM_H art placed at
   * its offset in room pixels. When present these replace `background` / `foreground`.
   */
  backgrounds?: RoomTile[];
  foregrounds?: RoomTile[];
  /** Union of polygons the owl may stand on. */
  walkable: Polygon[];
  /** Named spawn points; `default` is required. */
  spawns: Record<string, Vec2>;
  /**
   * Doorways and interaction spots. Walking into a door with `to` changes room; a closed door
   * shows its sign; `shop` and `idol` are spots that offer the gift shop and the Realm Vote.
   * What a spot does is the client's `interactions` table in RoomScene: standing in one shows
   * its button, and E runs it.
   */
  doors: DoorDef[];
  /**
   * Hiding spots where a visitor's collectible finds can appear (only the finder sees them).
   * Each is on the floor, at least 60 px from every doorway and spot, and reachable by a straight
   * walk from the default spawn that never crosses an exit (unit-tested in rooms.test.ts).
   */
  spots?: Vec2[];
  /** Ambient mood used by the scene for lighting and particles (`arcade`: neon indoors, no rain). */
  mood: 'hub' | 'dusk' | 'neon' | 'arcade';
}

/** One ROOM_W x ROOM_H piece of a room's art, at its top-left corner in room pixels. */
export interface RoomTile {
  key: string;
  x: number;
  y: number;
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
/** The biggest a room may be (four screens wide, two high): positions beyond it are refused. */
export const ROOM_MAX_W = 6400;
export const ROOM_MAX_H = 1800;

/** The tiles drawn behind the owls, in drawing order. */
export function backgroundTiles(room: RoomDef): RoomTile[] {
  return room.backgrounds ?? [{ key: room.background, x: 0, y: 0 }];
}

/** The tiles drawn in front of the owls, in drawing order (none for a room without overlays). */
export function foregroundTiles(room: RoomDef): RoomTile[] {
  return room.foregrounds ?? (room.foreground ? [{ key: room.foreground, x: 0, y: 0 }] : []);
}

export function findSpawn(room: RoomDef, name: string | undefined): Vec2 {
  const key = name ?? 'default';
  return (Object.hasOwn(room.spawns, key) ? room.spawns[key] : undefined) ?? room.spawns['default'] ?? { x: room.size.w / 2, y: room.size.h / 2 };
}
