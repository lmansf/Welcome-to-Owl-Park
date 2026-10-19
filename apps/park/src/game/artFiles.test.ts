import { describe, expect, it } from 'vitest';
import { PHONE_ROOM_BUDGET, rasterCandidates, roomScaleCap } from './artFiles';

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

describe('roomScaleCap', () => {
  it('keeps the 2x art of a one-screen room (background and overlay) on a dense phone', () => {
    expect(roomScaleCap(2, 2, 1.5, PHONE_ROOM_BUDGET)).toBe(1.5);
  });

  it('drops a wider room to its 1x copies when its 2x tiles would not fit the phone budget', () => {
    expect(roomScaleCap(3, 2, 1.5, PHONE_ROOM_BUDGET)).toBe(1);
    expect(roomScaleCap(6, 3, 2, PHONE_ROOM_BUDGET)).toBe(1);
  });

  it('keeps 2x tiles where the budget is bigger (a desktop)', () => {
    expect(roomScaleCap(6, 2, 1.5, 3 * PHONE_ROOM_BUDGET)).toBe(1.5);
    expect(roomScaleCap(7, 2, 1.5, 3 * PHONE_ROOM_BUDGET)).toBe(1);
  });

  it('changes nothing on a 1x screen, where only the 1x copies load anyway', () => {
    expect(roomScaleCap(6, 1, 1.5, PHONE_ROOM_BUDGET)).toBe(1.5);
  });
});
