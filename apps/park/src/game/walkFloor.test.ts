import { roomFor } from '../rooms';
import { describe, expect, it } from 'vitest';
import { FOOTPRINT, floorLook, paintFloor, rgba, standsOwnArt } from './walkFloor';

function recorder() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get: (t, p) => (p in t ? t[p as string] : (...args: unknown[]) => void calls.push({ op: String(p), args })),
    set: (t, p, v) => {
      t[p as string] = v;
      calls.push({ op: `${String(p)}=`, args: [v] });
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('the walkable floor, seen from above', () => {
  it('veils everything but the floor, cutting the floor out of the veil', () => {
    const hub = roomFor('hub')!;
    const { ctx, calls } = recorder();
    paintFloor(ctx, hub, false);
    const fills = calls.filter((c) => c.op === 'fill');
    expect(fills[0]!.args).toEqual(['evenodd']);
    // One moveTo per floor shape for the veil's holes, then the same again for the edge.
    const moves = calls.filter((c) => c.op === 'moveTo').length;
    expect(moves).toBeGreaterThanOrEqual(2 * hub.walkable.length);
    expect(calls.some((c) => c.op === 'stroke')).toBe(true);
  });

  it("reads the look's colours as Phaser takes them", () => {
    expect(rgba('rgba(255, 244, 214, 0.55)')).toEqual({ color: 0xfff4d6, alpha: 0.55 });
    expect(rgba(floorLook(false).solidEdge).alpha).toBeGreaterThan(0);
  });

  it('tints the floor and edges it brighter with size boxes on', () => {
    expect(floorLook(false).floor).toBeNull();
    expect(floorLook(true).floor).not.toBeNull();
    expect(floorLook(true).edgePx).toBeGreaterThan(floorLook(false).edgePx);
  });

  it('marks a solid perch, which stops a walk, apart from the floor', () => {
    const room = {
      size: { w: 400, h: 200 },
      walkable: [
        [
          { x: 0, y: 0 },
          { x: 400, y: 0 },
          { x: 400, y: 200 },
          { x: 0, y: 200 },
        ],
      ],
      perches: [
        {
          id: 'stump',
          area: [
            { x: 10, y: 10 },
            { x: 50, y: 10 },
            { x: 50, y: 50 },
          ],
          top: 40,
          solid: true,
        },
      ],
    };
    const { ctx, calls } = recorder();
    paintFloor(ctx, room as never, true);
    const strokes = calls.filter((c) => c.op === 'strokeStyle=').map((c) => c.args[0]);
    expect(strokes).toContain(floorLook(true).solidEdge);
  });
});

describe('a perch its own art stands on (OP-348)', () => {
  it('is every root of the Great Hollow: shown by its art and the shadow at its foot, with no amber box round its strip', () => {
    const hall = roomFor('m3-hall')!;
    const solid = (hall.perches ?? []).filter((p) => p.solid);
    expect(solid.length).toBeGreaterThan(0);
    for (const p of solid) expect(standsOwnArt(hall, p.id), p.id).toBe(true);
  });

  it('is not a perch that is part of a room\'s painting: that one keeps its amber edge', () => {
    expect(standsOwnArt({ pieces: [] }, 'stump')).toBe(false);
    expect(standsOwnArt({}, 'stump')).toBe(false);
    expect(standsOwnArt({ pieces: [{ id: 'other', key: 'kit-under-root-knot', x: 0, y: 0 }] }, 'stump')).toBe(false);
  });

  it('darkens the floor under such a perch only a little', () => {
    expect(FOOTPRINT.alpha).toBeGreaterThan(0.1);
    expect(FOOTPRINT.alpha).toBeLessThan(0.35);
  });
});
