/**
 * The guardian's picture, cut for a head that turns (OP-359; behind `?guardian=1`).
 *
 * There is one painting of the guardian (art/guardian.png), in one piece. A head that turns needs a
 * head and a body, and eyes that blink need lids. Until an artist paints the guardian in parts, the
 * page makes them from the one painting, by rule:
 *
 * - the body is the painting with the head taken off above the neck line, and the feathers below the
 *   line carried on up under where the head was (mirrored about the line), so a head that has turned a
 *   little never shows a hole or a second head under it;
 * - the head is the painting above the neck line, fading out a little way below it, so it lies over
 *   the body with no edge. At rest the two together are the painting, pixel for pixel;
 * - a lid is the feathers of the brow over each eye, drawn down over it, with a dark line where it ends;
 * - the carving that stands on the rim while the guardian itself is at the heart is the painting in
 *   one tone of wood.
 *
 * No image file is added, and an artist's parts replace all of this with files. Everything here works
 * on plain pixels, so it is unit-tested without a browser; guardianView.ts turns the results into textures.
 */
import type { Rect } from '@owl-park/shared';
import { GUARDIAN_ART, type Lids } from './guardian';

/** A picture as plain pixels: four bytes each (red, green, blue, how solid). */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * The neck line, in the painting's pixels: flat at `side` out at the head's two sides, dipping `dip`
 * under the chin, and past the head's width (`half` either side of the neck's middle) climbing away,
 * so the shoulders and what floats beside them stay the body's.
 */
export const NECK = { half: 185, side: 338, dip: 54, lean: 1.5 } as const;

/** Where the cut is at column `x`: the head is above this y, the body below. */
export function neckLine(x: number): number {
  const off = Math.abs(x - GUARDIAN_ART.neck.x);
  const u = off / NECK.half;
  return u <= 1 ? NECK.side + NECK.dip * (1 - u * u) : NECK.side - (off - NECK.half) * NECK.lean;
}

/** The head lies solid over the body to `solid` px below the line, and has faded out by `gone`. */
export const HEAD_SKIRT = { solid: 6, gone: 26 } as const;
/** The body is carried on up to `solid` px above the line, and has faded out by `gone`: as far as a turned head can uncover. */
export const BODY_RISE = { solid: 22, gone: 36 } as const;

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** How much of the head shows `d` px below the neck line (above it, `d` is under zero). */
export function headShows(d: number): number {
  return 1 - smooth(HEAD_SKIRT.solid, HEAD_SKIRT.gone, d);
}

/**
 * How much of the body shows `d` px below the neck line, at a column `off` px from the neck's middle.
 * Under the head the body is carried on up above the line; out toward the head's two sides it is
 * carried up less and less, and past them not at all: nothing of a shoulder is mirrored up into the air.
 */
export function bodyShows(d: number, off = 0): number {
  if (d >= 0) return 1;
  const k = Math.max(0, Math.min(1, (1 - Math.abs(off) / NECK.half) / 0.25));
  return k <= 0 ? 0 : smooth(-BODY_RISE.gone * k, -BODY_RISE.solid * k, d);
}

/** The part of the painting the head's own picture is cut from: its ear tufts down to where its skirt ends. */
export const HEAD_BOX: Rect = { x: 150, y: 20, w: 460, h: 420 };

/** The body: the painting below the neck line, its feathers mirrored on up under where the head was. The painting's size. */
export function cutBody(src: Pixels): Pixels {
  const out = new Uint8ClampedArray(src.data.length);
  const { width: w, height: h } = src;
  for (let x = 0; x < w; x++) {
    const line = neckLine(x);
    for (let y = 0; y < h; y++) {
      const d = y - line;
      const shows = bodyShows(d, x - GUARDIAN_ART.neck.x);
      if (shows <= 0) continue;
      // Above the line: the pixel as far below it.
      const from = d >= 0 ? y : Math.min(h - 1, Math.round(line - d));
      const i = (y * w + x) * 4;
      const j = (from * w + x) * 4;
      out[i] = src.data[j]!;
      out[i + 1] = src.data[j + 1]!;
      out[i + 2] = src.data[j + 2]!;
      out[i + 3] = Math.round(src.data[j + 3]! * shows);
    }
  }
  return { width: w, height: h, data: out };
}

/** An eye's opening (an ellipse), the row of brow feathers a lid is drawn from, and which side its beak is on (1: to its right). */
export const EYES = [
  { x: 337, y: 258.5, rx: 32, ry: 25, brow: 224, inner: 1 },
  { x: 460, y: 258.5, rx: 25.5, ry: 22.5, brow: 226, inner: -1 },
] as const;

/** How a lid's colour is warmed from the brow's (red, green, blue). */
const LID_WARMTH = [0.97, 0.88, 0.74] as const;

/** The line a lid ends in. */
const LASH = { r: 27, g: 21, b: 36, half: 1.7 } as const;

/** Where a lid ends at column `x`: half shut, a line across the eye leaning down toward the beak; shut, a curve bowed down like a sleeper's. */
export function lidEdge(eye: (typeof EYES)[number], lids: Exclude<Lids, 'open'>, x: number): number {
  const u = (x - eye.x) / eye.rx;
  if (lids === 'half') return eye.y - eye.ry * 0.08 + u * eye.rx * 0.1 * eye.inner;
  return eye.y + eye.ry * (0.16 + 0.32 * (1 - u * u)) + u * eye.rx * 0.05 * eye.inner;
}

