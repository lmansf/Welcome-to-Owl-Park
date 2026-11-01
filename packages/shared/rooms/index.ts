import type { Polygon } from '../src/geometry';
import { isNestRoom } from '../src/homes';
import type { Perch } from '../src/perches';
import type { Vec2 } from '../src/protocol';
import { ROOM_H, ROOM_W, mapOf, type RoomDef } from '../src/room';
import type { OwlSpeciesId } from '../src/species';

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

/** The tree's ground line on a screen of map 2 (room px; OP-157's painting puts it at 985 of 1152). */
export const TREE_GROUND = 770;
/** Half the depth of the tree's floor strip: an owl's spot on the plan stays on the ground line. */
const TREE_STRIP = 4;
/**
 * Room pixels over which the tree's slower and faster layers fade at their side edges (OP-162): a sky
 * plate's over the next one beneath it, the middle distance's over its neighbours (they overlap by
 * nearly a third), and the overlay's where its faster tile ends partway across the view.
 */
const TREE_SKY_FADE = 220;
const TREE_MID_FADE = 230;
const TREE_EDGE_FADE = 120;

/** A polygon from [x, y] pairs (room px). */
function pts(...p: ReadonlyArray<readonly [number, number]>): Polygon {
  return p.map(([x, y]) => ({ x, y }));
}

/** A rectangle from x0, y0 to x1, y1 as a polygon (room px). */
function box(x0: number, y0: number, x1: number, y1: number): Polygon {
  return pts([x0, y0], [x1, y0], [x1, y1], [x0, y1]);
}

