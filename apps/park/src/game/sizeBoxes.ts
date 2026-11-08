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

/** The lines the size list gives a piece: its name, its size in the game, the size to deliver, whether it has art. */
export function sizeLabel(key: string, spec: Pick<ArtSpec, 'w' | 'h' | 'kind'>, published: ReadonlyMap<string, string>): string[] {
  const d = deliverySize(key, spec);
  const deliver = d.w === spec.w && d.h === spec.h ? 'deliver at this size' : `deliver ${d.w} × ${d.h}`;
  return [boxName(key), `${spec.w} × ${spec.h} in game`, deliver, STATUS_WORDS[artStatus(key, published)]];
}

/**
 * The one small line a box carries in the game (the owner's ask, Nov 7: simpler boxes): its name and the
 * size to make it at. The rest (its size in the game, whether it has art) is in the size list.
 */
export function boxLabel(key: string, spec: Pick<ArtSpec, 'w' | 'h' | 'kind'>): string {
  const d = deliverySize(key, spec);
  return `${boxName(key)}  ${d.w}×${d.h}`;
}

/** How a box is drawn: a screen fills its rectangle; an overlay or a layer over others is see-through. */
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

/**
 * How each role looks: a screen is a plain dark ground; everything over it is a thin outline with the
 * faintest wash, so boxes that overlap stay readable and a tiled texture reads as one surface.
 */
export const BOX_LOOK: Record<BoxRole, { fill: string | null; edge: string; dash: boolean }> = {
  screen: { fill: '#1b2638', edge: '#3a4a66', dash: false },
  overlay: { fill: null, edge: '#ff7ad9', dash: true },
  layer: { fill: null, edge: '#7fd3ff', dash: true },
  piece: { fill: 'rgba(255, 211, 106, 0.10)', edge: '#ffd36a', dash: false },
  texture: { fill: 'rgba(110, 139, 78, 0.35)', edge: 'rgba(165, 212, 106, 0.35)', dash: false },
};

/** Draws a key's size box on a canvas of its logical size: a thin outline, no words (the scene labels one box per piece). */
export function paintSizeBox(ctx: CanvasRenderingContext2D, key: string, spec: Pick<ArtSpec, 'w' | 'h' | 'kind'>): void {
  const { w, h } = spec;
  const look = BOX_LOOK[boxRole(key, spec)];
  ctx.clearRect(0, 0, w, h);
  if (look.fill) {
    ctx.fillStyle = look.fill;
    ctx.fillRect(0, 0, w, h);
  }
  const line = 2;
  ctx.strokeStyle = look.edge;
  ctx.lineWidth = line;
  ctx.setLineDash(look.dash ? [10, 8] : []);
  ctx.strokeRect(line / 2, line / 2, w - line, h - line);
  ctx.setLineDash([]);
}

/** A label's colour: the edge colour of its box, so a label is matched to its outline at a glance. */
export function labelColour(key: string, spec: Pick<ArtSpec, 'kind'>): string {
  const role = boxRole(key, spec);
  return role === 'screen' ? '#c9d6ee' : role === 'texture' ? '#a5d46a' : BOX_LOOK[role].edge;
}
