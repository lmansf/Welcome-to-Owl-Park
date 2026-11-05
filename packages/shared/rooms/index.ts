import type { Polygon } from '../src/geometry';
import { isNestRoom } from '../src/homes';
import { doorTarget } from '../src/doorways';
import type { Perch } from '../src/perches';
import type { Vec2 } from '../src/protocol';
import { ROOM_H, ROOM_W, mapOf, type RoomDef } from '../src/room';
import type { OwlSpeciesId } from '../src/species';
import { TRIAL_COURSE, TRIAL_ROOMS } from './trialCourse';
import type { CourseDef } from '../src/course';

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
 * The lobby is the park's front entrance, where every visitor arrives: the painted ticket booth on
 * one side (it sells nothing since OP-180: the turnstiles sell a Day Ticket), the turnstile gate into
 * the hub on the other. It is two screens wide, its painting the
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

/** A polygon from [x, y] pairs measured on one screen's painting (1600 x 900), that screen `screen` screens east (room px). */
function onScreen(screen: number, ...p: ReadonlyArray<readonly [number, number]>): Polygon {
  return p.map(([x, y]) => ({ x: screen * ROOM_W + x, y }));
}

/** A rectangle from x0, y0 to x1, y1 as a polygon (room px). */
function box(x0: number, y0: number, x1: number, y1: number): Polygon {
  return pts([x0, y0], [x1, y0], [x1, y1], [x0, y1]);
}

/** An arched opening from x0 to x1, its round top at y0 and its foot at y1, as a polygon (room px). */
function arch(x0: number, y0: number, x1: number, y1: number, steps = 12): Polygon {
  const r = (x1 - x0) / 2;
  const top = Array.from({ length: steps + 1 }, (_, i) => {
    const a = Math.PI + (Math.PI * i) / steps;
    return { x: Math.round(x0 + r + r * Math.cos(a)), y: Math.round(y0 + r + r * Math.sin(a)) };
  });
  return [{ x: x0, y: y1 }, ...top, { x: x1, y: y1 }];
}

