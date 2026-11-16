import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ART } from './art';
import { IDOL_PARTS, PARTS, WING_OPEN, WING_OPEN_MAX, openedPoint, partKey, partKeys, reach, wingOpen, type IdolKey } from './idolParts';

// The drawing code is not run here.
vi.mock('phaser', () => ({ default: {} }));

const DIR = join(__dirname, '../../public/art');
const IDOLS = Object.keys(IDOL_PARTS) as IdolKey[];

/** A WebP's canvas size, from its extended header. */
function webpSize(file: string): { w: number; h: number } {
  const b = readFileSync(join(DIR, file));
  expect(b.toString('latin1', 12, 16)).toBe('VP8X');
  return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
}

describe('the idols painted in parts (OP-397)', () => {
  for (const idol of IDOLS) {
    const I = IDOL_PARTS[idol];

    it(`${idol}: every part lies in its frame at rest, and moves about a point on it`, () => {
      for (const part of PARTS) {
        const q = I.parts[part];
        expect(q.x, `${part}`).toBeGreaterThanOrEqual(0);
        expect(q.y, `${part}`).toBeGreaterThanOrEqual(0);
        expect(q.x + q.w, `${part}`).toBeLessThanOrEqual(I.w);
        expect(q.y + q.h, `${part}`).toBeLessThanOrEqual(I.h);
        expect(q.pivot.x, `${part}`).toBeGreaterThanOrEqual(q.x);
        expect(q.pivot.x, `${part}`).toBeLessThanOrEqual(q.x + q.w);
        expect(q.pivot.y, `${part}`).toBeGreaterThanOrEqual(q.y);
        expect(q.pivot.y, `${part}`).toBeLessThanOrEqual(q.y + q.h);
      }
      // The head turns about its neck, which sits on the body; the wings hang from the shoulders, either side of the middle.
      const { head, body } = I.parts;
      expect(head.pivot.y).toBeGreaterThanOrEqual(body.y);
      expect(I.parts['wing-left'].pivot.x).toBeLessThan(I.w / 2);
      expect(I.parts['wing-right'].pivot.x).toBeGreaterThan(I.w / 2);
      // Standing on its foot in the middle of the frame.
      expect(Math.abs(I.parts.base.pivot.x - I.w / 2)).toBeLessThan(I.w * 0.05);
    });

    it(`${idol}: each part is published at its size and at twice it, and the art knows it`, () => {
      expect(webpSize(`${idol}.webp`)).toEqual({ w: I.w, h: I.h });
      expect(webpSize(`${idol}@2x.webp`)).toEqual({ w: I.w * 2, h: I.h * 2 });
      for (const part of PARTS) {
        const q = I.parts[part];
        const key = partKey(idol, part);
        expect(ART[key], key).toMatchObject({ w: q.w, h: q.h });
        expect(webpSize(`${key}.webp`), key).toEqual({ w: q.w, h: q.h });
        expect(webpSize(`${key}@2x.webp`), key).toEqual({ w: q.w * 2, h: q.h * 2 });
      }
      expect(partKeys(idol)).toEqual(PARTS.map((p) => `${idol}-${p}`));
    });
  }

  it('the wings open a little with a breath and a beat, wide with a hoot, and never further', () => {
    expect(wingOpen(0, 0, 0)).toBe(0);
    expect(wingOpen(1, 0, 0)).toBeCloseTo(WING_OPEN.breath, 9);
    expect(wingOpen(1, 1, 1)).toBeCloseTo(WING_OPEN_MAX, 9);
    expect(wingOpen(5, 5, 5)).toBeCloseTo(WING_OPEN_MAX, 9);
    expect(wingOpen(-1, -1, -1)).toBe(0);
    expect(WING_OPEN.hoot).toBeGreaterThan(WING_OPEN.beat);
  });

  it('a wing opens outward: the left one’s tip to the left, the right one’s to the right', () => {
    const G = IDOL_PARTS.guardian.parts;
    const left = G['wing-left'];
    const right = G['wing-right'];
    const leftTip = { x: left.x + left.w / 2, y: left.y + left.h };
    const rightTip = { x: right.x + right.w / 2, y: right.y + right.h };
    expect(openedPoint(left, 'wing-left', leftTip, 0.2).x).toBeLessThan(leftTip.x);
    expect(openedPoint(right, 'wing-right', rightTip, 0.2).x).toBeGreaterThan(rightTip.x);
    expect(openedPoint(left, 'wing-left', left.pivot, 0.3)).toEqual(left.pivot);
  });

  it('the guardian, wings open wide, stays within its picture’s margin', () => {
    const G = IDOL_PARTS.guardian;
    const r = reach(G, WING_OPEN_MAX);
    expect(r.x0).toBeGreaterThan(-120);
    expect(r.x1).toBeLessThan(G.w + 120);
    expect(r.y1).toBeLessThan(G.h + 120);
    const rest = reach(G, 0);
    expect(rest.x0).toBeGreaterThanOrEqual(0);
    expect(rest.x1).toBeLessThanOrEqual(G.w);
  });
});
