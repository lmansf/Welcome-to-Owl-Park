/**
 * A skin trial (`?skin=<name>`, kept for the tab until `?skin=0`): a realm artist's skin sheet, cut
 * into the kit's slots by tools/kit/skin_sheet.py and published as `trial-<name>-kit-<realm>-<slot>`,
 * drawn in place of those slots, so a sheet can be tried in a course before anyone imports it.
 * Without the flag nothing changes: the trial's files are only asked for by a page that names it.
 *
 * Only the look changes, as with size boxes: each slot keeps its key, size, collision and place, and
 * a stand-in in the slot (`kit-<realm>-<slot>--<piece>`) takes the trial's art as it takes a
 * delivered slot's. One piece the slots don't have is drawn too: the skin sheet's updraft bits
 * (cell C6), cut into square frames, rise in the realm's updrafts in place of the drawn leaf
 * (`kit-<realm>-updraft-bits`).
 *
 * What an owl can stand on has to read at a glance, whatever the sheet: a trial's piece is drawn to
 * the outline of the stand-in it replaces (fitTrialArt), so its drawn top is the walk line the course
 * plays on, and what an owl stands on gets a lit top edge. Behind it, the backdrop sits back under a
 * veil (TRIAL_BACKDROP_VEIL). The course itself (its perches, hazards and collision) is unchanged.
 */
import { KIT_ART, kitSlotBase, type KitArtSpec } from '@owl-park/shared';
import { rasterNames } from './artNames';

const STORE = 'owl-park-skin';
const NAME = /^[a-z0-9]{1,24}$/;

/** The trial this tab draws, or null: `?skin=<name>` turns one on and `?skin=0` off, and either is kept for the tab. */
export function skinTrialWanted(asked: string | null, store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined = globalThis.sessionStorage): string | null {
  const pick = (v: string | null | undefined) => (v && v !== '0' && NAME.test(v) ? v : null);
  try {
    if (asked === '0') store?.removeItem(STORE);
    else if (pick(asked)) store?.setItem(STORE, asked!);
    return asked === '0' ? null : (pick(asked) ?? pick(store?.getItem(STORE)));
  } catch {
    // Storage refused (a private window): the address alone says.
    return pick(asked);
  }
}

/** The key of a realm's updraft bits, from its updraft column's art (`kit-<realm>-updraft`). */
export function updraftBitsKey(updraftArt: string): string {
  return `${kitSlotBase(updraftArt)}-bits`;
}

/**
 * The files a key draws from on trial `skin`: `trial-<skin>-<slot>` when the key is a realm slot (or
 * a stand-in in one, or the updraft bits) and the trial has a file for it; null otherwise.
 */
export function trialFilesOf(key: string, skin: string | null, published: ReadonlyMap<string, string>): string | null {
  if (!skin) return null;
  const base = kitSlotBase(key);
  if (!KIT_ART[key]?.slot && !base.endsWith('-updraft-bits')) return null;
  const files = `trial-${skin}-${base}`;
  return rasterNames(files, 1, published).length > 0 ? files : null;
}

/** The slots an owl stands on: their trial art gets a lit top edge, so safe ground reads as safe. */
export const STANDABLE_SLOTS: ReadonlySet<string> = new Set(['perch-end', 'perch-mid', 'perch-small', 'roost', 'slope']);

/** The veil over a trial's backdrop: dark and flat, so the backdrop sits back behind what an owl plays on. */
export const TRIAL_BACKDROP_VEIL = { colour: 0x14202a, alpha: 0.42 };

/** How far down from its top edge the lit edge reaches (piece px), and how much it lightens. */
export const RIM = { depth: 6, lift: 0.45 };

/** A box in an image's pixels: x0, y0 inclusive; x1, y1 exclusive. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Where an image's art is (alpha over 40), as tools/kit/measure.py measures a piece: its columns and
 * lowest row over the whole image, its top across the middle half of the art's width (so a raised
 * end does not set the walk line). Null for an empty image.
 */
export function artBox(alpha: ArrayLike<number>, w: number, h: number): Box | null {
  const solid = (x: number, y: number) => alpha[y * w + x]! > 40;
  let x0 = w, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (solid(x, y)) { if (x < x0) x0 = x; if (x + 1 > x1) x1 = x + 1; if (y + 1 > y1) y1 = y + 1; }
  if (x1 <= x0) return null;
  const m0 = x0 + Math.floor((x1 - x0) / 4), m1 = x1 - Math.floor((x1 - x0) / 4);
  let y0 = h;
  for (let y = 0; y < h && y0 === h; y++) for (let x = m0; x < m1; x++) if (solid(x, y)) { y0 = y; break; }
  return { x0, y0: Math.min(y0, y1 - 1), x1, y1 };
}

