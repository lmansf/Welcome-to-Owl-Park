import { describe, expect, it } from 'vitest';
import { HALL_ROOM, HALL_W } from '../rooms/hollowHall';
import { ROOMS } from '../rooms/index';
import { EDGE_ART, HALL_RING, SIDE_LEAST, STRIP_OUT, bumpProfile, edgeArt, edgeDraws, edgePlaceholder, kitFrames, shapedEdge } from './edges';
import { pointInPolygon } from './geometry';
import { INTERACTABLES } from './interactables';
import { kitDrawPlan } from './kit';
import { KIT_ART } from './kitArt';

const bumps = Object.entries(EDGE_ART).filter(([, a]) => a.kind === 'bump');
const hallFloor = HALL_ROOM.walkable[0]!;
const onFloor = (p: { x: number; y: number }) => pointInPolygon(p, hallFloor);

describe('edge pieces (the map should not read as big rectangles, Nov 8)', () => {
  it('each has a placeholder until its art is delivered, at a size an artist can paint at twice', () => {
    for (const [key, a] of Object.entries(EDGE_ART)) {
      expect(edgePlaceholder(key)?.length, key).toBeGreaterThan(0);
      expect(a.w % 2 === 0 && a.h % 2 === 0, key).toBe(true);
      expect(key.startsWith('edge-'), key).toBe(true);
    }
    expect(edgePlaceholder('not-an-edge')).toBeNull();
  });

  it("gives each bump the same profile every time, inside its box, easing out to the floor's line at its ends", () => {
    for (const [key, a] of bumps) {
      const prof = bumpProfile(key);
      expect(bumpProfile(key), key).toEqual(prof);
      expect(prof[0]!.x, key).toBe(0);
      expect(prof[prof.length - 1]!.x, key).toBe(a.w);
      for (const q of prof) expect(q.d >= 0 && q.d <= (a.depth ?? 0) * 1.25, key).toBe(true);
      // A bump that eases both ways meets the line at both ends; a corner is deep at its own end.
      if (a.ease !== 'right') expect(prof[prof.length - 1]!.d, key).toBe(0);
      if (a.ease !== 'left') expect(prof[0]!.d, key).toBe(0);
      if (a.ease === 'left') expect(Math.abs(prof[0]!.d - (a.depth ?? 0)), key).toBeLessThanOrEqual((a.depth ?? 0) * 0.15);
      // Its art stays on the right side of its edge: the box holds the whole of its profile.
      const base = a.base ?? 0;
      expect(a.side === 'front' ? base - (a.depth ?? 0) >= 0 : base + (a.depth ?? 0) <= a.h, key).toBe(true);
    }
  });

  it('refuses bumps that overlap or run past their edge', () => {
    const a = 'edge-hollow-roots-a';
    const w = edgeArt(a).w;
    expect(() => shapedEdge(0, 1000, 600, [{ id: 'x', key: a, x: 100, y: 600 }, { id: 'y', key: a, x: 100 + w - 10, y: 600 }])).toThrow(/overlaps/);
    expect(() => shapedEdge(0, 1000, 600, [{ id: 'x', key: a, x: 1000 - w + 10, y: 600 }])).toThrow(/runs past/);
    expect(shapedEdge(0, 1000, 600, [])).toEqual([
      { x: 0, y: 600 },
      { x: 1000, y: 600 },
    ]);
  });
});

describe("the Great Hollow's edges", () => {
  const edges = HALL_ROOM.edges ?? [];

  it('lays a worn ring round each moonbeam, walked across, and cuts nothing out of the oval floor', () => {
    expect(edges.length).toBeGreaterThanOrEqual(5);
    for (const e of edges) expect(edgeArt(e.key).kind, e.id).toBe('ring');
    for (const m of INTERACTABLES.filter((i) => i.room === HALL_ROOM.id && i.kind === 'moonbeam')) {
      expect(
        edges.some((e) => Math.abs(e.x + 380 - m.pos.x) < 2 && Math.abs(e.y + 190 - m.pos.y) < 2),
        m.id,
      ).toBe(true);
    }
  });

  it('keeps every piece in the room and on the floor, and every key a known piece', () => {
    for (const d of edgeDraws(edges)) {
      expect(d.x >= 0 && d.x + d.w <= HALL_W, d.id).toBe(true);
      expect(d.y + d.h <= HALL_ROOM.size.h, d.id).toBe(true);
      expect(onFloor({ x: d.x + d.w / 2, y: d.y + d.h / 2 }), d.id).toBe(true);
    }
    expect(new Set(edges.map((e) => e.id)).size).toBe(edges.length);
  });

  it('leaves every spot, spawn and leaf pile on open floor', () => {
    for (const s of HALL_ROOM.spots ?? []) expect(onFloor(s), `spot ${s.x}`).toBe(true);
    for (const [name, at] of Object.entries(HALL_ROOM.spawns)) expect(onFloor(at), name).toBe(true);
    for (const t of INTERACTABLES.filter((i) => i.room === HALL_ROOM.id)) expect(onFloor(t.pos), t.id).toBe(true);
  });
});

