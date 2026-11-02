import { kitPerches, kitRoom } from '../src/kit';
import { ROOM_W, type RoomDef, type RoomKit } from '../src/room';
import { TREE_GROUND } from './index';

/**
 * Rooms built from the art kit (OP-234) that stand in for a painted room only when the page asks
 * (`?kit=1`), so the park looks as it does until the owner moves a room over. Each is the painted
 * room's layout again, drawn from the kit: the same size, floor, ledges (its perches come from its
 * kit's ledges), doorways and spawns, which kit.test.ts holds it to. The room server never sees
 * these: an owl walks the painted room's geometry, which is the same.
 *
 * Moving a room over for good: give its entry in ROOMS this kit (through kitRoom) and drop it here.
 */

/** Pixels over which the kit's backdrops fade at their edges, as the painted tree's layers do. */
const SKY_FADE = 220;
const MID_FADE = 230;
const EDGE_FADE = 120;

/**
 * Level 4, the sky landing, from the kit: high off the ground (docs/TREE_STYLE.md: clear blue-navy
 * air, crowns below), the trunk on screen 0 with the spiral stair up it, the balcony on its west side
 * and the overlook's perches up the bough on screen 1. The boardwalk is drawn edge to edge, and a
 * railing closes it at each end of the walk (the barrier rule).
 */
const L4_KIT: RoomKit = {
  ground: TREE_GROUND,
  backdrops: [
    { key: 'kit-back-sky-high', rate: 0.5, screens: [1, 1] },
    { key: 'kit-back-sky-high', rate: 0.5, screens: [0, 0], fade: { right: SKY_FADE } },
    { key: 'kit-back-mid-high', rate: 0.75, screens: [0, 0], fade: { left: MID_FADE, right: MID_FADE } },
    { key: 'kit-back-over-leaves', rate: 1.2, screens: [0, 1], fade: { left: EDGE_FADE, right: EDGE_FADE }, front: true },
  ],
  surfaces: [
    // The trunk, about 660 wide at this height, centred at x 800 of screen 0 and running off its top.
    { id: 'trunk', texture: 'kit-tex-bark', rect: { x: 470, y: 0, w: 660, h: TREE_GROUND } },
    { id: 'trunk-heart', texture: 'kit-tex-wood', rect: { x: 760, y: 360, w: 90, h: 180 } },
    // The bough the overlook climbs, rising behind the lookout.
    { id: 'bough', texture: 'kit-tex-bark', rect: { x: ROOM_W + 1150, y: 0, w: 200, h: TREE_GROUND } },
    { id: 'bough-moss', texture: 'kit-tex-moss', rect: { x: ROOM_W + 1150, y: 0, w: 200, h: 60 } },
  ],
  paths: [{ id: 'boardwalk', x0: 0, x1: 2 * ROOM_W, top: 0, cap: 'kit-cap-plank', mid: 'kit-mid-plank', trim: 'kit-trim-rope' }],
  ledges: [
    { id: 'stair-1', x0: 896, x1: 984, top: 67 },
    { id: 'stair-2', x0: 924, x1: 1024, top: 96 },
    { id: 'stair-3', x0: 972, x1: 1068, top: 134 },
    { id: 'stair-landing', x0: 1004, x1: 1148, top: 175 },
    { id: 'stair-4', x0: 1048, x1: 1112, top: 206 },
    { id: 'stair-5', x0: 1044, x1: 1084, top: 239 },
    { id: 'balcony', x0: 584, x1: 740, top: 321, cap: 'kit-cap-plank', mid: 'kit-mid-plank', slope: 'kit-slope-plank', trim: 'kit-trim-rope' },
    { id: 'stump', x0: ROOM_W + 352, x1: ROOM_W + 520, top: 111, cap: 'kit-cap-moss', mid: 'kit-mid-branch', depth: 111 },
    { id: 'board', x0: ROOM_W + 584, x1: ROOM_W + 732, top: 233, cap: 'kit-cap-plank', mid: 'kit-mid-plank', slope: 'kit-slope-plank' },
    { id: 'mushroom', x0: ROOM_W + 800, x1: ROOM_W + 1056, top: 330, cap: 'kit-cap-moss', mid: 'kit-mid-branch', slope: 'kit-slope-branch', trim: 'kit-trim-vine' },
    { id: 'lookout', x0: ROOM_W + 1124, x1: ROOM_W + 1224, top: 431, cap: 'kit-cap-branch', mid: 'kit-mid-branch', slope: 'kit-slope-branch' },
  ],
  stairs: [{ id: 'spiral', treads: ['stair-1', 'stair-2', 'stair-3', 'stair-landing', 'stair-4', 'stair-5'], tread: 'kit-stair-tread', post: 'kit-stair-post' }],
  doors: [
    { door: 'stair-l4-l3', piece: 'kit-door-stair' },
    { door: 'stair-l5-l4', piece: 'kit-door-arch' },
  ],
  barriers: [
    // The boardwalk's ends: past them the planks run on into the view, not somewhere to go.
    { id: 'west-railing', x0: 20, x1: 148, top: 0, piece: 'kit-barrier-railing' },
    { id: 'overlook-railing', x0: ROOM_W + 1320, x1: 2 * ROOM_W - 20, top: 0, piece: 'kit-barrier-railing' },
  ],
  props: [
    // Each screen's lantern post, in front of the owls; a bench on the overlook.
    { id: 'post-0', piece: 'kit-prop-lamppost', x: 330, top: 0, front: true },
    { id: 'post-1', piece: 'kit-prop-lamppost', x: ROOM_W + 220, top: 0, front: true },
    { id: 'bench', piece: 'kit-bench-plank', x: ROOM_W + 700, top: 0 },
    { id: 'shelf', piece: 'kit-shelf-fungus', x: 520, top: 160 },
    { id: 'sign-down', piece: 'kit-sign-arrow', x: 560, top: 0, flip: true },
  ],
  decals: [
    { piece: 'kit-decal-moss', x: 600, y: 140 },
    { piece: 'kit-decal-moss', x: 1020, y: 620 },
    { piece: 'kit-decal-knot', x: 700, y: 520 },
    { piece: 'kit-decal-roots', x: 800, y: 60 },
    { piece: 'kit-decal-glow', x: 375, y: 520 },
    { piece: 'kit-decal-glow', x: ROOM_W + 265, y: 520 },
  ],
};

