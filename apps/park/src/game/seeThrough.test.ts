import { describe, expect, it } from 'vitest';
import { OWL_BODY, SEE_THROUGH, hiddenBehind } from './seeThrough';

/** An idol on the Great Hollow's rim: 300 wide and 520 tall, its foot at y 1600. */
const idol = { x: 4480, y: 1080, w: 300, h: 520 };
const FOOT = 1600;

describe('hiddenBehind: tall art hides the owl that stands behind it (OP-346)', () => {
  it('hides an owl standing north of its foot, inside its picture', () => {
    expect(hiddenBehind({ x: 4640, y: 1480 }, 0, idol, FOOT)).toBe(true);
    expect(hiddenBehind({ x: 4500, y: 1300 }, 0, idol, FOOT)).toBe(true);
  });

  it('does not hide an owl in front of it: that owl is drawn over the art', () => {
    expect(hiddenBehind({ x: 4640, y: 1600 }, 0, idol, FOOT)).toBe(false);
    expect(hiddenBehind({ x: 4640, y: 1660 }, 0, idol, FOOT)).toBe(false);
  });

  it('does not hide an owl beside it, or so far behind that it stands clear over the art', () => {
    expect(hiddenBehind({ x: 4400, y: 1480 }, 0, idol, FOOT)).toBe(false);
    expect(hiddenBehind({ x: 4900, y: 1480 }, 0, idol, FOOT)).toBe(false);
    expect(hiddenBehind({ x: 4640, y: 1060 }, 0, idol, FOOT)).toBe(false);
  });

  it('counts an owl half hidden, and not one that only brushes the art', () => {
    // Half its body across the art's left edge.
    expect(hiddenBehind({ x: idol.x, y: 1480 }, 0, idol, FOOT)).toBe(true);
    expect(hiddenBehind({ x: idol.x - OWL_BODY.w / 2 + 6, y: 1480 }, 0, idol, FOOT)).toBe(false);
  });

  it('follows an owl up into the air: flown up over the top of the art, it shows', () => {
    const feet = { x: 4640, y: 1480 };
    expect(hiddenBehind(feet, 200, idol, FOOT)).toBe(true);
    expect(hiddenBehind(feet, 500, idol, FOOT)).toBe(false);
  });

  it('leaves alone what an owl can be seen over: only art taller than an owl counts', () => {
    expect(SEE_THROUGH.tall).toBeGreaterThan(OWL_BODY.h);
    expect(SEE_THROUGH.alpha).toBeLessThan(0.5);
  });
});
