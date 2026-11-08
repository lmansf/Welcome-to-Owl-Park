/**
 * Layered room art: a room drawn from four painted layers per screen in place of its own tiles, fitted to
 * the room as it is (its floor, perches and doorways do not move): a backdrop far behind (rate 0.5), a
 * middle distance (0.75), the playable layer that scrolls with the room (1), and an overlay in front of
 * the owls (1.2). Each layer is one picture per screen at the room's tile size, shipped in public/art as
 * `<look>-<layer>-<screen>.webp`; the backdrop is opaque, the other three see-through.
 *
 * `partygrove` (Nov 8): the Party Grove (`hub`), generated with Higgsfield (seedream 4.5) from a layout
 * guide of the room, cut into screens and keyed by hand; the owner kept the look and turned it on for
 * everyone. It is the look every page draws; `?art=old` draws the room's earlier paintings instead.
 */
import { ROOM_W, type RoomDef, type RoomTile } from '@owl-park/shared';

export interface ArtLook {
  /** The room it draws. */
  room: string;
  /** How many screens it has, left to right, each with its four layers. */
  screens: number;
}

export const ART_LOOKS: Record<string, ArtLook> = {
  partygrove: { room: 'hub', screens: 3 },
};

/** The look every page draws unless it asks otherwise. */
export const DEFAULT_ART_LOOK = 'partygrove';

/** What `?art=old` asks for: the rooms' earlier paintings, with no layered look. */
export const OLD_ART = 'old';

/** The layered look this page draws: the default, another look by name, or none for `?art=old`. */
export function artLookWanted(asked: string | null): string | null {
  if (asked === OLD_ART) return null;
  return asked && Object.hasOwn(ART_LOOKS, asked) ? asked : DEFAULT_ART_LOOK;
}

/** Room pixels each layer fades over where it meets a neighbour (as the tree's layers do). */
const FADE = { back: 220, mid: 230, front: 120 };

export const LAYERS = ['back', 'mid', 'play', 'front'] as const;
type Layer = (typeof LAYERS)[number];

/** The art key (and file name) of a look's layer on screen `i`. */
export function lookKey(name: string, layer: Layer, i: number): string {
  return `${name}-${layer}-${i}`;
}

/** Every art key a look draws. */
export function lookKeys(name: string): string[] {
  const look = ART_LOOKS[name];
  if (!look) return [];
  return Array.from({ length: look.screens }, (_, i) => LAYERS.map((l) => lookKey(name, l, i))).flat();
}

/** Every art key of every look: what the park can draw for them. */
export function allLookKeys(): string[] {
  return Object.keys(ART_LOOKS).flatMap(lookKeys);
}

/**
 * The room as look `name` draws it: its tiles replaced by the look's four layers, everything else
 * (floor, perches, doorways) as it was. A room the look is not for, or no look, comes back as it is.
 */
export function artLookRoom(room: RoomDef, name: string | null | undefined): RoomDef {
  const look = name ? ART_LOOKS[name] : undefined;
  if (!look || look.room !== room.id) return room;
  const n = look.screens;
  const edges = (i: number, w: number) => ({ ...(i > 0 ? { left: w } : {}), ...(i < n - 1 ? { right: w } : {}) });
  // A faded tile lies over its neighbour, so the screens with two fading edges come last.
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Number(a > 0 && a < n - 1) - Number(b > 0 && b < n - 1));
  const layer = (l: Layer, rate: number, fade: number | null): RoomTile[] =>
    order.map((i) => ({ key: lookKey(name!, l, i), x: i * ROOM_W, y: 0, rate, ...(fade ? { fade: edges(i, fade) } : { plain: true }) }));
  return {
    ...room,
    backgrounds: [...layer('back', 0.5, FADE.back), ...layer('mid', 0.75, FADE.mid), ...layer('play', 1, null)],
    foregrounds: layer('front', 1.2, FADE.front),
  };
}
