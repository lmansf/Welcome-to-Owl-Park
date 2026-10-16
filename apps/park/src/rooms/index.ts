import { ROOM_H, ROOM_W, type RoomDef } from '@owl-park/shared';

/**
 * Room registry. Geometry (walkable polygons, doors, spawns) is authored alongside
 * the art; see docs/ART-PIPELINE.md. Ids are neutral words on purpose: realm names
 * stay out of this public repository and visitors see no names in the park.
 *
 * Public sign phrases for closed realms are the four approved wordings only.
 */
export const CLOSED_SIGNS = ['Not Yet Fledged', 'Closed for Molting', 'Pardon Our Feathers', 'Hatching Soon'] as const;

const size = { w: ROOM_W, h: ROOM_H };

export const ROOMS: Record<string, RoomDef> = {
  hub: {
    id: 'hub',
    size,
    background: 'hub',
    foreground: 'hub-fg',
    mood: 'hub',
    walkable: [
      [
        { x: 40, y: 560 },
        { x: 560, y: 470 },
        { x: 1040, y: 470 },
        { x: 1560, y: 560 },
        { x: 1580, y: 880 },
        { x: 20, y: 880 },
      ],
    ],
    spawns: {
      default: { x: 800, y: 700 },
      'from-grove': { x: 200, y: 760 },
      'from-market': { x: 1400, y: 760 },
    },
    doors: [
      { id: 'to-grove', rect: { x: 0, y: 620, w: 110, h: 260 }, to: { room: 'grove', spawn: 'default' }, marker: { x: 60, y: 600 } },
      { id: 'to-market', rect: { x: 1490, y: 620, w: 110, h: 260 }, to: { room: 'market', spawn: 'default' }, marker: { x: 1540, y: 600 } },
      { id: 'closed-a', rect: { x: 330, y: 470, w: 160, h: 70 }, closedSign: 'Not Yet Fledged', marker: { x: 410, y: 500 } },
      { id: 'closed-b', rect: { x: 1110, y: 470, w: 160, h: 70 }, closedSign: 'Hatching Soon', marker: { x: 1190, y: 500 } },
    ],
  },
  grove: {
    id: 'grove',
    size,
    background: 'grove',
    foreground: 'grove-fg',
    mood: 'dusk',
    walkable: [
      [
        { x: 60, y: 520 },
        { x: 500, y: 460 },
        { x: 1100, y: 460 },
        { x: 1560, y: 540 },
        { x: 1590, y: 880 },
        { x: 20, y: 880 },
      ],
    ],
    spawns: { default: { x: 1400, y: 760 } },
    doors: [{ id: 'to-hub', rect: { x: 1490, y: 620, w: 110, h: 260 }, to: { room: 'hub', spawn: 'from-grove' }, marker: { x: 1540, y: 600 } }],
  },
  market: {
    id: 'market',
    size,
    background: 'market',
    foreground: 'market-fg',
    mood: 'neon',
    walkable: [
      [
        { x: 40, y: 540 },
        { x: 480, y: 470 },
        { x: 1120, y: 470 },
        { x: 1560, y: 540 },
        { x: 1590, y: 880 },
        { x: 20, y: 880 },
      ],
    ],
    spawns: { default: { x: 200, y: 760 } },
    doors: [
      { id: 'to-hub', rect: { x: 0, y: 620, w: 110, h: 260 }, to: { room: 'hub', spawn: 'from-market' }, marker: { x: 60, y: 600 } },
      { id: 'shop', rect: { x: 980, y: 480, w: 240, h: 120 }, marker: { x: 1100, y: 440 } },
    ],
  },
};

/** Named anchors for large set pieces drawn by the scene (depth-sorted with the owls). */
export const ANCHORS: Record<string, Record<string, { x: number; y: number }>> = {
  hub: { 'tree-base': { x: 800, y: 470 } },
  grove: { guardian: { x: 800, y: 430 }, gathering: { x: 800, y: 620 } },
  market: { robot: { x: 1150, y: 420 }, shop: { x: 1100, y: 440 } },
};

export function getRoom(id: string): RoomDef {
  return ROOMS[id] ?? ROOMS['hub']!;
}
