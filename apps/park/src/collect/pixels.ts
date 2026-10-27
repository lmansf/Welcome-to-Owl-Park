/**
 * Pixel helpers for collectibles, free of DOM and Phaser so they are unit-tested in Node:
 * colourway hue rotation (the same matrix as CSS `hue-rotate()`, done by hand because Safari's
 * canvas has no `filter`), the multiply tint of the white collection icons, and the measurement
 * of where wearables sit on an owl.
 */

/** The 3x3 RGB matrix of a hue rotation by `deg` degrees (luminance-preserving, as in CSS filters). */
export function hueRotateMatrix(deg: number): number[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213,
    0.715 - c * 0.715 - s * 0.715,
    0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143,
    0.715 + c * 0.285 + s * 0.14,
    0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 + s * 0.715,
    0.072 + c * 0.928 + s * 0.072,
  ];
}

/** Rotate the hue of RGBA pixels in place; alpha is untouched, 0 and 360 are the identity. */
export function rotateHue(data: Uint8ClampedArray, deg: number): void {
  const turns = ((deg % 360) + 360) % 360;
  if (turns === 0) return;
  const m = hueRotateMatrix(turns);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    data[i] = m[0]! * r + m[1]! * g + m[2]! * b;
    data[i + 1] = m[3]! * r + m[4]! * g + m[5]! * b;
    data[i + 2] = m[6]! * r + m[7]! * g + m[8]! * b;
  }
}

/**
 * Multiply RGBA pixels by a `#RRGGBB` colour in place: white becomes the colour and grey a darker
 * shade of it, so a white icon painted with grey shading keeps its shading in every tint. Alpha is
 * untouched; anything but a 6-digit hex colour leaves the pixels as they are.
 */
export function multiplyTint(data: Uint8ClampedArray, hex: string): void {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = (data[i]! * r) / 255;
    data[i + 1] = (data[i + 1]! * g) / 255;
    data[i + 2] = (data[i + 2]! * b) / 255;
  }
}

export interface OwlAnchors {
  /** Where a hat's bottom-centre sits: the crown of the head, in owl canvas pixels (200 x 240). */
  head: { x: number; y: number; w: number };
  /** The eye line: centre and span of the eyes (glasses, masks). */
  eyes: { x: number; y: number; w: number };
  /** The top of the chest: scarves, collars, pendants. */
  neck: { x: number; y: number; w: number };
  /** The top of the eyes and the tip of the beak (rows): a hat stays above the one, a collar below the other (OP-127). */
  brow: number;
  chin: number;
}

/** Defaults for the 200 x 240 owl canvas when measuring is impossible (no pixels to read). */
export const DEFAULT_ANCHORS: OwlAnchors = {
  head: { x: 100, y: 34, w: 110 },
  eyes: { x: 100, y: 82, w: 92 },
  neck: { x: 100, y: 128, w: 100 },
  brow: 64,
  chin: 112,
};

/**
 * Which way an owl painting faces. Its three-quarter turn moves the eyes off the canvas centre,
 * toward the side the owl looks at: -1 left, 1 right. A front-on owl counts as facing right.
 */
export function artFacing(a: OwlAnchors, canvasW = 200): 1 | -1 {
  return a.eyes.x < canvasW / 2 - canvasW * 0.04 ? -1 : 1;
}

/** An alpha mask: `alpha[y * width + x]` is 0-255. */
export interface Mask {
  width: number;
  height: number;
  alpha: Uint8ClampedArray | Uint8Array;
}

const OPAQUE = 128;
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
};

/**
 * Measure an owl from its layer masks (all the same size; coordinates are scaled to the
 * 200 x 240 canvas). The eyes are the widest rows of the face layer in the upper half; the
 * crown is the median top of the body's opaque columns across the middle third of the head
 * (a median, so ear tufts do not lift a hat into the air); the neck is the top of the belly; the
 * brow and chin are the face's top and bottom rows (the feet, painted on the face layer too, aside).
 */
