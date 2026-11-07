import { readFileSync } from 'node:fs';
import { KIT_ART, KIT_SLOT_SPECS, NEW_MAP, NEW_MAP_COMMONS, NEW_MAP_HALL } from '@owl-park/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART, drawnAsSizeBox, loadArtKey, roomOpeningArt, sharpCopy, useSizeBoxes } from './art';
import { drawnRoom } from './kitView';
import { boxLabel, boxRole, boxable, deliverySize, paintSizeBox, sizeBoxesWanted, sizeLabel } from './sizeBoxes';
import { placeLabels } from './sizeLabels';
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
    const refused = {
      getItem: () => {
        throw new Error('no');
      },
      setItem: () => {
        throw new Error('no');
      },
    };
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

  it("give the size list a piece's name, its size in the game, the size to deliver and whether it has art", () => {
    const published = new Map([
      ['hub.webp', 'a'],
      ['hub@2x.webp', 'b'],
    ]);
    expect(sizeLabel('hub', ART.hub!, published)).toEqual(['hub', '1600 × 900 in game', 'deliver 3200 × 1800', 'has art']);
    expect(sizeLabel('kit-tex-bark', ART['kit-tex-bark']!, new Map())).toEqual([
      'kit-tex-bark',
      '512 × 512 in game',
      'deliver at this size',
      'no art yet',
    ]);
    const standIn = Object.keys(KIT_ART).find((k) => k.includes('--') && KIT_ART[k]!.standIn);
    expect(standIn).toBeDefined();
    const label = sizeLabel(standIn!, ART[standIn!]!, new Map([[`${KIT_ART[standIn!]!.standIn}.png`, 'c']]));
    expect(label[0]).toBe(standIn!.slice(0, standIn!.indexOf('--')));
    expect(label[3]).toBe('stand-in art');
  });

  it('carry one short line in the game: the name and the size to make it at', () => {
    expect(boxLabel('hub', ART.hub!)).toBe('hub  3200×1800');
    expect(boxLabel('kit-tex-bark', ART['kit-tex-bark']!)).toBe('kit-tex-bark  512×512');
    const standIn = Object.keys(KIT_ART).find((k) => k.includes('--') && KIT_ART[k]!.standIn)!;
    expect(boxLabel(standIn, ART[standIn]!).startsWith(`${standIn.slice(0, standIn.indexOf('--'))}  `)).toBe(true);
  });

  it('draw a screen filled and everything over it as a thin outline, with no words on the box', () => {
    expect(boxRole('hub', ART.hub!)).toBe('screen');
    expect(boxRole('hub-fg', ART['hub-fg']!)).toBe('overlay');
    expect(boxRole('tree-l1-0-mid', ART['tree-l1-0-mid']!)).toBe('layer');
    expect(boxRole('kit-tex-bark', ART['kit-tex-bark']!)).toBe('texture');
    expect(boxRole('glass-idol', ART['glass-idol']!)).toBe('piece');
    const calls: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_, p) => () => void calls.push(String(p)),
        set: (_, p, v) => {
          if (p === 'lineWidth') calls.push(`lineWidth=${v}`);
          return true;
        },
      },
    ) as unknown as CanvasRenderingContext2D;
    paintSizeBox(ctx, 'kit-fence-post', ART['kit-fence-post']!);
    expect(calls).not.toContain('fillText');
    expect(calls).not.toContain('strokeText');
    expect(calls).not.toContain('lineTo');
    expect(calls).toContain('lineWidth=2');
  });

  it('label each piece once in a room, on its biggest box, keeping labels apart where a corner is free', () => {
    const boxes = [
      { key: 'shelf', x: 0, y: 0, w: 240, h: 120 },
      { key: 'shelf', x: 500, y: 0, w: 480, h: 240 },
      { key: 'shelf', x: 1000, y: 0, w: 240, h: 120 },
      { key: 'post', x: 500, y: 0, w: 100, h: 240 },
    ];
    const at = placeLabels(boxes, () => ({ w: 90, h: 20 }));
    expect(at.map((p) => p.key).sort()).toEqual(['post', 'shelf']);
    const shelf = at.find((p) => p.key === 'shelf')!;
    expect(shelf.x).toBeGreaterThanOrEqual(500);
    const post = at.find((p) => p.key === 'post')!;
    const apart = Math.abs(shelf.x - post.x) >= 90 || Math.abs(shelf.y - post.y) >= 20;
    expect(apart).toBe(true);
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
