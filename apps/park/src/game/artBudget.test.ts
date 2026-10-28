import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { backgroundTiles } from '@owl-park/shared';
import { describe, expect, it } from 'vitest';
import { ROOMS } from '../rooms';

const ART = join(__dirname, '../../public/art');

/**
 * What one piece of art may weigh (OP-129), so the next room or piece does not slow the park.
 *
 * TODO-DOCS (OP-129): docs/ARCHITECTURE.md: this budget, the lazy-load rule (each room loads its own
 * art; only the home screen, the owl and the nest are on the way in), and the art list with its
 * content hashes (vite.config.ts) that lets /art/* be cached a year (public/_headers).
 */
const PNG_MAX_KB = 300;
const WEBP_MAX_KB = 700;

/** Over the PNG budget on purpose, each with why. */
const OVER_BUDGET: Record<string, string> = {
  'hub-fg@2x.png': "the hub's overlay at 2x: 256 colours already, which WebP does not beat, and only computers load it (phones take the 1x)",
};

const kb = (f: string) => statSync(join(ART, f)).size / 1024;

describe('the art budget (OP-129)', () => {
  const files = readdirSync(ART);

  it(`keeps every PNG under ${PNG_MAX_KB} kB, but for the few named with their reasons`, () => {
    expect(files.filter((f) => f.endsWith('.png') && kb(f) > PNG_MAX_KB && !OVER_BUDGET[f])).toEqual([]);
    // A named exception that has shrunk, or gone, comes off the list.
    for (const f of Object.keys(OVER_BUDGET)) expect(kb(f)).toBeGreaterThan(PNG_MAX_KB);
  });

  it(`keeps every WebP under ${WEBP_MAX_KB} kB`, () => {
    expect(files.filter((f) => f.endsWith('.webp') && kb(f) > WEBP_MAX_KB)).toEqual([]);
  });

  it("ships every room's painted screens as WebP, never PNG", () => {
    const keys = [...new Set(Object.values(ROOMS).flatMap((r) => backgroundTiles(r).map((t) => t.key)))];
    expect(keys.filter((k) => files.includes(`${k}.png`) || files.includes(`${k}@2x.png`))).toEqual([]);
  });
});