/**
 * Where a trial's art goes in a stand-in's box (both in the texture's pixels, `k` texture px to a
 * piece px): its art box onto the stand-in's measured outline, so the art's top is the stand-in's
 * top, the walk line. Null when the stand-in was not measured (a texture, a backdrop).
 */
export function fitRect(spec: Pick<KitArtSpec, 'w' | 'h' | 'top' | 'foot' | 'left' | 'right'>, k: number): Box | null {
  if (spec.top === undefined || spec.foot === undefined) return null;
  const left = spec.left ?? 0, right = spec.right ?? spec.w;
  if (right <= left || spec.foot <= spec.top) return null;
  return { x0: Math.round(left * k), y0: Math.round(spec.top * k), x1: Math.round(right * k), y1: Math.round(spec.foot * k) };
}

/**
 * The size of a trial piece's redrawn texture: the image's width, and the stand-in's own shape, so the
 * texture keeps the box drawKit stretches it to. A sheet cell is often shorter than the stand-in it
 * replaces (C11 is 240 x 60 where a bough end perch is 240 x 200); drawn at the cell's size, the
 * fitted art would land below the texture and the piece would vanish or show only its tip.
 */
export function fitSize(spec: Pick<KitArtSpec, 'w' | 'h'>, imgWidth: number): { w: number; h: number; k: number } {
  const k = imgWidth / spec.w;
  return { w: imgWidth, h: Math.max(1, Math.round(spec.h * k)), k };
}

/** Whether a stand-in is a run's right end: the trial's one end piece is mirrored there. */
export function isRightEnd(key: string): boolean {
  return /cap-right$/.test(KIT_ART[key]?.standIn ?? key);
}

/**
 * A trial's piece redrawn for the stand-in `key` it replaces: the art fitted to the stand-in's
 * outline (fitRect), mirrored for a run's right end, and lit along its top edge where an owl stands
 * on it. Null when the key needs no fitting (not a measured slot piece) or the image is empty.
 */
export function fitTrialArt(img: CanvasImageSource & { width: number; height: number }, key: string): HTMLCanvasElement | null {
  const spec = KIT_ART[key];
  if (!spec?.slot || spec.kind !== 'piece') return null;
  const size = fitSize(spec, img.width);
  const k = size.k;
  const to = fitRect(spec, k);
  if (!to) return null;
  const src = document.createElement('canvas');
  src.width = img.width;
  src.height = img.height;
  const sg = src.getContext('2d', { willReadFrequently: true });
  if (!sg) return null;
  sg.drawImage(img, 0, 0);
  const data = sg.getImageData(0, 0, src.width, src.height).data;
  const alpha = new Uint8ClampedArray(src.width * src.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!;
  const from = artBox(alpha, src.width, src.height);
  if (!from) return null;
  const out = document.createElement('canvas');
  out.width = size.w;
  out.height = size.h;
  const g = out.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.save();
  if (isRightEnd(key)) {
    g.translate(out.width, 0);
    g.scale(-1, 1);
  }
  const dx = isRightEnd(key) ? out.width - to.x1 : to.x0;
  g.drawImage(src, from.x0, from.y0, from.x1 - from.x0, from.y1 - from.y0, dx, to.y0, to.x1 - to.x0, to.y1 - to.y0);
  g.restore();
  if (STANDABLE_SLOTS.has(spec.slot)) lightTopEdge(g, out.width, out.height, Math.max(2, Math.round(RIM.depth * k)));
  return out;
}

/** Lightens each column's first `depth` opaque pixels: a lit edge that follows the piece's top. */
function lightTopEdge(g: CanvasRenderingContext2D, w: number, h: number, depth: number): void {
  const im = g.getImageData(0, 0, w, h);
  const d = im.data;
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h && d[(y * w + x) * 4 + 3]! <= 40) y++;
    for (let i = 0; i < depth && y + i < h; i++) {
      const p = ((y + i) * w + x) * 4;
      const t = RIM.lift * (1 - i / depth);
      for (let c = 0; c < 3; c++) d[p + c] = d[p + c]! + (255 - d[p + c]!) * t;
    }
  }
  g.putImageData(im, 0, 0);
}

let veiled = false;

/** Whether this page draws a skin trial's backdrop veiled (set by art.ts's useSkinTrial). */
export function trialBackdropVeiled(): boolean {
  return veiled;
}

/** Called by art.ts when a trial is turned on or off for the page. */
export function setTrialBackdropVeil(on: boolean): void {
  veiled = on;
}
