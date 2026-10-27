import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SPRITES } from '@owl-park/shared';
import { describe, expect, it } from 'vitest';

const ART = join(__dirname, '../../public/art');

describe('the sprite manifest (OP-127)', () => {
  it('knows every published sprite, and nothing that is not published', () => {
    const files = readdirSync(ART)
      .filter((f) => f.endsWith('.png') && !f.includes('@2x'))
      .map((f) => f.slice(0, -'.png'.length))
      .sort();
    // A sprite published without the manifest rewritten (`pnpm art:finish sprites`) shows here.
    expect(Object.keys(SPRITES).sort()).toEqual(files);
  });
});
