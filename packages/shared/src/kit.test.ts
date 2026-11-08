import { describe, expect, it } from 'vitest';
import { KIT_DEMOS, KIT_PREVIEWS } from '../rooms/kit';
import { ROOMS } from '../rooms/index';
import { KIT_MID_STRETCH, KIT_SCENE_SPAN, KIT_STAND_SINK, kitArtKeys, kitCells, kitCost, kitDrawPlan, kitPerches, kitProblems, kitRoom, kitSceneProblems, kitSceneSpans, kitTiles, midFill, walkedAt, withRow, type KitDraw } from './kit';
import { KIT_ART, KIT_KEY, KIT_PALETTE, drawOps, kitGroup, kitMotifs, kitPlaceholder, periodShifts, shiftOp, type KitOp } from './kitArt';
import { KIT_CATALOG } from './kitCatalog';
import { raster } from './raster';
import { ROOM_W, type RoomDef, type RoomKit } from './room';

/** Every room built from the kit: the registry's own (none yet), the demos that stand in for painted rooms and the rooms laid out ahead (the plaza). */
const KIT_ROOMS: readonly RoomDef[] = [...Object.values(ROOMS).filter((r) => r.kit), ...Object.values(KIT_DEMOS), ...Object.values(KIT_PREVIEWS)];

const GROUND = 770;

/** A small kit room for the rule's own cases: a floor from 100 to 1500, drawn as `kit` says. */
function room(kit: Partial<RoomKit>, extra: Partial<RoomDef> = {}): RoomDef {
  const k: RoomKit = { ground: GROUND, paths: [{ id: 'floor', x0: 100, x1: 1500, top: 0, cap: 'kit-plank-mid' }], ...kit };
  return kitRoom({
    id: 'kit-case',
    size: { w: ROOM_W, h: 900 },
    mood: 'hub',
    walkable: [
      [
        { x: 100, y: GROUND - 4 },
        { x: 1500, y: GROUND - 4 },
        { x: 1500, y: GROUND + 4 },
        { x: 100, y: GROUND + 4 },
      ],
    ],
    perches: kitPerches(k),
    spawns: { default: { x: 800, y: GROUND } },
    doors: [],
    ...extra,
    kit: k,
  });
}

