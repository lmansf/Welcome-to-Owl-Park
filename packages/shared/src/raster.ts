/**
 * A small software rasterizer (OP-234): fills rectangles, polygons, ellipses and thick lines into an
 * RGBA buffer, sampling each pixel at its centre, so the same drawing ops give the same pixels wherever
 * they are drawn (a shape moved by whole pixels lands on the same pixels moved). The art kit's
 * placeholders are tested with it (seamless tiling) and the greybox tool (tools/kit/greybox.mjs) draws
 * a kit room's layout with it; the park itself draws with Phaser.
 */

export interface Raster {
  w: number;
  h: number;
  /** RGBA, row by row from the top-left. */
  data: Uint8ClampedArray;
}

/** A canvas of w x h, clear, or filled with `bg` (0xRRGGBB). */
export function raster(w: number, h: number, bg?: number): Raster {
  const r: Raster = { w, h, data: new Uint8ClampedArray(w * h * 4) };
  if (bg !== undefined) fillRect(r, 0, 0, w, h, bg);
  return r;
}

/** Paints one span of row y from pixel xa to xb (exclusive) in `color` at `alpha`, over what is there. */
function span(r: Raster, y: number, xa: number, xb: number, color: number, alpha: number): void {
  if (y < 0 || y >= r.h || alpha <= 0) return;
  const a = Math.min(1, alpha);
  const from = Math.max(0, xa);
  const to = Math.min(r.w, xb);
  const cr = (color >> 16) & 0xff;
  const cg = (color >> 8) & 0xff;
  const cb = color & 0xff;
  const d = r.data;
  for (let x = from; x < to; x++) {
    const i = (y * r.w + x) * 4;
    if (a >= 1) {
      d[i] = cr;
      d[i + 1] = cg;
      d[i + 2] = cb;
      d[i + 3] = 255;
      continue;
    }
    const da = d[i + 3]! / 255;
    const oa = a + da * (1 - a);
    d[i] = (cr * a + d[i]! * da * (1 - a)) / oa;
    d[i + 1] = (cg * a + d[i + 1]! * da * (1 - a)) / oa;
    d[i + 2] = (cb * a + d[i + 2]! * da * (1 - a)) / oa;
    d[i + 3] = oa * 255;
  }
}

/** The first pixel whose centre is at or past x. */
const firstAt = (x: number) => Math.ceil(x - 0.5);

/** Fills the pixels whose centres lie in the rectangle. */
export function fillRect(r: Raster, x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
  const x0 = firstAt(x);
  const x1 = firstAt(x + w);
  for (let py = Math.max(0, firstAt(y)); py < Math.min(r.h, firstAt(y + h)); py++) span(r, py, x0, x1, color, alpha);
}

/** Fills a polygon (flat x, y list), even-odd. */
export function fillPoly(r: Raster, pts: readonly number[], color: number, alpha = 1): void {
  const n = pts.length / 2;
  if (n < 3) return;
  let ymin = Number.POSITIVE_INFINITY;
  let ymax = Number.NEGATIVE_INFINITY;
  for (let i = 1; i < pts.length; i += 2) {
    ymin = Math.min(ymin, pts[i]!);
    ymax = Math.max(ymax, pts[i]!);
  }
  const xs: number[] = [];
  for (let py = Math.max(0, firstAt(ymin)); py < Math.min(r.h, firstAt(ymax)); py++) {
    const yc = py + 0.5;
    xs.length = 0;
    for (let i = 0; i < n; i++) {
      const ax = pts[2 * i]!;
      const ay = pts[2 * i + 1]!;
      const bx = pts[(2 * i + 2) % pts.length]!;
      const by = pts[(2 * i + 3) % pts.length]!;
      if ((ay <= yc && yc < by) || (by <= yc && yc < ay)) xs.push(ax + ((yc - ay) * (bx - ax)) / (by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) span(r, py, firstAt(xs[i]!), firstAt(xs[i + 1]!), color, alpha);
  }
}

/** Fills an ellipse about cx, cy with radii rx, ry. */
export function fillEllipse(r: Raster, cx: number, cy: number, rx: number, ry: number, color: number, alpha = 1): void {
  if (rx <= 0 || ry <= 0) return;
  for (let py = Math.max(0, firstAt(cy - ry)); py < Math.min(r.h, firstAt(cy + ry)); py++) {
    const t = (py + 0.5 - cy) / ry;
    if (t * t >= 1) continue;
    const dx = rx * Math.sqrt(1 - t * t);
    span(r, py, firstAt(cx - dx), firstAt(cx + dx), color, alpha);
  }
}

/** Draws a line `width` thick (a filled quad about it). */
export function strokeLine(r: Raster, x0: number, y0: number, x1: number, y1: number, width: number, color: number, alpha = 1): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len === 0) return;
  const nx = (-(y1 - y0) / len) * (width / 2);
  const ny = ((x1 - x0) / len) * (width / 2);
  fillPoly(r, [x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny], color, alpha);
}

/** Draws `src` onto `dst` with its top-left at x, y (whole pixels), over what is there. */
export function blit(dst: Raster, src: Raster, x: number, y: number): void {
  for (let sy = 0; sy < src.h; sy++) {
    const dy = sy + y;
    if (dy < 0 || dy >= dst.h) continue;
    for (let sx = 0; sx < src.w; sx++) {
      const dx = sx + x;
      if (dx < 0 || dx >= dst.w) continue;
      const i = (sy * src.w + sx) * 4;
      const a = src.data[i + 3]! / 255;
      if (a > 0) span(dst, dy, dx, dx + 1, (src.data[i]! << 16) | (src.data[i + 1]! << 8) | src.data[i + 2]!, a);
    }
  }
}
