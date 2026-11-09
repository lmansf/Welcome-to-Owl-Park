/**
 * Things to do out on the plazas' floors (the owner's ask, Nov 8: "we have to put stuff around the room to
 * interact with and not rely on putting everything on the wall"). Each painted room grown into a plaza
 * (rooms/plaza.ts) gets a few little scenes out in its open floor, each a cluster of art that tells one
 * story (the owner's rule: "the placement of the items should always tell a story. Otherwise they're
 * just clutter"): a bird bath to splash in, mushrooms to bounce on, a telescope to look through, a shiny
 * thing someone dropped, and stumps and logs to land on beside them. The clusters keep clear of the
 * back of each room, where its doorways are and owls cross between them, of the rings where a crowd
 * gathers round each moonbeam, and of the leaf piles already there.
 *
 * The things to use are interactables (interactables.ts), each drawn from its kit art (`piece`); the
 * stumps and logs are solid perches with their art as the room's pieces; the rest is the room's pieces.
 */
import type { InteractableDef } from './interactables';
import type { Perch } from './perches';
import type { RoomPiece } from './room';

/** What there is to do in a cluster. */
export type FloorThingKind = 'bird-bath' | 'mushroom' | 'telescope' | 'shiny';

/** The art each thing to do is drawn with (a kit key), or none: a shiny thing is a glint drawn by the game. */
export const FLOOR_THING_ART: Readonly<Record<FloorThingKind, string | null>> = {
  'bird-bath': 'kit-entrance-bird-bath',
  mushroom: 'kit-clearing-mushroom-cluster',
  telescope: 'kit-landmark-telescope-brass',
  shiny: null,
};

/** The pale mushrooms: the same thing to do, in a room where the warm ones would look out of place. */
export const PALE_MUSHROOMS = 'kit-under-mushroom-cluster';

/** How far in front of its art's foot an owl stands to use a thing (room px): its spot on the plan. */
export const FLOOR_THING_STAND = 12;

export type FloorPerchKind = 'stump' | 'log' | 'bench';

/**
 * Each perch's art, how high its standing surface is over its foot (measured off the art: the middle of
 * a stump's cut face, the top of a log) and that surface's ends from the piece's middle. Every one is a
 * single jump up (a jump tops out near 150, jump.ts), so a kid lands it first or second try.
 */
export const FLOOR_PERCH_ART: Readonly<Record<FloorPerchKind, { key: string; stands: number; span: readonly [number, number] }>> = {
  stump: { key: 'kit-ground-tree-stump', stands: 90, span: [-55, 55] },
  log: { key: 'kit-seat-log', stands: 100, span: [-90, 80] },
  bench: { key: 'kit-low-log-bench', stands: 105, span: [-100, 100] },
};

/**
 * A perch is a strip of the plan FLOOR_PERCH_HALF either side of its line, its piece's foot at the
 * strip's back edge, so an owl stood anywhere on it is drawn over the art, its feet on the surface
 * (the Great Hollow's roots are built the same way, hollowHall.ts).
 */
export const FLOOR_PERCH_HALF = 20;

export interface FloorThing {
  kind: FloorThingKind;
  /** Its art's foot (room px); the owl stands FLOOR_THING_STAND in front of it to use it. */
  x: number;
  y: number;
  /** Other art than the kind's own (the pale mushrooms). */
  piece?: string;
  flip?: true;
}

export interface FloorCluster {
  /** Unique across the park: the things' and perches' ids start with it. */
  id: string;
  room: string;
  /** What this corner tells, in one line. */
  story: string;
  things: FloorThing[];
  /** Stumps and logs to land on: the piece's middle and the strip's back edge (room px). */
  perches?: Array<{ kind: FloorPerchKind; x: number; y: number; flip?: true }>;
  /** Art that sets the scene and is not used: a potted tree, a rain barrel (kit keys, foot at x, y). */
  decor?: Array<{ key: string; x: number; y: number; flip?: true }>;
}

