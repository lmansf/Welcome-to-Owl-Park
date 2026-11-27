import { describe, expect, it } from 'vitest';
import { clearOfOwl, type Box } from './tipPlace';

// OP-512: a tip held at the screen's top band could land right over the visitor's own owl.
const owl: Box = { left: 970, right: 1030, top: 600, bottom: 700 };
const over = (x: number, y: number, w: number, h: number, o: Box) => x + w / 2 > o.left && x - w / 2 < o.right && y > o.top && y - h < o.bottom;

describe('clearOfOwl (OP-512)', () => {
  it('leaves a tip that does not touch the owl where it was placed', () => {
    expect(clearOfOwl(1000, 400, 500, 60, owl, 100, 1000, 10)).toBe(400);
    expect(clearOfOwl(400, 650, 300, 60, owl, 100, 1000, 10)).toBe(650);
    expect(clearOfOwl(1000, 650, 500, 60, null, 100, 1000, 10)).toBe(650);
  });

  it('lifts a tip that covers the owl to just over its head', () => {
    const y = clearOfOwl(1000, 680, 500, 60, owl, 100, 1000, 10);
    expect(y).toBe(590);
    expect(over(1000, y, 500, 60, owl)).toBe(false);
  });

  it('puts it under the owl feet when there is no room over its head', () => {
    const y = clearOfOwl(1000, 650, 500, 60, owl, 560, 1000, 10);
    expect(y).toBe(770);
    expect(over(1000, y, 500, 60, owl)).toBe(false);
  });

  it('keeps it as placed when the screen has room neither over nor under the owl', () => {
    expect(clearOfOwl(1000, 650, 500, 60, owl, 560, 740, 10)).toBe(650);
  });

  it('counts a tip whose edge only touches the owl as clear', () => {
    expect(clearOfOwl(1000, 600, 500, 60, owl, 100, 1000, 10)).toBe(600);
    expect(clearOfOwl(1000 + 250 + 30, 650, 500, 60, owl, 100, 1000, 10)).toBe(650);
  });
});
