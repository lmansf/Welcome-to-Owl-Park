/**
 * The test course (OP-224): a small parkour course of placeholder rooms the page draws in plain shapes
 * (`drawn`), for the keepers only (`keeperOnly`): no door of a room visitors walk leads here, and the
 * room server turns any other owl away. It uses every part of the course kit (course.ts): the trail
 * gate in the trailhead grants the dash, three acts joined by doors, a pit in each act that only a
 * jump and a dash cross, benches as checkpoints, a bell to ring in each act (the objective strip), a
 * shortcut in the second act that opens from its far side, five lost feathers and the finish shrine,
 * whose exit leads back to the trailhead. A keeper reaches it at `?room=trail-head` (with `?keeper=1`
 * on the room server).
 *
 * Room ids are neutral words, as every room's are.
 */
import type { CourseDef } from '../src/course';
import type { Polygon } from '../src/geometry';
import type { RoomDef } from '../src/room';

function box(x0: number, y0: number, x1: number, y1: number): Polygon {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/** A crate to jump up on, solid from the floor: every room has one, a hop up and a way round. */
function crate(id: string, x0: number, y0: number, x1: number, y1: number) {
  return { id, area: box(x0, y0, x1, y1), top: 80, solid: true };
}

/** The floor of every act: one long yard, the pits cut across it. */
const YARD = box(80, 380, 1520, 760);
const EAST_DOOR = { x: 1460, y: 500, w: 60, h: 160 };
const WEST_DOOR = { x: 80, y: 500, w: 60, h: 160 };

export const TRIAL_COURSE_ID = 'trail';

export const TRIAL_ROOMS: Record<string, RoomDef> = {
  // The trailhead: the trail gate east into the first act (the dash comes with it), the course's exit
  // back in by the gate, and a way west to the hub.
  'trail-head': {
    id: 'trail-head',
    size: { w: 1600, h: 900 },
    background: 'trail-head',
    walkable: [box(100, 380, 1500, 760)],
    perches: [crate('trail-head-crate', 480, 560, 620, 640)],
    spawns: { default: { x: 800, y: 580 }, 'from-course': { x: 1180, y: 660 }, 'from-canopy': { x: 800, y: 460 } },
    doors: [
      // The Updraft Canopy's trail gate for now (updraftCanopy.ts), until the clearing's course doorway is painted.
      { id: 'canopy-gate', rect: { x: 740, y: 380, w: 120, h: 40 }, to: { room: 'canopy-1', spawn: 'from-gate' }, marker: { x: 800, y: 360 } },
      { id: 'trail-gate', rect: { x: 1440, y: 470, w: 60, h: 200 }, to: { room: 'trail-1', spawn: 'from-gate' }, marker: { x: 1470, y: 440 } },
      { id: 'west', rect: { x: 100, y: 470, w: 60, h: 200 }, to: { room: 'hub', spawn: 'default' }, marker: { x: 130, y: 440 } },
    ],
    mood: 'dusk',
    keeperOnly: true,
    drawn: true,
  },
  // Act one: a bench by the way in, the first pit (200 px across: a dash takes an owl over), a bench
  // past it, the first bell, and two lost feathers (one by the pit's near lip, one in the far corner).
  'trail-1': {
    id: 'trail-1',
    size: { w: 1600, h: 900 },
    background: 'trail-1',
    walkable: [YARD],
    perches: [crate('trail-1-crate', 1110, 560, 1230, 640)],
    spawns: { default: { x: 220, y: 580 }, 'from-gate': { x: 220, y: 580 }, 'from-east': { x: 1340, y: 640 } },
    doors: [{ id: 'east', rect: EAST_DOOR, to: { room: 'trail-2', spawn: 'from-west' }, marker: { x: 1490, y: 470 } }],
    mood: 'dusk',
    keeperOnly: true,
    drawn: true,
    course: {
      id: TRIAL_COURSE_ID,
      act: 1,
      pits: [box(700, 380, 900, 760)],
      benches: [
        { id: 'b1', at: { x: 340, y: 450 } },
        { id: 'b2', at: { x: 1020, y: 450 } },
      ],
      parts: [{ id: 'bell-1', at: { x: 1280, y: 460 } }],
      feathers: [
        { id: 'f1', at: { x: 640, y: 720 } },
        { id: 'f2', at: { x: 1420, y: 410 } },
      ],
    },
  },
  // Act two: a pit with a low bridge under its south end, shut by a gate at the bridge's east end; the
  // gate opens from its far side (the east), so after one dash across, the bridge is the owl's way.
  'trail-2': {
    id: 'trail-2',
    size: { w: 1600, h: 900 },
    background: 'trail-2',
    walkable: [YARD],
    perches: [crate('trail-2-crate', 1050, 560, 1170, 640)],
    spawns: { default: { x: 220, y: 580 }, 'from-west': { x: 220, y: 580 }, 'from-east': { x: 1340, y: 640 } },
    doors: [
      { id: 'west', rect: WEST_DOOR, to: { room: 'trail-1', spawn: 'from-east' }, marker: { x: 110, y: 470 } },
      { id: 'east', rect: EAST_DOOR, to: { room: 'trail-3', spawn: 'from-west' }, marker: { x: 1490, y: 470 } },
    ],
    mood: 'dusk',
    keeperOnly: true,
    drawn: true,
    course: {
      id: TRIAL_COURSE_ID,
      act: 2,
      pits: [box(560, 380, 760, 690)],
      benches: [
        { id: 'b3', at: { x: 340, y: 450 } },
        { id: 'b4', at: { x: 960, y: 450 } },
      ],
      parts: [{ id: 'bell-2', at: { x: 1280, y: 460 } }],
      feathers: [{ id: 'f3', at: { x: 640, y: 730 } }],
      shortcuts: [{ id: 'bridge', gate: box(760, 690, 784, 760), opener: { x: 790, y: 690, w: 90, h: 70 } }],
    },
  },
  // Act three: the last pit, a bench past it, the third bell, two lost feathers and the finish shrine;
  // the exit east leads out of the course, back to the trailhead.
  'trail-3': {
    id: 'trail-3',
    size: { w: 1600, h: 900 },
    background: 'trail-3',
    walkable: [YARD],
    perches: [crate('trail-3-crate', 820, 560, 940, 640)],
    spawns: { default: { x: 220, y: 580 }, 'from-west': { x: 220, y: 580 } },
    doors: [
      { id: 'west', rect: WEST_DOOR, to: { room: 'trail-2', spawn: 'from-east' }, marker: { x: 110, y: 470 } },
      { id: 'exit', rect: EAST_DOOR, to: { room: 'trail-head', spawn: 'from-course' }, marker: { x: 1490, y: 470 } },
    ],
    mood: 'dusk',
    keeperOnly: true,
    drawn: true,
    course: {
      id: TRIAL_COURSE_ID,
      act: 3,
      pits: [box(450, 380, 650, 760)],
      benches: [
        { id: 'b5', at: { x: 300, y: 450 } },
        { id: 'b6', at: { x: 780, y: 450 } },
      ],
      parts: [{ id: 'bell-3', at: { x: 1000, y: 700 } }],
      feathers: [
        { id: 'f4', at: { x: 1150, y: 420 } },
        { id: 'f5', at: { x: 300, y: 720 } },
      ],
      shrine: { id: 'shrine', at: { x: 1300, y: 580 } },
    },
  },
};

export const TRIAL_COURSE: CourseDef = {
  id: TRIAL_COURSE_ID,
  objective: 'bells',
  acts: ['trail-1', 'trail-2', 'trail-3'],
  gate: { room: 'trail-head', door: 'trail-gate', spawn: 'from-gate' },
  exit: { room: 'trail-3', door: 'exit' },
  // Stand-ins from the catalogue until a realm's course has its own (the owner's to pick).
  item: 'leaf-crown~0',
  emote: 'twirl',
  gold: { ms: 60_000, item: 'sparkle~9' },
  floorMs: 8_000,
  keeper: true,
};
