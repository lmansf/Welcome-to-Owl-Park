import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ART } from './art';
import { GUARDIAN_TUCK, IDOL_PARTS, PARTS, WING_OPEN, WING_OPEN_MAX, openedPoint, partKey, partKeys, reach, tuckedPose, wingOpen, type IdolKey } from './idolParts';

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

  // Logan, Nov 20, on his phone: "The guardian is cool, but looks really unnatural with the head and wings so
  // disconnected. They should probably overlap the body model a little bit".
  describe('the guardian put together as one owl, its head and wings tucked into its body', () => {
    const G = IDOL_PARTS.guardian.parts;
    /** Measured from the paintings (frame px): the body's left edge and the left wing's inner edge, row by row from the shoulder to the bough. */
    const SIDE: ReadonlyArray<{ y: number; body: number; wing: number }> = [
      { y: 350, body: 241, wing: 227 },
      { y: 410, body: 218, wing: 268 },
      { y: 470, body: 209, wing: 272 },
      { y: 530, body: 211, wing: 263 },
      { y: 590, body: 226, wing: 243 },
      { y: 620, body: 238, wing: 233 },
      { y: 650, body: 259, wing: 221 },
    ];
    /** Measured from the paintings: by column across the neck, the head's lowest feathers and the top of the body under them. */
    const NECK: ReadonlyArray<{ x: number; head: number; body: number }> = [
      { x: 265, head: 282, body: 291 },
      { x: 340, head: 308, body: 311 },
      { x: 355, head: 312, body: 314 },
      { x: 460, head: 288, body: 298 },
    ];
    /** Where a point of the left wing goes, tucked in and opened by `open`. */
    const leftWing = (p: { x: number; y: number }, open: number) => {
      const q = G['wing-left'];
      const pose = tuckedPose('wing-left', q.pivot, open);
      const turned = openedPoint(q, 'wing-left', p, pose.rotation);
      return { x: turned.x + pose.at.x - q.pivot.x, y: turned.y + pose.at.y - q.pivot.y };
    };

    it('laid out as measured, it had the gaps he saw: under the chin and between each wing and the body', () => {
      expect(NECK.some((c) => c.head < c.body)).toBe(true);
      expect(SIDE.some((r) => r.wing < r.body)).toBe(true);
    });

    it('lays each wing over the body’s side from shoulder to bough, at rest and with a full breath', () => {
      // At rest each wing lies well over the body; on the in-breath the low tip lifts but still touches it.
      for (const [open, over] of [[0, 8], [WING_OPEN.breath, 0]] as const)
        for (const r of SIDE) expect(leftWing({ x: r.wing, y: r.y }, open).x, `row ${r.y}, open ${open}`).toBeGreaterThan(r.body + over);
    });

    it('sits the head into the body’s ruff, with no seam under the chin', () => {
      for (const c of NECK) expect(c.head + GUARDIAN_TUCK.head, `column ${c.x}`).toBeGreaterThan(c.body + 4);
      expect(tuckedPose('head', G.head.pivot, 0)).toEqual({ at: { x: G.head.pivot.x, y: G.head.pivot.y + GUARDIAN_TUCK.head }, rotation: 0 });
    });

    it('tucks both wings alike, mirrored, and still opens them outward with a hoot', () => {
      const l = tuckedPose('wing-left', G['wing-left'].pivot, 0);
      const r = tuckedPose('wing-right', G['wing-right'].pivot, 0);
      expect(l.at.x - G['wing-left'].pivot.x).toBe(-(r.at.x - G['wing-right'].pivot.x));
      expect(l.rotation).toBe(-r.rotation);
      // At rest a wing's tip is turned in toward the body (Phaser turns clockwise: the left wing anticlockwise is in).
      expect(l.rotation).toBeLessThan(0);
      expect(tuckedPose('wing-left', G['wing-left'].pivot, WING_OPEN.hoot).rotation).toBeGreaterThan(0);
      // Its body and bough stay where they are.
      for (const part of ['body', 'base'] as const) expect(tuckedPose(part, G[part].pivot, 0.2)).toEqual({ at: G[part].pivot, rotation: 0 });
    });
  });
});