describe("kit rooms' platform frames", () => {
  const kitRooms = Object.values(ROOMS).filter((r) => r.kit);

  it('frames only a textured body, inside its sides, with roots hanging no further than set below its foot', () => {
    let framed = 0;
    for (const room of kitRooms) {
      for (const d of kitDrawPlan(room)) {
        const strips = kitFrames(d, room.size, kitDrawPlan(room));
        if (!strips.length) continue;
        framed++;
        expect(KIT_ART[d.key]?.kind, d.id).toBe('texture');
        for (const s of strips) {
          expect(s.x >= d.x - STRIP_OUT.side && s.x + s.w <= d.x + d.w + STRIP_OUT.side, s.id).toBe(true);
          // The top, where an owl lands, is left to the cap.
          expect(s.y, s.id).toBeGreaterThan(d.y);
          expect(s.y + s.h, s.id).toBeLessThanOrEqual(d.y + d.h + STRIP_OUT.under);
        }
      }
    }
    expect(framed).toBeGreaterThan(5);
  });

  it("never lays a strip over another platform's walking line", () => {
    for (const room of kitRooms) {
      const plan = kitDrawPlan(room);
      const bodies = plan.filter((d) => d.role === 'path' || d.role === 'ledge' || d.role === 'hill');
      for (const d of plan)
        for (const s of kitFrames(d, room.size, plan))
          for (const o of bodies) {
            if (o.id === d.id) continue;
            const across = o.x < s.x + s.w && o.x + o.w > s.x;
            // A cap's box top is its art's top, above its walking line: no strip reaches it.
            expect(across && o.y > s.y && o.y < s.y + s.h, `${room.id} ${s.id} over ${o.id}`).toBe(false);
          }
    }
  });

  it('frames no side at the room wall, nor the foot of a body that stands on the room floor', () => {
    const flat = { key: 'kit-tex-inner-wood', x: 0, y: 700, w: 400, h: 200, role: 'path' as const, id: 'p' };
    const strips = kitFrames(flat, { w: 1600, h: 900 });
    expect(strips.map((s) => s.id)).toEqual(['p:right']);
  });

  it('frames a side only where it stands free: not where another body begins at it (OP-348)', () => {
    const size = { w: 1600, h: 900 };
    const walk = { key: 'kit-tex-earth', x: 100, y: 770, w: 600, h: 130, role: 'path' as const, id: 'walk' };
    // A course's pit: the same earth, a step lower, from the walk's very end.
    const pit = { key: 'kit-tex-earth', x: 700, y: 800, w: 400, h: 100, role: 'path' as const, id: 'pit' };
    const far = { key: 'kit-tex-earth', x: 1100, y: 770, w: 300, h: 130, role: 'path' as const, id: 'far' };
    const plan = [walk, pit, far];
    // Alone, the walk has both its sides; beside the pit, only the one that stands free.
    expect(kitFrames(walk, size).map((s) => s.id)).toEqual(['walk:left', 'walk:right']);
    expect(kitFrames(walk, size, plan).map((s) => s.id)).toEqual(['walk:left']);
    expect(kitFrames(pit, size, plan)).toEqual([]);
    expect(kitFrames(far, size, plan).map((s) => s.id)).toEqual(['far:right']);
    // A neighbour that begins well down the side leaves the side above it framed, down to it and no further.
    const low = { ...pit, y: 850, h: 50 };
    const right = kitFrames(walk, size, [walk, low]).find((s) => s.id === 'walk:right')!;
    expect(right.y + right.h).toBe(850);
    expect(right.h).toBeGreaterThanOrEqual(SIDE_LEAST);
    // A body a gap away is no neighbour: the side stands free.
    const apart = { ...pit, x: 760 };
    expect(kitFrames(walk, size, [walk, apart]).map((s) => s.id)).toEqual(['walk:left', 'walk:right']);
    // Nor is a cap, a prop or a backdrop piece at the side: only a body of earth is.
    const cap = { key: 'kit-plank-mid', x: 700, y: 760, w: 300, h: 60, role: 'path' as const, id: 'cap' };
    expect(kitFrames(walk, size, [walk, cap]).map((s) => s.id)).toEqual(['walk:left', 'walk:right']);
  });

  it('leaves no strip down the join of a walk and a pit in any course', () => {
    let pits = 0;
    for (const room of kitRooms.filter((r) => r.course)) {
      const plan = kitDrawPlan(room);
      const bodies = plan.filter((d) => (d.role === 'path' || d.role === 'ledge' || d.role === 'hill') && KIT_ART[d.key]?.kind === 'texture');
      for (const d of bodies.filter((b) => b.layer === 'hazard')) {
        pits++;
        expect(kitFrames(d, room.size, plan).filter((s) => s.tile === 'y'), `${room.id} ${d.id}`).toEqual([]);
        for (const o of bodies.filter((b) => b.id !== d.id && (Math.abs(b.x + b.w - d.x) <= 2 || Math.abs(b.x - (d.x + d.w)) <= 2))) {
          const atJoin = kitFrames(o, room.size, plan).filter((s) => s.tile === 'y' && ((s.id.endsWith(':right') && Math.abs(o.x + o.w - d.x) <= 2) || (s.id.endsWith(':left') && Math.abs(o.x - (d.x + d.w)) <= 2)));
          for (const s of atJoin) expect(s.y + s.h, `${room.id} ${s.id}`).toBeLessThanOrEqual(d.y);
        }
      }
    }
    // The canopy's and the neon course's drops (the ink course's pits are flooded walks, with no body of their own).
    expect(pits).toBeGreaterThan(5);
  });
});