/** An oval about cx, cy, rx across and ry up and down from it, as a polygon (room px). */
function oval(cx: number, cy: number, rx: number, ry: number, steps = 24): Polygon {
  return Array.from({ length: steps }, (_, i) => {
    const a = (2 * Math.PI * i) / steps;
    return { x: Math.round(cx + rx * Math.cos(a)), y: Math.round(cy + ry * Math.sin(a)) };
  });
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
      // The arcade's door; for an owl walking the tree, the arcade is down in level 0's cave (OP-163).
      { id: 'to-arcade', rect: { x: 3098, y: 678, w: 60, h: 36 }, to: { room: 'arcade', spawn: 'from-market' }, closedInTree: true, marker: { x: 3126, y: 640 } },
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
      { id: 'to-hub', rect: { x: 150, y: 690, w: 140, h: 75 }, to: { room: 'hub', spawn: 'from-glass' }, toTree: { room: 'l3', spawn: 'glass' }, marker: { x: 220, y: 728 } },
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
      // The lobby: the lintel over the way down, a flap from the floor; the shelf fungus over it, a jump
      // from the lintel. The spiral stair is taken from the floor at its foot (OP-220), so its treads and
      // the balcony at its top are not ledges: an owl goes up by the doorway, never by hopping the stair.
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
      // On the way to the market, the level's first hill (OP-238): the lane rises gently (1 in 4) over a
      // knoll, 80 up at its top, and down again before the archway. Drawn by the art kit (rooms/kit.ts).
      {
        ...treeLedge('knoll', 3 * ROOM_W + 300, 3 * ROOM_W + 940, 80),
        profile: [
          { x: 3 * ROOM_W + 300, top: 0 },
          { x: 3 * ROOM_W + 620, top: 80 },
          { x: 3 * ROOM_W + 940, top: 0 },
        ],
      },
      // The roof run's crates, roofs and lantern tower lead nowhere yet (the market's adventure is still
      // to come), so they are not ledges: a rope across the foot of the crates shuts the climb (OP-220).
    ],
    // What is painted in front of the path, drawn again over the owls (OP-173): the west path's two lamp
    // posts (their poles and lanterns), the post in front of the market square's stall, the lobby stair's
    // banister and the tower balcony's railing. The banister is raised: drawn over an owl on the stair,
    // never over one walking by on the floor in front of the stair. Rails and spindles are cut one by one
    // from the paintings, so what shows between them (the wall, the steps, the tower) stays behind.
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
      // The lobby stair's banister (raised): its rail round to the foot post, the post, and the spindles under the upper flight.
      {
        id: 'banister-rail',
        raised: true,
        poly: onScreen(
          1,
          [866, 443], [880, 455], [896, 468], [912, 482], [928, 495], [944, 508], [960, 521], [976, 535], [990, 547], [993, 556], [998, 564], [1003, 572],
          [1007, 580], [1009, 588], [1011, 596], [1012, 604], [1011, 612], [1010, 620], [1008, 628], [1005, 636], [1001, 644], [997, 652], [992, 660], [986, 668],
          [980, 676], [973, 684], [956, 684], [968, 676], [975, 668], [982, 660], [987, 652], [992, 644], [995, 636], [998, 628], [1000, 620], [1002, 612],
          [1002, 604], [1002, 596], [1000, 588], [998, 580], [994, 572], [989, 564], [983, 556], [977, 549], [968, 542], [952, 529], [936, 515], [920, 502],
          [904, 489], [888, 476], [872, 462], [866, 457],
        ),
      },
      { id: 'banister-post', raised: true, poly: onScreen(1, [955, 682], [966, 682], [976, 690], [975, 701], [971, 703], [971, 735], [974, 738], [974, 757], [949, 757], [949, 738], [952, 735], [952, 703], [948, 700], [948, 690]) },
      {
        id: 'banister-spindles-1',
        raised: true,
        poly: onScreen(
          1,
          [868, 460], [868, 477], [869, 478], [868, 489], [889, 506], [892, 506], [891, 505], [892, 502], [890, 501], [891, 500], [890, 480], [893, 479],
          [884, 472], [874, 471], [874, 469], [877, 466], [870, 460],
        ),
      },
      { id: 'banister-spindle-2', raised: true, poly: onScreen(1, [900, 486], [899, 489], [902, 494], [899, 504], [899, 511], [900, 514], [909, 521], [909, 519], [907, 518], [908, 506], [906, 499], [908, 492]) },
      { id: 'banister-spindle-3', raised: true, poly: onScreen(1, [916, 499], [915, 503], [917, 505], [917, 513], [915, 517], [915, 525], [919, 530], [923, 532], [925, 531], [923, 530], [924, 518], [922, 507], [925, 506]) },
      { id: 'banister-spindle-4', raised: true, poly: onScreen(1, [932, 513], [932, 517], [934, 519], [932, 539], [934, 542], [943, 548], [941, 544], [943, 535], [940, 523], [944, 522], [934, 513]) },
      {
        id: 'banister-spindles-5',
        raised: true,
        poly: onScreen(
          1,
          [944, 523], [949, 528], [950, 533], [948, 535], [951, 536], [952, 538], [951, 541], [948, 542], [950, 544], [950, 550], [946, 551], [990, 586],
          [990, 580], [988, 579], [990, 578], [990, 563], [981, 552], [946, 523],
        ),
      },
      { id: 'banister-spindle-6', raised: true, poly: onScreen(1, [988, 652], [998, 648], [1000, 660], [998, 700], [990, 700], [987, 665]) },
      // The tower balcony's railing: its two rails and six posts, over an owl on the balcony.
      {
        id: 'railing-top',
        poly: onScreen(
          3,
          [1257, 206], [1272, 203], [1300, 199], [1330, 197], [1365, 196], [1395, 196], [1430, 197], [1460, 199], [1490, 203], [1504, 205], [1504, 213], [1490, 211],
          [1460, 207], [1430, 205], [1395, 204], [1365, 204], [1330, 205], [1300, 207], [1272, 211], [1257, 214],
        ),
      },
      {
        id: 'railing-middle',
        poly: onScreen(
          3,
          [1257, 223], [1272, 220], [1300, 217], [1330, 215], [1365, 213], [1395, 215], [1430, 216], [1460, 216], [1490, 221], [1504, 223], [1504, 231], [1490, 229],
          [1460, 224], [1430, 224], [1395, 223], [1365, 221], [1330, 223], [1300, 225], [1272, 228], [1257, 231],
        ),
      },
      { id: 'railing-post-1', poly: onScreen(3, [1257, 198], [1267, 198], [1268, 200], [1268, 247], [1256, 247], [1256, 200]) },
      { id: 'railing-post-2', poly: onScreen(3, [1284, 193], [1292, 193], [1293, 195], [1293, 247], [1283, 247], [1283, 195]) },
      { id: 'railing-post-3', poly: onScreen(3, [1344, 190], [1355, 190], [1356, 192], [1356, 247], [1343, 247], [1343, 192]) },
      { id: 'railing-post-4', poly: onScreen(3, [1410, 188], [1421, 188], [1422, 190], [1422, 247], [1409, 247], [1409, 190]) },
      { id: 'railing-post-5', poly: onScreen(3, [1473, 191], [1481, 191], [1482, 193], [1482, 247], [1472, 247], [1472, 193]) },
      { id: 'railing-post-6', poly: onScreen(3, [1494, 196], [1503, 196], [1504, 198], [1504, 247], [1493, 247], [1493, 198]) },
    ],
    // Painted glows that do nothing yet, shaded so they do not read as things to use (OP-173): the
    // closed gate's lit doors, the lobby's booth window and the nest of eggs over it, the market square's lit stall
    // windows and the roof run's lit stall fronts.
    shades: [
      // Each follows the painted shape it quiets (a door, an arch, the nest's bowl, a row of windows);
      // the game softens its edge, so it reads as shadow over the painting, never as a box.
      { id: 'gate-doors', poly: box(288, 448, 542, 711), alpha: 0.45 },
      { id: 'booth-window', poly: arch(ROOM_W + 807, 611, ROOM_W + 855, 674), alpha: 0.5 },
      // The nest of eggs high in the hollow has nothing under it to jump from, so it is quieted rather than made a ledge.
      { id: 'nest', poly: oval(ROOM_W + 830, 322, 66, 28), alpha: 0.35 },
      { id: 'stall-windows', poly: box(2 * ROOM_W + 558, 508, 2 * ROOM_W + 1108, 592), alpha: 0.35 },
      { id: 'stall-fronts', poly: box(3 * ROOM_W + 492, 614, 3 * ROOM_W + 1232, 698), alpha: 0.35 },
    ],
    // Owls come in at the lobby's middle; the west end's spawn stands where the overlay's grass leaves
    // the path clear; one back from the market comes out just short of the tower's archway.
    spawns: {
      default: { x: ROOM_W + 800, y: TREE_GROUND },
      west: { x: 720, y: TREE_GROUND },
      east: { x: 3 * ROOM_W + 1100, y: TREE_GROUND },
      market: { x: 3 * ROOM_W + 1230, y: TREE_GROUND },
      // Down from level 2, just west of the stair up; up from level 0, just east of the way down: each
      // arrival faces the level's other stair, so an owl climbing the tree crosses no doorway (OP-220).
      'from-l2': { x: ROOM_W + 900, y: TREE_GROUND },
      'from-l0': { x: ROOM_W + 760, y: TREE_GROUND },
    },
    doors: [
      // The closed gate at the west end: a blockade on the stone apron in front of it, its phrase on
      // its board; the door turns owls back at the apron's edge, where the overlay's grass leaves the
      // path clear.
      { id: 'closed-west', rect: { x: 630, y: 750, w: 60, h: 40 }, closedSign: 'Not Yet Fledged', top: 0, marker: { x: 415, y: TREE_GROUND } },
      // The archway at the foot of the lantern tower, at the roof run's east end: into the market's
      // own screens (OP-155's grid), whose way out brings a tree owl back here. Taken on the
      // ground only, so an owl on the high roof or the balcony over it walks on past.
      // Down to level 0, through the arched way down under the lintel, on the floor: the lobby's west stair.
      { id: 'stair-l1-l0', rect: { x: ROOM_W + 610, y: 750, w: 90, h: 40 }, to: { room: 'l0', spawn: 'from-l1' }, top: 0, way: 'down', markAt: { x: ROOM_W + 653, y: 640 } },
      // Up to level 2: the spiral stair, its east stair, taken from the floor at its foot (OP-220).
      { id: 'stair-l2-l1', rect: { x: ROOM_W + 960, y: 750, w: 110, h: 40 }, to: { room: 'l2', spawn: 'from-l1' }, top: 0, way: 'up', markAt: { x: ROOM_W + 1015, y: 560 } },
      { id: 'to-market', rect: { x: 3 * ROOM_W + 1300, y: 750, w: 90, h: 40 }, to: { room: 'market', spawn: 'default' }, top: 0, markAt: { x: 3 * ROOM_W + 1365, y: 462 } },
    ],
    // What shuts the ways not open yet (OP-220): a locked gate where the floor ends before the ink-wash
    // realm's closed gate, and a rope across the foot of the roof run's crates (the boardwalk under it runs
    // on to the archway).
    barriers: [
      { id: 'closed-west', kind: 'gate', x: 570, w: 90, sign: 'Not Yet Fledged' },
      { id: 'roof-run', kind: 'rope', x: 3 * ROOM_W + 60, w: 220, sign: 'Hatching Soon' },
    ],
  },
  // Level 4, the sky landing (OP-159): two screens, the stair landing round the trunk (0) and the quiet
  // overlook east of it (+1), painted in the six layers of OP-173: the sky at half the camera's pace, the
  // middle distance at three quarters (the overlook has none: its view stays open), the back scenery,
  // the platforms and the front props (all three cut from one painting of each screen, so they stay in
  // register), and the overlay at 1.2 in front of the owls. Only the back scenery is drawn a step
  // quieter; the platforms are drawn as painted, so what an owl stands on stands out, and the front
  // props (each screen's lantern post) are drawn over the owls, under the overlay. The ledges are the
  // platforms' own tops, measured on their layer at 1600 x 900. The stairs up to level 5 and down to
  // level 3 are added as those levels are built. Gated like level 1.
  l4: {
    id: 'l4',
    map: 2,
    gated: true,
    owlScale: 1.25,
    size: { w: 2 * ROOM_W, h: ROOM_H },
    background: 'tree-l4-0-back',
    backgrounds: [
      // The skies: the landing's lies over the overlook's and fades into it.
      { key: 'tree-l4-e1-bg', x: ROOM_W, y: 0, rate: 0.5 },
      { key: 'tree-l4-0-bg', x: 0, y: 0, rate: 0.5, fade: { right: TREE_SKY_FADE } },
      // The landing's middle distance, fading into the overlook's open view.
      { key: 'tree-l4-0-mid', x: 0, y: 0, rate: 0.75, fade: { left: TREE_MID_FADE, right: TREE_MID_FADE } },
      // The back scenery (quieted), then the platforms over it (as painted), edge to edge.
      ...['0', 'e1'].map((s, i) => ({ key: `tree-l4-${s}-back`, x: i * ROOM_W, y: 0 })),
      ...['0', 'e1'].map((s, i) => ({ key: `tree-l4-${s}-play`, x: i * ROOM_W, y: 0, plain: true })),
    ],
    foregrounds: [
      // The front props with the room, over the owls; then the overlay, over everything.
      ...['0', 'e1'].map((s, i) => ({ key: `tree-l4-${s}-front`, x: i * ROOM_W, y: 0, plain: true })),
      ...['0', 'e1'].map((s, i) => ({ key: `tree-l4-${s}-fg`, x: i * ROOM_W, y: 0, rate: 1.2, fade: { left: TREE_EDGE_FADE, right: TREE_EDGE_FADE } })),
    ],
    mood: 'hub',
    // The boardwalk round the trunk, from its west end on the landing to the railing at the overlook's end.
    walkable: [
      [
        { x: 130, y: TREE_GROUND - TREE_STRIP },
        { x: ROOM_W + 1330, y: TREE_GROUND - TREE_STRIP },
        { x: ROOM_W + 1330, y: TREE_GROUND + TREE_STRIP },
        { x: 130, y: TREE_GROUND + TREE_STRIP },
      ],
    ],
    perches: [
      // The landing has none: its spiral stair up is taken from the floor at its foot (OP-220), so its
      // treads and the balcony west of the trunk (reached only from them) are not ledges.
      // The overlook: a stair of perches up the bough, each a hop and a short gap on from the last: the
      // stump, the board on its post, the mushroom's cap and the lookout at the top.
      treeLedge('stump', ROOM_W + 352, ROOM_W + 520, 111),
      treeLedge('board', ROOM_W + 584, ROOM_W + 732, 233),
      treeLedge('mushroom', ROOM_W + 800, ROOM_W + 1056, 330),
      treeLedge('lookout', ROOM_W + 1124, ROOM_W + 1224, 431),
    ],
    // Owls come in on the landing, just west of the stair's foot; the east spawn is at the overlook's railing.
    spawns: {
      default: { x: 800, y: TREE_GROUND },
      west: { x: 220, y: TREE_GROUND },
      east: { x: ROOM_W + 1240, y: TREE_GROUND },
      // Up from level 3, just east of the way down; down from level 5, just west of the stair up: each
      // arrival faces the level's other stair (OP-220).
      'from-l3': { x: 780, y: TREE_GROUND },
      'from-l5': { x: 840, y: TREE_GROUND },
    },
    doors: [
      // The way down to level 3, west of the trunk: the stair behind the railing, taken from the boardwalk.
      { id: 'stair-l4-l3', rect: { x: 640, y: 750, w: 100, h: 40 }, to: { room: 'l3', spawn: 'from-l4' }, top: 0, way: 'down', markAt: { x: 690, y: 560 } },
      // Up to level 5, east of it: the spiral stair round the trunk, taken from the floor at its foot (OP-220).
      { id: 'stair-l5-l4', rect: { x: 880, y: 750, w: 100, h: 40 }, to: { room: 'l5', spawn: 'from-l4' }, top: 0, way: 'up', markAt: { x: 930, y: 600 } },
    ],
  },
  // Level 3, the high branch east (OP-160): three screens, the trunk's landing (0) with its stair up to
  // level 4, the stained-glass realm's common area (+1) and its reach (+2), where the stained-glass
  // street's doorway stands and a stair of perches climbs the branch toward its tip. Painted in the six
  // layers as level 4 (only the landing has front props; the common area stays open, with no middle
  // distance). Both stairs are taken from the floor (OP-220): down to level 2 at the boardwalk's west end,
  // where the game draws the stairhead (the painting has none there), and up to level 4 at the foot of the
  // painted stair east of it. The branch's perches toward the tip lead nowhere yet, so a rope shuts them.
  l3: {
    id: 'l3',
    map: 2,
    gated: true,
    owlScale: 1.25,
    size: { w: 3 * ROOM_W, h: ROOM_H },
    background: 'tree-l3-0-back',
    backgrounds: [
      // The skies, farthest from the trunk first: each lies over the one beyond it and fades into it.
      { key: 'tree-l3-e2-bg', x: 2 * ROOM_W, y: 0, rate: 0.5 },
      { key: 'tree-l3-e1-bg', x: ROOM_W, y: 0, rate: 0.5, fade: { right: TREE_SKY_FADE } },
      { key: 'tree-l3-0-bg', x: 0, y: 0, rate: 0.5, fade: { right: TREE_SKY_FADE } },
      // The middle distance of the landing and the reach, each fading into the common area's open view.
      { key: 'tree-l3-0-mid', x: 0, y: 0, rate: 0.75, fade: { left: TREE_MID_FADE, right: TREE_MID_FADE } },
      { key: 'tree-l3-e2-mid', x: 2 * ROOM_W, y: 0, rate: 0.75, fade: { left: TREE_MID_FADE, right: TREE_MID_FADE } },
      ...['0', 'e1', 'e2'].map((s, i) => ({ key: `tree-l3-${s}-back`, x: i * ROOM_W, y: 0 })),
      ...['0', 'e1', 'e2'].map((s, i) => ({ key: `tree-l3-${s}-play`, x: i * ROOM_W, y: 0, plain: true })),
    ],
    foregrounds: [
      { key: 'tree-l3-0-front', x: 0, y: 0, plain: true },
      ...['0', 'e1', 'e2'].map((s, i) => ({ key: `tree-l3-${s}-fg`, x: i * ROOM_W, y: 0, rate: 1.2, fade: { left: TREE_EDGE_FADE, right: TREE_EDGE_FADE } })),
    ],
    mood: 'hub',
    // The boardwalk from the landing's west end, through the common area, to the end of the reach's
    // boardwalk, where the rope across the branch stops an owl.
    walkable: [
      [
        { x: 150, y: TREE_GROUND - TREE_STRIP },
        { x: 2 * ROOM_W + 880, y: TREE_GROUND - TREE_STRIP },
        { x: 2 * ROOM_W + 880, y: TREE_GROUND + TREE_STRIP },
        { x: 150, y: TREE_GROUND + TREE_STRIP },
      ],
    ],
    // No ledges: the stair up is taken at its foot (OP-220), so its treads and its landing are not ledges,
    // and the reach's stump, table, fungus, boards and tip lead nowhere yet, behind the rope.
    spawns: {
      default: { x: 300, y: TREE_GROUND },
      // Down from level 4, just west of the stair up; up from level 2, just east of the stairhead: each
      // arrival faces the level's other stair (OP-220).
      'from-l4': { x: 450, y: TREE_GROUND },
      east: { x: 2 * ROOM_W + 820, y: TREE_GROUND },
      // Back out of the stained-glass street, in front of its doorway.
      glass: { x: 2 * ROOM_W + 690, y: TREE_GROUND },
      'from-l2': { x: 340, y: TREE_GROUND },
    },
    doors: [
      // Down to level 2, at the boardwalk's west end: the stairhead the game draws (`landings`).
      { id: 'stair-l3-l2', rect: { x: 170, y: 750, w: 100, h: 40 }, to: { room: 'l2', spawn: 'from-l3' }, top: 0, way: 'down', markAt: { x: 220, y: 640 } },
      // Up to level 4: the painted stair up the trunk, taken from the floor at its foot.
      { id: 'stair-l4-l3', rect: { x: 500, y: 750, w: 110, h: 40 }, to: { room: 'l4', spawn: 'from-l3' }, top: 0, way: 'up', markAt: { x: 555, y: 600 } },
      // The stained-glass doorway on the reach: into the realm's street (today's stained-glass realm),
      // whose way out brings a tree owl back here.
      { id: 'to-glass', rect: { x: 2 * ROOM_W + 480, y: 750, w: 120, h: 40 }, to: { room: 'glass', spawn: 'default' }, top: 0, markAt: { x: 2 * ROOM_W + 538, y: 430 } },
    ],
    // The stairhead down through the boardwalk's west end, where the painting shows no stair (OP-220).
    landings: [{ id: 'stair-l3-l2', x: 160, w: 120 }],
    // The rope from the reach's railing post across the branch: the perches toward the tip are shut for now.
    barriers: [{ id: 'reach', kind: 'rope', x: 2 * ROOM_W + 850, w: 70, sign: 'Hatching Soon' }],
  },
  // Level 2, the high branch west (OP-161): three screens, the trunk's landing (0) with its stairs up to
  // level 3 and down to level 1, the grove's common area (-1), left open for its idol, guardian and game,
  // and its reach (-2), the treetop diner (OP-165) with the tip's perch at the branch's end. Painted in
  // the six layers as levels 3 and 4 (only the landing has front props). Both stairs are taken from the
  // floor (OP-220): down to level 1 west of the trunk, where the game draws the stairhead (the painting has
  // none there), and up to level 3 at the foot of the painted stair. The steps behind the trunk's east
  // side lead nowhere now, so a rope ends the boardwalk before them.
  l2: {
    id: 'l2',
    map: 2,
    gated: true,
    owlScale: 1.25,
    size: { w: 3 * ROOM_W, h: ROOM_H },
    background: 'tree-l2-0-back',
    backgrounds: [
      // The skies, farthest from the trunk first: each lies over the one beyond it and fades into it.
      { key: 'tree-l2-w2-bg', x: 0, y: 0, rate: 0.5 },
      { key: 'tree-l2-w1-bg', x: ROOM_W, y: 0, rate: 0.5, fade: { left: TREE_SKY_FADE } },
      { key: 'tree-l2-0-bg', x: 2 * ROOM_W, y: 0, rate: 0.5, fade: { left: TREE_SKY_FADE } },
      ...['w2', 'w1', '0'].map((s, i) => ({ key: `tree-l2-${s}-mid`, x: i * ROOM_W, y: 0, rate: 0.75, fade: { left: TREE_MID_FADE, right: TREE_MID_FADE } })),
      ...['w2', 'w1', '0'].map((s, i) => ({ key: `tree-l2-${s}-back`, x: i * ROOM_W, y: 0 })),
      ...['w2', 'w1', '0'].map((s, i) => ({ key: `tree-l2-${s}-play`, x: i * ROOM_W, y: 0, plain: true })),
    ],
    foregrounds: [
      { key: 'tree-l2-0-front', x: 2 * ROOM_W, y: 0, plain: true },
      ...['w2', 'w1', '0'].map((s, i) => ({ key: `tree-l2-${s}-fg`, x: i * ROOM_W, y: 0, rate: 1.2, fade: { left: TREE_EDGE_FADE, right: TREE_EDGE_FADE } })),
    ],
    mood: 'hub',
    // The branch's top out to its tip in the west, the diner's deck, the common area and the landing, to
    // the rope on the trunk's east side.
    walkable: [
      [
        { x: 160, y: TREE_GROUND - TREE_STRIP },
        { x: 2 * ROOM_W + 1100, y: TREE_GROUND - TREE_STRIP },
        { x: 2 * ROOM_W + 1100, y: TREE_GROUND + TREE_STRIP },
        { x: 160, y: TREE_GROUND + TREE_STRIP },
      ],
    ],
    perches: [
      // The reach: the round perch at the branch's tip, west of the diner's deck (the capstone's place).
      // The landing's stair is taken at its foot (OP-220), so its treads and landing are not ledges.
      treeLedge('tip', 82, 168, 64),
    ],
    spawns: {
      default: { x: 2 * ROOM_W + 300, y: TREE_GROUND },
      west: { x: 460, y: TREE_GROUND },
      // Up from level 1, just east of the stairhead; down from level 3, just west of the stair up: each
      // arrival faces the level's other stair (OP-220).
      'from-l1': { x: 2 * ROOM_W + 340, y: TREE_GROUND },
      'from-l3': { x: 2 * ROOM_W + 470, y: TREE_GROUND },
    },
    doors: [
      // Down to level 1, west of the trunk: the stairhead the game draws (`landings`).
      { id: 'stair-l2-l1', rect: { x: 2 * ROOM_W + 180, y: 750, w: 100, h: 40 }, to: { room: 'l1', spawn: 'from-l2' }, top: 0, way: 'down', markAt: { x: 2 * ROOM_W + 230, y: 640 } },
      // Up to level 3: the painted stair up the trunk, taken from the floor at its foot.
      { id: 'stair-l3-l2', rect: { x: 2 * ROOM_W + 540, y: 750, w: 110, h: 40 }, to: { room: 'l3', spawn: 'from-l2' }, top: 0, way: 'up', markAt: { x: 2 * ROOM_W + 595, y: 600 } },
    ],
    // The stairhead down through the boardwalk, where the painting shows no stair (OP-220).
    landings: [{ id: 'stair-l2-l1', x: 2 * ROOM_W + 170, w: 120 }],
    // The rope across the boardwalk on the trunk's east side, before the painted steps behind it.
    barriers: [{ id: 'trunk-east', kind: 'rope', x: 2 * ROOM_W + 1070, w: 70, sign: 'Hatching Soon' }],
  },
  // Level 5, the canopy (OP-158): six screens, in two rooms so a room stays at most four screens (decided
  // 2026-11-01), split at the front gate so the Day Ticket is sold where the tree's park begins (also
  // decided then). The nests street (`l5-street`, outside the gate) is the three screens from the street's
  // far west end to the trunk's crown: the second parkour bough (6) climbing west, shut for now behind a
  // fallen branch at its foot, where a closed doorway waits for the places beyond Owl Park (the owner's
  // steer, 2026-11-02), the nest doors along the boardwalk, and the trunk. Its east end is the front gate:
  // the turnstiles let an owl on into the canopy (`l5`, inside), under the entrance arch (+1), past the
  // stair down to level 4, the lounge and gift shop (+2), to the first parkour bough (7, +3), shut the same
  // way at the pier's end (OP-220: neither bough leads anywhere yet). Painted in the six layers as levels 2 to 4 (only
  // the trunk has front props).
  'l5-street': {
    id: 'l5-street',
    map: 2,
    gated: true,
    owlScale: 1.25,
    size: { w: 3 * ROOM_W, h: ROOM_H },
    background: 'tree-l5-w1-back',
    backgrounds: [
      // The skies, farthest from the trunk first: each lies over the one beyond it and fades into it.
      { key: 'tree-l5-w2-bg', x: 0, y: 0, rate: 0.5 },
      { key: 'tree-l5-w1-bg', x: ROOM_W, y: 0, rate: 0.5, fade: { left: TREE_SKY_FADE } },
      { key: 'tree-l5-0-bg', x: 2 * ROOM_W, y: 0, rate: 0.5, fade: { left: TREE_SKY_FADE } },
      ...['w2', 'w1', '0'].map((s, i) => ({ key: `tree-l5-${s}-mid`, x: i * ROOM_W, y: 0, rate: 0.75, fade: { left: TREE_MID_FADE, right: TREE_MID_FADE } })),
      ...['w2', 'w1', '0'].map((s, i) => ({ key: `tree-l5-${s}-back`, x: i * ROOM_W, y: 0 })),
      ...['w2', 'w1', '0'].map((s, i) => ({ key: `tree-l5-${s}-play`, x: i * ROOM_W, y: 0, plain: true })),
    ],
    foregrounds: [
      { key: 'tree-l5-0-front', x: 2 * ROOM_W, y: 0, plain: true },
      ...['w2', 'w1', '0'].map((s, i) => ({ key: `tree-l5-${s}-fg`, x: i * ROOM_W, y: 0, rate: 1.2, fade: { left: TREE_EDGE_FADE, right: TREE_EDGE_FADE } })),
    ],
    mood: 'hub',
    // The boardwalk past the nest doors, from the fallen branch at the foot of the bough in the west, round
    // the trunk, to the gate. Bough 6's stones, plank, mushroom and far perch are painted but are not ledges.
    walkable: [
      [
        { x: 580, y: TREE_GROUND - TREE_STRIP },
        { x: 3 * ROOM_W - 20, y: TREE_GROUND - TREE_STRIP },
        { x: 3 * ROOM_W - 20, y: TREE_GROUND + TREE_STRIP },
        { x: 580, y: TREE_GROUND + TREE_STRIP },
      ],
    ],
    spawns: {
      default: { x: ROOM_W + 800, y: TREE_GROUND },
      west: { x: 700, y: TREE_GROUND },
      // Back out of the gate from the canopy, in front of the turnstiles.
      'from-canopy': { x: 3 * ROOM_W - 220, y: TREE_GROUND },
      // Out of the park by the Menu, or back from checkout in this page: before the gate, as the lobby's 'from-hub' is (LEFT_PARK_SPAWN).
      'from-hub': { x: 3 * ROOM_W - 220, y: TREE_GROUND },
      // Out of a nest, just east of its door (door 0 the owl's own, nearest the gate): beside the doorstep,
      // not on it, since an owl standing in a nest's doorway goes in as soon as the street says whose it is.
      'from-nest-0': { x: 3080, y: TREE_GROUND },
      'from-nest-1': { x: 2765, y: TREE_GROUND },
      'from-nest-2': { x: 2220, y: TREE_GROUND },
      'from-nest-3': { x: 1925, y: TREE_GROUND },
      'from-nest-4': { x: 1345, y: TREE_GROUND },
      'from-nest-5': { x: 1120, y: TREE_GROUND },
    },
    doors: [
      // The tree's front gate, at the street's east end past the trunk: its turnstiles let an owl with a
      // ticket on into the canopy, under the entrance arch, and sell a Day Ticket to one without (OP-180).
      { id: 'gate', rect: { x: 3 * ROOM_W - 100, y: 750, w: 80, h: 40 }, to: { room: 'l5', spawn: 'default' }, top: 0, markAt: { x: 3 * ROOM_W - 60, y: 600 } },
      // The nest doors along the boardwalk, as today's street's (STREET_DOORS): the owl's own nest behind
      // door 0, nearest the gate, and up to five other owls' open nests west of it. Each door's flag hangs
      // over it. The westmost painted door is a nest still to hatch.
      { id: 'nest-door-0', rect: { x: 2960, y: 750, w: 100, h: 40 }, top: 0, marker: { x: 3010, y: 590 } },
      { id: 'nest-door-1', rect: { x: 2645, y: 750, w: 100, h: 40 }, top: 0, marker: { x: 2695, y: 590 } },
      { id: 'nest-door-2', rect: { x: 2100, y: 750, w: 100, h: 40 }, top: 0, marker: { x: 2150, y: 590 } },
      { id: 'nest-door-3', rect: { x: 1805, y: 750, w: 100, h: 40 }, top: 0, marker: { x: 1855, y: 590 } },
      { id: 'nest-door-4', rect: { x: 1225, y: 750, w: 100, h: 40 }, top: 0, marker: { x: 1275, y: 590 } },
      { id: 'nest-door-5', rect: { x: 1000, y: 750, w: 100, h: 40 }, top: 0, marker: { x: 1050, y: 590 } },
      { id: 'spare-nest', rect: { x: 770, y: 750, w: 100, h: 40 }, closedSign: 'Hatching Soon', top: 0, marker: { x: 820, y: TREE_GROUND } },
      // The street's west end, at the foot of bough 6: a doorway for the places beyond Owl Park, shut until
      // one exists (no destination yet; the owner's steer, OP-158), on the floor behind its fallen branch.
      { id: 'closed-beyond', rect: { x: 590, y: 750, w: 60, h: 40 }, closedSign: 'Hatching Soon', top: 0, marker: { x: 600, y: TREE_GROUND } },
    ],
    // OP-220: a fallen branch across the bough's foot, where the floor ends (the way beyond, and bough 6,
    // shut for now), and boards nailed over the nest still to hatch.
    barriers: [
      { id: 'closed-beyond', kind: 'branch', x: 540, w: 90, sign: 'Hatching Soon' },
      { id: 'spare-nest', kind: 'boards', x: 770, w: 100, sign: 'Hatching Soon' },
    ],
  },
  l5: {
    id: 'l5',
    map: 2,
    gated: true,
    owlScale: 1.25,
    size: { w: 3 * ROOM_W, h: ROOM_H },
    background: 'tree-l5-e1-back',
    backgrounds: [
      // The skies, farthest from the gate first: each lies over the one beyond it and fades into it.
      { key: 'tree-l5-e3-bg', x: 2 * ROOM_W, y: 0, rate: 0.5 },
      { key: 'tree-l5-e2-bg', x: ROOM_W, y: 0, rate: 0.5, fade: { right: TREE_SKY_FADE } },
      { key: 'tree-l5-e1-bg', x: 0, y: 0, rate: 0.5, fade: { right: TREE_SKY_FADE } },
      ...['e1', 'e2', 'e3'].map((s, i) => ({ key: `tree-l5-${s}-mid`, x: i * ROOM_W, y: 0, rate: 0.75, fade: { left: TREE_MID_FADE, right: TREE_MID_FADE } })),
      ...['e1', 'e2', 'e3'].map((s, i) => ({ key: `tree-l5-${s}-back`, x: i * ROOM_W, y: 0 })),
      ...['e1', 'e2', 'e3'].map((s, i) => ({ key: `tree-l5-${s}-play`, x: i * ROOM_W, y: 0, plain: true })),
    ],
    foregrounds: ['e1', 'e2', 'e3'].map((s, i) => ({ key: `tree-l5-${s}-fg`, x: i * ROOM_W, y: 0, rate: 1.2, fade: { left: TREE_EDGE_FADE, right: TREE_EDGE_FADE } })),
    mood: 'hub',
    // The boardwalk from the gate, under the entrance arch, past the lounge and the gift shop, to the end
    // of the pier, where a fallen branch shuts bough 7 for now (OP-220: its stumps, plank, branch and tip
    // are painted but are not ledges, since the bough leads nowhere yet).
    walkable: [
      [
        { x: 20, y: TREE_GROUND - TREE_STRIP },
        { x: 2 * ROOM_W + 680, y: TREE_GROUND - TREE_STRIP },
        { x: 2 * ROOM_W + 680, y: TREE_GROUND + TREE_STRIP },
        { x: 20, y: TREE_GROUND + TREE_STRIP },
      ],
    ],
    spawns: {
      // Through the gate: under the entrance arch.
      default: { x: 800, y: TREE_GROUND },
      // Up from level 4, at the foot of the stair behind the arch.
      'from-l4': { x: 1160, y: TREE_GROUND },
      east: { x: 2 * ROOM_W + 560, y: TREE_GROUND },
    },
    doors: [
      // Back out through the gate, to the street.
      { id: 'to-street', rect: { x: 20, y: 750, w: 80, h: 40 }, to: { room: 'l5-street', spawn: 'from-canopy' }, top: 0, markAt: { x: 60, y: 600 } },
      // Down to level 4, the way into the tree: the railed stair behind the arch, taken from the boardwalk,
      // its mark pointing down (OP-220).
      { id: 'stair-l5-l4', rect: { x: 1230, y: 750, w: 100, h: 40 }, to: { room: 'l4', spawn: 'from-l5' }, top: 0, way: 'down', markAt: { x: 1280, y: 600 } },
    ],
    barriers: [{ id: 'bough-7', kind: 'branch', x: 2 * ROOM_W + 650, w: 70, sign: 'Hatching Soon' }],
  },
  // Level 0, the cavern under the tree (OP-163): two screens, the realm challenge stair (-1) and the
  // stair foot (0), painted in the six layers as the levels above (no front props). The stair from the
  // lobby ring comes down round a great root to the floor, and is taken up from its foot (OP-220); west of
  // it two root knobs and a stone shelf lead up toward the high root ledge (the find's place, set by the
  // spot placer). The mouth at the east end leads into the arcade cave, its own room. In the west, the
  // stairwell down to OP-115's first lock is boarded up until that ticket ships; beyond the low stone wall
  // the cavern falls away and nothing leads on.
  l0: {
    id: 'l0',
    map: 2,
    gated: true,
    owlScale: 1.25,
    size: { w: 2 * ROOM_W, h: ROOM_H },
    background: 'tree-l0-0-back',
    backgrounds: [
      // The cavern's depths, farthest from the trunk first: each lies over the one beyond it and fades into it.
      { key: 'tree-l0-w1-bg', x: 0, y: 0, rate: 0.5 },
      { key: 'tree-l0-0-bg', x: ROOM_W, y: 0, rate: 0.5, fade: { left: TREE_SKY_FADE } },
      ...['w1', '0'].map((s, i) => ({ key: `tree-l0-${s}-mid`, x: i * ROOM_W, y: 0, rate: 0.75, fade: { left: TREE_MID_FADE, right: TREE_MID_FADE } })),
      ...['w1', '0'].map((s, i) => ({ key: `tree-l0-${s}-back`, x: i * ROOM_W, y: 0 })),
      ...['w1', '0'].map((s, i) => ({ key: `tree-l0-${s}-play`, x: i * ROOM_W, y: 0, plain: true })),
    ],
    foregrounds: ['w1', '0'].map((s, i) => ({ key: `tree-l0-${s}-fg`, x: i * ROOM_W, y: 0, rate: 1.2, fade: { left: TREE_EDGE_FADE, right: TREE_EDGE_FADE } })),
    mood: 'hub',
    // The floor from the low stone wall in the west, past the closed stairwell and the stair's foot, to
    // the mouth of the arcade cave in the east.
    walkable: [
      [
        { x: 290, y: TREE_GROUND - TREE_STRIP },
        { x: 2 * ROOM_W - 20, y: TREE_GROUND - TREE_STRIP },
        { x: 2 * ROOM_W - 20, y: TREE_GROUND + TREE_STRIP },
        { x: 290, y: TREE_GROUND + TREE_STRIP },
      ],
    ],
    perches: [
      // The west: the top of the low stone wall where the floor ends, a hop up.
      treeLedge('low-wall', 62, 270, 118),
      // The find's way: the stone shelf, a hop up, the two root knobs over it, and the high root ledge,
      // a glide from the stair (or a jump from the higher knob).
      treeLedge('shelf', ROOM_W + 470, ROOM_W + 610, 46),
      treeLedge('knob-low', ROOM_W + 380, ROOM_W + 470, 93),
      treeLedge('knob-high', ROOM_W + 480, ROOM_W + 560, 128),
      treeLedge('root-ledge', ROOM_W + 330, ROOM_W + 610, 264),
      // The stair up to the lobby ring is taken from the floor at its foot (OP-220), so its treads are not ledges.
    ],
    // Down from the lobby ring at the stair's foot; back from the arcade cave inside its mouth; the
    // west end's by the closed stairwell.
    spawns: {
      default: { x: ROOM_W + 1150, y: TREE_GROUND },
      west: { x: 900, y: TREE_GROUND },
      // Down from level 1, just west of the stair up, facing the level's other stair (OP-220).
      'from-l1': { x: ROOM_W + 880, y: TREE_GROUND },
      'from-arcade': { x: 2 * ROOM_W - 220, y: TREE_GROUND },
    },
    doors: [
      // The stairwell down to OP-115's first lock, the level's west stair: closed, boards nailed over it.
      { id: 'stair-challenge', rect: { x: 600, y: 750, w: 160, h: 40 }, closedSign: 'Not Yet Fledged', top: 0, way: 'down', marker: { x: 680, y: TREE_GROUND } },
      // Up to the lobby ring, its east stair: the stair round the great root, taken from the floor at its foot.
      { id: 'stair-l1-l0', rect: { x: ROOM_W + 960, y: 750, w: 100, h: 40 }, to: { room: 'l1', spawn: 'from-l0' }, top: 0, way: 'up', markAt: { x: ROOM_W + 1010, y: 600 } },
      // The cavern's mouth at the east end, into the arcade cave.
      { id: 'to-arcade', rect: { x: 2 * ROOM_W - 100, y: 750, w: 80, h: 40 }, to: { room: 'l0-arcade', spawn: 'from-l0' }, top: 0, markAt: { x: 2 * ROOM_W - 60, y: 600 } },
    ],
    barriers: [{ id: 'stair-challenge', kind: 'boards', x: 590, w: 180, sign: 'Not Yet Fledged' }],
  },
  // Neon Roost, the arcade, rebuilt as level 0's cave (OP-163, decided on OP-155): three screens off the
  // cavern's east end, its own room (cap 40, as today's hall). A bay a screen, each with the alcove where
  // the game sets a cabinet (Hoot & Hop, Moon Flap, Talon Toss, west to east), the score wall's panel on
  // the middle screen, and two smaller alcoves on the last, Hatching Soon. The east end closes.
  'l0-arcade': {
    id: 'l0-arcade',
    map: 2,
    gated: true,
    owlScale: 1.25,
    size: { w: 3 * ROOM_W, h: ROOM_H },
    background: 'tree-l0-c0-back',
    backgrounds: [
      // The cave's depths, farthest from the cavern first.
      { key: 'tree-l0-c2-bg', x: 2 * ROOM_W, y: 0, rate: 0.5 },
      { key: 'tree-l0-c1-bg', x: ROOM_W, y: 0, rate: 0.5, fade: { right: TREE_SKY_FADE } },
      { key: 'tree-l0-c0-bg', x: 0, y: 0, rate: 0.5, fade: { right: TREE_SKY_FADE } },
      ...['c0', 'c1', 'c2'].map((s, i) => ({ key: `tree-l0-${s}-mid`, x: i * ROOM_W, y: 0, rate: 0.75, fade: { left: TREE_MID_FADE, right: TREE_MID_FADE } })),
      ...['c0', 'c1', 'c2'].map((s, i) => ({ key: `tree-l0-${s}-back`, x: i * ROOM_W, y: 0 })),
      ...['c0', 'c1', 'c2'].map((s, i) => ({ key: `tree-l0-${s}-play`, x: i * ROOM_W, y: 0, plain: true })),
    ],
    // No overlay for now (OP-216): the cave's three root overlays covered about a third of the view and
    // showed a cut band at the floor, so the cave is drawn without them until OP-215 repaints them as
    // thin roots at the screen's edges. The overlays stay published (tree-l0-c0-fg to c2-fg).
    foregrounds: [],
    mood: 'arcade',
    // The wet stone floor, from the mouth in the west to the wall of roots that closes the east end.
    walkable: [
      [
        { x: 40, y: TREE_GROUND - TREE_STRIP },
        { x: 2 * ROOM_W + 1380, y: TREE_GROUND - TREE_STRIP },
        { x: 2 * ROOM_W + 1380, y: TREE_GROUND + TREE_STRIP },
        { x: 40, y: TREE_GROUND + TREE_STRIP },
      ],
    ],
    spawns: { default: { x: 300, y: TREE_GROUND }, 'from-l0': { x: 220, y: TREE_GROUND } },
    doors: [
      // The mouth, back out into the cavern.
      { id: 'to-l0', rect: { x: 0, y: 750, w: 80, h: 40 }, to: { room: 'l0', spawn: 'from-arcade' }, top: 0, markAt: { x: 50, y: 600 } },
      // The three cabinets, each spot on the floor before its alcove and each marker on its screen
      // (the game draws the cabinets, ARCADE_ART in the page).
      { id: 'cabinet-crossing', rect: { x: 720, y: 750, w: 160, h: 40 }, top: 0, marker: { x: 800, y: 627 } },
      { id: 'cabinet-flight', rect: { x: ROOM_W + 1145, y: 750, w: 160, h: 40 }, top: 0, marker: { x: ROOM_W + 1225, y: 627 } },
      { id: 'cabinet-sling', rect: { x: 2 * ROOM_W + 505, y: 750, w: 160, h: 40 }, top: 0, marker: { x: 2 * ROOM_W + 585, y: 627 } },
    ],
  },
  // The test course (OP-224): keepers only, drawn in plain shapes (trialCourse.ts).
  ...TRIAL_ROOMS,
};

/** The parkour courses (OP-224, course.ts), by id: today only the keepers' test course. */
export const COURSES: Readonly<Record<string, CourseDef>> = { [TRIAL_COURSE.id]: TRIAL_COURSE };

/**
 * Where an owl walking the tree comes out of its nest, and where Play puts it should its nest not answer
 * (OP-156's entries setting): the canopy's street of nests (level 5, OP-158), in front of its own door,
 * outside the tree's front gate.
 */
export const TREE_ARRIVAL = { room: 'l5-street', spawn: 'from-nest-0' } as const;

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
    // An owl walking the tree (OP-156) goes out into the tree instead: the nests' street is in its canopy.
    { id: 'to-street', rect: { x: 245, y: 656, w: 100, h: 44 }, to: { room: 'homes', spawn: 'from-nest-0' }, toTree: { ...TREE_ARRIVAL }, marker: { x: 290, y: 580 } },
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
      const to = roomFor(doorTarget(d, 2)?.room ?? '');
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
