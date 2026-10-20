import type { Vec2 } from '../src/protocol';
import { ROOM_H, ROOM_W, type RoomDef } from '../src/room';

/**
 * Room registry shared by the browser client and the room server, so both clamp walks
 * with byte-identical geometry. Ids are neutral words on purpose: realm names stay out of
 * this public repository and visitors see no names in the park.
 *
 * The hub and the grove are three screens wide and the market two: each room's approved painting
 * is its middle screen (the market's first) and the wings were painted out from it, so positions
 * on the painting are its old ones plus one screen in the hub and the grove.
 *
 * The lobby is the park's front entrance, where every visitor arrives: the ticket booth on one
 * side, the turnstile gate into the hub on the other. It is two screens wide, its painting the
 * east screen. It is outside the park, so it has no hiding spots and quests never send owls there.
 */
export const CLOSED_SIGNS = ['Not Yet Fledged', 'Closed for Molting', 'Pardon Our Feathers', 'Hatching Soon'] as const;

export const ROOMS: Record<string, RoomDef> = {
  hub: {
    id: 'hub',
    size: { w: 3 * ROOM_W, h: ROOM_H },
    background: 'hub',
    backgrounds: [
      { key: 'hub-west', x: 0, y: 0 },
      { key: 'hub', x: ROOM_W, y: 0 },
      { key: 'hub-east', x: 2 * ROOM_W, y: 0 },
    ],
    // The painting's corner frame of bark and roots is not drawn in the wide hollow: its straight
    // cuts would show at the joins.
    foregrounds: [],
    mood: 'hub',
    walkable: [
      [
        // One floor across the three screens: the west wing's bay under the lantern beam, the hollow's
        // nave between the four doorways, and the east wing's bay before the stump stage.
        { x: 140, y: 900 },
        { x: 150, y: 770 },
        { x: 250, y: 740 },
        { x: 330, y: 760 },
        { x: 420, y: 785 },
        { x: 480, y: 762 },
        { x: 560, y: 752 },
        { x: 620, y: 712 },
        { x: 700, y: 698 },
        { x: 1250, y: 698 },
        { x: 1400, y: 702 },
        { x: 1600, y: 702 },
        { x: 1655, y: 700 },
        { x: 1668, y: 604 },
        { x: 1806, y: 604 },
        { x: 1806, y: 634 },
        { x: 1868, y: 634 },
        { x: 1900, y: 566 },
        { x: 2020, y: 600 },
        { x: 2200, y: 612 },
        { x: 2400, y: 630 },
        { x: 2600, y: 612 },
        { x: 2780, y: 600 },
        { x: 2900, y: 566 },
        { x: 2932, y: 634 },
        { x: 2994, y: 634 },
        { x: 2994, y: 604 },
        { x: 3100, y: 604 },
        { x: 3112, y: 700 },
        { x: 3200, y: 704 },
        { x: 3300, y: 690 },
        { x: 3500, y: 682 },
        { x: 3790, y: 690 },
        { x: 4060, y: 690 },
        { x: 4150, y: 700 },
        { x: 4300, y: 745 },
        { x: 4450, y: 760 },
        { x: 4600, y: 790 },
        { x: 4700, y: 830 },
        { x: 4720, y: 900 },
      ],
    ],
    spawns: { 'default': { x: 2400, y: 730 }, 'from-grove': { x: 1800, y: 740 }, 'from-market': { x: 2990, y: 750 } },
    doors: [
      { id: 'to-grove', rect: { x: 1700, y: 610, w: 130, h: 90 }, to: { room: 'grove', spawn: 'default' }, marker: { x: 1765, y: 560 } },
      { id: 'to-market', rect: { x: 2940, y: 610, w: 150, h: 100 }, to: { room: 'market', spawn: 'default' }, marker: { x: 3015, y: 560 } },
      { id: 'closed-a', rect: { x: 2030, y: 560, w: 140, h: 90 }, closedSign: 'Not Yet Fledged', marker: { x: 2100, y: 598 } },
      { id: 'closed-b', rect: { x: 2630, y: 560, w: 140, h: 90 }, closedSign: 'Hatching Soon', marker: { x: 2700, y: 598 } },
    ],
    spots: [
      { x: 300, y: 840 },
      { x: 520, y: 810 },
      { x: 760, y: 760 },
      { x: 980, y: 860 },
      { x: 1200, y: 760 },
      { x: 1450, y: 840 },
      { x: 1660, y: 820 },
      { x: 1930, y: 820 },
      { x: 1980, y: 720 },
      { x: 2120, y: 760 },
      { x: 2250, y: 860 },
      { x: 2400, y: 650 },
      { x: 2560, y: 840 },
      { x: 2720, y: 760 },
      { x: 2870, y: 850 },
      { x: 3080, y: 820 },
      { x: 3300, y: 800 },
      { x: 3460, y: 710 },
      { x: 3650, y: 880 },
      { x: 3950, y: 885 },
      { x: 4380, y: 800 },
      { x: 4560, y: 870 },
    ],
  },
  grove: {
    id: 'grove',
    size: { w: 3 * ROOM_W, h: ROOM_H },
    background: 'grove',
    backgrounds: [
      { key: 'grove-west', x: 0, y: 0 },
      { key: 'grove', x: ROOM_W, y: 0 },
      { key: 'grove-east', x: 2 * ROOM_W, y: 0 },
    ],
    // The overlay's string of lanterns hangs at the west end; the rest stays on the painting.
    foregrounds: [
      { key: 'grove-west-fg', x: 0, y: 0 },
      { key: 'grove-fg', x: ROOM_W, y: 0 },
    ],
    mood: 'dusk',
    walkable: [
      [
        // The west wing: the lawn down to the pond's near bank.
        { x: 390, y: 668 },
        { x: 560, y: 664 },
        { x: 722, y: 672 },
        { x: 1080, y: 668 },
        { x: 1200, y: 672 },
        { x: 1420, y: 664 },
        { x: 1520, y: 676 },
        { x: 1600, y: 690 },
        { x: 1680, y: 650 },
        { x: 1860, y: 600 },
        { x: 1900, y: 700 },
        { x: 1900, y: 765 },
        { x: 1660, y: 765 },
        { x: 1560, y: 790 },
        { x: 1300, y: 800 },
        { x: 1100, y: 860 },
        { x: 700, y: 880 },
        { x: 520, y: 860 },
        { x: 440, y: 760 },
      ],
      [
        // The jetty, out over the pond.
        { x: 722, y: 655 },
        { x: 985, y: 608 },
        { x: 1022, y: 615 },
        { x: 1015, y: 648 },
        { x: 790, y: 690 },
      ],
      [
        // The clearing: the lawn, then the trunk is cut out above the roots. Owls walk in straight
        // lines, so the floor stays open across the front of the roots and the hollow's threshold.
        { x: 1930, y: 510 },
        { x: 2550, y: 510 },
        { x: 2525, y: 610 },
        { x: 2505, y: 705 },
        { x: 3050, y: 705 },
        { x: 3140, y: 695 },
        { x: 3140, y: 850 },
        { x: 3070, y: 870 },
        { x: 2850, y: 880 },
        { x: 1960, y: 880 },
        { x: 1890, y: 790 },
        { x: 1850, y: 600 },
        { x: 1862, y: 540 },
      ],
      [
        // The east wing: the lawn under the treehouses, past the mushrooms and the fallen log.
        { x: 3100, y: 700 },
        { x: 3340, y: 688 },
        { x: 3420, y: 705 },
        { x: 3560, y: 700 },
        { x: 3640, y: 672 },
        { x: 3800, y: 640 },
        { x: 3950, y: 650 },
        { x: 4000, y: 700 },
        { x: 4250, y: 722 },
        { x: 4300, y: 690 },
        { x: 4420, y: 645 },
        { x: 4560, y: 650 },
        { x: 4580, y: 720 },
        { x: 4450, y: 770 },
        { x: 4380, y: 860 },
        { x: 4340, y: 900 },
        { x: 3340, y: 900 },
        { x: 3340, y: 745 },
        { x: 3100, y: 745 },
      ],
    ],
    spawns: { 'default': { x: 2610, y: 860 } },
    doors: [
      { id: 'to-hub', rect: { x: 2675, y: 775, w: 125, h: 80 }, to: { room: 'hub', spawn: 'from-grove' }, marker: { x: 2737, y: 700 } },
      // The gathering spot beneath the guardian: standing here lets a ticket-holder vote for this realm.
      { id: 'idol', rect: { x: 2290, y: 560, w: 220, h: 120 }, marker: { x: 2400, y: 612 } },
    ],
    spots: [
      { x: 560, y: 760 },
      { x: 700, y: 850 },
      { x: 880, y: 730 },
      { x: 900, y: 640 },
      { x: 1050, y: 800 },
      { x: 1250, y: 720 },
      { x: 1400, y: 745 },
      { x: 1920, y: 700 },
      { x: 1980, y: 840 },
      { x: 2020, y: 620 },
      { x: 2080, y: 530 },
      { x: 2120, y: 760 },
      { x: 2200, y: 540 },
      { x: 2300, y: 860 },
      { x: 2420, y: 800 },
      { x: 2560, y: 760 },
      { x: 3450, y: 720 },
      { x: 3600, y: 840 },
      { x: 3760, y: 700 },
      { x: 3900, y: 800 },
      { x: 4200, y: 735 },
      { x: 4450, y: 700 },
    ],
  },
  market: {
    id: 'market',
    size: { w: 2 * ROOM_W, h: ROOM_H },
    background: 'market',
    backgrounds: [
      { key: 'market', x: 0, y: 0 },
      { key: 'market-east', x: ROOM_W, y: 0 },
    ],
    // The overlay's awning and crates stand at the east end, where the street bends away.
    foregrounds: [
      { key: 'market-fg', x: 0, y: 0 },
      { key: 'market-east-fg', x: ROOM_W, y: 0 },
    ],
    mood: 'neon',
    walkable: [
      [
        // The street, from the curb in front of the stalls down, past the neon stage to where it bends
        // away; the doorway's threshold on the left.
        { x: 0, y: 690 },
        { x: 1500, y: 690 },
        { x: 1520, y: 705 },
        { x: 1830, y: 712 },
        { x: 1840, y: 738 },
        { x: 1990, y: 738 },
        { x: 2000, y: 700 },
        { x: 2600, y: 697 },
        { x: 2610, y: 737 },
        { x: 2760, y: 737 },
        { x: 2770, y: 712 },
        { x: 2950, y: 705 },
        { x: 3040, y: 662 },
        { x: 3110, y: 652 },
        { x: 3130, y: 690 },
        { x: 3045, y: 720 },
        { x: 3030, y: 760 },
        { x: 3025, y: 888 },
        { x: 280, y: 888 },
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
    spots: [
      { x: 330, y: 860 },
      { x: 480, y: 720 },
      { x: 560, y: 850 },
      { x: 600, y: 705 },
      { x: 720, y: 760 },
      { x: 860, y: 860 },
      { x: 880, y: 720 },
      { x: 1080, y: 860 },
      { x: 1300, y: 875 },
      { x: 1440, y: 715 },
      { x: 1700, y: 800 },
      { x: 1900, y: 860 },
      { x: 2100, y: 790 },
      { x: 2500, y: 860 },
      { x: 2700, y: 800 },
      { x: 2900, y: 860 },
    ],
  },
  lobby: {
    id: 'lobby',
    size: { w: 2 * ROOM_W, h: ROOM_H },
    background: 'lobby',
    backgrounds: [
      { key: 'lobby-west', x: 0, y: 0 },
      { key: 'lobby', x: ROOM_W, y: 0 },
    ],
    mood: 'dusk',
    walkable: [
      [
        // The cobbled plaza: from the curved balustrade on the west, around the front of the owl
        // fountain and the bench, past the booth and the two carved owls up to the turnstiles (the
        // gate's threshold), and down to the balustrade that closes it on the east.
        { x: 0, y: 815 },
        { x: 300, y: 808 },
        { x: 405, y: 800 },
        { x: 425, y: 712 },
        { x: 480, y: 712 },
        { x: 488, y: 735 },
        { x: 520, y: 748 },
        { x: 600, y: 756 },
        { x: 665, y: 758 },
        { x: 740, y: 756 },
        { x: 810, y: 748 },
        { x: 845, y: 735 },
        { x: 850, y: 712 },
        { x: 1020, y: 712 },
        { x: 1030, y: 728 },
        { x: 1150, y: 728 },
        { x: 1160, y: 712 },
        { x: 1600, y: 705 },
        { x: 1720, y: 702 },
        { x: 2100, y: 702 },
        { x: 2390, y: 708 },
        { x: 2400, y: 695 },
        { x: 2790, y: 695 },
        { x: 2800, y: 708 },
        { x: 2840, y: 708 },
        { x: 2900, y: 735 },
        { x: 2960, y: 762 },
        { x: 3050, y: 820 },
        { x: 3120, y: 870 },
        { x: 3145, y: 888 },
        { x: 0, y: 888 },
      ],
    ],
    spawns: { 'default': { x: 2200, y: 820 } },
    doors: [
      // The ticket window of the birdhouse booth.
      { id: 'booth', rect: { x: 1890, y: 702, w: 170, h: 88 }, marker: { x: 1960, y: 590 } },
      // The five turnstiles beneath the owls' wings: through them is the hub.
      { id: 'gate', rect: { x: 2400, y: 650, w: 390, h: 64 }, to: { room: 'hub', spawn: 'default' }, marker: { x: 2595, y: 600 } },
    ],
  },
};

/** Named anchors for large set pieces drawn by the scene (depth-sorted with the owls). */
export const ANCHORS: Record<string, Record<string, { x: number; y: number }>> = {
  hub: { 'tree-base': { x: 2400, y: 628 } },
  grove: { guardian: { x: 2400, y: 430 }, gathering: { x: 2400, y: 612 } },
  market: { robot: { x: 1240, y: 520 }, shop: { x: 1080, y: 560 } },
};

/**
 * The rooms' layout. Positions saved under an older one (the quest items already handed out) move
 * with the rooms: layout 2 painted the hub and the grove a screen wider on the west, so what stood
 * at x in either now stands at x + one screen.
 */
export const ROOM_LAYOUT = 2;
const LAYOUT_MOVES: Readonly<Record<number, Readonly<Record<string, number>>>> = { 2: { hub: ROOM_W, grove: ROOM_W } };

/** Where a position saved under layout `from` in `room` is now. */
export function relayout(room: string, p: Vec2, from: number): Vec2 {
  let x = p.x;
  for (let v = from + 1; v <= ROOM_LAYOUT; v++) x += LAYOUT_MOVES[v]?.[room] ?? 0;
  return { x, y: p.y };
}

export function getRoom(id: string): RoomDef {
  return Object.hasOwn(ROOMS, id) ? ROOMS[id]! : ROOMS['hub']!;
}
