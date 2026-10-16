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
        { x: 0, y: 604 },
        { x: 206, y: 604 },
        { x: 206, y: 634 },
        { x: 268, y: 634 },
        { x: 300, y: 566 },
        { x: 420, y: 600 },
        { x: 600, y: 612 },
        { x: 800, y: 630 },
        { x: 1000, y: 612 },
        { x: 1180, y: 600 },
        { x: 1300, y: 566 },
        { x: 1332, y: 634 },
        { x: 1394, y: 634 },
        { x: 1394, y: 604 },
        { x: 1600, y: 604 },
        { x: 1600, y: 900 },
        { x: 0, y: 900 },
      ],
    ],
    spawns: { 'default': { x: 800, y: 730 }, 'from-grove': { x: 220, y: 690 }, 'from-market': { x: 1380, y: 690 } },
    doors: [
      { id: 'to-grove', rect: { x: 0, y: 604, w: 140, h: 120 }, to: { room: 'grove', spawn: 'default' }, marker: { x: 92, y: 560 } },
      { id: 'to-market', rect: { x: 1460, y: 604, w: 140, h: 120 }, to: { room: 'market', spawn: 'default' }, marker: { x: 1508, y: 560 } },
      { id: 'closed-a', rect: { x: 430, y: 560, w: 140, h: 90 }, closedSign: 'Not Yet Fledged', marker: { x: 500, y: 598 } },
      { id: 'closed-b', rect: { x: 1030, y: 560, w: 140, h: 90 }, closedSign: 'Hatching Soon', marker: { x: 1100, y: 598 } },
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
        { x: 330, y: 510 },
        { x: 1270, y: 510 },
        { x: 1420, y: 545 },
        { x: 1600, y: 640 },
        { x: 1600, y: 850 },
        { x: 1470, y: 870 },
        { x: 1250, y: 880 },
        { x: 360, y: 880 },
        { x: 290, y: 790 },
        { x: 250, y: 600 },
        { x: 262, y: 540 },
      ],
    ],
    spawns: { 'default': { x: 1406, y: 760 } },
    doors: [{ id: 'to-hub', rect: { x: 1486, y: 630, w: 114, h: 250 }, to: { room: 'hub', spawn: 'from-grove' }, marker: { x: 1545, y: 745 } }],
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
  hub: { 'tree-base': { x: 800, y: 628 } },
  grove: { guardian: { x: 800, y: 430 }, gathering: { x: 800, y: 612 } },
  market: { robot: { x: 1150, y: 420 }, shop: { x: 1100, y: 440 } },
};

export function getRoom(id: string): RoomDef {
  return ROOMS[id] ?? ROOMS['hub']!;
}
