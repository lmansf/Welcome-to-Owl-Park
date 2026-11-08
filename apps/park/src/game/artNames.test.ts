import { describe, expect, it, vi } from 'vitest';
import { GLOBAL_ART, artScale } from './art';
import { BOOT_ART, DENSE_FROM_RATIO, DENSE_SCALE, earlyArtScript, owlArtScale, rasterCandidates } from './artNames';

// art.ts only lists the art here; no Phaser runs.
vi.mock('phaser', () => ({ default: {} }));

const RATIOS = [0.5, 1, 1.1, 1.2, 1.25, 1.3, 1.37, 1.374, 1.375, 1.4, 1.5, 1.75, 2, 2.625, 3];

/** Run the page's early script on a screen of this pixel ratio; the addresses it asked for, and what it kept. */
function runEarly(script: string, devicePixelRatio: number, fetch: unknown = (url: string) => Promise.resolve({ url })) {
  const asked: string[] = [];
  const win: { devicePixelRatio: number; __owlParkArt?: Record<string, Promise<unknown>> } = { devicePixelRatio };
  const recorded = typeof fetch === 'function' ? (url: string, init: unknown) => (asked.push(url), (fetch as (u: string, i: unknown) => Promise<unknown>)(url, init)) : fetch;
  new Function('window', 'fetch', script)(win, recorded);
  return { asked, kept: win.__owlParkArt ?? {} };
}

describe('the boot art', () => {
  it('is the art the boot loads (GLOBAL_ART)', () => {
    expect([...BOOT_ART].sort()).toEqual([...GLOBAL_ART].sort());
  });

  it('loads at the scale owlArtScale says, on every screen', () => {
    for (const dpr of RATIOS) expect(owlArtScale(dpr)).toBe(artScale('owl', Math.min(2, Math.max(1, dpr)), 1.5));
  });

  it('is the 2x copy from DENSE_FROM_RATIO up, and the 1x copy below it', () => {
    for (const dpr of RATIOS) expect(owlArtScale(dpr) > DENSE_SCALE).toBe(dpr >= DENSE_FROM_RATIO);
  });
});

describe('earlyArtScript', () => {
  // Every boot key ships at 1x and 2x but the face, only at 1x here, and the blink, as SVG.
  const shipped = new Map<string, string>();
  BOOT_ART.forEach((key, i) => {
    shipped.set(`${key}.png`, `a${i}`);
    if (key !== 'owl-face') shipped.set(`${key}@2x.png`, `b${i}`);
  });
  shipped.set('owl-blink.svg', 'c0');
  const script = earlyArtScript('/base/art/', shipped);
  /** What the art loader asks for first for each boot key on this screen. */
  const loaderFirst = (dpr: number) => BOOT_ART.filter((k) => k !== 'owl-blink').map((k) => rasterCandidates('/base/art/', k, owlArtScale(dpr), shipped)[0]);

  it('asks for exactly the files the art loader will ask for first, on every screen, the SVG left to the loader', () => {
    for (const dpr of RATIOS) expect(runEarly(script, dpr).asked).toEqual(loaderFirst(dpr));
    expect(runEarly(script, 2).asked).toContain('/base/art/owl-body%402x.png?v=b0');
    expect(runEarly(script, 2).asked).toContain('/base/art/owl-face.png?v=a3');
    expect(runEarly(script, 1).asked).toContain('/base/art/owl-body.png?v=a0');
    expect(runEarly(script, 1).asked.some((u) => u.includes('owl-blink'))).toBe(false);
  });

  it('keeps each answer by its address for the loader, a failed download as nothing', async () => {
    const { asked, kept } = runEarly(script, 2, (url: string) => (url.includes('owl-body') ? Promise.reject(new Error('offline')) : Promise.resolve({ url })));
    expect(Object.keys(kept)).toEqual(asked);
    expect(await kept['/base/art/owl-body%402x.png?v=b0']).toBeNull();
    expect(await kept['/base/art/owl-belly%402x.png?v=b1']).toEqual({ url: '/base/art/owl-belly%402x.png?v=b1' });
  });

  it('asks for nothing in a browser without fetch, and leaves the loader nothing to take', () => {
    expect(runEarly(script, 2, null)).toEqual({ asked: [], kept: {} });
  });
});
