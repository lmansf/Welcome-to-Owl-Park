/**
 * Size boxes (`?sizes=1`): every piece of the map's art drawn as a plain box with its name, the size
 * the game draws it at and the size to deliver it at, in place of its art, so the map can be laid out
 * first and each piece made to fit its box afterwards (the owner's call, Nov 7: design the map, then
 * build the art in as it is needed).
 *
 * Only the look changes. A box is a texture under the art's own key at the art's logical size, so
 * everything that draws, crops, tiles or scales that key works as it does with the art, and nothing
 * the owl walks on, collides with or opens is touched. A real file under the key replaces the box by
 * itself once the page is opened without `?sizes=1` (a file swap, no code change).
 *
 * Owls, the arcade's games and the climb's tower keep their art: they are characters and screens of
 * their own, not pieces of the map.
 */
import { KIT_ART, KIT_SLOT_SPECS, kitFilesOf, kitSlotBase } from '@owl-park/shared';
import type { ArtKind, ArtSpec } from './art';
import { rasterNames } from './artNames';

/** The kinds of art a size box stands in for. */
const BOXED: ReadonlySet<ArtKind> = new Set<ArtKind>(['room', 'piece', 'kit', 'texture', 'layer']);

export function boxable(kind: ArtKind): boolean {
  return BOXED.has(kind);
}

const STORE = 'owl-park-sizes';

/**
 * Whether this tab draws size boxes: `?sizes=1` turns them on and `?sizes=0` off, and either is kept
 * for the tab, so a page that comes back without the address's query (back from checkout, a reload of
 * a room) still shows what the owner asked for.
 */
export function sizeBoxesWanted(asked: string | null, store: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.sessionStorage): boolean {
  try {
    if (asked === '1' || asked === '0') store?.setItem(STORE, asked);
    return (asked ?? store?.getItem(STORE)) === '1';
  } catch {
    // Storage refused (a private window): the address alone says.
    return asked === '1';
  }
}

export interface Size {
  w: number;
  h: number;
}

/** The name a box shows: a realm kit slot drawn by a stand-in (`kit-glass-perch-mid--kit-branch-mid`) is the slot it fills. */
export function boxName(key: string): string {
  return kitSlotBase(key);
}

/**
 * The size to deliver a piece at, in pixels. A realm kit slot's is the kit list's (tools/kit/realm-kit.csv);
 * a texture or backdrop layer ships at the size it is drawn; the tree's painted layers (`tree-*`) ship at
 * 1x; every other painting and piece ships a 2x copy for sharp screens (docs/ART-PIPELINE.md), which is
 * the file to make.
 */
export function deliverySize(key: string, spec: Pick<ArtSpec, 'w' | 'h' | 'kind'>): Size {
  const kit = KIT_ART[key];
  if (kit?.slot) {
    const s = KIT_SLOT_SPECS[kit.slot];
    return { w: s.deliverW, h: s.deliverH };
  }
  const kind = kit?.kind ?? spec.kind;
  const once = kind === 'texture' || kind === 'layer' || (spec.kind === 'room' && key.startsWith('tree-'));
  return once ? { w: spec.w, h: spec.h } : { w: spec.w * 2, h: spec.h * 2 };
}

/** Whether the build ships art for a key: its own, a stand-in's (a realm slot not delivered yet), or none. */
export function artStatus(key: string, published: ReadonlyMap<string, string>): 'art' | 'stand-in' | 'none' {
  const files = kitFilesOf(key);
  const has = published.has(`${files}.svg`) || rasterNames(files, 1, published).length > 0;
  if (!has) return 'none';
  return KIT_ART[key]?.standIn ? 'stand-in' : 'art';
}

const STATUS_WORDS = { art: 'has art', 'stand-in': 'stand-in art', none: 'no art yet' } as const;

/** The lines a box shows, top to bottom: its name, its size in the game, the size to deliver, whether it has art. */
export function sizeLabel(key: string, spec: Pick<ArtSpec, 'w' | 'h' | 'kind'>, published: ReadonlyMap<string, string>): string[] {
  const d = deliverySize(key, spec);
  const deliver = d.w === spec.w && d.h === spec.h ? 'deliver at this size' : `deliver ${d.w} × ${d.h}`;
  return [boxName(key), `${spec.w} × ${spec.h} in game`, deliver, STATUS_WORDS[artStatus(key, published)]];
}

