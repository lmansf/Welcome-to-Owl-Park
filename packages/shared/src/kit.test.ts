import { describe, expect, it } from 'vitest';
import { KIT_DEMOS } from '../rooms/kit';
import { ROOMS } from '../rooms/index';
import { kitArtKeys, kitCells, kitCost, kitDrawPlan, kitPerches, kitProblems, kitRoom, kitTiles, walkedAt, type KitDraw } from './kit';
import { KIT_ART, KIT_KEY, KIT_PALETTE, drawOps, kitGroup, kitMotifs, kitPlaceholder, periodShifts, shiftOp, type KitOp } from './kitArt';
import { raster } from './raster';
import { ROOM_W, type RoomDef, type RoomKit } from './room';

/** Every room built from the kit: the registry's own (none yet) and the demos that stand in for painted rooms. */
const KIT_ROOMS: readonly RoomDef[] = [...Object.values(ROOMS).filter((r) => r.kit), ...Object.values(KIT_DEMOS)];

const GROUND = 770;

/** A small kit room for the rule's own cases: a floor from 100 to 1500, drawn as `kit` says. */
function room(kit: Partial<RoomKit>, extra: Partial<RoomDef> = {}): RoomDef {
  const k: RoomKit = { ground: GROUND, paths: [{ id: 'floor', x0: 100, x1: 1500, top: 0, cap: 'kit-cap-plank' }], ...kit };
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
    expect(kitProblems(room({ ledges: [{ id: 'low', x0: 700, x1: 800, top: 60, cap: 'kit-cap-plank' }] }))).toEqual([]);
  });

  it('asks for a barrier under a ledge no owl reaches', () => {
    const high = room({ ledges: [{ id: 'high', x0: 700, x1: 800, top: 500, cap: 'kit-cap-plank' }] });
    expect(kitProblems(high)).toEqual(['ledge high is drawn where no owl reaches it, with no barrier at its foot']);
    const barred = room({ ledges: [{ id: 'high', x0: 700, x1: 800, top: 500, cap: 'kit-cap-plank' }], barriers: [{ id: 'roots', x0: 690, x1: 810, top: 0, piece: 'kit-barrier-roots' }] });
    expect(kitProblems(barred)).toEqual([]);
  });

  it('asks for a barrier at the foot of a ledge drawn but not stood on', () => {
    const shelf = { id: 'shelf', x0: 300, x1: 420, top: 80, cap: 'kit-cap-moss', perch: false as const };
    expect(kitProblems(room({ ledges: [shelf] }))).toEqual(['ledge shelf is drawn where no owl reaches it, with no barrier at its foot']);
    expect(kitProblems(room({ ledges: [shelf], barriers: [{ id: 'rope', x0: 300, x1: 420, top: 80, piece: 'kit-barrier-rope' }] }))).toEqual([]);
    // A barrier beside the ledge is not at its foot.
    expect(kitProblems(room({ ledges: [shelf], barriers: [{ id: 'rope', x0: 500, x1: 600, top: 0, piece: 'kit-barrier-rope' }] }))).toHaveLength(1);
  });

  it('asks for a barrier where a path is drawn past the end of the walk, unless a doorway stands there', () => {
    const long = { paths: [{ id: 'floor', x0: 0, x1: ROOM_W, top: 0, cap: 'kit-cap-plank' }] };
    expect(kitProblems(room(long))).toEqual([
      'path floor leads nowhere west of x 100: no barrier or doorway at the end of the walk',
      'path floor leads nowhere east of x 1500: no barrier or doorway at the end of the walk',
    ]);
    const railed = { ...long, barriers: [{ id: 'w', x0: 20, x1: 120, top: 0, piece: 'kit-barrier-railing' }] };
    expect(kitProblems(room(railed))).toEqual(['path floor leads nowhere east of x 1500: no barrier or doorway at the end of the walk']);
    const door = { id: 'out', rect: { x: 1460, y: 750, w: 60, h: 40 }, to: { room: 'hub', spawn: 'default' }, top: 0 };
    expect(kitProblems(room(railed, { doors: [door] }))).toEqual([]);
  });

  it('asks for a barrier across a path no owl walks', () => {
    const upper = { id: 'gallery', x0: 200, x1: 600, top: 300, cap: 'kit-cap-plank' };
    const paths = [{ id: 'floor', x0: 100, x1: 1500, top: 0, cap: 'kit-cap-plank' }, upper];
    expect(kitProblems(room({ paths }))).toEqual(['path gallery is drawn where no owl walks, with no barrier at its foot']);
    expect(kitProblems(room({ paths, barriers: [{ id: 'bar', x0: 380, x1: 500, top: 300, piece: 'kit-barrier-railing' }] }))).toEqual([]);
  });

  it('asks that the floor owls walk is drawn, and that every key, tread and doorway is the kit\'s and the room\'s', () => {
    expect(kitProblems(room({ paths: [{ id: 'floor', x0: 100, x1: 700, top: 0, cap: 'kit-cap-plank' }] }))[0]).toMatch(/^the floor at x 7\d\d is walked but not drawn$/);
    expect(kitProblems(room({ surfaces: [{ id: 's', texture: 'kit-tex-chrome', rect: { x: 0, y: 0, w: 10, h: 10 } }] }))).toEqual(["kit-tex-chrome is not in the kit's catalogue (KIT_ART)"]);
    expect(kitProblems(room({ surfaces: [{ id: 's', texture: 'tree-l4-0-back', rect: { x: 0, y: 0, w: 10, h: 10 } }] }))).toEqual(['tree-l4-0-back is not a kit key (kit-<group>-<name>)']);
    expect(kitProblems(room({ stairs: [{ id: 'st', treads: ['nope'] }] }))).toEqual(["stair st's tread nope is no ledge"]);
    expect(kitProblems(room({ doors: [{ door: 'nope', piece: 'kit-door-arch' }] }))).toEqual(['door piece kit-door-arch stands at nope, which is no doorway of the room']);
  });

  it('finds the stretches an owl walks along a height', () => {
    const r = room({});
    expect(walkedAt(r, GROUND, 0, 0, ROOM_W)).toEqual([[100, 1500]]);
    expect(walkedAt(r, GROUND, 50, 0, ROOM_W)).toEqual([]);
  });
});

