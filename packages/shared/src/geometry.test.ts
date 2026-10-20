import { describe, expect, it } from 'vitest';
import { closestPointOnPolygon, distanceToRect, isWalkable, pointInPolygon, pointInRect, snapToWalkable, type Polygon } from './geometry';

const square: Polygon = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];
const trapezoid: Polygon = [
  { x: 40, y: 560 },
  { x: 560, y: 470 },
  { x: 1040, y: 470 },
  { x: 1560, y: 560 },
  { x: 1580, y: 880 },
  { x: 20, y: 880 },
];

describe('pointInPolygon', () => {
  it('detects inside and outside', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
    expect(pointInPolygon({ x: 800, y: 700 }, trapezoid)).toBe(true);
    expect(pointInPolygon({ x: 800, y: 100 }, trapezoid)).toBe(false);
  });
  it('counts edges as inside', () => {
    expect(pointInPolygon({ x: 0, y: 50 }, square)).toBe(true);
    expect(pointInPolygon({ x: 100, y: 100 }, square)).toBe(true);
  });
});

describe('snapToWalkable', () => {
  it('leaves walkable points alone', () => {
    expect(snapToWalkable({ x: 20, y: 30 }, [square])).toEqual({ x: 20, y: 30 });
  });
  it('snaps outside points to the nearest boundary', () => {
    expect(snapToWalkable({ x: 150, y: 50 }, [square])).toEqual({ x: 100, y: 50 });
    const snapped = snapToWalkable({ x: 800, y: 50 }, [trapezoid]);
    expect(snapped.y).toBe(470);
    expect(snapped.x).toBe(800);
    expect(isWalkable(snapped, [trapezoid])).toBe(true);
  });
  it('considers every polygon', () => {
    const far: Polygon = [
      { x: 1000, y: 0 },
      { x: 1100, y: 0 },
      { x: 1100, y: 100 },
      { x: 1000, y: 100 },
    ];
    expect(snapToWalkable({ x: 990, y: 50 }, [square, far])).toEqual({ x: 1000, y: 50 });
  });
});

describe('helpers', () => {
  it('closestPointOnPolygon handles corners', () => {
    expect(closestPointOnPolygon({ x: 120, y: 120 }, square)).toEqual({ x: 100, y: 100 });
  });
  it('distanceToRect is 0 inside and the shortest way to an edge or corner outside', () => {
    const r = { x: 10, y: 10, w: 20, h: 10 };
    expect(distanceToRect({ x: 15, y: 15 }, r)).toBe(0);
    expect(distanceToRect({ x: 15, y: 4 }, r)).toBe(6);
    expect(distanceToRect({ x: 33, y: 24 }, r)).toBe(5);
  });

  it('pointInRect is inclusive', () => {
    expect(pointInRect({ x: 10, y: 10 }, { x: 10, y: 10, w: 5, h: 5 })).toBe(true);
    expect(pointInRect({ x: 16, y: 10 }, { x: 10, y: 10, w: 5, h: 5 })).toBe(false);
  });
});
