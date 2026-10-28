import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SPRITES } from '@owl-park/shared';
import { describe, expect, it } from 'vitest';

const ART = join(__dirname, '../../public/art');

/** Whether a (lossy) WebP carries alpha, by its extended header's flag: a cut-out such as a piece of furniture, not a painting. */
const cutOut = (file: string): boolean => {
  const b = readFileSync(join(ART, file));
  return b.toString('latin1', 12, 16) === 'VP8X' && (b[20]! & 0x10) !== 0;
};

describe('the sprite manifest (OP-127)', () => {
  it('knows every published sprite, and nothing that is not published', () => {
    const files = readdirSync(ART)
      .filter((f) => !f.includes('@2x') && (f.endsWith('.png') || (f.endsWith('.webp') && cutOut(f))))
      .map((f) => f.replace(/\.(png|webp)$/, ''))
      .sort();
    // A sprite published without the manifest rewritten (`pnpm art:finish sprites`) shows here.
    expect(Object.keys(SPRITES).sort()).toEqual(files);
  });
});
