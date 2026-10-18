import { ROOM_H, ROOM_W, type RoomDef } from '../src/room';

/**
 * Room registry shared by the browser client and the room server, so both clamp walks
 * with byte-identical geometry. Ids are neutral words on purpose: realm names stay out of
 * this public repository and visitors see no names in the park.
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
    spawns: { 'default': { x: 800, y: 730 }, 'from-grove': { x: 200, y: 740 }, 'from-market': { x: 1390, y: 750 } },
    doors: [
      { id: 'to-grove', rect: { x: 100, y: 610, w: 130, h: 90 }, to: { room: 'grove', spawn: 'default' }, marker: { x: 165, y: 560 } },
      { id: 'to-market', rect: { x: 1340, y: 610, w: 150, h: 100 }, to: { room: 'market', spawn: 'default' }, marker: { x: 1415, y: 560 } },
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
        // The lawn, then the trunk is cut out above the roots: owls walk in straight lines, so
        // the floor stays open across the front of the roots and the hollow's threshold.
        { x: 330, y: 510 },
        { x: 950, y: 510 },
        { x: 925, y: 610 },
        { x: 905, y: 705 },
        { x: 1450, y: 705 },
        { x: 1600, y: 660 },
        { x: 1600, y: 850 },
        { x: 1470, y: 870 },
        { x: 1250, y: 880 },
        { x: 360, y: 880 },
        { x: 290, y: 790 },
        { x: 250, y: 600 },
        { x: 262, y: 540 },
      ],
    ],
    spawns: { 'default': { x: 1010, y: 860 } },
    doors: [
      { id: 'to-hub', rect: { x: 1075, y: 775, w: 125, h: 80 }, to: { room: 'hub', spawn: 'from-grove' }, marker: { x: 1137, y: 700 } },
      // The gathering spot beneath the guardian: standing here lets a ticket-holder vote for this realm.
      { id: 'idol', rect: { x: 690, y: 560, w: 220, h: 120 }, marker: { x: 800, y: 612 } },
    ],
  },
  market: {
    id: 'market',
    size,
    background: 'market',
    foreground: 'market-fg',
    mood: 'neon',
    walkable: [
      [
        // The street, from the curb in front of the stalls down; the doorway's threshold on the left.
        { x: 0, y: 690 },
        { x: 1500, y: 690 },
        { x: 1600, y: 700 },
        { x: 1600, y: 720 },
        { x: 1420, y: 740 },
        { x: 1380, y: 885 },
        { x: 280, y: 885 },
        { x: 250, y: 830 },
        { x: 170, y: 760 },
        { x: 0, y: 760 },
      ],
    ],
    spawns: { 'default': { x: 330, y: 740 } },
    doors: [
      { id: 'to-hub', rect: { x: 0, y: 600, w: 120, h: 220 }, to: { room: 'hub', spawn: 'from-market' }, marker: { x: 70, y: 580 } },
      { id: 'shop', rect: { x: 960, y: 690, w: 170, h: 80 }, marker: { x: 1080, y: 560 } },
      // Beneath the giant robot owl: standing here lets a ticket-holder vote for this realm.
      { id: 'idol', rect: { x: 1150, y: 710, w: 220, h: 100 }, marker: { x: 1260, y: 760 } },
    ],
  },
};

/** Named anchors for large set pieces drawn by the scene (depth-sorted with the owls). */
export const ANCHORS: Record<string, Record<string, { x: number; y: number }>> = {
  hub: { 'tree-base': { x: 800, y: 628 } },
  grove: { guardian: { x: 800, y: 430 }, gathering: { x: 800, y: 612 } },
  market: { robot: { x: 1240, y: 520 }, shop: { x: 1080, y: 560 } },
};

export function getRoom(id: string): RoomDef {
  return Object.hasOwn(ROOMS, id) ? ROOMS[id]! : ROOMS['hub']!;
}