describe("the arcade's edge stand-ins", () => {
  it('use no moss or leaf colours, so the plaza sits in the night street', () => {
    const tree = new Set([0x3e5a3a, 0x6e8b4e, 0x4f7a3e, 0x8dae5a]);
    const keys = Object.keys(EDGE_ART).filter((k) => k.startsWith('edge-arcade-'));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) for (const op of edgePlaceholder(key) ?? []) expect(tree.has(op.c), key).toBe(false);
  });
});

describe('the Great Hollow\'s plaza rings sit in its painting (OP-348)', () => {
  const ring = edgePlaceholder('edge-hall-plaza-ring')!;
  const mossy = edgePlaceholder('edge-hollow-plaza-ring')!;

  it('rings each of the hall\'s plazas with the hall\'s own ring, not the mossy one', () => {
    const rings = (HALL_ROOM.edges ?? []).filter((e) => EDGE_ART[e.key]?.kind === 'ring');
    expect(rings.length).toBeGreaterThan(0);
    for (const r of rings) expect(r.key).toBe('edge-hall-plaza-ring');
    expect(EDGE_ART['edge-hall-plaza-ring']).toEqual(EDGE_ART['edge-hollow-plaza-ring']);
  });

  it('is a pool of light and a ring of stones with their shadows: none of the moss that lay on the painting as a green film', () => {
    const ellipses = (ops: typeof ring) => ops.flatMap((o) => (o.op === 'ellipse' ? [o] : []));
    const all = ellipses(ring);
    expect(all).toHaveLength(ring.length);
    const colours = new Set(all.map((o) => o.c));
    expect([...colours].sort()).toEqual([HALL_RING.light, HALL_RING.shadow, HALL_RING.stone, HALL_RING.stoneDark].sort());
    for (const o of ellipses(mossy)) if (o.rx > 100) expect(colours.has(o.c)).toBe(false);
    // The pool: steps of light, each inside the last, none strong enough to lie on the floor as a disc.
    const pool = all.filter((o) => o.c === HALL_RING.light && o.rx > 60);
    expect(pool.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < pool.length; i++) expect(pool[i]!.rx).toBeLessThan(pool[i - 1]!.rx);
    for (const o of pool) expect(o.a ?? 1).toBeLessThanOrEqual(0.1);
    // Each stone lies over its own shadow.
    const stones = all.filter((o) => o.c === HALL_RING.stone || o.c === HALL_RING.stoneDark);
    const shadows = all.filter((o) => o.c === HALL_RING.shadow);
    expect(stones.length).toBe(22);
    expect(shadows.length).toBe(stones.length);
  });
});
