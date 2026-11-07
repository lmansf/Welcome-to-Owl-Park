import { readFileSync } from 'node:fs';
import { KIT_ART, KIT_SLOT_SPECS, NEW_MAP, NEW_MAP_COMMONS, NEW_MAP_HALL } from '@owl-park/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART, drawnAsSizeBox, loadArtKey, roomOpeningArt, sharpCopy, useSizeBoxes } from './art';
import { drawnRoom } from './kitView';
import { boxRole, boxable, deliverySize, labelAt, paintSizeBox, sizeBoxesWanted, sizeLabel } from './sizeBoxes';
import { roomFor } from '../rooms';

// art.ts only lists the art here; no Phaser runs.
vi.mock('phaser', () => ({ default: {} }));

const ASSETS = JSON.parse(readFileSync(new URL('../../../../tools/art/config/assets.json', import.meta.url), 'utf8')) as {
  keys: Record<string, { w: number; h: number; kind: string; with_2x?: boolean }>;
};

afterEach(() => useSizeBoxes(false));

describe('size boxes (?sizes=1)', () => {
  it('stand in for the map art only: never an owl, the arcade games or the climb', () => {
    expect(boxable('room')).toBe(true);
    expect(boxable('piece')).toBe(true);
    expect(boxable('kit')).toBe(true);
    expect(boxable('texture')).toBe(true);
    expect(boxable('layer')).toBe(true);
    expect(boxable('owl')).toBe(false);
    expect(boxable('arcade')).toBe(false);
    expect(boxable('climb')).toBe(false);
  });

  it('are asked for with ?sizes=1, kept for the tab, and put away with ?sizes=0', () => {
    const kept = new Map<string, string>();
    const store = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) };
    expect(sizeBoxesWanted(null, store)).toBe(false);
    expect(sizeBoxesWanted('1', store)).toBe(true);
    expect(sizeBoxesWanted(null, store)).toBe(true);
    expect(sizeBoxesWanted('0', store)).toBe(false);
    expect(sizeBoxesWanted(null, store)).toBe(false);
    const refused = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
    expect(sizeBoxesWanted('1', refused)).toBe(true);
    expect(sizeBoxesWanted(null, refused)).toBe(false);
  });

  it('give the delivery size the art tools publish: 2x where the asset list ships a 2x copy, 1x where it does not', () => {
    const wrong: string[] = [];
    for (const [key, spec] of Object.entries(ART)) {
      const a = ASSETS.keys[key];
      if (!a || !boxable(spec.kind) || KIT_ART[key]?.slot) continue;
      const d = deliverySize(key, spec);
      const want = a.with_2x ? { w: spec.w * 2, h: spec.h * 2 } : { w: spec.w, h: spec.h };
      if (d.w !== want.w || d.h !== want.h) wrong.push(`${key}: ${d.w}x${d.h}, the asset list ships ${want.w}x${want.h}`);
    }
    expect(wrong).toEqual([]);
  });

  it("give a realm kit slot the kit list's delivery size, stand-ins included", () => {
    const slots = Object.entries(KIT_ART).filter(([, s]) => s.slot);
    expect(slots.length).toBeGreaterThan(0);
    for (const [key, s] of slots) {
      const spec = KIT_SLOT_SPECS[s.slot!];
      expect(deliverySize(key, ART[key]!), key).toEqual({ w: spec.deliverW, h: spec.deliverH });
    }
  });

  it('label a piece with its name, its size in the game, the size to deliver and whether it has art', () => {
    const published = new Map([['hub.webp', 'a'], ['hub@2x.webp', 'b']]);
    expect(sizeLabel('hub', ART.hub!, published)).toEqual(['hub', '1600 × 900 in game', 'deliver 3200 × 1800', 'has art']);
    expect(sizeLabel('kit-tex-bark', ART['kit-tex-bark']!, new Map())).toEqual(['kit-tex-bark', '512 × 512 in game', 'deliver at this size', 'no art yet']);
    const standIn = Object.keys(KIT_ART).find((k) => k.includes('--') && KIT_ART[k]!.standIn);
    expect(standIn).toBeDefined();
    const label = sizeLabel(standIn!, ART[standIn!]!, new Map([[`${KIT_ART[standIn!]!.standIn}.png`, 'c']]));
    expect(label[0]).toBe(standIn!.slice(0, standIn!.indexOf('--')));
    expect(label[3]).toBe('stand-in art');
  });

  it('draw a screen filled, an overlay and a layer see-through, each label on a line of its own', () => {
    expect(boxRole('hub', ART.hub!)).toBe('screen');
    expect(boxRole('hub-fg', ART['hub-fg']!)).toBe('overlay');
    expect(boxRole('tree-l1-0-mid', ART['tree-l1-0-mid']!)).toBe('layer');
    expect(boxRole('kit-tex-bark', ART['kit-tex-bark']!)).toBe('texture');
    expect(boxRole('glass-idol', ART['glass-idol']!)).toBe('piece');
    const spots = ['tree-l4-0-bg', 'tree-l4-0-mid', 'tree-l4-0-back', 'tree-l4-0-front', 'tree-l4-0-fg'].map((k) => labelAt(k, boxRole(k, ART[k]!)));
    expect(new Set(spots).size).toBe(spots.length);
  });

  it('paint the label inside the box, the longest line fitting its width', () => {
    const texts: Array<{ t: string; x: number; y: number }> = [];
    let px = 0;
    const ctx = {
      set font(f: string) {
        px = Number(/(\d+)px/.exec(f)?.[1]);
      },
      measureText: (t: string) => ({ width: t.length * px * 0.6 }),
      fillText: (t: string, x: number, y: number) => void texts.push({ t, x, y }),
      strokeText: () => undefined,
      clearRect: () => undefined,
      fillRect: () => undefined,
      strokeRect: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => undefined,
      setLineDash: () => undefined,
    } as unknown as CanvasRenderingContext2D;
    const spec = ART['kit-fence-post']!; // 80 x 240: narrow
    paintSizeBox(ctx, 'kit-fence-post', spec, new Map());
    expect(texts.map((t) => t.t)).toEqual(sizeLabel('kit-fence-post', spec, new Map()));
    for (const t of texts) {
      expect(t.t.length * px * 0.6).toBeLessThanOrEqual(spec.w * 0.9 + 1);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y + px).toBeLessThanOrEqual(spec.h);
    }
  });

  it('are drawn in place of the art, fetching nothing, and no sharper copy replaces them', async () => {
    const made: Array<{ key: string; w: number; h: number }> = [];
    const ctx = new Proxy({}, { get: (_, p) => (p === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true });
    const scene = {
      textures: {
        exists: () => false,
        createCanvas: (key: string, w: number, h: number) => {
          made.push({ key, w, h });
          return { getContext: () => ctx, refresh: () => undefined };
        },
        addImage: () => {
          throw new Error('art was loaded');
        },
      },
    };
    const fetched = vi.fn();
    vi.stubGlobal('Image', fetched);
    vi.stubGlobal('fetch', fetched);
    try {
      useSizeBoxes(true);
      expect(await loadArtKey(scene as never, 'hub', 1)).toBe(true);
      expect(made).toEqual([{ key: 'hub', w: 1600, h: 900 }]);
      expect(await sharpCopy('hub', 2)).toBeNull();
      expect(fetched).not.toHaveBeenCalled();
      // Owls keep their art.
      expect(drawnAsSizeBox('owl-body')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('cover every piece of map art the new map opens with', () => {
    useSizeBoxes(true);
    const rooms = [...Object.keys(NEW_MAP), ...NEW_MAP_HALL, ...NEW_MAP_COMMONS, 'lobby', 'homes', 'hub'];
    const left: string[] = [];
    for (const id of rooms) {
      const room = roomFor(id);
      expect(room, id).toBeDefined();
      const keys = roomOpeningArt(id, drawnRoom(room!, { kit: true }));
      for (const k of keys) if (!drawnAsSizeBox(k) && ART[k]!.kind !== 'arcade') left.push(`${id}: ${k}`);
    }
    expect(left).toEqual([]);
  });
});
