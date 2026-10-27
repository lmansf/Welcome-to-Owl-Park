import { describe, expect, it } from 'vitest';
import { DEFAULT_ANCHORS, artFacing, hueRotateMatrix, measureAnchors, multiplyTint, rotateHue, type Mask } from './pixels';

const px = (...rgba: number[]) => new Uint8ClampedArray(rgba);

describe('multiply tint', () => {
  it('turns white into the colour and grey into a darker shade of it, keeping alpha', () => {
    const px = new Uint8ClampedArray([255, 255, 255, 255, 128, 128, 128, 200, 9, 9, 9, 0]);
    multiplyTint(px, '#4FA3FF');
    expect([...px.slice(0, 4)]).toEqual([0x4f, 0xa3, 0xff, 255]);
    expect([...px.slice(4, 8)]).toEqual([Math.round((128 * 0x4f) / 255), Math.round((128 * 0xa3) / 255), 128, 200]);
    expect([...px.slice(8, 12)]).toEqual([9, 9, 9, 0]); // fully transparent pixels are left alone
  });

  it('ignores anything that is not a #RRGGBB colour', () => {
    const px = new Uint8ClampedArray([200, 100, 50, 255]);
    for (const bad of ['', 'red', '#fff', '4FA3FF', '#4FA3FG']) multiplyTint(px, bad);
    expect([...px]).toEqual([200, 100, 50, 255]);
  });
});

describe('hue rotation', () => {
  it('is the identity at 0 and 360 degrees and leaves alpha alone', () => {
    const a = px(200, 40, 10, 255, 0, 0, 0, 0);
    rotateHue(a, 0);
    expect([...a]).toEqual([200, 40, 10, 255, 0, 0, 0, 0]);
    rotateHue(a, 360);
    expect([...a]).toEqual([200, 40, 10, 255, 0, 0, 0, 0]);
  });

  it('keeps greys grey (the matrix rows sum to one)', () => {
    for (const deg of [36, 90, 180, 288]) {
      const m = hueRotateMatrix(deg);
      for (let r = 0; r < 3; r++) expect(m[r * 3]! + m[r * 3 + 1]! + m[r * 3 + 2]!).toBeCloseTo(1, 6);
      const g = px(120, 120, 120, 255);
      rotateHue(g, deg);
      expect([...g]).toEqual([120, 120, 120, 255]);
    }
  });

  it('turns a strong red toward green and blue as the angle grows', () => {
    const red = () => px(220, 30, 30, 255);
    const a = red();
    rotateHue(a, 120);
    expect(a[1]).toBeGreaterThan(a[0]!); // green dominates
    const b = red();
    rotateHue(b, 240);
    expect(b[2]).toBeGreaterThan(b[0]!); // blue dominates
  });
});

/** A 200 x 240 mask with rectangles and ellipses painted opaque. */
function mask(paint: (set: (x: number, y: number) => void) => void): Mask {
  const alpha = new Uint8ClampedArray(200 * 240);
  paint((x, y) => {
    if (x >= 0 && x < 200 && y >= 0 && y < 240) alpha[y * 200 + x] = 255;
  });
  return { width: 200, height: 240, alpha };
}
const ellipse = (cx: number, cy: number, rx: number, ry: number) => (set: (x: number, y: number) => void) => {
  for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(x, y);
};

