import { describe, expect, it } from 'vitest';
import { AIRBORNE, FLIGHT_STEP_MS, GLIDE_SINK, GLIDING, GROUNDED, ON_GROUND, carryOn, newFlier, stepFlier, type Air } from '@owl-park/shared';
import { AirTrack, FLAP_MS, SHADOW_FULL_Z, shadowFade, wingsFor } from './airTrack';

/** One step into a jump, as the jumping page tells it. */
const up = stepFlier(newFlier(), { pressed: true, held: true }).air;

describe('an owl’s flight as a page draws it (OP-084)', () => {
  it('draws the arc a state carries on to, the same as reckoning it from the start', () => {
    const track = new AirTrack();
    track.tell(up, 1000);
    for (const later of [0, 5, 100, 333, 600]) {
      const drawn = track.at(1000 + later);
      expect(drawn.z, `${later} ms`).toBeCloseTo(carryOn(up, later).z, 6);
    }
    // Down at last, and on the ground from then on.
    expect(track.at(10_000)).toEqual(ON_GROUND);
    expect(track.at(10_500)).toEqual(ON_GROUND);
  });

  it('waits for a state’s time to come, then takes the newer one; one overtaken never shows', () => {
    const track = new AirTrack();
    track.tell(up, 1000);
    const glide: Air = { z: 120, vz: -GLIDE_SINK, s: GLIDING, f: 1 };
    track.tell(glide, 1200);
    // Not yet: the jump goes on.
    expect(track.at(1100).s).toBe(AIRBORNE);
    expect(track.at(1100).z).toBeCloseTo(carryOn(up, 100).z, 6);
    // Its time come: the glide, from where it was told.
    expect(track.at(1300).s).toBe(GLIDING);
    expect(track.at(1300).z).toBeCloseTo(carryOn(glide, 100).z, 6);
    // Told afresh for an earlier time than one still waiting: the waiting one is dropped.
    const later = new AirTrack();
    later.tell(up, 2000);
    later.tell(glide, 1500);
    expect(later.at(2100).s).toBe(GLIDING);
    // Nothing told, or nothing yet: on the ground.
    expect(new AirTrack().at(5)).toEqual(ON_GROUND);
    const soon = new AirTrack();
    soon.tell(up, 3000);
    expect(soon.at(2900)).toEqual(ON_GROUND);
  });

  it('beats the wings for a jump or a flap, spreads them in a glide and tucks them in a fall', () => {
    const track = new AirTrack();
    track.tell(up, 1000);
    track.at(1000);
    expect(track.flapAt).toBe(1000);
    // A cut is no flap.
    track.tell({ z: 40, vz: 180, s: AIRBORNE, f: 1 }, 1100);
    track.at(1100);
    expect(track.flapAt).toBe(1000);
    expect([0, 0.3, 0.55, 0.8].map((t) => wingsFor(up, t * FLAP_MS))).toEqual(['spread', 'tucked', 'spread', 'tucked']);
    expect(wingsFor({ z: 80, vz: -GLIDE_SINK, s: GLIDING, f: 0 }, FLAP_MS * 2)).toBe('spread');
    expect(wingsFor({ z: 80, vz: -400, s: AIRBORNE, f: 0 }, FLAP_MS * 2)).toBe('tucked');
    expect(wingsFor(ON_GROUND, 0)).toBeNull();
    expect(GROUNDED).toBe(ON_GROUND.s);
  });

  it('shrinks and fades the shadow with height, and no further than SHADOW_FULL_Z', () => {
    expect(shadowFade(0)).toBe(0);
    expect(shadowFade(SHADOW_FULL_Z / 2)).toBeCloseTo(0.5);
    expect(shadowFade(SHADOW_FULL_Z * 3)).toBe(1);
    expect(shadowFade(-4)).toBe(0);
    expect(FLIGHT_STEP_MS).toBeGreaterThan(0);
  });
});