describe('the barrier rule (OP-234)', () => {
  it('runs over every kit room: a drawn ledge or path an owl cannot reach, or that leads nowhere, has a barrier at its foot', () => {
    expect(KIT_ROOMS.length).toBeGreaterThan(0);
    for (const r of KIT_ROOMS) expect(kitProblems(r), r.id).toEqual([]);
  });

  it('passes a room whose floor is drawn as far as owls walk and whose ledges are all reached', () => {
    expect(kitProblems(room({ ledges: [{ id: 'low', x0: 700, x1: 800, top: 60, cap: 'kit-plank-mid' }] }))).toEqual([]);
  });

  it('asks for a barrier under a ledge no owl reaches', () => {
    const high = room({ ledges: [{ id: 'high', x0: 700, x1: 800, top: 500, cap: 'kit-plank-mid' }] });
    expect(kitProblems(high)).toEqual(['ledge high is drawn where no owl reaches it, with no barrier at its foot']);
    const barred = room({ ledges: [{ id: 'high', x0: 700, x1: 800, top: 500, cap: 'kit-plank-mid' }], barriers: [{ id: 'roots', x0: 690, x1: 810, top: 0, piece: 'kit-under-barrier-roots' }] });
    expect(kitProblems(barred)).toEqual([]);
  });

  it('asks for a barrier at the foot of a ledge drawn but not stood on', () => {
    const shelf = { id: 'shelf', x0: 300, x1: 420, top: 80, cap: 'kit-plank-single', perch: false as const };
    expect(kitProblems(room({ ledges: [shelf] }))).toEqual(['ledge shelf is drawn where no owl reaches it, with no barrier at its foot']);
    expect(kitProblems(room({ ledges: [shelf], barriers: [{ id: 'rope', x0: 300, x1: 420, top: 80, piece: 'kit-barrier-rope' }] }))).toEqual([]);
    // A barrier beside the ledge is not at its foot.
    expect(kitProblems(room({ ledges: [shelf], barriers: [{ id: 'rope', x0: 500, x1: 600, top: 0, piece: 'kit-barrier-rope' }] }))).toHaveLength(1);
  });

  it('asks for a barrier where a path is drawn past the end of the walk, unless a doorway stands there', () => {
    const long = { paths: [{ id: 'floor', x0: 0, x1: ROOM_W, top: 0, cap: 'kit-plank-mid' }] };
    expect(kitProblems(room(long))).toEqual([
      'path floor leads nowhere west of x 100: no barrier or doorway at the end of the walk',
      'path floor leads nowhere east of x 1500: no barrier or doorway at the end of the walk',
    ]);
    const railed = { ...long, barriers: [{ id: 'w', x0: 20, x1: 120, top: 0, piece: 'kit-fence-section' }] };
    expect(kitProblems(room(railed))).toEqual(['path floor leads nowhere east of x 1500: no barrier or doorway at the end of the walk']);
    const door = { id: 'out', rect: { x: 1460, y: 750, w: 60, h: 40 }, to: { room: 'hub', spawn: 'default' }, top: 0 };
    expect(kitProblems(room(railed, { doors: [door] }))).toEqual([]);
  });

  it('asks for a barrier across a path no owl walks', () => {
    const upper = { id: 'gallery', x0: 200, x1: 600, top: 300, cap: 'kit-plank-mid' };
    const paths = [{ id: 'floor', x0: 100, x1: 1500, top: 0, cap: 'kit-plank-mid' }, upper];
    expect(kitProblems(room({ paths }))).toEqual(['path gallery is drawn where no owl walks, with no barrier at its foot']);
    expect(kitProblems(room({ paths, barriers: [{ id: 'bar', x0: 380, x1: 500, top: 300, piece: 'kit-fence-section' }] }))).toEqual([]);
  });

  it('asks that the floor owls walk is drawn, and that every key, tread and doorway is the kit\'s and the room\'s', () => {
    expect(kitProblems(room({ paths: [{ id: 'floor', x0: 100, x1: 700, top: 0, cap: 'kit-plank-mid' }] }))[0]).toMatch(/^the floor at x 7\d\d is walked but not drawn$/);
    expect(kitProblems(room({ surfaces: [{ id: 's', texture: 'kit-tex-chrome', rect: { x: 0, y: 0, w: 10, h: 10 } }] }))).toEqual(["kit-tex-chrome is not in the kit's catalogue (KIT_ART)"]);
    expect(kitProblems(room({ surfaces: [{ id: 's', texture: 'tree-l4-0-back', rect: { x: 0, y: 0, w: 10, h: 10 } }] }))).toEqual(['tree-l4-0-back is not a kit key (kit-<group>-<name>)']);
    expect(kitProblems(room({ stairs: [{ id: 'st', treads: ['nope'] }] }))).toEqual(["stair st's tread nope is no ledge"]);
    expect(kitProblems(room({ doors: [{ door: 'nope', piece: 'kit-doorway-stone' }] }))).toEqual(['door piece kit-doorway-stone stands at nope, which is no doorway of the room']);
  });

  it('finds the stretches an owl walks along a height', () => {
    const r = room({});
    expect(walkedAt(r, GROUND, 0, 0, ROOM_W)).toEqual([[100, 1500]]);
    expect(walkedAt(r, GROUND, 50, 0, ROOM_W)).toEqual([]);
  });
});

