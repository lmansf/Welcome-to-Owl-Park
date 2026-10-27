import { isNestRoom } from '../src/homes';
import type { Vec2 } from '../src/protocol';
import { ROOM_H, ROOM_W, type RoomDef } from '../src/room';

export { STREET_DOORS, STREET_ROOM } from '../src/homes';

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
 * The way back out is where the owls come in: the hub's floor at the foot of its spawn, whose
 * bottom edge leads to the lobby, outside the gate (C43, wayout.ts).
 *
 * The street (`homes`) is outside the park too, and free: a lane of tree houses at dusk that the
 * lobby's west end leads to. It is two screens wide, its painting the east screen, where the lane
 * from the lobby comes in. Six nest doors stand along it, each into one owl's nest: a room of its
 * own, made from NEST_ROOM. Neither has hiding spots.
 *
 * The arcade is a neon hall off the market street's east end, where the street bends away, three
 * screens long: a bay for each game cabinet along its back wall, each under its game's sign, and the
 * score board on the wall between the second and the third. Its entrance from the street is at its
 * west end. It has no hiding spots.
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
        // The two closed arches are boarded up: the floor stops at the front of each blockade.
        { x: 1990, y: 600 },
        { x: 2000, y: 672 },
        { x: 2290, y: 672 },
        { x: 2300, y: 620 },
        { x: 2400, y: 630 },
        { x: 2505, y: 620 },
        { x: 2515, y: 672 },
        // The east arch is a doorway into the stained-glass realm; while the realm is closed the
        // blockade stands in it and the door turns owls back at its threshold.
        { x: 2560, y: 672 },
        { x: 2560, y: 604 },
        { x: 2770, y: 604 },
        { x: 2770, y: 672 },
        { x: 2815, y: 672 },
        { x: 2830, y: 600 },
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
    spawns: { 'default': { x: 2400, y: 730 }, 'from-grove': { x: 1800, y: 740 }, 'from-market': { x: 2990, y: 750 }, 'from-glass': { x: 2665, y: 740 } },
    doors: [
      { id: 'to-grove', rect: { x: 1700, y: 610, w: 130, h: 90 }, to: { room: 'grove', spawn: 'default' }, marker: { x: 1765, y: 560 } },
      { id: 'to-market', rect: { x: 2940, y: 610, w: 150, h: 100 }, to: { room: 'market', spawn: 'default' }, marker: { x: 3015, y: 560 } },
      // The marker is the foot of each arch's blockade; the rect is the strip in front of it.
      { id: 'closed-a', rect: { x: 2040, y: 660, w: 210, h: 30 }, closedSign: 'Not Yet Fledged', marker: { x: 2145, y: 668 } },
      // The east arch leads to the stained-glass realm (gated: the realms setting opens it); its sign and blockade stay until then.
      { id: 'to-glass', rect: { x: 2560, y: 610, w: 210, h: 90 }, to: { room: 'glass', spawn: 'from-hub' }, closedSign: 'Hatching Soon', marker: { x: 2665, y: 668 } },
      // The way out (C43): the floor's bottom edge below where owls arrive from the turnstiles, back
      // to the lobby outside the gate. A soft ring on the floor marks it.
      { id: 'to-lobby', rect: { x: 2310, y: 862, w: 180, h: 38 }, to: { room: 'lobby', spawn: 'from-hub' }, marker: { x: 2400, y: 872 } },
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
        // away, and up the pavement on the right to the arcade's doorway; the doorway's threshold on
        // the left.
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
        { x: 3080, y: 678 },
        { x: 3100, y: 690 },
        { x: 3155, y: 690 },
        { x: 3200, y: 708 },
        { x: 3200, y: 888 },
        { x: 280, y: 888 },
        { x: 250, y: 830 },
        { x: 170, y: 760 },
        { x: 0, y: 760 },
      ],
    ],
    spawns: { 'default': { x: 330, y: 740 }, 'from-arcade': { x: 3090, y: 770 } },
    doors: [
      { id: 'to-hub', rect: { x: 0, y: 600, w: 120, h: 220 }, to: { room: 'hub', spawn: 'from-market' }, marker: { x: 70, y: 580 } },
      // The arcade's doorway on the pavement where the street bends away, under its joystick sign.
      { id: 'to-arcade', rect: { x: 3098, y: 678, w: 60, h: 36 }, to: { room: 'arcade', spawn: 'from-market' }, marker: { x: 3126, y: 640 } },
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
  /**
   * The stained-glass realm (designs/the-stained-glass-climb.md): two screens, the arch back to
   * the hub and the idol on the west screen, the portal to the solo climb at the foot of a tall
   * window on the east. Gated: closed until the keepers open it with the realms setting.
   */
  glass: {
    id: 'glass',
    gated: true,
    size: { w: 2 * ROOM_W, h: ROOM_H },
    background: 'glass',
    backgrounds: [
      { key: 'glass', x: 0, y: 0 },
      { key: 'glass-east', x: ROOM_W, y: 0 },
    ],
    foregrounds: [],
    mood: 'dusk',
    walkable: [
      [
        { x: 0, y: 690 },
        { x: 1500, y: 690 },
        { x: 1520, y: 705 },
        { x: 2400, y: 705 },
        { x: 2420, y: 690 },
        { x: 3200, y: 690 },
        { x: 3200, y: 888 },
        { x: 280, y: 888 },
        { x: 250, y: 830 },
        { x: 170, y: 760 },
        { x: 0, y: 760 },
      ],
    ],
    spawns: { 'default': { x: 330, y: 740 }, 'from-hub': { x: 330, y: 740 } },
    doors: [
      { id: 'to-hub', rect: { x: 0, y: 600, w: 120, h: 220 }, to: { room: 'hub', spawn: 'from-glass' }, marker: { x: 70, y: 580 } },
      { id: 'idol', rect: { x: 1150, y: 710, w: 220, h: 100 }, marker: { x: 1260, y: 760 } },
      // The portal: standing here offers the climb (the client's `interactions` table).
      // The foot of the tall window in the east screen's painting.
      { id: 'portal', rect: { x: 2785, y: 700, w: 200, h: 90 }, marker: { x: 2885, y: 640 } },
    ],
    spots: [
      { x: 330, y: 860 },
      { x: 480, y: 720 },
      { x: 600, y: 850 },
      { x: 760, y: 760 },
      { x: 900, y: 860 },
      { x: 1050, y: 730 },
      { x: 1450, y: 860 },
      { x: 1700, y: 800 },
      { x: 1900, y: 860 },
      { x: 2100, y: 790 },
      { x: 2300, y: 860 },
      { x: 2450, y: 740 },
      { x: 2900, y: 860 },
      { x: 3050, y: 780 },
    ],
  },
  arcade: {
    id: 'arcade',
    size: { w: 3 * ROOM_W, h: ROOM_H },
    background: 'arcade',
    backgrounds: [
      { key: 'arcade', x: 0, y: 0 },
      { key: 'arcade-mid', x: ROOM_W, y: 0 },
      { key: 'arcade-end', x: 2 * ROOM_W, y: 0 },
    ],
    mood: 'arcade',
    walkable: [
      [
        // The wet tiled floor: out through the open doorway on the west onto the street beyond its
        // threshold, along the foot of the back wall and around the front of each cabinet (Hoot & Hop,
        // then Moon Flap past the passage with the chrome pillar, then Nest Knockdown on its crate in
        // the purple alcove's light), to the last chrome pillar at the east end.
        { x: 0, y: 700 },
        { x: 195, y: 700 },
        { x: 200, y: 724 },
        { x: 455, y: 724 },
        { x: 458, y: 764 },
        { x: 612, y: 808 },
        { x: 758, y: 770 },
        { x: 762, y: 708 },
        { x: 1318, y: 708 },
        { x: 1600, y: 714 },
        { x: 1606, y: 722 },
        { x: 1690, y: 758 },
        { x: 1742, y: 774 },
        { x: 1830, y: 786 },
        { x: 1995, y: 774 },
        { x: 2002, y: 748 },
        { x: 2100, y: 744 },
        { x: 2950, y: 714 },
        { x: 3135, y: 718 },
        { x: 3180, y: 682 },
        { x: 3300, y: 672 },
        { x: 3550, y: 690 },
        { x: 3828, y: 720 },
        { x: 3832, y: 756 },
        { x: 3995, y: 774 },
        { x: 4148, y: 766 },
        { x: 4150, y: 752 },
        { x: 4330, y: 770 },
        { x: 4470, y: 810 },
        { x: 4582, y: 798 },
        { x: 4600, y: 790 },
        { x: 4672, y: 802 },
        { x: 4790, y: 804 },
        { x: 4790, y: 888 },
        { x: 0, y: 888 },
      ],
    ],
    spawns: { 'default': { x: 300, y: 810 }, 'from-market': { x: 300, y: 810 } },
    doors: [
      // The open doorway, out onto the street past its threshold.
      { id: 'to-market', rect: { x: 0, y: 700, w: 120, h: 100 }, to: { room: 'market', spawn: 'from-arcade' }, marker: { x: 100, y: 640 } },
      // The three cabinets, each spot on the floor in front of its cabinet and each marker on its screen.
      { id: 'cabinet-crossing', rect: { x: 540, y: 812, w: 160, h: 60 }, marker: { x: 652, y: 482 } },
      { id: 'cabinet-flight', rect: { x: 1820, y: 790, w: 160, h: 60 }, marker: { x: 1862, y: 496 } },
      { id: 'cabinet-sling', rect: { x: 3910, y: 780, w: 170, h: 60 }, marker: { x: 3975, y: 468 } },
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
    // An owl that leaves the park stands in front of the turnstiles, outside the gate.
    spawns: { 'default': { x: 2200, y: 820 }, 'from-homes': { x: 190, y: 850 }, 'from-hub': { x: 2595, y: 800 } },
    doors: [
      // The lane to the street of nests, past the west end of the balustrade.
      { id: 'to-homes', rect: { x: 0, y: 790, w: 110, h: 98 }, to: { room: 'homes', spawn: 'from-lobby' }, marker: { x: 55, y: 790 } },
      // The ticket window of the birdhouse booth.
      { id: 'booth', rect: { x: 1890, y: 702, w: 170, h: 88 }, marker: { x: 1960, y: 590 } },
      // The five turnstiles beneath the owls' wings, from the left owl's plinth to the right one's
      // (the first turns between the plinth and the first post): through them is the hub.
      { id: 'gate', rect: { x: 2350, y: 650, w: 440, h: 64 }, to: { room: 'hub', spawn: 'default' }, marker: { x: 2595, y: 600 } },
    ],
  },
  homes: {
    id: 'homes',
    size: { w: 2 * ROOM_W, h: ROOM_H },
    background: 'homes',
    backgrounds: [
      { key: 'homes-west', x: 0, y: 0 },
      { key: 'homes', x: ROOM_W, y: 0 },
    ],
    mood: 'dusk',
    walkable: [
      [
        // The lane beneath the tree houses, from the mossy bank that closes its west end past the six
        // nest doors (each a step up onto its doorstep) to the east end, where it bends away past the
        // two posts to the lobby. Where the screens join it narrows between the roots behind and the
        // dark mounds in front, and at the east end the mossy bank in the corner is not lane.
        { x: 312, y: 724 },
        { x: 480, y: 718 },
        { x: 500, y: 712 },
        { x: 504, y: 704 },
        { x: 598, y: 704 },
        { x: 606, y: 714 },
        { x: 745, y: 716 },
        { x: 800, y: 700 },
        { x: 1000, y: 696 },
        { x: 1010, y: 691 },
        { x: 1114, y: 691 },
        { x: 1124, y: 697 },
        { x: 1260, y: 698 },
        { x: 1290, y: 684 },
        { x: 1450, y: 682 },
        { x: 1458, y: 669 },
        { x: 1544, y: 669 },
        { x: 1552, y: 682 },
        { x: 1700, y: 686 },
        { x: 1830, y: 690 },
        { x: 1866, y: 690 },
        { x: 1872, y: 684 },
        { x: 1978, y: 684 },
        { x: 1986, y: 690 },
        { x: 2340, y: 690 },
        { x: 2344, y: 666 },
        { x: 2454, y: 666 },
        { x: 2458, y: 690 },
        { x: 2810, y: 695 },
        { x: 2816, y: 676 },
        { x: 2928, y: 676 },
        { x: 2934, y: 696 },
        { x: 3080, y: 702 },
        { x: 3110, y: 664 },
        { x: 3150, y: 646 },
        { x: 3200, y: 640 },
        { x: 3200, y: 718 },
        { x: 3100, y: 772 },
        { x: 3000, y: 832 },
        { x: 2944, y: 880 },
        { x: 1860, y: 880 },
        { x: 1760, y: 830 },
        { x: 1700, y: 806 },
        { x: 1676, y: 780 },
        { x: 1648, y: 760 },
        { x: 1610, y: 756 },
        { x: 1576, y: 756 },
        { x: 1566, y: 768 },
        { x: 1490, y: 774 },
        { x: 1445, y: 794 },
        { x: 1400, y: 834 },
        { x: 1372, y: 880 },
        { x: 462, y: 880 },
        { x: 444, y: 832 },
        { x: 436, y: 782 },
        { x: 345, y: 780 },
        { x: 318, y: 770 },
      ],
    ],
    spawns: {
      'default': { x: 2640, y: 790 },
      'from-lobby': { x: 3030, y: 750 },
      'from-nest-0': { x: 2872, y: 752 },
      'from-nest-1': { x: 2399, y: 742 },
      'from-nest-2': { x: 1935, y: 762 },
      'from-nest-3': { x: 1495, y: 742 },
      'from-nest-4': { x: 1070, y: 768 },
      'from-nest-5': { x: 565, y: 782 },
    },
    doors: [
      // The lane back to the lobby, past the two posts at the east end.
      { id: 'to-lobby', rect: { x: 3130, y: 670, w: 70, h: 66 }, to: { room: 'lobby', spawn: 'from-homes' }, marker: { x: 3170, y: 680 } },
      // The nest doors, one at the foot of each trunk, door 0 nearest the lobby: blue, red and yellow
      // on the east screen, green, teal and red on the west. Door 0 is always the visitor's own nest
      // and the others are other owls' open nests, so where each one leads is decided per visitor and
      // none has a `to`. The rect is the doorstep and the strip of lane in front of it, its middle
      // just behind the lane's edge, so a walk along the lane to a door reaches it; the marker is
      // where the door's flag hangs, high over the door and clear of its lantern.
      { id: 'nest-door-0', rect: { x: 2802, y: 676, w: 140, h: 40 }, marker: { x: 2872, y: 375 } },
      { id: 'nest-door-1', rect: { x: 2329, y: 666, w: 140, h: 46 }, marker: { x: 2399, y: 377 } },
      { id: 'nest-door-2', rect: { x: 1855, y: 672, w: 140, h: 36 }, marker: { x: 1925, y: 377 } },
      { id: 'nest-door-3', rect: { x: 1430, y: 666, w: 140, h: 32 }, marker: { x: 1500, y: 410 } },
      { id: 'nest-door-4', rect: { x: 993, y: 682, w: 140, h: 32 }, marker: { x: 1063, y: 405 } },
      { id: 'nest-door-5', rect: { x: 480, y: 700, w: 140, h: 40 }, marker: { x: 550, y: 405 } },
    ],
  },
};

/**
 * The nest every owl has: a cosy round room inside a trunk, one screen. It is a template rather than
 * a room of the registry: each nest is this room under its own id, `nest-<nestId>`, as roomFor gives
 * it (homes.ts has the nest ids and the spots where the furniture stands).
 */
export const NEST_ROOM: RoomDef = {
  id: 'nest',
  size: { w: ROOM_W, h: ROOM_H },
  background: 'nest',
  // Gold dust drifting in the lamplight, as inside the hub's tree.
  mood: 'hub',
  walkable: [
    [
      // The round floor of the hollow: in from the door in the west wall, along the back wall beneath
      // the round window, and in front of the stone hearth in the east wall, between the dark curve
      // of the trunk on either side.
      { x: 270, y: 888 },
      { x: 232, y: 820 },
      { x: 214, y: 772 },
      { x: 250, y: 724 },
      { x: 250, y: 676 },
      { x: 340, y: 676 },
      { x: 372, y: 678 },
      { x: 420, y: 668 },
      { x: 530, y: 654 },
      { x: 560, y: 634 },
      { x: 800, y: 630 },
      { x: 1040, y: 634 },
      { x: 1080, y: 652 },
      { x: 1130, y: 656 },
      { x: 1215, y: 668 },
      { x: 1245, y: 688 },
      { x: 1280, y: 702 },
      { x: 1320, y: 712 },
      { x: 1350, y: 718 },
      { x: 1388, y: 732 },
      { x: 1396, y: 772 },
      { x: 1376, y: 812 },
      { x: 1340, y: 860 },
      { x: 1320, y: 888 },
    ],
  ],
  spawns: {
    'default': { x: 340, y: 740 },
    // In front of the mirror (OP-077), facing it: where Play puts the owl, every visit (OP-105).
    mirror: { x: 650, y: 720 },
  },
  doors: [
    // The round door in the west wall, out to the street: its rect is the doorway's floor. The owl
    // comes out by the nest door it went in by (`from-nest-<n>`, which only the visit knows), else
    // by door 0, its own nest's.
    { id: 'to-street', rect: { x: 245, y: 656, w: 100, h: 44 }, to: { room: 'homes', spawn: 'from-nest-0' }, marker: { x: 290, y: 580 } },
    // The floor in front of the mirror (NEST_MIRROR): standing here, Look in the mirror opens Your owl.
    { id: 'mirror', rect: { x: 560, y: 686, w: 140, h: 64 } },
  ],
};

/**
 * Where a nest's standing mirror stands (OP-077): the middle of its foot, against the back wall
 * between the lamp's spot (f1) and the round window, clear of the furniture spots either side. High
 * on the floor, so on a phone it shows above the pad and the stick, which cover the front corners.
 * It is part of the room, not a furnishing, so every nest has it, furnished or not, and any owl may
 * look into it: it shows that owl, and changes only that owl.
 */
export const NEST_MIRROR: Vec2 = { x: 590, y: 660 };

/**
 * Where every nest's "To the park" sign stands (OP-105): the middle of its words' foot, on the round
 * door itself, above its little window. Play lands every owl in its own nest, so the way out is
 * marked on the door. The wall over the door is a furniture spot (w1), and no wall piece hung there
 * reaches down this far.
 */
export const NEST_PARK_SIGN: Vec2 = { x: 287, y: 400 };

/** Named anchors for large set pieces drawn by the scene (depth-sorted with the owls). */
export const ANCHORS: Record<string, Record<string, { x: number; y: number }>> = {
  hub: { 'tree-base': { x: 2400, y: 628 } },
  grove: { guardian: { x: 2400, y: 430 }, gathering: { x: 2400, y: 612 } },
  market: { robot: { x: 1240, y: 520 }, shop: { x: 1080, y: 560 } },
  glass: { idol: { x: 1260, y: 705 }, portal: { x: 2885, y: 560 } },
};

/** The rooms the realms setting gates, as the keepers' page lists them. */
export const GATED_ROOMS: readonly string[] = Object.values(ROOMS).filter((r) => r.gated).map((r) => r.id);

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

/** The room with this id: one of ROOMS, or a nest made from NEST_ROOM; undefined for anything else. */
export function roomFor(id: string): RoomDef | undefined {
  if (Object.hasOwn(ROOMS, id)) return ROOMS[id];
  return isNestRoom(id) ? { ...NEST_ROOM, id } : undefined;
}

/** The room with this id, or the hub for an id that is no room. */
export function getRoom(id: string): RoomDef {
  return roomFor(id) ?? ROOMS['hub']!;
}