export const PLAZA_CLUSTERS: readonly FloorCluster[] = [
  // The Treetop Commons, on either side of its ring, clear of the walk from the street of nests to the turnstiles.
  {
    id: 'lobby-bath',
    room: 'lobby',
    story: 'A bird bath under a potted tree, where owls waiting for the turnstiles splash, and a log beside it to dry off on.',
    decor: [{ key: 'kit-entrance-planter-tree', x: 520, y: 1010 }],
    things: [{ kind: 'bird-bath', x: 700, y: 1040 }],
    perches: [{ kind: 'log', x: 880, y: 1080 }],
  },
  {
    id: 'lobby-stars',
    room: 'lobby',
    story: 'A brass telescope aimed at the stars over the tree, a stump to stand on for a better look, and a lost button glinting nearby.',
    things: [
      { kind: 'telescope', x: 2560, y: 1040 },
      { kind: 'shiny', x: 2680, y: 1068 },
    ],
    perches: [{ kind: 'stump', x: 2400, y: 1070 }],
  },
  // The arcade hall: by the doorway, between its two rings, and at its far end.
  {
    id: 'arcade-skylight',
    room: 'arcade',
    story: 'A coin telescope by the door, pointed up through the skylight, for a look at the moon before a game.',
    things: [{ kind: 'telescope', x: 520, y: 1090 }],
  },
  {
    id: 'arcade-token',
    room: 'arcade',
    story: 'A token rolled out from under the vending machine and lies glinting on the wet tiles, by a bench to wait for a turn on.',
    decor: [{ key: 'kit-neon-vending-machine', x: 2150, y: 1000 }],
    things: [{ kind: 'shiny', x: 2060, y: 1060 }],
    perches: [{ kind: 'bench', x: 2300, y: 1060 }],
  },
  {
    id: 'arcade-crack',
    room: 'arcade',
    story: 'Pale mushrooms push up through a crack in the tiles where the roof drips, and owls bounce on them between games.',
    things: [
      { kind: 'mushroom', x: 4250, y: 1080, piece: PALE_MUSHROOMS },
      { kind: 'mushroom', x: 4400, y: 1130, piece: PALE_MUSHROOMS, flip: true },
    ],
  },
  // The lane under the nests, west of its ring.
  {
    id: 'homes-stump',
    room: 'homes',
    story: "Mushrooms came up round an old stump in the lane's shade, and owls hop from the caps up onto the stump.",
    things: [{ kind: 'mushroom', x: 880, y: 1060 }],
    perches: [{ kind: 'stump', x: 1060, y: 1080 }],
  },
  {
    id: 'homes-bath',
    room: 'homes',
    story: 'Neighbours from the nests set out a bird bath on the lane, with a log beside it to sit and gossip on.',
    things: [{ kind: 'bird-bath', x: 1620, y: 1080 }],
    perches: [{ kind: 'log', x: 1800, y: 1100 }],
  },
  // The night market's street, between its rings and at its east end.
  {
    id: 'market-coin',
    room: 'market',
    story: 'A coin rolled away from the stalls and came to rest by a rain barrel, glinting in a puddle, with a bench to wait out the rain.',
    decor: [{ key: 'kit-ground-water-barrel', x: 1500, y: 1020 }],
    things: [{ kind: 'shiny', x: 1590, y: 1070 }],
    perches: [{ kind: 'bench', x: 1780, y: 1060 }],
  },
  {
    id: 'market-planter',
    room: 'market',
    story: "Pale mushrooms took over a planter box at the street's end, springy enough for an owl to bounce on.",
    decor: [{ key: 'kit-neon-rooftop-garden', x: 3010, y: 1000 }],
    things: [{ kind: 'mushroom', x: 2950, y: 1080, piece: PALE_MUSHROOMS }],
  },
  // The glass street: either side of its ring, and in the middle of its front.
  {
    id: 'glass-bath',
    room: 'glass',
    story: 'A bird bath among the glass planters, where the light through the windows makes the water shine.',
    decor: [{ key: 'kit-glass-glass-planter', x: 360, y: 1200 }],
    things: [{ kind: 'bird-bath', x: 240, y: 1300 }],
  },
  {
    id: 'glass-vane',
    room: 'glass',
    story: 'A telescope by the feather weathervane, for owls who want to see which way the wind will blow them next.',
    decor: [{ key: 'kit-glass-weathervane', x: 1470, y: 1290 }],
    things: [{ kind: 'telescope', x: 1330, y: 1250 }],
  },
  {
    id: 'glass-chip',
    room: 'glass',
    story: 'A chip of coloured glass, fallen from the windows high above, glints in the middle of the street.',
    things: [{ kind: 'shiny', x: 800, y: 1560 }],
  },
  // The grove's clearing, in the gaps between its three rings and at its east end.
  {
    id: 'grove-stump',
    room: 'grove',
    story: 'Mushrooms ring an old stump in the clearing: the caps are springy enough to bounce on, the stump a step up to look round.',
    things: [{ kind: 'mushroom', x: 1880, y: 1050 }],
    perches: [{ kind: 'stump', x: 2060, y: 1110 }],
  },
  {
    id: 'grove-bath',
    room: 'grove',
    story: 'A bird bath brimming with rain at the edge of the east ring, where owls splash after the climb down from the huts.',
    things: [{ kind: 'bird-bath', x: 3420, y: 1150 }],
  },
  {
    id: 'grove-log',
    room: 'grove',
    story: "A fallen log at the clearing's east end, with something shiny caught in the moss in front of it.",
    things: [{ kind: 'shiny', x: 4620, y: 1120 }],
    perches: [{ kind: 'log', x: 4620, y: 1000 }],
  },
  // The Party Grove: either side of the way back into the trunk, and past its east ring.
  {
    id: 'hub-mushrooms',
    room: 'hub',
    story: 'Party mushrooms by the west ring, springy as cushions, with a stump to stand on and watch the dancing.',
    things: [{ kind: 'mushroom', x: 1950, y: 1040 }],
    perches: [{ kind: 'stump', x: 1700, y: 1050 }],
  },
  {
    id: 'hub-bath',
    room: 'hub',
    story: 'A bird bath left out after the party, still full of rain, and a log beside it to sit on.',
    things: [{ kind: 'bird-bath', x: 2820, y: 1030 }],
    perches: [{ kind: 'log', x: 3080, y: 1040 }],
  },
  {
    id: 'hub-stars',
    room: 'hub',
    story: 'A telescope left out after the party, aimed at the owl-shaped stars, and a party favour glinting where it fell.',
    things: [
      { kind: 'telescope', x: 4250, y: 1030 },
      { kind: 'shiny', x: 4380, y: 1000 },
    ],
  },
];

