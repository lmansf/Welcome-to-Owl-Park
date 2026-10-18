import { describe, expect, it } from 'vitest';
import { rasterCandidates } from './artFiles';

describe('rasterCandidates', () => {
  it('tries WebP before PNG at 1x', () => {
    expect(rasterCandidates('/art/', 'hub', 1)).toEqual(['/art/hub.webp', '/art/hub.png']);
    expect(rasterCandidates('/art/', 'hub', 1.25)).toEqual(['/art/hub.webp', '/art/hub.png']);
  });

  it('tries the 2x copies first on dense screens, WebP before PNG in each', () => {
    expect(rasterCandidates('/base/art/', 'owl-body', 2)).toEqual([
      '/base/art/owl-body@2x.webp',
      '/base/art/owl-body@2x.png',
      '/base/art/owl-body.webp',
      '/base/art/owl-body.png',
    ]);
  });
});
