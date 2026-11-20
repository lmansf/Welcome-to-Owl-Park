/**
 * The guardian's lids and its carving (OP-359).
 *
 * The guardian is painted in parts (OP-397, idolParts.ts): a head, a body, two wings and its bough,
 * each its own picture, so its head turns and its wings open with nothing cut by rule. What is still
 * made here, from the paintings:
 *
 * - a lid is the feathers of the brow over each eye of the painted head, drawn down over it, with a
 *   dark line where it ends;
 * - the carving that stands on the rim while the guardian itself is at the heart is the whole
 *   painting (art/guardian.webp) in one tone of wood.
 *
 * Everything here works on plain pixels, so it is unit-tested without a browser; guardianView.ts turns
 * the results into textures.
 */
import type { Lids } from './guardian';

/** A picture as plain pixels: four bytes each (red, green, blue, how solid). */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * An eye's opening (an ellipse), the row of brow feathers a lid is drawn from, and which side its beak
 * is on (1: to its right). In the painted head's own pixels at 1x (art/guardian-head.webp, 272 x 281).
 */
export interface Eye {
  x: number;
  y: number;
  rx: number;
  ry: number;
  brow: number;
  inner: 1 | -1;
}
export const EYES: readonly [Eye, Eye] = [
  { x: 101, y: 157, rx: 22.5, ry: 17, brow: 135, inner: 1 },
  { x: 189, y: 157, rx: 20, ry: 16, brow: 136, inner: -1 },
];

/** The painted head's width at 1x, which EYES are measured in. */
export const HEAD_W = 272;

/** How a lid's colour is warmed from the brow's (red, green, blue). */
const LID_WARMTH = [0.97, 0.88, 0.74] as const;

/** The line a lid ends in. */
const LASH = { r: 27, g: 21, b: 36, half: 1.7 } as const;

/** Where a lid ends at column `x`: half shut, a line across the eye leaning down toward the beak; shut, a curve bowed down like a sleeper's. */
export function lidEdge(eye: Eye, lids: Exclude<Lids, 'open'>, x: number): number {
  const u = (x - eye.x) / eye.rx;
  if (lids === 'half') return eye.y - eye.ry * 0.08 + u * eye.rx * 0.1 * eye.inner;
  return eye.y + eye.ry * (0.16 + 0.32 * (1 - u * u)) + u * eye.rx * 0.05 * eye.inner;
}

/** An eye at `k` times its size: the head's picture may be drawn at twice its size (a dense screen's @2x). */
function scaled(eye: Eye, k: number): Eye {
  return { x: eye.x * k, y: eye.y * k, rx: eye.rx * k, ry: eye.ry * k, brow: eye.brow * k, inner: eye.inner };
}

/**
 * The painted head with its lids as asked: a copy, with each eye's lid drawn over it. `head` is the
 * head's picture at any size; the eyes are measured at 1x and scaled to it.
 */
export function lidded(head: Pixels, lids: Lids, base: readonly Eye[] = EYES): Pixels {
  const out = new Uint8ClampedArray(head.data);
  if (lids === 'open') return { width: head.width, height: head.height, data: out };
  const k = head.width / HEAD_W;
  const eyes = base.map((e) => scaled(e, k));
  const lid = lidColour(head, eyes);
  for (const eye of eyes) drawLid(out, head.width, head.height, eye, lids, lid);
  return { width: head.width, height: head.height, data: out };
}

/** The colour of a lid: the brow feathers over the middle of both eyes, evened out, so the two lids are one colour and neither is striped. */
function lidColour(src: Pixels, eyes: readonly Eye[]): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const eye of eyes) {
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
function drawLid(head: Uint8ClampedArray, w: number, h: number, eye: Eye, lids: Exclude<Lids, 'open'>, lid: readonly [number, number, number]): void {
  for (let sx = Math.floor(eye.x - eye.rx - 2); sx <= Math.ceil(eye.x + eye.rx + 2); sx++) {
    const edge = lidEdge(eye, lids, sx);
    const nx = (sx - eye.x) / eye.rx;
    const top = eye.y - eye.ry * Math.sqrt(Math.max(0, 1 - nx * nx));
    for (let sy = Math.floor(eye.y - eye.ry - 2); sy <= Math.ceil(eye.y + eye.ry + 2); sy++) {
      const r = Math.hypot(nx, (sy - eye.y) / eye.ry);
      // How far inside the eye's opening this pixel is, in pixels, about: the opening's edge is soft.
      const inside = Math.max(0, Math.min(1, (1 - r) * Math.min(eye.rx, eye.ry) + 0.5));
      if (inside <= 0) continue;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const i = (sy * w + sx) * 4;
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