describe('the story rule (the owner, 2026-11-03; docs/TREE_STYLE.md section 8)', () => {
  const bench = { id: 'bench', piece: 'kit-high-cloud-bench', x: 400, top: 0 };
  const pole = { id: 'pole', piece: 'kit-high-lantern-pole', x: 520, top: 0 };
  const sign = { id: 'sign', piece: 'kit-high-sign-board', x: 1300, top: 0 };

  it('runs over every kit room: every prop is in one scene with a one-line story, each group close and apart', () => {
    for (const r of KIT_ROOMS) {
      expect(kitSceneProblems(r), r.id).toEqual([]);
      const grouped = (r.kit?.scenes ?? []).flatMap((sc) => sc.props).sort();
      expect(grouped, r.id).toEqual((r.kit?.props ?? []).map((p) => p.id).sort());
      for (const sc of r.kit?.scenes ?? []) expect(sc.story.length, `${r.id} ${sc.id}`).toBeGreaterThan(20);
    }
  });

  it('asks what story a prop tells when it belongs to no scene', () => {
    expect(kitSceneProblems(room({ props: [bench] }))).toEqual(['prop bench belongs to no scene: what story does it tell?']);
  });

  it('refuses a scene spread along the walk like a catalogue row', () => {
    const row = room({ props: [bench, pole, sign], scenes: [{ id: 'row', story: 'A bench, a lantern and a sign along the walk.', props: ['bench', 'pole', 'sign'] }] });
    const [span] = kitSceneSpans(row);
    expect(span!.x1 - span!.x0).toBeGreaterThan(KIT_SCENE_SPAN);
    expect(kitSceneProblems(row)).toEqual([expect.stringMatching(/^scene row runs \d+ px, more than 720: a row, not a scene$/)]);
  });

  it('passes small groups with room around them, and refuses two that run into each other', () => {
    const apart = room({
      props: [bench, pole, sign],
      scenes: [
        { id: 'rest', story: 'A bench under a lantern, looking out over the crowns.', props: ['bench', 'pole'] },
        { id: 'notice', story: 'A sign where the walk ends, saying it ends.', props: ['sign'] },
      ],
    });
    expect(kitSceneProblems(apart)).toEqual([]);
    const close = room({
      props: [bench, { ...sign, x: 600 }],
      scenes: [
        { id: 'rest', story: 'A bench under a lantern, looking out over the crowns.', props: ['bench'] },
        { id: 'notice', story: 'A sign where the walk ends, saying it ends.', props: ['sign'] },
      ],
    });
    expect(kitSceneProblems(close)).toEqual([expect.stringMatching(/^scenes rest and notice run into each other/)]);
  });

  it('keeps a story to one line, and a prop to one scene', () => {
    const r = room({
      props: [bench],
      scenes: [
        { id: 'a', story: 'A bench.\nAnd more.', props: ['bench'] },
        { id: 'b', story: 'The same bench again, in a second scene.', props: ['bench', 'stool'], about: ['gate'] },
      ],
    });
    expect(kitSceneProblems(r)).toEqual([
      "scene a's story is not one line of at most 140 characters",
      'prop bench is in two scenes, a and b',
      'scene b groups stool, which is no prop of the room',
      'scene b is about gate, which is no doorway, barrier or ledge of the room',
      expect.stringMatching(/^scenes a and b run into each other/),
    ]);
  });
});

describe.each(Object.keys(KIT_DEMOS))('the %s demo drawn from the kit (OP-234)', (id) => {
  const kit = KIT_DEMOS[id]!;
  const painted = ROOMS[id]!;

  it("keeps the painted level's doorways, spawns and ledges", () => {
    expect(kit.doors).toEqual(painted.doors);
    expect(kit.spawns).toEqual(painted.spawns);
    expect(kit.perches).toEqual(painted.perches);
  });

  it("keeps the painted level's size, floor and everything the room server checks", () => {
    for (const field of ['id', 'map', 'gated', 'owlScale', 'size', 'walkable', 'mood'] as const) expect(kit[field], field).toEqual(painted[field]);
    expect(kit.spots).toEqual(painted.spots);
    expect(kit.places).toEqual(painted.places);
  });

  it('draws a piece at every doorway and every ledge', () => {
    const plan = kitDrawPlan(kit);
    for (const d of kit.doors) expect(plan.some((p) => p.role === 'door' && p.id === d.id), d.id).toBe(true);
    const stairOf = new Map((kit.kit?.stairs ?? []).flatMap((s) => s.treads.map((t) => [t, s.id] as const)));
    for (const p of kit.perches ?? []) expect(plan.some((d) => (d.role === 'ledge' && d.id === p.id) || (d.role === 'stair' && d.id === stairOf.get(p.id))), p.id).toBe(true);
  });

  it("signs every way not open yet over a barrier the kit draws there", () => {
    const drawn = kitDrawPlan(kit).filter((d) => d.role === 'barrier');
    for (const b of kit.barriers ?? []) expect(drawn.some((d) => d.x < b.x + b.w && b.x < d.x + d.w), b.id).toBe(true);
  });

  it('draws no foreground overlay of painted art', () => {
    expect(kit.foregrounds).toBeUndefined();
  });

  it('fades a backdrop over its neighbour where one painting meets another, so no screen edge shows as a cut', () => {
    // A slower tile is drawn bigger than its screen (tilePlacement), so neighbours overlap and the one drawn later lies on top.
    const tiles = kit.backgrounds ?? [];
    tiles.forEach((later, j) => {
      tiles.slice(0, j).forEach((earlier) => {
        if ((earlier.rate ?? 1) !== (later.rate ?? 1) || earlier.key === later.key || Math.abs(earlier.x - later.x) !== ROOM_W) return;
        const side = later.x > earlier.x ? 'left' : 'right';
        expect(later.fade?.[side] ?? 0, `${later.key} at ${later.x} over ${earlier.key}`).toBeGreaterThan(0);
      });
    });
  });
});

