import { describe, expect, it } from 'vitest';
import { GUARDIAN_ART } from './guardian';
import { EYES, HEAD_W, carved, lidded, lidEdge, type Pixels } from './guardianArt';
import { IDOL_PARTS } from './idolParts';

const HEAD = IDOL_PARTS.guardian.parts.head;

/** A picture of the given size, every pixel solid and its own colour, so a pixel can be told from every other in its row and column. */
function picture(w: number, h: number): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = x % 256;
      data[i + 1] = y % 256;
      data[i + 2] = (x * 7 + y * 3) % 256;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

const at = (p: Pixels, x: number, y: number) => Array.from(p.data.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 4));

describe('its lids', () => {
  it('are measured on the painted head, which is the head of the guardian’s frame', () => {
    expect(HEAD.w).toBe(HEAD_W);
    for (const e of EYES) {
      expect(e.x - e.rx).toBeGreaterThan(0);
      expect(e.x + e.rx).toBeLessThan(HEAD.w);
      expect(e.brow).toBeLessThan(e.y - e.ry + 4);
      expect(e.y + e.ry).toBeLessThan(HEAD.h);
    }
    // Where the frame's face is, the head's eyes are about.
    const face = { x: GUARDIAN_ART.face.x - HEAD.x, y: GUARDIAN_ART.face.y - HEAD.y };
    expect(Math.abs((EYES[0].x + EYES[1].x) / 2 - face.x)).toBeLessThan(40);
    expect(Math.abs(EYES[0].y - face.y)).toBeLessThan(50);
  });

  for (const k of [1, 2]) {
    it(`change nothing but its eyes, at ${k}x: every other pixel of the head is as it is with its eyes open`, () => {
      const open = picture(HEAD.w * k, HEAD.h * k);
      expect(Buffer.from(lidded(open, 'open').data).equals(Buffer.from(open.data))).toBe(true);
      for (const lids of ['half', 'closed'] as const) {
        const shut = lidded(open, lids);
        let changed = 0;
        const astray: string[] = [];
        for (let y = 0; y < open.height; y++) {
          for (let x = 0; x < open.width; x++) {
            const i = (y * open.width + x) * 4;
            if (open.data[i] === shut.data[i] && open.data[i + 1] === shut.data[i + 1] && open.data[i + 2] === shut.data[i + 2] && open.data[i + 3] === shut.data[i + 3]) continue;
            changed++;
            const px = x / k;
            const py = y / k;
            if (!EYES.some((e) => Math.hypot((px - e.x) / (e.rx + 2), (py - e.y) / (e.ry + 2)) <= 1)) astray.push(`${lids} at ${px},${py}`);
          }
        }
        expect(astray).toEqual([]);
        expect(changed).toBeGreaterThan(400 * k * k);
      }
    });
  }

  it('shut, cover the whole of each eye; half shut, its upper half, leaving the lower open', () => {
    const open = picture(HEAD.w, HEAD.h);
    const half = lidded(open, 'half');
    const closed = lidded(open, 'closed');
    const px = (p: Pixels, x: number, y: number) => at(p, Math.round(x), Math.round(y));
    for (const e of EYES) {
      const low = [e.x, e.y + e.ry * 0.75] as const;
      const high = [e.x, e.y - e.ry * 0.6] as const;
      expect(px(closed, ...low)).not.toEqual(px(open, ...low));
      expect(px(closed, ...high)).not.toEqual(px(open, ...high));
      expect(px(half, ...high)).not.toEqual(px(open, ...high));
      expect(px(half, ...low)).toEqual(px(open, ...low));
      // A lid is one colour across: the same lid at the same height, either side of the eye's middle, is about the same.
      const l = px(closed, e.x - e.rx * 0.4, e.y - e.ry * 0.3);
      const r = px(closed, e.x + e.rx * 0.4, e.y - e.ry * 0.3);
      for (let c = 0; c < 3; c++) expect(Math.abs(l[c]! - r[c]!)).toBeLessThanOrEqual(24);
    }
  });

  it('end in a line across the eye half shut, and lower, bowed down like a sleeper’s, shut', () => {
    for (const e of EYES) {
      expect(lidEdge(e, 'closed', e.x)).toBeGreaterThan(lidEdge(e, 'half', e.x) + e.ry * 0.3);
      expect(lidEdge(e, 'closed', e.x)).toBeGreaterThan(lidEdge(e, 'closed', e.x - e.rx * 0.8));
      expect(lidEdge(e, 'closed', e.x)).toBeGreaterThan(lidEdge(e, 'closed', e.x + e.rx * 0.8));
      expect(lidEdge(e, 'closed', e.x)).toBeLessThan(e.y + e.ry);
      // Half shut it leans down toward the beak, which is between the eyes.
      const toBeak = e.inner;
      expect(lidEdge(e, 'half', e.x + toBeak * 10)).toBeGreaterThan(lidEdge(e, 'half', e.x - toBeak * 10));
    }
    // The two eyes are either side of the beak.
    const beak = GUARDIAN_ART.beak.x - HEAD.x;
    expect(EYES[0].x).toBeLessThan(beak);
    expect(EYES[1].x).toBeGreaterThan(beak);
  });
});

describe('the carving that stands on the rim while the guardian is at the heart', () => {
  it('is the painting in one tone of wood: as solid everywhere, lighter where the painting is lighter, and no colour but the wood’s', () => {
    const src = picture(GUARDIAN_ART.w, GUARDIAN_ART.h);
    src.data.set([0, 0, 0, 0], 0);
    src.data.set([250, 250, 250, 255], 4);
    src.data.set([10, 10, 10, 255], 8);
    src.data.set([20, 240, 30, 128], 12);
    const wood = carved(src);
    expect(Array.from(wood.data.slice(0, 4))).toEqual([0, 0, 0, 0]);
    const light = Array.from(wood.data.slice(4, 8));
    const dark = Array.from(wood.data.slice(8, 12));
    const green = Array.from(wood.data.slice(12, 16));
    expect(light[3]).toBe(255);
    expect(green[3]).toBe(128);
    for (const p of [light, dark, green]) {
      expect(p[0]!).toBeGreaterThanOrEqual(p[1]!);
      expect(p[1]!).toBeGreaterThanOrEqual(p[2]!);
    }
    expect(light[0]!).toBeGreaterThan(dark[0]! + 100);
    // Wood has no white and no black.
    expect(light[0]!).toBeLessThan(230);
    expect(dark[0]!).toBeGreaterThan(30);
  });
});