describe('owl anchors', () => {
  it('finds the crown, the eye line and the neck of a simple owl, ignoring ear tufts', () => {
    const body = mask((set) => {
      ellipse(100, 160, 60, 75)(set); // body
      ellipse(100, 80, 60, 50)(set); // head: crown at y 30
      for (let y = 5; y < 40; y++) for (let x = 45; x < 55; x++) set(x, y); // left tuft up to y 5
      for (let y = 5; y < 40; y++) for (let x = 145; x < 155; x++) set(x, y); // right tuft
    });
    const face = mask((set) => {
      ellipse(78, 80, 18, 16)(set);
      ellipse(122, 80, 18, 16)(set);
      ellipse(100, 104, 6, 8)(set); // beak below the eyes
    });
    const belly = mask(ellipse(100, 170, 40, 55)); // top at y 115
    const a = measureAnchors(body, face, belly);
    expect(a.eyes.y).toBeGreaterThan(74);
    expect(a.eyes.y).toBeLessThan(86);
    expect(a.eyes.x).toBeCloseTo(100, 0);
    expect(a.eyes.w).toBeGreaterThan(70);
    expect(a.head.y).toBeGreaterThanOrEqual(29); // the crown, not a tuft tip at y 5
    expect(a.head.y).toBeLessThan(40);
    expect(a.neck.y).toBeGreaterThanOrEqual(114);
    expect(a.neck.y).toBeLessThan(122);
    expect(a.neck.w).toBeGreaterThan(20);
    // The face's top and bottom: the tops of the eyes (y 64) and the beak's tip (y 112).
    expect(a.brow).toBe(64);
    expect(a.chin).toBe(113);
  });

  it('puts the neck below the beak when the belly layer also covers the face disc', () => {
    const body = mask(ellipse(100, 130, 70, 105));
    const face = mask((set) => {
      ellipse(80, 95, 15, 15)(set);
      ellipse(120, 95, 15, 15)(set);
      ellipse(100, 125, 7, 13)(set); // beak down to y 138
      for (let x = 70; x < 130; x++) for (let y = 226; y < 236; y++) set(x, y); // gold feet
    });
    const belly = mask((set) => {
      ellipse(100, 92, 48, 30)(set); // the pale face disc, from y 62
      ellipse(100, 180, 50, 50)(set); // the chest
    });
    const a = measureAnchors(body, face, belly);
    expect(a.neck.y).toBeGreaterThanOrEqual(139);
    expect(a.neck.y).toBeLessThan(150);
    // The chin is the beak's tip, not the feet painted on the same layer.
    expect(a.chin).toBe(139);
  });

  it('centres on the eyes of an owl drawn in a three-quarter turn', () => {
    const body = mask(ellipse(80, 120, 65, 100));
    const face = mask((set) => {
      ellipse(55, 70, 14, 14)(set);
      ellipse(95, 70, 16, 16)(set);
    });
    const belly = mask(ellipse(70, 170, 30, 50));
    const a = measureAnchors(body, face, belly);
    expect(a.eyes.x).toBeGreaterThan(70);
    expect(a.eyes.x).toBeLessThan(80);
    expect(a.head.x).toBe(a.eyes.x);
  });

  it('scales measurements from a 2x texture to the 200 x 240 canvas', () => {
    const big = (m: Mask): Mask => {
      const alpha = new Uint8ClampedArray(400 * 480);
      for (let y = 0; y < 480; y++) for (let x = 0; x < 400; x++) alpha[y * 400 + x] = m.alpha[(y >> 1) * 200 + (x >> 1)]!;
      return { width: 400, height: 480, alpha };
    };
    const body = mask(ellipse(100, 120, 70, 100));
    const face = mask((set) => {
      ellipse(80, 80, 15, 15)(set);
      ellipse(120, 80, 15, 15)(set);
    });
    const belly = mask(ellipse(100, 170, 40, 50));
    const one = measureAnchors(body, face, belly);
    const two = measureAnchors(big(body), big(face), big(belly));
    expect(two.eyes.y).toBeCloseTo(one.eyes.y, 0);
    expect(two.head.y).toBeCloseTo(one.head.y, 0);
    expect(two.neck.y).toBeCloseTo(one.neck.y, 0);
    expect(two.brow).toBeCloseTo(one.brow, 0);
    expect(two.chin).toBeCloseTo(one.chin, 0);
  });

  it('falls back to defaults when the face layer is empty', () => {
    const empty = mask(() => undefined);
    expect(measureAnchors(empty, empty, empty)).toEqual(DEFAULT_ANCHORS);
  });
});

describe('artFacing', () => {
  it('reads the way a painted owl is turned from where its eyes sit', () => {
    expect(artFacing({ ...DEFAULT_ANCHORS, eyes: { x: 68, y: 80, w: 82 } })).toBe(-1);
    expect(artFacing({ ...DEFAULT_ANCHORS, eyes: { x: 132, y: 80, w: 82 } })).toBe(1);
  });
  it('counts a front-on owl (or unmeasured art) as facing right', () => {
    expect(artFacing(DEFAULT_ANCHORS)).toBe(1);
    expect(artFacing({ ...DEFAULT_ANCHORS, eyes: { x: 95, y: 80, w: 82 } })).toBe(1);
  });
});