describe('the l4 demo drawn from the kit (OP-234)', () => {
  const kit = KIT_DEMOS['l4']!;

  it('draws its backdrops as the room tiles, with parallax rates and fades like the painted layers (sky, far, and a middle layer on screen 1 only, as the target has)', () => {
    expect(kit.backgrounds?.map((t) => t.rate)).toEqual([0.5, 0.5, 0.6, 0.6, 0.75]);
    expect(kit.foregrounds).toBeUndefined();
    expect(kit.background).toBe('kit-high-sky-b');
  });
});

describe('the kit draw plan (OP-234)', () => {
  const draw = (d: Partial<KitDraw>): KitDraw => ({ key: 'kit-tex-bark', x: 0, y: 0, w: 256, h: 256, tile: 'xy', layer: 'back', role: 'surface', id: 's', ...d });

  it('repeats a texture from the room origin, so two surfaces of it side by side line up', () => {
    const cells = kitCells(draw({ x: 400, y: 50, w: 300, h: 100 }));
    expect(cells.map((c) => [c.x, c.y])).toEqual([
      [0, 0],
      [512, 0],
    ]);
    expect(cells[0]!.crop).toEqual({ x: 400, y: 50, w: 112, h: 100 });
    expect(cells[1]!.crop).toEqual({ x: 0, y: 50, w: 188, h: 100 });
    // Covering the box exactly, no more.
    const area = cells.reduce((n, c) => n + c.crop.w * c.crop.h, 0);
    expect(area).toBe(300 * 100);
  });

  it("lays a run's middle piece art to art, a whole number of whole copies fitted to the run", () => {
    // kit-plank-mid is 320 wide, its art from x 14 to 306 (292 wide): a run of 900 takes three copies, each stretched to 300.
    const cells = kitCells(draw({ key: 'kit-plank-mid', tile: 'x', x: 100, y: 700, w: 900, h: 120 }));
    const k = 900 / (3 * 292);
    expect(cells.map((c) => c.x)).toEqual([100 - 14 * k, 100 + (292 - 14) * k, 100 + (584 - 14) * k]);
    expect(cells.every((c) => c.y === 700 && c.h === 120 && c.w === 320 * k)).toBe(true);
    expect(cells.every((c) => c.crop.w === 320 && c.crop.h === 120)).toBe(true);
    // The art of the first starts at the run's start and that of the last ends at its end.
    expect(cells[0]!.x + 14 * k).toBe(100);
    expect(cells[2]!.x + 306 * k).toBeCloseTo(1000, 9);
  });

  it('draws a piece that does not repeat to its box', () => {
    expect(kitCells(draw({ key: 'kit-doorway-stone', tile: 'none', x: 5, y: 6, w: 240, h: 320 }))).toEqual([{ x: 5, y: 6, w: 240, h: 320, crop: { x: 0, y: 0, w: 240, h: 320 } }]);
  });

  it("puts a run's walking line a step into its art's measured top, and spans a single platform's art across its run", () => {
    const r = room({ ledges: [{ id: 'low', x0: 700, x1: 940, top: 60, cap: 'kit-high-mist-platform' }] });
    const d = kitDrawPlan(r).find((p) => p.id === 'low')!;
    const s = KIT_ART['kit-high-mist-platform']!;
    const k = 240 / (s.right! - s.left!);
    expect(d.tile).toBe('none');
    expect(d.x + s.left! * k).toBeCloseTo(700, 0);
    expect(d.x + s.right! * k).toBeCloseTo(940, 0);
    expect(d.y + (s.top! + KIT_STAND_SINK) * k).toBeCloseTo(GROUND - 60, 0);
  });

  it('stands a prop, a doorway piece and a barrier on the foot of its art', () => {
    const r = room({ props: [{ id: 'bench', piece: 'kit-high-cloud-bench', x: 400, top: 0 }], barriers: [{ id: 'rope', x0: 60, x1: 322, top: 0, piece: 'kit-high-rope-barrier' }] });
    const plan = kitDrawPlan(r);
    const bench = plan.find((p) => p.id === 'bench')!;
    expect(bench.y + KIT_ART['kit-high-cloud-bench']!.foot!).toBe(GROUND);
    const rope = plan.find((p) => p.id === 'rope')!;
    expect(rope.x + KIT_ART['kit-high-rope-barrier']!.left!).toBe(60);
    expect(rope.y + KIT_ART['kit-high-rope-barrier']!.foot!).toBe(GROUND);
  });

  it('stands a doorway piece on its doorway, at its height', () => {
    const l4 = KIT_DEMOS['l4']!;
    const up = kitDrawPlan(l4).find((d) => d.role === 'door' && d.id === 'stair-l5-l4')!;
    expect(up.x + up.w / 2).toBe(930);
    expect(up.y + KIT_ART[up.key]!.foot!).toBe(GROUND);
  });

  it('is empty for a painted room', () => {
    expect(kitDrawPlan(ROOMS['l4']!)).toEqual([]);
    expect(kitArtKeys(ROOMS['l4']!)).toEqual([]);
  });

  it('keeps each kit room light enough for a phone: few images, few textures', () => {
    for (const r of KIT_ROOMS) {
      const cost = kitCost(r, 1);
      expect(cost.images, r.id).toBeLessThanOrEqual(400);
      expect(cost.textures, r.id).toBeLessThanOrEqual(48);
    }
  });

  it('makes one tile per screen of each backdrop', () => {
    expect(kitTiles({ ground: 0, backdrops: [{ key: 'kit-canopy-sky-a', rate: 0.5, screens: [1, 3] }] }).backgrounds.map((t) => t.x)).toEqual([ROOM_W, 2 * ROOM_W, 3 * ROOM_W]);
  });
});

