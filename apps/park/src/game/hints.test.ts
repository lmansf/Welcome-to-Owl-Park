import { describe, expect, it } from 'vitest';
import { placeHints, type ScreenBox, type ViewRect } from './hints';

// A 1000 x 600 screen showing room pixels 1000-2000 by 0-600 (one CSS pixel per room pixel).
const view: ViewRect = { x: 1000, y: 0, w: 1000, h: 600 };
const screen: ScreenBox = { w: 1000, h: 600, top: 50, bottom: 50, side: 30 };

describe('placeHints', () => {
  it('shows nothing for a target on screen', () => {
    expect(placeHints([{ id: 'door', x: 1500, y: 300 }], view, screen)).toEqual([]);
  });

  it('puts a chip on the right edge, pointing right, for a target off to the right', () => {
    const [p] = placeHints([{ id: 'door', x: 3000, y: 300 }], view, screen);
    expect(p).toMatchObject({ id: 'door', x: 970, y: 300 });
    expect(p!.angle).toBeCloseTo(0);
  });

  it('puts a chip on the left edge, pointing left, for a target off to the left', () => {
    const [p] = placeHints([{ id: 'door', x: 200, y: 300 }], view, screen);
    expect(p!.x).toBe(30);
    expect(Math.abs(p!.angle)).toBeCloseTo(Math.PI);
  });

  it('follows the line toward the target, so a target low and to the right sits low on the right edge', () => {
    const [p] = placeHints([{ id: 'door', x: 2400, y: 580 }], view, screen);
    expect(p!.x).toBe(970);
    expect(p!.y).toBeGreaterThan(300);
    expect(p!.y).toBeLessThanOrEqual(550);
    expect(p!.angle).toBeGreaterThan(0);
  });

  it('meets the top edge for a target far above', () => {
    const tall: ViewRect = { x: 0, y: 900, w: 1000, h: 600 };
    const [p] = placeHints([{ id: 'spot', x: 500, y: 100 }], tall, screen);
    expect(p!.y).toBe(50);
    expect(p!.angle).toBeCloseTo(-Math.PI / 2);
  });

  it('keeps chips on the same edge apart, inside the edge', () => {
    const ps = placeHints(
      [
        { id: 'a', x: 3000, y: 300 },
        { id: 'b', x: 3000, y: 305 },
        { id: 'c', x: 3000, y: 310 },
      ],
      view,
      screen,
      52,
    );
    const ys = ps.map((p) => p.y).sort((a, b) => a - b);
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(52);
    expect(ys[2]! - ys[1]!).toBeGreaterThanOrEqual(52);
    expect(Math.max(...ys)).toBeLessThanOrEqual(550);
  });
});
