import { describe, expect, it } from 'vitest';
import { GUARDIAN_ART, HEAD_REACH } from './guardian';
import { BODY_RISE, EYES, HEAD_BOX, HEAD_SKIRT, NECK, bodyShows, carved, cutBody, cutHead, headShows, lidEdge, neckLine, type Pixels } from './guardianArt';

/** A painting-sized picture, every pixel solid and its own colour, so a pixel can be told from every other in its row and column. */
function picture(): Pixels {
  const { w, h } = GUARDIAN_ART;
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
const NECK_X = GUARDIAN_ART.neck.x;

describe('the neck line: where the guardian’s head ends and its body begins (OP-359)', () => {
  it('dips under the chin and is level with the head’s two sides', () => {
    expect(neckLine(NECK_X)).toBe(NECK.side + NECK.dip);
    expect(neckLine(NECK_X - NECK.half)).toBeCloseTo(NECK.side, 6);
    expect(neckLine(NECK_X + NECK.half)).toBeCloseTo(NECK.side, 6);
    expect(neckLine(NECK_X - 60)).toBeCloseTo(neckLine(NECK_X + 60), 6);
    expect(neckLine(NECK_X - 60)).toBeGreaterThan(neckLine(NECK_X - 150));
  });

  it('climbs away past the head’s width, so a shoulder and what floats beside it stay the body’s', () => {
    expect(neckLine(NECK_X - NECK.half - 40)).toBe(NECK.side - 40 * NECK.lean);
    // The left shoulder's top (painting px): well under the line there, so it is the body's.
    expect(350 - neckLine(160)).toBeGreaterThan(HEAD_SKIRT.gone);
  });

  it('is what the head turns about: the neck’s middle is on the head’s side of it, near the line', () => {
    const d = GUARDIAN_ART.neck.y - neckLine(NECK_X);
    expect(d).toBeLessThan(0);
    expect(d).toBeGreaterThan(-40);
  });
});

describe('the cut: a body with the head off it and a head on its own', () => {
  it('leaves no hole at rest: everywhere one of the two is solid', () => {
    for (let d = -80; d <= 80; d += 0.5) expect(Math.max(headShows(d), bodyShows(d)), `${d}`).toBe(1);
    // The head is solid down to a little under the line and gone a little further; the body solid from the line.
    expect(headShows(HEAD_SKIRT.solid)).toBe(1);
    expect(headShows(HEAD_SKIRT.gone)).toBe(0);
    expect(bodyShows(0)).toBe(1);
    expect(bodyShows(-BODY_RISE.solid)).toBe(1);
    expect(bodyShows(-BODY_RISE.gone)).toBe(0);
  });

  it('carries the body up under the head as far as a turned head can uncover, and not at all out past the head’s sides', () => {
    // The side of the head lifts this far when the head rolls as far as it ever does.
    const uncovered = NECK.half * Math.sin(HEAD_REACH.roll + HEAD_REACH.tilt) * 0.5;
    expect(BODY_RISE.solid).toBeGreaterThanOrEqual(uncovered);
    expect(bodyShows(-5, 0)).toBe(1);
    expect(bodyShows(-5, NECK.half)).toBe(0);
    expect(bodyShows(-5, NECK.half + 30)).toBe(0);
    expect(bodyShows(5, NECK.half + 30)).toBe(1);
  });

  it('the body is the painting below the line, its own pixels mirrored on up above it, and nothing where the head was', () => {
    const src = picture();
    const body = cutBody(src);
    expect(body.width).toBe(GUARDIAN_ART.w);
    expect(body.height).toBe(GUARDIAN_ART.h);
    const line = Math.round(neckLine(NECK_X));
    expect(at(body, NECK_X, line + 40)).toEqual(at(src, NECK_X, line + 40));
    expect(at(body, NECK_X, GUARDIAN_ART.foot.y)).toEqual(at(src, NECK_X, GUARDIAN_ART.foot.y));
    // Ten px above the line: the pixel ten below it.
    expect(at(body, NECK_X, line - 10)).toEqual(at(src, NECK_X, line + 10));
    // The face is gone.
    expect(at(body, GUARDIAN_ART.face.x, GUARDIAN_ART.face.y)[3]).toBe(0);
    expect(at(body, NECK_X, line - BODY_RISE.gone - 2)[3]).toBe(0);
  });

  it('the head is the painting above the line, fading out below it, cut to its own box', () => {
    const src = picture();
    const head = cutHead(src, 'open');
    expect(head.width).toBe(HEAD_BOX.w);
    expect(head.height).toBe(HEAD_BOX.h);
    const inHead = (x: number, y: number) => at(head, x - HEAD_BOX.x, y - HEAD_BOX.y);
    expect(inHead(GUARDIAN_ART.face.x, GUARDIAN_ART.face.y)).toEqual(at(src, GUARDIAN_ART.face.x, GUARDIAN_ART.face.y));
    const line = Math.round(neckLine(NECK_X));
    expect(inHead(NECK_X, line)[3]).toBe(255);
    const fading = inHead(NECK_X, line + Math.round((HEAD_SKIRT.solid + HEAD_SKIRT.gone) / 2))[3]!;
    expect(fading).toBeGreaterThan(0);
    expect(fading).toBeLessThan(255);
    expect(inHead(NECK_X, line + HEAD_SKIRT.gone + 1)[3]).toBe(0);
    // Its box holds the whole of it: nothing solid on the box's edge rows below, or to either side at the neck.
    expect(HEAD_BOX.y + HEAD_BOX.h).toBeGreaterThan(neckLine(NECK_X) + HEAD_SKIRT.gone);
    expect(HEAD_BOX.x).toBeLessThan(GUARDIAN_ART.boxes[0].x);
    expect(HEAD_BOX.x + HEAD_BOX.w).toBeGreaterThan(GUARDIAN_ART.boxes[0].x + GUARDIAN_ART.boxes[0].w);
    expect(HEAD_BOX.y).toBeLessThan(GUARDIAN_ART.boxes[0].y);
  });

  it('put back together at rest, head over body, the two are the painting', () => {
    const src = picture();
    const body = cutBody(src);
    const head = cutHead(src, 'open');
    for (const [x, y] of [
      [GUARDIAN_ART.face.x, GUARDIAN_ART.face.y],
      [NECK_X, Math.round(neckLine(NECK_X)) - 3],
      [NECK_X, Math.round(neckLine(NECK_X)) + 3],
      [NECK_X - 120, Math.round(neckLine(NECK_X - 120)) + 12],
      [NECK_X + 90, Math.round(neckLine(NECK_X + 90)) + 20],
      [GUARDIAN_ART.chest.x, GUARDIAN_ART.chest.y],
    ] as const) {
      const h = at(head, x - HEAD_BOX.x, y - HEAD_BOX.y);
      const b = at(body, x, y);
      const a = (h[3] ?? 0) / 255;
      // Head over body, as the page draws them.
      const over = [0, 1, 2].map((c) => Math.round((h[c] ?? 0) * a + b[c]! * (1 - a) * (b[3]! / 255)));
      const solid = a + (1 - a) * (b[3]! / 255);
      expect(solid, `${x},${y}`).toBeCloseTo(1, 6);
      for (let c = 0; c < 3; c++) expect(Math.abs(over[c]! - at(src, x, y)[c]!), `${x},${y}`).toBeLessThanOrEqual(1);
    }
  });
});

describe('its lids', () => {
  it('change nothing but its eyes: every other pixel of the head is as it is with its eyes open', () => {
    const src = picture();
    const open = cutHead(src, 'open');
    for (const lids of ['half', 'closed'] as const) {
      const shut = cutHead(src, lids);
      let changed = 0;
      for (let y = 0; y < open.height; y++) {
        for (let x = 0; x < open.width; x++) {
          const i = (y * open.width + x) * 4;
          if (open.data[i] === shut.data[i] && open.data[i + 1] === shut.data[i + 1] && open.data[i + 2] === shut.data[i + 2] && open.data[i + 3] === shut.data[i + 3]) continue;
          changed++;
          const px = x + HEAD_BOX.x;
          const py = y + HEAD_BOX.y;
          expect(EYES.some((e) => Math.hypot((px - e.x) / (e.rx + 2), (py - e.y) / (e.ry + 2)) <= 1), `${lids} at ${px},${py}`).toBe(true);
        }
      }
      expect(changed).toBeGreaterThan(400);
    }
  });

  it('shut, cover the whole of each eye; half shut, its upper half, leaving the lower open', () => {
    const src = picture();
    const open = cutHead(src, 'open');
    const half = cutHead(src, 'half');
    const closed = cutHead(src, 'closed');
    const px = (p: Pixels, x: number, y: number) => at(p, Math.round(x) - HEAD_BOX.x, Math.round(y) - HEAD_BOX.y);
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
    expect(EYES[0].x).toBeLessThan(GUARDIAN_ART.beak.x);
    expect(EYES[1].x).toBeGreaterThan(GUARDIAN_ART.beak.x);
  });
});

describe('the carving that stands on the rim while the guardian is at the heart', () => {
  it('is the painting in one tone of wood: as solid everywhere, lighter where the painting is lighter, and no colour but the wood’s', () => {
    const src = picture();
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