/** Every colour an op draws in. */
const coloursOf = (ops: readonly KitOp[]) => new Set(ops.map((o) => o.c));
const PALETTE = new Set<number>(Object.values(KIT_PALETTE));

describe('runs and columns of the recut kit (OP-251)', () => {
  const ROW = 'kit-cut-plank';
  const mids = [320, 480, 640].map((l) => `${ROW}-mid-${l}`);
  const plan = (kit: Partial<RoomKit>) => kitDrawPlan({ kit: { ground: 770, ...kit }, doors: [], size: { w: 2 * ROOM_W, h: 900 } });

  it('spells a row out as its caps and its middles of every length', () => {
    expect(withRow({ id: 'r', x0: 0, x1: 100, top: 0, row: ROW })).toMatchObject({ left: `${ROW}-cap-left`, right: `${ROW}-cap-right`, mids });
    expect(withRow({ id: 'r', x0: 0, x1: 100, top: 0, row: ROW, mids: [mids[0]!] }).mids).toEqual([mids[0]]);
  });

  it('fills a stretch art to art with middles, the same way every time, never one piece twice running where another fits', () => {
    for (const len of [700, 1280, 2300, 3200 - 320]) {
      const fill = midFill(mids, 160, 160 + len, `walk-${len}`);
      expect(fill).toEqual(midFill(mids, 160, 160 + len, `walk-${len}`));
      expect(fill[0]!.x0).toBe(160);
      expect(fill[fill.length - 1]!.x1).toBeCloseTo(160 + len, 6);
      fill.forEach((m, i) => {
        if (i) expect(m.x0).toBeCloseTo(fill[i - 1]!.x1, 6);
        if (i) expect(m.key).not.toBe(fill[i - 1]!.key);
        const k = (m.x1 - m.x0) / KIT_ART[m.key]!.w;
        expect(k).toBeGreaterThanOrEqual(KIT_MID_STRETCH.min);
        expect(k).toBeLessThanOrEqual(KIT_MID_STRETCH.max);
      });
    }
  });

  it('draws a row run as its left cap, its middles and its right cap, each top at the walking line', () => {
    const draws = plan({ paths: [{ id: 'walk', x0: 0, x1: 2 * ROOM_W, top: 0, row: ROW }] }).filter((d) => d.id === 'walk');
    const keys = draws.map((d) => d.key);
    expect(keys).toContain(`${ROW}-cap-left`);
    expect(keys).toContain(`${ROW}-cap-right`);
    expect(keys.filter((k) => k.includes('-mid-')).length).toBeGreaterThan(3);
    for (const d of draws) expect(d.y + ((KIT_ART[d.key]!.top ?? 0) + KIT_STAND_SINK) * (d.h / KIT_ART[d.key]!.h)).toBeCloseTo(770, 0);
  });

  it('sets a join into a run with its art from its x, the middles filling around it', () => {
    const draws = plan({ paths: [{ id: 'walk', x0: 0, x1: 2000, top: 0, row: ROW, joins: [{ x: 900, piece: 'kit-cut-plank-to-stone' }] }] });
    const join = draws.find((d) => d.key === 'kit-cut-plank-to-stone')!;
    const art = KIT_ART['kit-cut-plank-to-stone']!;
    expect(join.x + (art.left ?? 0)).toBe(900);
    const before = draws.filter((d) => d.key.includes('-mid-') && d.x < 900);
    expect(Math.max(...before.map((d) => d.x + d.w))).toBeLessThanOrEqual(901);
  });

  it('draws a column as its middle scaled to its width and laid down it whole, with no copy squashed', () => {
    const [mid] = plan({ columns: [{ id: 'trunk', x0: 470, x1: 1130, y0: -40, y1: 900, mid: 'kit-cut-trunk-mid' }] });
    expect(mid).toMatchObject({ key: 'kit-cut-trunk-mid', tile: 'y', y: -40, h: 940 });
    const s = KIT_ART['kit-cut-trunk-mid']!;
    const u = mid!.w / s.w;
    expect(mid!.x + (s.left ?? 0) * u).toBeCloseTo(470, 0);
    const cells = kitCells(mid!);
    expect(cells).toHaveLength(1);
    expect(cells[0]!.w).toBe(mid!.w);
  });

  it('draws a column with bark edges as edge, middle, edge, art to art across its width, in the same courses down (OP-259)', () => {
    const keys = ['kit-cut-trunk-edge-left', 'kit-cut-trunk-mid', 'kit-cut-trunk-edge-right'] as const;
    const draws = plan({ columns: [{ id: 'trunk', x0: 470, x1: 1130, y0: -40, y1: 900, left: keys[0], mid: keys[1], right: keys[2] }] });
    expect(draws.map((d) => d.key)).toEqual([...keys]);
    const art = (d: KitDraw) => {
      const s = KIT_ART[d.key]!;
      const u = d.w / s.w;
      return [d.x + (s.left ?? 0) * u, d.x + (s.right ?? s.w) * u] as const;
    };
    const spans = draws.map(art);
    // Within the pixel each box is rounded to.
    const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1.5);
    near(spans[0]![0], 470);
    near(spans[2]![1], 1130);
    near(spans[1]![0], spans[0]![1]);
    near(spans[2]![0], spans[1]![1]);
    const courses = draws.map((d) => kitCells(d).map((c) => [Math.round(c.y), Math.round(c.h)]));
    expect(courses[0]!.length).toBeGreaterThan(1);
    expect(courses[1]).toEqual(courses[0]);
    expect(courses[2]).toEqual(courses[0]);
  });
});

