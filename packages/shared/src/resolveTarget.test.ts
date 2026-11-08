import { describe, expect, it } from 'vitest';
import { ROOMS } from '../rooms';
import { resolveTarget, steerTarget, walkableReach } from './resolveTarget';
import type { Polygon } from './geometry';

const left: Polygon = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];
const right: Polygon = [
  { x: 200, y: 0 },
  { x: 300, y: 0 },
  { x: 300, y: 100 },
  { x: 200, y: 100 },
];

describe('resolveTarget', () => {
  it('returns the tap when the whole line is walkable', () => {
    expect(resolveTarget({ x: 10, y: 10 }, { x: 90, y: 90 }, [left])).toEqual({ x: 90, y: 90 });
  });
  it('snaps a tap outside the area to its edge', () => {
    expect(resolveTarget({ x: 50, y: 50 }, { x: 50, y: 150 }, [left])).toEqual({ x: 50, y: 100 });
  });
  it('stops at a gap instead of crossing it', () => {
    const r = resolveTarget({ x: 50, y: 50 }, { x: 250, y: 50 }, [left, right]);
    expect(r.x).toBeLessThanOrEqual(100);
    expect(r.x).toBeGreaterThan(90);
    expect(r.y).toBe(50);
  });
  it('is a no-op for tiny moves', () => {
    expect(resolveTarget({ x: 50, y: 50 }, { x: 52, y: 51 }, [left])).toEqual({ x: 52, y: 51 });
  });
  it('recovers when starting outside the area', () => {
    expect(resolveTarget({ x: -40, y: 50 }, { x: 60, y: 50 }, [left])).toEqual({ x: 60, y: 50 });
  });
});

describe('floor shut for now', () => {
  // The way into a closed arch: floor, but not while its realm is closed.
  const shut = [{ x: 40, y: 0, w: 20, h: 60 }];
  it('stops a walk at its edge', () => {
    const r = resolveTarget({ x: 50, y: 90 }, { x: 50, y: 20 }, [left], shut);
    expect(r.x).toBe(50);
    expect(r.y).toBeGreaterThan(60);
    expect(r.y).toBeLessThan(70);
  });
  it('keeps keyboard walking out of it', () => {
    expect(walkableReach({ x: 50, y: 90 }, { x: 0, y: -1 }, [left], undefined, shut).y).toBeGreaterThan(60);
    const t = steerTarget({ x: 50, y: 66 }, { x: 0, y: -1 }, [left], 12, shut);
    expect(t === null || t.y > 60 || t.x < 40 || t.x > 60).toBe(true);
  });
  it('is floor again once it opens', () => {
    expect(resolveTarget({ x: 50, y: 90 }, { x: 50, y: 20 }, [left])).toEqual({ x: 50, y: 20 });
  });
});

describe('walkableReach', () => {
  it('walks to the last walkable sample before the edge', () => {
    const r = walkableReach({ x: 10, y: 50 }, { x: 1, y: 0 }, [left]);
    expect(r.x).toBeGreaterThan(90);
    expect(r.x).toBeLessThanOrEqual(100);
    expect(r.y).toBe(50);
  });
  it('never crosses a gap between two areas', () => {
    expect(walkableReach({ x: 50, y: 50 }, { x: 1, y: 0 }, [left, right]).x).toBeLessThanOrEqual(100);
  });
  it('starts from an owl standing on the edge', () => {
    expect(walkableReach({ x: 0, y: 50 }, { x: 1, y: 0 }, [left]).x).toBeGreaterThan(90);
  });
  it('stays put when the way is blocked', () => {
    expect(walkableReach({ x: 98, y: 50 }, { x: 1, y: 0 }, [left])).toEqual({ x: 98, y: 50 });
  });
  it('stops at the given distance', () => {
    expect(walkableReach({ x: 10, y: 50 }, { x: 1, y: 0 }, [left], 30)).toEqual({ x: 40, y: 50 });
  });
});

describe('steerTarget', () => {
  const wide: Polygon = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 100 },
    { x: 0, y: 100 },
  ];
  it('heads straight on when the way is open', () => {
    const t = steerTarget({ x: 50, y: 50 }, { x: 1, y: 0 }, [wide])!;
    expect(t.x).toBeGreaterThan(390);
    expect(t.y).toBe(50);
  });
  it('slides along an edge when a diagonal runs into it', () => {
    // Up and to the right from just under the top edge: straight on is blocked, so it slides right.
    const t = steerTarget({ x: 50, y: 4 }, { x: Math.SQRT1_2, y: -Math.SQRT1_2 }, [wide])!;
    expect(t.x).toBeGreaterThan(100);
    expect(t.y).toBeGreaterThanOrEqual(0);
  });
  it('gives up when every bearing is blocked', () => {
    expect(steerTarget({ x: 396, y: 50 }, { x: 1, y: 0 }, [wide])).toBeNull();
  });
  it('slides along an edge more than 45 degrees off the keys, close along it, not away from it (OP-124)', () => {
    // A top edge falling a degree to the right, like the lobby's turnstile line, with the owl right under it.
    const sloped: Polygon = [
      { x: 0, y: 100 },
      { x: 400, y: 106 },
      { x: 400, y: 300 },
      { x: 0, y: 300 },
    ];
    const t = steerTarget({ x: 200, y: 103.05 }, { x: Math.SQRT1_2, y: -Math.SQRT1_2 }, [sloped])!;
    expect(t.x).toBeGreaterThan(390);
    expect(t.y - (100 + (t.x * 6) / 400)).toBeLessThan(1);
    // Held up into it, there is nowhere to go: 89 degrees off the keys is no way along it.
    expect(steerTarget({ x: 200, y: 103.05 }, { x: 0, y: -1 }, [sloped])).toBeNull();
  });

  it("goes into the lobby's gate held up and right from anywhere under the turnstile line west of it (OP-124)", () => {
    const lobby = ROOMS['lobby']!;
    const gate = lobby.doors.find((d) => d.id === 'gate')!.rect;
    const up = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
    // The line falls from (2100, 702) to (2390, 708): an owl held up against it stands within a walk sample below it.
    const starts = [{ x: 2250, y: 712 }];
    for (let x = 2110; x <= 2340; x += 10) for (const below of [0.05, 1, 3, 5.9]) starts.push({ x, y: 702 + ((x - 2100) * 6) / 290 + below });
    for (const from of starts) {
      const t = steerTarget(from, up, lobby.walkable);
      expect(t, `from ${from.x}, ${from.y.toFixed(2)}`).not.toBeNull();
      // Where the walk crosses the gate's left end, it is between the gate's top and bottom.
      expect(t!.x, `from ${from.x}, ${from.y.toFixed(2)}`).toBeGreaterThan(gate.x);
      const y = from.y + ((gate.x - from.x) * (t!.y - from.y)) / (t!.x - from.x);
      expect(y, `from ${from.x}, ${from.y.toFixed(2)}`).toBeGreaterThanOrEqual(gate.y);
      expect(y, `from ${from.x}, ${from.y.toFixed(2)}`).toBeLessThanOrEqual(gate.y + gate.h);
    }
  });
});