/** A thing's id: its cluster's, its kind and, past the first of its kind there, a number. */
function thingIds(c: FloorCluster): string[] {
  const seen: Record<string, number> = {};
  return c.things.map((t) => {
    const n = (seen[t.kind] = (seen[t.kind] ?? 0) + 1);
    return n === 1 ? `${c.id}-${t.kind}` : `${c.id}-${t.kind}-${n}`;
  });
}

const perchId = (c: FloorCluster, i: number) => (i === 0 ? `${c.id}-perch` : `${c.id}-perch-${i + 1}`);

/** The things to use out on the plazas' floors, each standing in front of its art. */
export const FLOOR_INTERACTABLES: readonly InteractableDef[] = PLAZA_CLUSTERS.flatMap((c) => {
  const ids = thingIds(c);
  return c.things.map((t, i): InteractableDef => {
    const piece = t.piece ?? FLOOR_THING_ART[t.kind];
    return {
      id: ids[i]!,
      kind: t.kind,
      room: c.room,
      pos: { x: t.x, y: t.y + FLOOR_THING_STAND },
      ...(piece ? { piece } : {}),
      ...(t.flip ? { flip: true as const } : {}),
    };
  });
});

/** A perch's standing surface along the room (room x), its art turned round when flipped. */
export function floorPerchSpan(kind: FloorPerchKind, x: number, flip?: boolean): [number, number] {
  const [a, b] = FLOOR_PERCH_ART[kind].span;
  return flip ? [x - b, x - a] : [x + a, x + b];
}

/** The stumps and logs of a room's clusters, as solid perches. */
export function floorPerches(room: string): Perch[] {
  return PLAZA_CLUSTERS.filter((c) => c.room === room).flatMap((c) =>
    (c.perches ?? []).map((p, i): Perch => {
      const [x0, x1] = floorPerchSpan(p.kind, p.x, p.flip);
      return {
        id: perchId(c, i),
        area: [
          { x: x0, y: p.y },
          { x: x1, y: p.y },
          { x: x1, y: p.y + FLOOR_PERCH_HALF * 2 },
          { x: x0, y: p.y + FLOOR_PERCH_HALF * 2 },
        ],
        top: FLOOR_PERCH_ART[p.kind].stands + FLOOR_PERCH_HALF,
        solid: true,
      };
    }),
  );
}

/** The art of a room's clusters that is not used: its perches' and its decor (things to use draw their own). */
export function floorPieces(room: string): RoomPiece[] {
  return PLAZA_CLUSTERS.filter((c) => c.room === room).flatMap((c) => [
    ...(c.decor ?? []).map((d, i): RoomPiece => ({ id: `${c.id}-decor-${i + 1}`, key: d.key, x: d.x, y: d.y, ...(d.flip ? { flip: true as const } : {}) })),
    ...(c.perches ?? []).map((p, i): RoomPiece => ({ id: perchId(c, i), key: FLOOR_PERCH_ART[p.kind].key, x: p.x, y: p.y, ...(p.flip ? { flip: true as const } : {}) })),
  ]);
}
