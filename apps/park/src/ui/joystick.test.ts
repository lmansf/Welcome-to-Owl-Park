import { describe, expect, it } from 'vitest';
import { STICK_WAYS, cameToRest, stickWay } from './joystick';

const R = 64;
const at = (deg: number, len = 40) => [Math.cos((deg * Math.PI) / 180) * len, Math.sin((deg * Math.PI) / 180) * len] as const;

describe('the thumbstick', () => {
  it('rests near the middle and points one of eight ways, like the walking keys', () => {
    expect(stickWay(5, -4, R, null)).toBeNull();
    expect(stickWay(...at(0), R, null)).toBe(0);
    expect(stickWay(...at(90), R, null)).toBe(2); // screen y points down
    expect(stickWay(...at(-135), R, null)).toBe(5);
    expect(stickWay(...at(170), R, null)).toBe(4);
    expect(stickWay(...at(-170), R, null)).toBe(4);
    for (const w of STICK_WAYS) expect(Math.hypot(w.x, w.y)).toBeCloseTo(1, 10);
    expect(STICK_WAYS[1]).toEqual({ x: Math.SQRT1_2, y: Math.SQRT1_2 });
  });

  it('keeps its way a little past the edge, so a thumb on a boundary does not zig-zag', () => {
    expect(stickWay(...at(25), R, null)).toBe(1);
    expect(stickWay(...at(25), R, 0)).toBe(0);
    expect(stickWay(...at(30), R, 0)).toBe(0);
    expect(stickWay(...at(35), R, 0)).toBe(1);
    // Across the left-hand seam of the circle.
    expect(stickWay(...at(-165), R, 4)).toBe(4);
    expect(stickWay(...at(165), R, 4)).toBe(4);
    // Letting go to the middle stops it.
    expect(stickWay(2, 2, R, 3)).toBeNull();
  });

  it('comes to rest when it pointed a way and points none: the thumb lifted or back at the middle', () => {
    expect(cameToRest(3, null)).toBe(true);
    expect(cameToRest(0, null)).toBe(true); // way 0 (right) is a way
    expect(cameToRest(3, 4)).toBe(false);
    expect(cameToRest(null, 4)).toBe(false);
    expect(cameToRest(null, null)).toBe(false);
    // As the stick reads a thumb: pushed up, then back inside the middle.
    const up = stickWay(...at(-90), R, null);
    expect(cameToRest(up, stickWay(2, -3, R, up))).toBe(true);
  });

  it('points only right, down, left or up for a game played by flicks, and holds a way past its edge (OP-137)', () => {
    expect(stickWay(...at(0), R, null, 4)).toBe(0);
    expect(stickWay(...at(30), R, null, 4)).toBe(0);
    expect(stickWay(...at(60), R, null, 4)).toBe(2);
    expect(stickWay(...at(-100), R, null, 4)).toBe(6);
    expect(stickWay(...at(-150), R, null, 4)).toBe(4);
    expect(stickWay(...at(150), R, null, 4)).toBe(4);
    // A flick up that starts a little to the side is still up.
    expect(stickWay(...at(-60), R, null, 4)).toBe(6);
    expect(stickWay(...at(-40), R, 6, 4)).toBe(6);
    expect(stickWay(...at(-30), R, 6, 4)).toBe(0);
    expect(stickWay(3, -3, R, 6, 4)).toBeNull();
  });
});