/** How a box is drawn: a screen fills its rectangle; an overlay or a layer over others is see-through, its label kept clear of theirs. */
export type BoxRole = 'screen' | 'overlay' | 'layer' | 'piece' | 'texture';

export function boxRole(key: string, spec: Pick<ArtSpec, 'kind'>): BoxRole {
  const kind = KIT_ART[key]?.kind ?? spec.kind;
  if (kind === 'texture') return 'texture';
  if (/-fg$/.test(key)) return 'overlay';
  if (kind === 'layer' || kind === 'room') {
    if (/-(mid|far|back|play|front)(-[a-z])?$/.test(key)) return 'layer';
    return 'screen';
  }
  return 'piece';
}

/** Where down a box its label stands (a share of its height): layers drawn over one screen each keep their own line. */
export function labelAt(key: string, role: BoxRole): number {
  if (role === 'overlay') return 0.86;
  if (role !== 'layer') return 0.5;
  if (/-far(-[a-z])?$/.test(key)) return 0.22;
  if (/-back$/.test(key)) return 0.34;
  if (/-mid(-[a-z])?$/.test(key)) return 0.66;
  if (/-front$/.test(key)) return 0.78;
  return 0.5;
}

const LOOK: Record<BoxRole, { fill: string | null; edge: string; dash: boolean }> = {
  screen: { fill: '#1d2b44', edge: '#ffd36a', dash: false },
  overlay: { fill: null, edge: '#ff7ad9', dash: true },
  layer: { fill: 'rgba(120, 180, 255, 0.10)', edge: '#7fd3ff', dash: true },
  piece: { fill: 'rgba(201, 162, 39, 0.35)', edge: '#ffd36a', dash: false },
  texture: { fill: 'rgba(110, 139, 78, 0.45)', edge: '#a5d46a', dash: false },
};

/** Draws a key's size box on a canvas of its logical size. */
export function paintSizeBox(ctx: CanvasRenderingContext2D, key: string, spec: Pick<ArtSpec, 'w' | 'h' | 'kind'>, published: ReadonlyMap<string, string>): void {
  const { w, h } = spec;
  const role = boxRole(key, spec);
  const look = LOOK[role];
  ctx.clearRect(0, 0, w, h);
  if (look.fill) {
    ctx.fillStyle = look.fill;
    ctx.fillRect(0, 0, w, h);
  }
  const line = Math.max(2, Math.min(8, Math.round(Math.min(w, h) / 60)));
  // The corners joined, faintly: where the box's middle is.
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = look.edge;
  ctx.lineWidth = Math.max(1, line / 2);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, h);
  ctx.moveTo(w, 0);
  ctx.lineTo(0, h);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = line;
  ctx.setLineDash(look.dash ? [line * 4, line * 3] : []);
  ctx.strokeRect(line / 2, line / 2, w - line, h - line);
  ctx.setLineDash([]);
  // The label, as large as fits a fifth of the box's height and nine tenths of its width.
  const lines = sizeLabel(key, spec, published);
  let size = Math.max(6, Math.min(44, Math.floor(h / (lines.length * 1.35 + 1))));
  const font = (px: number) => `bold ${px}px system-ui, sans-serif`;
  ctx.font = font(size);
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  if (widest > w * 0.9) {
    size = Math.max(6, Math.floor((size * w * 0.9) / widest));
    ctx.font = font(size);
  }
  const step = size * 1.25;
  const middle = h * labelAt(key, role);
  const top = Math.min(h - step * lines.length, Math.max(0, middle - (step * lines.length) / 2));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size / 5);
  ctx.strokeStyle = '#07122a';
  lines.forEach((l, i) => {
    ctx.fillStyle = i === 0 ? look.edge : '#ffffff';
    ctx.strokeText(l, w / 2, top + i * step);
    ctx.fillText(l, w / 2, top + i * step);
  });
}
