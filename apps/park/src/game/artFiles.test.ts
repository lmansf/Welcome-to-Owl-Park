import { describe, expect, it } from 'vitest';
import { OWL_LAYERS, PHONE_ROOM_BUDGET, SPECIES_LAYERS, isSpeciesLayer, rasterCandidates, roomScaleCap } from './artFiles';

describe('species layers', () => {
  it('name each species its own five layers, the great horned owl keeping the plain ones', () => {
    expect(SPECIES_LAYERS['great-horned']).toEqual(OWL_LAYERS);
    expect(SPECIES_LAYERS.barn).toEqual(['owl-barn-body', 'owl-barn-belly', 'owl-barn-accent', 'owl-barn-face', 'owl-barn-blink']);
    expect(SPECIES_LAYERS.screech[4]).toBe('owl-screech-blink');
  });

  it('tells a species layer from the great horned owl and everything else', () => {
    expect(isSpeciesLayer('owl-snowy-face')).toBe(true);
    expect(isSpeciesLayer('owl-face')).toBe(false);
    expect(isSpeciesLayer('owl-master')).toBe(false);
    expect(isSpeciesLayer('robot-owl')).toBe(false);
  });
});

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

describe('rasterCandidates with the files the build ships', () => {
  it('asks only for what is there: one request a key, not a miss first', () => {
    const shipped = new Set(['owl-body@2x.png', 'owl-body.png', 'hub.webp', 'nest@2x.webp', 'nest.webp']);
    expect(rasterCandidates('/art/', 'owl-body', 2, shipped)).toEqual(['/art/owl-body@2x.png', '/art/owl-body.png']);
    expect(rasterCandidates('/art/', 'hub', 2, shipped)).toEqual(['/art/hub.webp']);
    expect(rasterCandidates('/art/', 'nest', 1, shipped)).toEqual(['/art/nest.webp']);
    expect(rasterCandidates('/art/', 'missing', 2, shipped)).toEqual([]);
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
