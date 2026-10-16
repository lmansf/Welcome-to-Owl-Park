import { describe, expect, it } from 'vitest';
import { resolveTarget } from './resolveTarget';
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
