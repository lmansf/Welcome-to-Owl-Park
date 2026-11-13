import { describe, expect, it } from 'vitest';
import { ROOMS } from '../rooms';
import { RING_RISE, ringPoint } from './bowlView';

describe('the Great Hollow’s floor recedes wherever an owl stands (Nov 8: "It’s still flat")', () => {
  const b = ROOMS['m3-hall']!.bowl!;
  const inside = (p: { x: number; y: number }) => ((p.x - b.cx) / b.rx) ** 2 + ((p.y - b.cy) / b.ry) ** 2 <= 1.0001;

  it('keeps every growth ring on the floor, the outermost on the rim', () => {
    for (const k of [0.1, 0.5, 0.9, 1])
      for (let i = 0; i < 64; i++) expect(inside(ringPoint(b, k, (i / 64) * 2 * Math.PI)), `${k}`).toBe(true);
    expect(ringPoint(b, 1, Math.PI / 2).y).toBeCloseTo(b.cy + b.ry);
  });

  it('bunches the rings up at the back and spreads them at the front, as rings tipped away do', () => {
    const gap = (t: number) => Math.abs(ringPoint(b, 0.6, t).y - ringPoint(b, 0.5, t).y);
    expect(gap(-Math.PI / 2)).toBeLessThan(gap(Math.PI / 2) * 0.7);
    expect(RING_RISE).toBeGreaterThan(0);
  });
});
