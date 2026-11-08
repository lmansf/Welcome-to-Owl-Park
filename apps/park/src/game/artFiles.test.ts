import { describe, expect, it } from 'vitest';
import { FLIGHT_LAYERS, OWL_LAYERS, PHONE_ROOM_BUDGET, SPECIES_FLIGHT_LAYERS, SPECIES_LAYERS, isFlightLayer, isSpeciesLayer, rasterCandidates, roomScaleCap } from './artFiles';

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

describe('flight layers (OP-136)', () => {
  it('name each kind its flight body, belly and accent, the great horned owl keeping the plain ones', () => {
    expect(SPECIES_FLIGHT_LAYERS['great-horned']).toEqual(FLIGHT_LAYERS);
    expect(FLIGHT_LAYERS).toEqual(['owl-flight-body', 'owl-flight-belly', 'owl-flight-accent']);
    expect(SPECIES_FLIGHT_LAYERS.barn).toEqual(['owl-barn-flight-body', 'owl-barn-flight-belly', 'owl-barn-flight-accent']);
  });

  it('tells a flight layer from the ground layers and the wing', () => {
    expect(isFlightLayer('owl-flight-body')).toBe(true);
    expect(isFlightLayer('owl-snowy-flight-accent')).toBe(true);
    expect(isFlightLayer('owl-body')).toBe(false);
    expect(isFlightLayer('owl-wing-body')).toBe(false);
    expect(isSpeciesLayer('owl-barn-flight-body')).toBe(false);
  });
});

describe('rasterCandidates', () => {
  it('tries WebP before PNG at 1x', () => {
    expect(rasterCandidates('/art/', 'hub', 1)).toEqual(['/art/hub.webp', '/art/hub.png']);
    expect(rasterCandidates('/art/', 'hub', 1.25)).toEqual(['/art/hub.webp', '/art/hub.png']);
  });

  it('tries the 2x copies first on dense screens, WebP before PNG in each, the @ sent encoded (no redirect)', () => {
    expect(rasterCandidates('/base/art/', 'owl-body', 2)).toEqual([
      '/base/art/owl-body%402x.webp',
      '/base/art/owl-body%402x.png',
      '/base/art/owl-body.webp',
      '/base/art/owl-body.png',
    ]);
  });
});

describe('rasterCandidates with the files the build ships', () => {
  it('asks only for what is there, with its hash: one request a key, not a miss first', () => {
    const shipped = new Map([
      ['owl-body@2x.png', 'a1'],
      ['owl-body.png', 'b2'],
      ['hub.webp', 'c3'],
      ['nest@2x.webp', 'd4'],
      ['nest.webp', 'e5'],
    ]);
    expect(rasterCandidates('/art/', 'owl-body', 2, shipped)).toEqual(['/art/owl-body%402x.png?v=a1', '/art/owl-body.png?v=b2']);
    expect(rasterCandidates('/art/', 'hub', 2, shipped)).toEqual(['/art/hub.webp?v=c3']);
    expect(rasterCandidates('/art/', 'nest', 1, shipped)).toEqual(['/art/nest.webp?v=e5']);
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