export const KIT_DEMOS: Readonly<Record<string, RoomDef>> = {
  l4: kitRoom({
    id: 'l4',
    map: 2,
    gated: true,
    owlScale: 1.25,
    size: { w: 2 * ROOM_W, h: 900 },
    mood: 'hub',
    walkable: [
      [
        { x: 130, y: TREE_GROUND - 4 },
        { x: ROOM_W + 1330, y: TREE_GROUND - 4 },
        { x: ROOM_W + 1330, y: TREE_GROUND + 4 },
        { x: 130, y: TREE_GROUND + 4 },
      ],
    ],
    perches: kitPerches(L4_KIT),
    spawns: {
      default: { x: 800, y: TREE_GROUND },
      west: { x: 220, y: TREE_GROUND },
      east: { x: ROOM_W + 1240, y: TREE_GROUND },
      'from-l3': { x: 780, y: TREE_GROUND },
      'from-l5': { x: 1180, y: TREE_GROUND },
    },
    doors: [
      { id: 'stair-l4-l3', rect: { x: 640, y: 750, w: 100, h: 40 }, to: { room: 'l3', spawn: 'from-l4' }, top: 0, markAt: { x: 690, y: 560 } },
      { id: 'stair-l5-l4', rect: { x: 1044, y: 750, w: 40, h: 40 }, to: { room: 'l5', spawn: 'from-l4' }, top: 239, markAt: { x: 1064, y: 470 } },
    ],
    kit: L4_KIT,
  }),
};

/** The kit room that stands in for a room when the page asks for kit rooms, if there is one. */
export function kitDemoFor(id: string): RoomDef | undefined {
  return Object.hasOwn(KIT_DEMOS, id) ? KIT_DEMOS[id] : undefined;
}