describe('the l4 demo drawn from the kit (OP-234)', () => {
  const kit = KIT_DEMOS['l4']!;
  const painted = ROOMS['l4']!;

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

  it('draws its backdrops as the room tiles, with parallax rates and fades like the painted layers', () => {
    expect(kit.backgrounds?.map((t) => t.rate)).toEqual([0.5, 0.5, 0.75]);
    expect(kit.foregrounds?.map((t) => [t.x, t.rate])).toEqual([
      [0, 1.2],
      [ROOM_W, 1.2],
    ]);
    expect(kit.background).toBe('kit-back-sky-high');
  });
});

describe('the kit draw plan (OP-234)', () => {
  const draw = (d: Partial<KitDraw>): KitDraw => ({ key: 'kit-tex-bark', x: 0, y: 0, w: 256, h: 256, tile: 'xy', layer: 'back', role: 'surface', id: 's', ...d });

  it('repeats a texture from the room origin, so two surfaces of it side by side line up', () => {
    const cells = kitCells(draw({ x: 100, y: 50, w: 300, h: 100 }));
    expect(cells.map((c) => [c.x, c.y])).toEqual([
      [0, 0],
      [256, 0],
    ]);
    expect(cells[0]!.crop).toEqual({ x: 100, y: 50, w: 156, h: 100 });
    expect(cells[1]!.crop).toEqual({ x: 0, y: 50, w: 144, h: 100 });
    // Covering the box exactly, no more.
    const area = cells.reduce((n, c) => n + c.crop.w * c.crop.h, 0);
    expect(area).toBe(300 * 100);
  });

  it('repeats a cap across only, anchored to the run along the other axis', () => {
    const cells = kitCells(draw({ key: 'kit-cap-plank', tile: 'x', x: 10, y: 700, w: 250, h: 28 }));
    expect(cells.map((c) => c.x)).toEqual([0, 128, 256]);
    expect(cells.every((c) => c.y === 700 && c.h === 28)).toBe(true);
  });

  it('stretches a piece that does not repeat to its box', () => {
    expect(kitCells(draw({ key: 'kit-door-arch', tile: 'none', x: 5, y: 6, w: 180, h: 260 }))).toEqual([{ x: 5, y: 6, w: 180, h: 260, crop: { x: 0, y: 0, w: 180, h: 260 } }]);
  });

  it('stands a doorway piece on its doorway, at its height', () => {
    const l4 = KIT_DEMOS['l4']!;
    const up = kitDrawPlan(l4).find((d) => d.role === 'door' && d.id === 'stair-l5-l4')!;
    expect(up.x + up.w / 2).toBe(1064);
    expect(up.y + up.h).toBe(GROUND - 239);
  });

  it('is empty for a painted room', () => {
    expect(kitDrawPlan(ROOMS['l4']!)).toEqual([]);
    expect(kitArtKeys(ROOMS['hub']!)).toEqual([]);
  });

  it('keeps each kit room light enough for a phone: few images, few textures', () => {
    for (const r of KIT_ROOMS) {
      const cost = kitCost(r, 1);
      expect(cost.images, r.id).toBeLessThanOrEqual(400);
      expect(cost.textures, r.id).toBeLessThanOrEqual(48);
    }
  });

  it('makes one tile per screen of each backdrop', () => {
    expect(kitTiles({ ground: 0, backdrops: [{ key: 'kit-back-sky-top', rate: 0.5, screens: [1, 3] }] }).backgrounds.map((t) => t.x)).toEqual([ROOM_W, 2 * ROOM_W, 3 * ROOM_W]);
  });
});

/** Every colour an op draws in. */
const coloursOf = (ops: readonly KitOp[]) => new Set(ops.map((o) => o.c));
const PALETTE = new Set<number>(Object.values(KIT_PALETTE));

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

  it('keeps an overlay to the outer fifth of each side (docs/TREE_STYLE.md, section 3)', () => {
    for (const key of ['kit-back-over-leaves', 'kit-back-over-roots']) {
      const r = raster(1600, 900);
      drawOps(r, kitPlaceholder(key)!);
      let middle = 0;
      for (let y = 0; y < 900; y += 4) for (let x = 340; x < 1260; x += 4) middle += r.data[(y * 1600 + x) * 4 + 3]!;
      expect(middle, key).toBe(0);
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
