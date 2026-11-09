import { describe, expect, it } from 'vitest';
import { HALL_ROOM, HALL_W } from '../rooms/hollowHall';
import { ROOMS } from '../rooms/index';
import { EDGE_ART, STRIP_OUT, bumpProfile, edgeArt, edgeDraws, edgePlaceholder, kitFrames, shapedEdge } from './edges';
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
});

describe("the arcade's edge stand-ins", () => {
  it('use no moss or leaf colours, so the plaza sits in the night street', () => {
    const tree = new Set([0x3e5a3a, 0x6e8b4e, 0x4f7a3e, 0x8dae5a]);
    const keys = Object.keys(EDGE_ART).filter((k) => k.startsWith('edge-arcade-'));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) for (const op of edgePlaceholder(key) ?? []) expect(tree.has(op.c), key).toBe(false);
  });
});