/** The head: the painting above the neck line fading out below it, its lids as asked. HEAD_BOX's size. */
export function cutHead(src: Pixels, lids: Lids): Pixels {
  const { x: x0, y: y0, w, h } = HEAD_BOX;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let x = 0; x < w; x++) {
    const sx = x + x0;
    if (sx < 0 || sx >= src.width) continue;
    const line = neckLine(sx);
    for (let y = 0; y < h; y++) {
      const sy = y + y0;
      if (sy < 0 || sy >= src.height) continue;
      const shows = headShows(sy - line);
      if (shows <= 0) continue;
      const i = (y * w + x) * 4;
      const j = (sy * src.width + sx) * 4;
      out[i] = src.data[j]!;
      out[i + 1] = src.data[j + 1]!;
      out[i + 2] = src.data[j + 2]!;
      out[i + 3] = Math.round(src.data[j + 3]! * shows);
    }
  }
  if (lids !== 'open') for (const eye of EYES) drawLid(src, out, eye, lids);
  return { width: w, height: h, data: out };
}

/** The colour of a lid: the brow feathers over the middle of both eyes, evened out, so the two lids are one colour and neither is striped. */
function lidColour(src: Pixels): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const eye of EYES) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let x = Math.round(eye.x - eye.rx * 0.6); x <= Math.round(eye.x + eye.rx * 0.6); x++) {
        const px = Math.max(0, Math.min(src.width - 1, x));
        const py = Math.max(0, Math.min(src.height - 1, eye.brow + dy));
        const j = (py * src.width + px) * 4;
        r += src.data[j]!;
        g += src.data[j + 1]!;
        b += src.data[j + 2]!;
        n++;
      }
    }
  }
  // The brow has the white of the face's mark in it: a lid is the warmer brown of the feathers round the eye.
  return [(r / n) * LID_WARMTH[0], (g / n) * LID_WARMTH[1], (b / n) * LID_WARMTH[2]];
}

/**
 * A lid over one eye of the head's picture: the brow's colour from the top of the eye's opening down
 * to the lid's edge, in shadow under the brow and rounder below it, and the dark line it ends in. Shut,
 * the lower lid closes the rest of the opening, so nothing of the eye shows.
 */
function drawLid(src: Pixels, head: Uint8ClampedArray, eye: (typeof EYES)[number], lids: Exclude<Lids, 'open'>): void {
  const { x: x0, y: y0, w } = HEAD_BOX;
  const lid = lidColour(src);
  for (let sx = Math.floor(eye.x - eye.rx - 2); sx <= Math.ceil(eye.x + eye.rx + 2); sx++) {
    const edge = lidEdge(eye, lids, sx);
    const nx = (sx - eye.x) / eye.rx;
    const top = eye.y - eye.ry * Math.sqrt(Math.max(0, 1 - nx * nx));
    for (let sy = Math.floor(eye.y - eye.ry - 2); sy <= Math.ceil(eye.y + eye.ry + 2); sy++) {
      const r = Math.hypot(nx, (sy - eye.y) / eye.ry);
      // How far inside the eye's opening this pixel is, in pixels, about: the opening's edge is soft.
      const inside = Math.max(0, Math.min(1, (1 - r) * Math.min(eye.rx, eye.ry) + 0.5));
      if (inside <= 0) continue;
      const i = ((sy - y0) * w + (sx - x0)) * 4;
      if (head[i + 3] === 0) continue;
      const over = edge - sy;
      // The upper lid above its edge; shut, the lower lid below it.
      const upper = Math.max(0, Math.min(1, over + 0.5));
      const cover = (lids === 'closed' ? 1 : upper) * inside;
      if (cover > 0) {
        const t = Math.max(0, Math.min(1, (sy - top) / Math.max(1, edge - top)));
        const shade = upper > 0.5 ? 0.8 + 0.2 * smooth(0, 0.4, t) - 0.07 * smooth(0.75, 1, t) : 0.9;
        for (let c = 0; c < 3; c++) head[i + c] = Math.round(head[i + c]! * (1 - cover) + lid[c]! * shade * cover);
      }
      // The line it ends in.
      const line = Math.max(0, Math.min(1, LASH.half + 0.5 - Math.abs(over))) * inside;
      if (line > 0) {
        head[i] = Math.round(head[i]! * (1 - line) + LASH.r * line);
        head[i + 1] = Math.round(head[i + 1]! * (1 - line) + LASH.g * line);
        head[i + 2] = Math.round(head[i + 2]! * (1 - line) + LASH.b * line);
      }
    }
  }
}

/** The wood a carving is cut from: its darkest, its middle and its lightest. */
const WOOD = [
  [46, 30, 18],
  [118, 82, 48],
  [204, 164, 112],
] as const;

/**
 * The painting as a carving: every pixel keeps how light it is and how solid, and takes the wood's
 * colour for that lightness. What glows in the painting does not glow in wood.
 */
export function carved(src: Pixels): Pixels {
  const out = new Uint8ClampedArray(src.data.length);
  for (let i = 0; i < src.data.length; i += 4) {
    const a = src.data[i + 3]!;
    if (a === 0) continue;
    // Its lightness, pulled in from the two ends: wood has no white and no black.
    const light = (0.299 * src.data[i]! + 0.587 * src.data[i + 1]! + 0.114 * src.data[i + 2]!) / 255;
    const t = 0.08 + 0.8 * light;
    const [lo, hi, k] = t < 0.5 ? [WOOD[0], WOOD[1], t * 2] : [WOOD[1], WOOD[2], (t - 0.5) * 2];
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(lo[c]! + (hi[c]! - lo[c]!) * k);
    out[i + 3] = a;
  }
  return { width: src.width, height: src.height, data: out };
}
