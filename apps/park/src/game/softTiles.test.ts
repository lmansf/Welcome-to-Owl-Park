import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NEST_ROOM, ROOMS } from '../rooms';
import { roomArtCap, softTiles } from './art';
import { PHONE_ROOM_BUDGET } from './artFiles';

// art.ts only works out which files to ask for here; no Phaser runs.
vi.mock('phaser', () => ({ default: {} }));

const phone = { pixelRatio: 2, artScaleMax: 1.5, roomArtBudget: PHONE_ROOM_BUDGET };
const computer = { pixelRatio: 1, artScaleMax: 1.5, roomArtBudget: PHONE_ROOM_BUDGET * 3 };

/** A build that ships `names`, each with a made-up hash. */
const shipping = (...names: string[]) => new Map(names.map((n, i) => [n, `h${i}`]));

describe('softTiles (OP-129)', () => {
  const nest = NEST_ROOM;

  it('on a dense phone, are the paintings a room wants at 2x and ships at 1x and 2x both', () => {
    expect(roomArtCap(nest, phone)).toBeGreaterThan(1.25);
    expect(softTiles(nest, phone, shipping('nest.webp', 'nest@2x.webp'))).toEqual(['nest']);
  });

  it('are none on a screen that wants the 1x copies anyway', () => {
    expect(softTiles(nest, computer, shipping('nest.webp', 'nest@2x.webp'))).toEqual([]);
  });

  it('leave out a painting with no 1x copy to open on, or no 2x copy to sharpen to, or an SVG', () => {
    expect(softTiles(nest, phone, shipping('nest@2x.webp'))).toEqual([]);
    expect(softTiles(nest, phone, shipping('nest.webp'))).toEqual([]);
    expect(softTiles(nest, phone, shipping('nest.svg', 'nest.webp', 'nest@2x.webp'))).toEqual([]);
  });

  it('are none for a room of several screens that keeps to its 1x copies on a phone', () => {
    const hub = ROOMS['hub']!;
    if (roomArtCap(hub, phone) > 1.25) return; // a budget that allows the hub's 2x copies has nothing to show here
    const names = [...new Set(['hub', 'hub-east', 'hub-west'].flatMap((k) => [`${k}.webp`, `${k}@2x.webp`]))];
    expect(softTiles(hub, phone, shipping(...names))).toEqual([]);
  });
});

describe('prefetchRoomArt for a painting that may open soft (OP-129)', () => {
  /** A browser whose cache holds `cached`: the art files asked of the cache (ask) and of the server (get), in order. */
  function browser(cached: string[]) {
    const log: string[] = [];
    const file = (url: string) => decodeURIComponent(url.split('?')[0]!.split('/').pop()!);
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (init?.cache === 'only-if-cached') {
        log.push(`ask ${file(url)}`);
        if (!cached.includes(file(url))) throw new TypeError('not in the cache');
        return { ok: true, body: null };
      }
      log.push(`get ${file(url)}`);
      return { arrayBuffer: async () => new ArrayBuffer(0) };
    });
    return log;
  }
  const scene = { textures: { exists: () => false } } as never;

  // Each test a fresh page: the files fetched ahead are remembered per page.
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('on a first visit fetches the 1x copy, then the 2x copy once the rest has come', async () => {
    const log = browser([]);
    const { prefetchRoomArt } = await import('./art');
    prefetchRoomArt(scene, NEST_ROOM, phone);
    await vi.waitFor(() => expect(log).toContain('get nest@2x.webp'));
    expect(log.indexOf('ask nest@2x.webp')).toBeLessThan(log.indexOf('get nest.webp'));
    expect(log.indexOf('get nest.webp')).toBeLessThan(log.indexOf('get nest@2x.webp'));
  });

  it('leaves the 1x copy alone when the browser has the 2x copy already', async () => {
    const log = browser(['nest@2x.webp']);
    const { prefetchRoomArt } = await import('./art');
    prefetchRoomArt(scene, NEST_ROOM, phone);
    await vi.waitFor(() => expect(log).toContain('get nest@2x.webp'));
    expect(log).not.toContain('get nest.webp');
  });
});