export function measureAnchors(body: Mask, face: Mask, belly: Mask): OwlAnchors {
  const sx = 200 / body.width;
  const sy = 240 / body.height;
  const at = (m: Mask, x: number, y: number) => (m.alpha[y * m.width + x] ?? 0) >= OPAQUE;

  // Eyes: rows of the face layer in the upper half with the most opaque pixels.
  const half = Math.floor(face.height / 2);
  const rowCount: number[] = [];
  let maxRow = 0;
  for (let y = 0; y < half; y++) {
    let n = 0;
    for (let x = 0; x < face.width; x++) if (at(face, x, y)) n++;
    rowCount.push(n);
    maxRow = Math.max(maxRow, n);
  }
  if (maxRow === 0) return DEFAULT_ANCHORS;
  let ySum = 0;
  let yN = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let y = 0; y < half; y++) {
    if (rowCount[y]! < maxRow * 0.6) continue;
    ySum += y;
    yN++;
    for (let x = 0; x < face.width; x++) {
      if (!at(face, x, y)) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }
  const eyeY = ySum / yN;
  const eyeX = (minX + maxX) / 2;
  const eyeW = Math.max(1, maxX - minX + 1);

  // Head: the body's opaque span on the eye line, then the median top across its middle third.
  const ey = Math.round(eyeY);
  let l = -1;
  let r = -1;
  for (let x = 0; x < body.width; x++) {
    if (!at(body, x, ey)) continue;
    if (l < 0) l = x;
    r = x;
  }
  if (l < 0) {
    l = Math.round(eyeX - eyeW);
    r = Math.round(eyeX + eyeW);
  }
  const third = (r - l) / 3;
  const tops: number[] = [];
  for (let x = Math.round(l + third); x <= Math.round(r - third); x++) {
    for (let y = 0; y < body.height; y++) {
      if (at(body, x, y)) {
        tops.push(y);
        break;
      }
    }
  }
  const headTop = tops.length ? median(tops) : Math.max(0, eyeY - eyeW * 0.6);

  // Neck: the first belly row with a few opaque pixels below the face (eyes and beak), centred on
  // that row's span. Some owls' belly layer includes a pale face disc, so its top is the forehead;
  // searching below the lowest face pixel above the feet finds the chest instead.
  let faceTop = -1;
  let faceBottom = -1;
  for (let y = 0; y < Math.floor(face.height * 0.8); y++) {
    for (let x = 0; x < face.width; x++) {
      if (at(face, x, y)) {
        if (faceTop < 0) faceTop = y;
        faceBottom = y;
        break;
      }
    }
  }
  let neckY = NaN;
  let nl = -1;
  let nr = -1;
  for (let y = Math.max(0, faceBottom + 2); y < belly.height && Number.isNaN(neckY); y++) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < belly.width; x++) {
      if (!at(belly, x, y)) continue;
      if (first < 0) first = x;
      last = x;
    }
    if (first >= 0 && last - first >= 3) {
      neckY = y;
      nl = first;
      nr = last;
    }
  }
  // Widen to the belly's span a little lower down, where it is fully open.
  if (!Number.isNaN(neckY)) {
    const y2 = Math.min(belly.height - 1, Math.round(neckY + belly.height * 0.04));
    for (let x = 0; x < belly.width; x++) {
      if (!at(belly, x, y2)) continue;
      nl = Math.min(nl, x);
      nr = Math.max(nr, x);
    }
  }

  return {
    head: { x: eyeX * sx, y: headTop * sy, w: (r - l + 1) * sx },
    eyes: { x: eyeX * sx, y: eyeY * sy, w: eyeW * sx },
    neck: Number.isNaN(neckY) ? { x: eyeX * sx, y: Math.min(240, (eyeY + eyeW * 0.75) * sy), w: (r - l + 1) * sx * 0.8 } : { x: ((nl + nr) / 2) * sx, y: neckY * sy, w: (nr - nl + 1) * sx },
    brow: faceTop * sy,
    chin: (faceBottom + 1) * sy,
  };
}
