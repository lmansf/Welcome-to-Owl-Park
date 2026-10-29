import { describe, expect, it } from 'vitest';
import { AIRBORNE, FLIGHT_STEP_MS, GLIDE_SINK, GLIDING, GROUNDED, ON_GROUND, carryOn, newFlier, stepFlier, type Air } from '@owl-park/shared';
import { AirTrack, FLAP_BEATS, FLAP_MS, SHADOW_FULL_Z, WING_TURN, shadowFade, wingTurn } from './airTrack';

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

  it('keeps an owl told it landed on a perch standing up there, until it is told it left (OP-084)', () => {
    const track = new AirTrack();
    track.tell(up, 1000);
    const onPerch: Air = { z: 80, vz: 0, s: GROUNDED, f: 0 };
    track.tell(onPerch, 1300);
    expect(track.at(1400)).toEqual(onPerch);
    expect(track.at(60_000)).toEqual(onPerch);
    // Off its edge: down from there to the floor, and done.
    track.tell({ z: 80, vz: 0, s: AIRBORNE, f: 1 }, 61_000);
    expect(track.at(61_100).z).toBeLessThan(80);
    expect(track.at(70_000)).toEqual(ON_GROUND);
    expect(track.at(70_100)).toEqual(ON_GROUND);
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

  it('keeps each flight as it is carried on, step by step: its top however seldom it is drawn, whether it glided, how long it was up', () => {
    // Drawn every frame, or only three times in the whole flight: the same record.
    const often = new AirTrack();
    const seldom = new AirTrack();
    often.tell(up, 1000);
    seldom.tell(up, 1000);
    for (let now = 1000; now <= 4000; now += 16) often.at(now);
    for (const now of [1000, 1400, 4000]) seldom.at(now);
    expect(seldom.flown).toEqual(often.flown);
    // The top is the highest step of the arc, which no frame need land on.
    let top = 0;
    for (let ms = 0; ms <= 3000; ms += FLIGHT_STEP_MS) top = Math.max(top, carryOn(up, ms).z);
    expect(often.flown.n).toBe(1);
    expect(often.flown.peak).toBeCloseTo(top, 6);
    expect(often.flown.glided).toBe(false);
    expect(often.flown.ms).toBeGreaterThan(0);
    // A glide told on the way up is the same flight, and it glided; the next jump is another flight.
    const track = new AirTrack();
    track.tell(up, 1000);
    track.tell({ z: 120, vz: -GLIDE_SINK, s: GLIDING, f: 1 }, 1200);
    track.at(1100);
    track.at(20_000);
    expect(track.flown).toMatchObject({ n: 1, glided: true });
    expect(track.at(20_000)).toEqual(ON_GROUND);
    track.tell(up, 30_000);
    track.at(30_050);
    expect(track.flown).toMatchObject({ n: 2, glided: false, ms: 0 });
  });

  it('beats the wings for a jump or a flap, spreads them in a glide, raises them a little in a fall, and folds them away on the ground', () => {
    const track = new AirTrack();
    track.tell(up, 1000);
    track.at(1000);
    expect(track.flapAt).toBe(1000);
    // A cut is no flap.
    track.tell({ z: 40, vz: 180, s: AIRBORNE, f: 1 }, 1100);
    track.at(1100);
    expect(track.flapAt).toBe(1000);
    // A beat starts with the wings up, sweeps them down (the power stroke) and back, FLAP_BEATS times.
    const beat = FLAP_MS / FLAP_BEATS;
    expect(wingTurn(up, 0)).toEqual({ turn: WING_TURN.up, beating: true });
    expect(wingTurn(up, beat / 2)!.turn).toBeCloseTo(WING_TURN.down);
    expect(wingTurn(up, beat)!.turn).toBeCloseTo(WING_TURN.up);
    expect(wingTurn(up, beat * 1.5)!.turn).toBeCloseTo(WING_TURN.down);
    // Then they hold: spread in a glide, raised a little in a fall.
    expect(wingTurn({ z: 80, vz: -GLIDE_SINK, s: GLIDING, f: 0 }, FLAP_MS * 2)).toEqual({ turn: WING_TURN.glide, beating: false });
    expect(wingTurn({ z: 80, vz: -400, s: AIRBORNE, f: 0 }, FLAP_MS * 2)).toEqual({ turn: WING_TURN.fall, beating: false });
    expect(wingTurn(ON_GROUND, 0)).toBeNull();
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
