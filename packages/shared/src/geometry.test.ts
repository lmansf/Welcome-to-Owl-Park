import { describe, expect, it } from 'vitest';
import { closestPointOnPolygon, distanceToRect, isWalkable, pointInPolygon, pointInRect, segmentTouchesRect, snapToWalkable, type Polygon } from './geometry';

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

describe('segmentTouchesRect: a straight way and a rectangle', () => {
  const r = { x: 100, y: 200, w: 50, h: 30 }; // x 100 to 150, y 200 to 230
  const touches = (ax: number, ay: number, bx: number, by: number) => segmentTouchesRect({ x: ax, y: ay }, { x: bx, y: by }, r);

  it('a way straight across it touches it, either way round', () => {
    expect(touches(50, 215, 200, 215)).toBe(true);
    expect(touches(200, 215, 50, 215)).toBe(true);
    expect(touches(125, 150, 125, 300)).toBe(true);
    expect(touches(125, 300, 125, 150)).toBe(true);
    expect(touches(60, 190, 190, 240)).toBe(true);
  });

  it('a way that begins or ends inside it touches it, and so does one wholly inside', () => {
    expect(touches(125, 215, 400, 400)).toBe(true);
    expect(touches(0, 0, 125, 215)).toBe(true);
    expect(touches(110, 205, 140, 225)).toBe(true);
    expect(touches(125, 215, 125, 215)).toBe(true);
  });

  it('a way that stops short of it, or sets off beyond it, does not', () => {
    expect(touches(50, 215, 99, 215)).toBe(false);
    expect(touches(151, 215, 300, 215)).toBe(false);
    expect(touches(125, 100, 125, 199)).toBe(false);
    expect(touches(125, 231, 125, 400)).toBe(false);
    expect(touches(90, 190, 90, 190)).toBe(false);
  });

  it('a way that runs past one of its sides does not, however long it is', () => {
    expect(touches(0, 199, 400, 199)).toBe(false);
    expect(touches(0, 231, 400, 231)).toBe(false);
    expect(touches(99, 0, 99, 400)).toBe(false);
    expect(touches(151, 0, 151, 400)).toBe(false);
  });

  it('a slanted way that passes a corner without meeting it does not, though it is between both pairs of sides at different times', () => {
    // Between the left and right sides only after it has dropped below the bottom side.
    expect(touches(60, 200, 160, 300)).toBe(false);
    expect(touches(160, 300, 60, 200)).toBe(false);
    // The same slant moved up meets the rectangle.
    expect(touches(60, 160, 160, 260)).toBe(true);
  });

  it('its edge and its corners count, as pointInRect counts them', () => {
    expect(touches(0, 200, 400, 200)).toBe(true);
    expect(touches(0, 230, 400, 230)).toBe(true);
    expect(touches(100, 0, 100, 400)).toBe(true);
    expect(touches(150, 0, 150, 400)).toBe(true);
    expect(touches(50, 215, 100, 215)).toBe(true);
    expect(touches(150, 215, 300, 215)).toBe(true);
    // Through the top right corner alone.
    expect(touches(140, 190, 160, 210)).toBe(true);
    expect(touches(150, 200, 150, 200)).toBe(true);
  });
});