describe('the kit catalogue and its placeholders (OP-234)', () => {
  it('names every piece kit-<group>-<name>', () => {
    for (const key of Object.keys(KIT_ART)) {
      expect(key, key).toMatch(KIT_KEY);
      expect(kitGroup(key), key).not.toBeNull();
    }
  });

  it('has a placeholder for every piece, drawn in the tree palette only', () => {
    for (const key of Object.keys(KIT_ART)) {
      const ops = kitPlaceholder(key);
      expect(ops?.length, key).toBeGreaterThan(0);
      expect([...coloursOf(ops!)].filter((c) => !PALETTE.has(c)), key).toEqual([]);
    }
    expect(kitPlaceholder('kit-tex-nothing')).toBeNull();
  });

  it('holds the published kit, piece for piece: its keys and logical sizes, and where each piece’s art stands', () => {
    expect(Object.keys(KIT_ART).length).toBe(Object.keys(KIT_CATALOG).length);
    expect(KIT_ART['kit-plank-mid']).toMatchObject({ w: 320, h: 120, kind: 'piece', tile: 'x' });
    expect(KIT_ART['kit-tex-bark']).toMatchObject({ w: 512, h: 512, kind: 'texture', tile: 'xy' });
    expect(KIT_ART['kit-high-sky-a']).toMatchObject({ w: 1600, h: 900, kind: 'layer', tile: 'none' });
    expect(KIT_ART['kit-plank-cap-left']?.tile).toBe('none');
    expect(KIT_ART['kit-trim-rope']?.tile).toBe('x');
    for (const [key, s] of Object.entries(KIT_ART).filter(([, s]) => s.kind === 'piece')) {
      expect(s.top, key).toBeDefined();
      expect(0 <= s.top! && s.top! < s.foot! && s.foot! <= s.h, key).toBe(true);
      expect(0 <= s.left! && s.left! < s.right! && s.right! <= s.w, key).toBe(true);
    }
  });

  // A repeating piece is one period of an endless pattern: drawn alone it is exactly the middle of the
  // pattern drawn over three periods each way, so copies side by side meet with no seam.
  for (const [key, spec] of Object.entries(KIT_ART).filter(([, s]) => s.tile !== 'none')) {
    it(`tiles ${key} with no seam`, () => {
      const m = kitMotifs(key)!;
      const one = raster(spec.w, spec.h);
      drawOps(one, kitPlaceholder(key)!);
      const across = spec.tile === 'x' || spec.tile === 'xy' ? 3 : 1;
      const down = spec.tile === 'y' || spec.tile === 'xy' ? 3 : 1;
      const plane = raster(spec.w * across, spec.h * down);
      const ox = across === 3 ? spec.w : 0;
      const oy = down === 3 ? spec.h : 0;
      // The plane: every period's base, then each motif at every period, in the piece's own order.
      const periods: Array<[number, number]> = [];
      for (let i = 0; i < across; i++) for (let j = 0; j < down; j++) periods.push([i * spec.w, j * spec.h]);
      for (const [px, py] of periods) drawOps(plane, m.base.map((o) => shiftOp(o, px, py)));
      for (const o of m.motifs) for (const [px, py] of periods) for (const [dx, dy] of periodShifts(spec.w, spec.h, spec.tile)) drawOps(plane, [shiftOp(o, px + dx, py + dy)]);
      let differ = 0;
      for (let y = 0; y < spec.h; y++)
        for (let x = 0; x < spec.w; x++)
          for (let c = 0; c < 4; c++) if (one.data[(y * spec.w + x) * 4 + c] !== plane.data[((y + oy) * plane.w + x + ox) * 4 + c]) differ++;
      expect(differ).toBe(0);
    });
  }
});