/** A ledge of the tree (map 2): a perch over the ground line from x0 to x1, `top` above it. */
function treeLedge(id: string, x0: number, x1: number, top: number): Perch {
  return {
    id,
    top,
    area: [
      { x: x0, y: TREE_GROUND - TREE_STRIP },
      { x: x1, y: TREE_GROUND - TREE_STRIP },
      { x: x1, y: TREE_GROUND + TREE_STRIP },
      { x: x0, y: TREE_GROUND + TREE_STRIP },
    ],
  };
}

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
    // Upper levels (OP-084, perches.ts), along the west wing's back wall: the root bench under the
    // lantern beam, its seat drawn at y 600..632 above its place along the wall, a jump up from the
    // floor; and the beam itself, drawn at y 416..448 from the left trunk to where it bends down into
    // the right one, a jump and the second flap up from the bench. The bench is solid, its front a face
    // on the floor's back edge; the beam is not, and the bench is under it.
    perches: [
      {
        id: 'hub-bench',
        area: [
          { x: 715, y: 680 },
          { x: 1260, y: 680 },
          { x: 1260, y: 712 },
          { x: 715, y: 712 },
        ],
        top: 80,
        solid: true,
      },
      {
        id: 'hub-beam',
        area: [
          { x: 722, y: 680 },
          { x: 1140, y: 680 },
          { x: 1140, y: 712 },
          { x: 722, y: 712 },
        ],
        top: 264,
      },
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
      // Up on the root bench, a jump from the floor (OP-084).
      { x: 820, y: 696, top: 80 },
      { x: 1150, y: 696, top: 80 },
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
    // Upper levels (OP-084, perches.ts), the treetop walk in the east wing, tiered as routes.ts reckons
    // them. The fallen log on the lawn, a jump up (solid: walked round on the floor). The ladder up the
    // middle tree: an owl perches on a rung halfway, then on the porch at its top, a jump each, and from
    // the porch on the loft's deck above it to the left, a jump more: single jumps all the way (tier 1).
    // The porch is also a jump and the second flap straight from the floor (tier 2). The left tree's
    // treehouse is across the gap from the loft, past the rope bridge, and only a glide gets there (tier
    // 3). The rope bridge stays painted, not a perch, so the treehouse stays the glide's.
    // TODO-DOCS (OP-084): docs/ACTIVITIES.md: the grove's treetop walk (the ladder to the porch's leaf
    // pile and the loft, and the glide to the far treehouse's), beside the hub's bench and beam.
    perches: [
      {
        id: 'grove-log',
        area: [
          { x: 4060, y: 815 },
          { x: 4285, y: 800 },
          { x: 4285, y: 820 },
          { x: 4060, y: 835 },
        ],
        top: 60,
        solid: true,
      },
      {
        id: 'grove-rung',
        area: [
          { x: 4083, y: 695 },
          { x: 4120, y: 695 },
          { x: 4120, y: 712 },
          { x: 4083, y: 712 },
        ],
        top: 110,
      },
      {
        id: 'grove-porch',
        area: [
          { x: 4118, y: 700 },
          { x: 4362, y: 700 },
          { x: 4362, y: 716 },
          { x: 4118, y: 716 },
        ],
        top: 218,
      },
      {
        id: 'grove-loft',
        area: [
          { x: 3995, y: 694 },
          { x: 4140, y: 694 },
          { x: 4140, y: 710 },
          { x: 3995, y: 710 },
        ],
        top: 292,
      },
      {
        id: 'grove-hut',
        area: [
          { x: 3560, y: 690 },
          { x: 3728, y: 690 },
          { x: 3728, y: 702 },
          { x: 3560, y: 702 },
        ],
        top: 345,
      },
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
      // Up on the fallen log, a jump from the lawn, and on the loft, at the top of the ladder (OP-084).
      { x: 4170, y: 818, top: 60 },
      { x: 4050, y: 702, top: 292 },
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
    // Upper levels (OP-084, perches.ts), the rooftops, tiered as routes.ts reckons them. On the west
    // screen the stall row's roof, a jump up from the curb all along it: it climbs to the right as the
    // street comes nearer, so its area slants with it, and an owl stands on the roof as drawn; along it,
    // level with it, onto the neon signboards at its east end. The feather shop's roof, which the giant robot owl stands
    // on, is a jump up from the curb right of the shop's doorway. On the east screen the stalls' roofs,
    // a jump up from the plaza. All those single jumps (tier 1). The big food stall's roof and the big
    // tent's ridge stand higher, over counters that reach out into the plaza: a jump and the flap from
    // in front of each (tier 2), the stalls' roofs kept too far from them for a jump across. The street
    // has no gap only a glide crosses. No perch reaches over a doorway, or an owl standing up there would
    // be in it.
    // TODO-DOCS (OP-084): docs/ACTIVITIES.md: the market's rooftops (the stall row to the signboards,
    // the shop's roof at the robot owl's feet and the plaza's stalls by single jumps; the food stall and
    // the tent by a jump and the flap).
    perches: [
      {
        id: 'market-stalls',
        area: [
          { x: 340, y: 708 },
          { x: 875, y: 679 },
          { x: 875, y: 695 },
          { x: 340, y: 724 },
        ],
        top: 136,
      },
      {
        id: 'market-boards',
        area: [
          { x: 868, y: 676 },
          { x: 985, y: 676 },
          { x: 985, y: 689 },
          { x: 868, y: 689 },
        ],
        top: 136,
      },
      {
        id: 'market-shop',
        area: [
          { x: 1135, y: 684 },
          { x: 1475, y: 684 },
          { x: 1475, y: 700 },
          { x: 1135, y: 700 },
        ],
        top: 126,
      },
      {
        id: 'market-food',
        area: [
          { x: 1745, y: 724 },
          { x: 1955, y: 752 },
          { x: 1955, y: 768 },
          { x: 1745, y: 740 },
        ],
        top: 220,
      },
      {
        id: 'market-roofs',
        area: [
          { x: 2090, y: 692 },
          { x: 2500, y: 692 },
          { x: 2500, y: 708 },
          { x: 2090, y: 708 },
        ],
        top: 130,
      },
      {
        id: 'market-tent',
        area: [
          { x: 2640, y: 729 },
          { x: 2870, y: 729 },
          { x: 2870, y: 745 },
          { x: 2640, y: 745 },
        ],
        top: 209,
      },
    ],
    spawns: { 'default': { x: 330, y: 740 }, 'from-arcade': { x: 3090, y: 770 } },
    doors: [
      // Its way out: to the hub, or for an owl walking the tree (OP-162), back to the roof run's archway.
      { id: 'to-hub', rect: { x: 0, y: 600, w: 120, h: 220 }, to: { room: 'hub', spawn: 'from-market' }, toTree: { room: 'l1', spawn: 'market' }, marker: { x: 70, y: 580 } },
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
      // Up on the stall row's roof, and on the plaza's stalls' roofs, a jump from the street (OP-084).
      { x: 680, y: 698, top: 136 },
      { x: 2300, y: 700, top: 130 },
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
    // The floor as painted (OP-127): it starts at the arch back into the tree (the trunk left of it is
    // bark) and goes round the idol's plinth, which stands on it and is no floor itself. Past the
    // plinth it keeps to the pavement where the two screens join (repainted, OP-125): the pink
    // shopfront's stone base, into its lit doorway porch, along the next building's ledge, then the
    // plaza's far edge.
    walkable: [
      [
        { x: 140, y: 690 },
        { x: 1140, y: 690 },
        { x: 1140, y: 815 },
        { x: 1380, y: 815 },
        { x: 1380, y: 758 },
        { x: 1600, y: 758 },
        { x: 1612, y: 732 },
        { x: 1745, y: 732 },
        { x: 1757, y: 748 },
        { x: 1960, y: 748 },
        { x: 1990, y: 705 },
        { x: 2400, y: 705 },
        { x: 2420, y: 690 },
        { x: 3200, y: 690 },
        { x: 3200, y: 888 },
        { x: 280, y: 888 },
        { x: 250, y: 830 },
        { x: 170, y: 760 },
        { x: 140, y: 760 },
      ],
    ],
    spawns: { 'default': { x: 330, y: 740 }, 'from-hub': { x: 330, y: 740 } },
    doors: [
      // The painted arch's threshold (x 150 to 290), not the trunk beside it; its glow at the arch's foot.
      { id: 'to-hub', rect: { x: 150, y: 690, w: 140, h: 75 }, to: { room: 'hub', spawn: 'from-glass' }, marker: { x: 220, y: 728 } },
      // In front of the plinth: an owl votes standing on the floor before the idol, not on its plinth.
      { id: 'idol', rect: { x: 1150, y: 816, w: 220, h: 64 }, marker: { x: 1260, y: 848 } },
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
        // then Moon Flap past the passage with the chrome pillar, then Talon Toss on its crate in
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
  // ---- The tree (map 2, OP-128): the side-scrolling park around the great trunk, dark until it opens ----
  //
  // Level 1, the ground: one room for the level's screens (the cells of the tree's grid, OP-155), seen
  // from the side, four screens west to east (OP-162): the path to a closed gate, the lobby at the
  // trunk's foot (OP-157's style frame), the market's common square, and its roof run. The floor is the
  // ground line as a thin strip, and the ledges are perches (their areas strips of it, their tops their
  // heights over the ground line), measured on the paintings at 1600 x 900. Each screen's art is four
  // layers: the sky plate at half the camera's pace, the middle distance at three quarters, the
  // playfield with the room, and the overlay at 1.2 in front of the owls. The slower layers overlap the
  // next screen's and fade over it, the lobby's on top so its own view stays as approved; the overlay
  // ends partway across the view between screens, so it fades at its sides. Gated: only a keeper's
  // token (OP-156) or the realms switch lets owls in.
  l1: {
    id: 'l1',
    map: 2,
    gated: true,
    owlScale: 1.25,
    size: { w: 4 * ROOM_W, h: ROOM_H },
    background: 'tree-l1-0-play',
    backgrounds: [
      // The skies, farthest from the lobby first: each lies over the one beyond it and fades into it.
      { key: 'tree-l1-e2-bg', x: 3 * ROOM_W, y: 0, rate: 0.5 },
      { key: 'tree-l1-e1-bg', x: 2 * ROOM_W, y: 0, rate: 0.5, fade: { right: TREE_SKY_FADE } },
      { key: 'tree-l1-w1-bg', x: 0, y: 0, rate: 0.5 },
      { key: 'tree-l1-0-bg', x: ROOM_W, y: 0, rate: 0.5, fade: { left: TREE_SKY_FADE, right: TREE_SKY_FADE } },
      // The middle distance, each screen's fading into its neighbours'.
      ...['w1', '0', 'e1', 'e2'].map((s, i) => ({ key: `tree-l1-${s}-mid`, x: i * ROOM_W, y: 0, rate: 0.75, fade: { left: TREE_MID_FADE, right: TREE_MID_FADE } })),
      // The playfields, edge to edge, their floors on the one ground line.
      ...['w1', '0', 'e1', 'e2'].map((s, i) => ({ key: `tree-l1-${s}-play`, x: i * ROOM_W, y: 0 })),
    ],
    foregrounds: ['w1', '0', 'e1', 'e2'].map((s, i) => ({ key: `tree-l1-${s}-fg`, x: i * ROOM_W, y: 0, rate: 1.2, fade: { left: TREE_EDGE_FADE, right: TREE_EDGE_FADE } })),
    mood: 'hub',
    // The ground line, from the barrier in front of the closed gate in the west, past the lobby and
    // through the market's square, to the archway at the east end of the roof run.
    walkable: [
      [
        { x: 600, y: TREE_GROUND - TREE_STRIP },
        { x: 4 * ROOM_W - 24, y: TREE_GROUND - TREE_STRIP },
        { x: 4 * ROOM_W - 24, y: TREE_GROUND + TREE_STRIP },
        { x: 600, y: TREE_GROUND + TREE_STRIP },
      ],
    ],
    perches: [
      // West: a flat-topped boulder and a fallen log beside the path, each a hop up, and the top of
      // the stone wall behind them, a hop up from either (OP-173: it looked like a ledge, so it is one).
      treeLedge('boulder', 680, 850, 110),
      treeLedge('log', 1010, 1210, 85),
      treeLedge('wall', 700, 1440, 190),
      // The lobby: up the spiral stair (three steps a jump apart) to the balcony; the lintel over the
      // way down, a flap from the floor; the shelf fungus over it, a jump from the lintel.
      treeLedge('stair-1', ROOM_W + 953, ROOM_W + 1078, 82),
      treeLedge('stair-2', ROOM_W + 961, ROOM_W + 1063, 153),
      treeLedge('stair-3', ROOM_W + 922, ROOM_W + 1016, 223),
      treeLedge('balcony', ROOM_W + 1000, ROOM_W + 1109, 286),
      treeLedge('lintel', ROOM_W + 582, ROOM_W + 730, 196),
      treeLedge('fungus', ROOM_W + 508, ROOM_W + 641, 282),
      // The market's square: crates stacked by the path in from the lobby; a stone block and the crate
      // on it, the way up onto the stall roofs. (The plinth, the stall's counter and the perch post
      // are the statue's, the game's and the guardian's, so no owl stands there.)
      treeLedge('crates-low', 2 * ROOM_W + 105, 2 * ROOM_W + 275, 125),
      treeLedge('crates-high', 2 * ROOM_W + 60, 2 * ROOM_W + 240, 225),
      treeLedge('block', 2 * ROOM_W + 1120, 2 * ROOM_W + 1270, 155),
      treeLedge('crate', 2 * ROOM_W + 1165, 2 * ROOM_W + 1240, 205),
      treeLedge('stall-roofs', 2 * ROOM_W + 465, 2 * ROOM_W + 1240, 350),
      // The round plinth, a jump up, and the steps beside it up to the stall roofs (OP-173: they looked
      // like a way up, so they are one).
      treeLedge('plinth', 2 * ROOM_W + 425, 2 * ROOM_W + 590, 152),
      treeLedge('steps-1', 2 * ROOM_W + 397, 2 * ROOM_W + 462, 190),
      treeLedge('steps-2', 2 * ROOM_W + 412, 2 * ROOM_W + 476, 238),
      treeLedge('steps-3', 2 * ROOM_W + 434, 2 * ROOM_W + 496, 285),
      // The roof run: a stair of crates and barrels a half-visitor a step, the long roof over the
      // stalls, the higher one by the lantern tower, and the tower's balcony, a jump up from that
      // roof's end under it, the highest ledge of the level.
      treeLedge('crates-1', 3 * ROOM_W + 80, 3 * ROOM_W + 245, 95),
      treeLedge('crates-2', 3 * ROOM_W + 160, 3 * ROOM_W + 390, 170),
      treeLedge('crates-3', 3 * ROOM_W + 265, 3 * ROOM_W + 425, 250),
      treeLedge('roof-low', 3 * ROOM_W + 410, 3 * ROOM_W + 965, 310),
      treeLedge('barrel', 3 * ROOM_W + 535, 3 * ROOM_W + 608, 383),
      treeLedge('roof-high', 3 * ROOM_W + 955, 3 * ROOM_W + 1340, 402),
      treeLedge('tower-balcony', 3 * ROOM_W + 1258, 3 * ROOM_W + 1500, 530),
    ],
    // What is painted in front of the path, drawn again over the owls (OP-173): the west path's two lamp
    // posts (their poles and lanterns) and the post in front of the market square's stall.
    fronts: [
      { id: 'lamp-1', poly: pts([926, 448], [940, 448], [941, 700], [944, 768], [922, 768], [925, 700]) },
      { id: 'lamp-1-lantern-l', poly: pts([868, 560], [906, 560], [914, 572], [914, 598], [906, 610], [868, 610], [860, 598], [860, 572]) },
      { id: 'lamp-1-lantern-r', poly: pts([956, 530], [996, 530], [1004, 542], [1004, 588], [996, 600], [956, 600], [948, 588], [948, 542]) },
      { id: 'lamp-2', poly: pts([1294, 445], [1306, 445], [1307, 712], [1310, 768], [1290, 768], [1293, 712]) },
      { id: 'lamp-2-lantern-l', poly: pts([1232, 556], [1272, 556], [1280, 568], [1280, 610], [1272, 622], [1232, 622], [1224, 610], [1224, 568]) },
      { id: 'lamp-2-lantern-r', poly: pts([1318, 538], [1356, 538], [1364, 550], [1364, 598], [1356, 610], [1318, 610], [1310, 598], [1310, 550]) },
      {
        id: 'perch-post',
        poly: pts(
          ...([[955, 318], [1102, 318], [1102, 349], [1046, 352], [1042, 400], [1037, 440], [1036, 460], [1030, 480], [1022, 520], [1016, 560], [1012, 580], [1010, 640], [1004, 700],
            [1005, 760], [1006, 778], [938, 778], [940, 760], [945, 700], [950, 640], [955, 580], [968, 560], [972, 520], [978, 488], [990, 470], [997, 460], [1002, 440], [993, 400],
            [993, 352], [955, 350]] as const).map(([x, y]) => [2 * ROOM_W + x, y] as const),
        ),
      },
    ],
    // Painted glows that do nothing yet, shaded so they do not read as things to use (OP-173): the
    // closed gate's lit doors, the lobby's booth window, its way down and the nest of eggs over them, the market square's lit stall
    // windows and the roof run's lit stall fronts.
    shades: [
      { id: 'gate-doors', poly: box(290, 445, 540, 712), alpha: 0.45 },
      { id: 'booth-window', poly: box(ROOM_W + 795, 595, ROOM_W + 868, 685), alpha: 0.5 },
      // The nest of eggs high in the hollow has nothing under it to jump from, so it is quieted rather than made a ledge.
      { id: 'nest', poly: box(ROOM_W + 760, 296, ROOM_W + 900, 352), alpha: 0.35 },
      { id: 'way-down', poly: box(ROOM_W + 594, 600, ROOM_W + 740, 755), alpha: 0.4 },
      { id: 'stall-windows', poly: box(2 * ROOM_W + 560, 515, 2 * ROOM_W + 1095, 605), alpha: 0.35 },
      { id: 'stall-fronts', poly: box(3 * ROOM_W + 476, 560, 3 * ROOM_W + 1263, 742), alpha: 0.3 },
    ],
    // Owls come in at the lobby's middle; the west end's spawn stands where the overlay's grass leaves
    // the path clear; one back from the market comes out just short of the tower's archway.
    spawns: {
      default: { x: ROOM_W + 800, y: TREE_GROUND },
      west: { x: 720, y: TREE_GROUND },
      east: { x: 3 * ROOM_W + 1100, y: TREE_GROUND },
      market: { x: 3 * ROOM_W + 1230, y: TREE_GROUND },
    },
    doors: [
      // The closed gate at the west end: a blockade on the stone apron in front of it, its phrase on
      // its board; the door turns owls back at the apron's edge, where the overlay's grass leaves the
      // path clear.
      { id: 'closed-west', rect: { x: 630, y: 750, w: 60, h: 40 }, closedSign: 'Not Yet Fledged', marker: { x: 415, y: TREE_GROUND } },
      // The archway at the foot of the lantern tower, at the roof run's east end: into the market's
      // own screens (OP-155's grid), whose way out brings a tree owl back here. Taken on the
      // ground only, so an owl on the high roof or the balcony over it walks on past.
      { id: 'to-market', rect: { x: 3 * ROOM_W + 1300, y: 750, w: 90, h: 40 }, to: { room: 'market', spawn: 'default' }, top: 0, markAt: { x: 3 * ROOM_W + 1365, y: 462 } },
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

/** A realm's guardian: the owl over its Realm Vote spot (the `idol` door). */
export interface GuardianDef {
  /** The realm's room id, or a neutral id held for a realm that is not open yet. */
  realm: string;
  /** A real owl species from the one list (OWL_SPECIES), never another realm's. */
  species: OwlSpeciesId;
  /** Held for a realm not open yet, so no other realm takes its species; it has no room. */
  reserved?: true;
}

/**
 * Every realm's guardian owl and its species (OP-112): a different real species in each realm, so
 * the realms read apart at a glance. The grove's guardian is a great horned owl, the market's giant
 * robot is built as a barred owl and the stained-glass realm's idol is a barn owl. Two are held for
 * realms not open yet: the snowy owl for the ink-wash realm and the burrowing owl for a desert realm.
 *
 * TODO-DOCS (OP-112): docs/GLOSSARY.md (Guardian: every realm has one, each a species of its own;
 * Species: the barred owl is the market guardian's only) and docs/ART-PIPELINE.md's `robot-owl` row
 * (built as a barred owl).
 */
export const GUARDIANS: readonly GuardianDef[] = [
  { realm: 'grove', species: 'great-horned' },
  { realm: 'market', species: 'barred' },
  { realm: 'glass', species: 'barn' },
  { realm: 'ink', species: 'snowy', reserved: true },
  { realm: 'desert', species: 'burrowing', reserved: true },
];

/** The rooms the realms setting gates, as the keepers' page lists them. */
export const GATED_ROOMS: readonly string[] = Object.values(ROOMS).filter((r) => r.gated).map((r) => r.id);

/**
 * The rooms of today's park an owl walking the tree can go into (OP-162): the realms a level of the
 * tree opens into, and every room their doorways lead to, each doorway taken the tree's way
 * (`toTree` before `to`). An owl in one of them keeps walking the tree; one anywhere else of map 1
 * walks today's park.
 */
export const TREE_REALMS: ReadonlySet<string> = (() => {
  const seen = new Set<string>();
  const next = Object.values(ROOMS).filter((r) => mapOf(r) === 2);
  for (let room = next.pop(); room; room = next.pop()) {
    for (const d of room.doors) {
      const to = roomFor((d.toTree ?? d.to)?.room ?? '');
      if (!to || mapOf(to) === 2 || seen.has(to.id)) continue;
      seen.add(to.id);
      next.push(to);
    }
  }
  return seen;
})();

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
