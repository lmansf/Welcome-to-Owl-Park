import { describe, expect, it } from 'vitest';
import { AIRBORNE, FLIGHT_STEP_MS, GLIDING, GROUNDED, LIFTED, MAX_AIR_Z, airChanged, carryOn, checkAir, isAirShape, newFlier, stepFlier, type Flier } from './flight';
import { UPDRAFT_RISE, UPDRAFT_SLACK_MS, UPDRAFT_WARN_MS, liftAt, liftHolds, updraftEnding, updraftOn, type Updraft } from './updraft';

const steady: Updraft = { id: 'u1', x: 1260, w: 120, top: 580 };
const gust: Updraft = { id: 'u2', x: 2240, w: 120, top: 560, onMs: 3000, offMs: 2000, phase: 0 };
const late: Updraft = { ...gust, id: 'u3', x: 2800, phase: 0.5 };

const HOLD = { pressed: false, held: true };
const NONE = { pressed: false, held: false };
const steps = (ms: number) => Math.round(ms / FLIGHT_STEP_MS);

/** An owl in the air at `z`, falling, its flaps spent or not. */
const falling = (z: number, f: 0 | 1 | 2 = 0): Flier => ({ ...newFlier(), air: { z, vz: -100, s: AIRBORNE, f } });

describe('updrafts (OP-226)', () => {
  it('keeps the same gusts on every page: on, then off, by park time and phase; always on with no timing', () => {
    expect(updraftOn(steady, 0)).toBe(true);
    expect(updraftOn(steady, 123_456)).toBe(true);
    expect(updraftOn(gust, 0)).toBe(true);
    expect(updraftOn(gust, 2999)).toBe(true);
    expect(updraftOn(gust, 3000)).toBe(false);
    expect(updraftOn(gust, 4999)).toBe(false);
    expect(updraftOn(gust, 5000)).toBe(true);
    // Half a cycle on: the second column is off while the first is on, for a part of each cycle.
    expect(updraftOn(gust, 600)).toBe(true);
    expect(updraftOn(late, 600)).toBe(false);
    expect(updraftOn(late, 2600)).toBe(true);
    // The leaves thin out for the last moments of every gust.
    expect(updraftEnding(gust, 3000 - UPDRAFT_WARN_MS - 1)).toBe(false);
    expect(updraftEnding(gust, 3000 - UPDRAFT_WARN_MS)).toBe(true);
    expect(updraftEnding(gust, 3100)).toBe(false);
    expect(updraftEnding(steady, 2900)).toBe(false);
  });

  it('lifts an owl only inside a column that is on, below its top', () => {
    expect(liftAt([steady, gust], 1300, 100, 0)?.id).toBe('u1');
    expect(liftAt([steady, gust], 1200, 100, 0)).toBeUndefined();
    expect(liftAt([steady, gust], 2300, 100, 0)?.id).toBe('u2');
    expect(liftAt([steady, gust], 2300, 100, 3500)).toBeUndefined();
    expect(liftAt([steady], 1300, 700, 0)).toBeUndefined();
  });

  it('carries a gliding owl up at its pace to its top, holds it there, and drops it into a fall the moment Jump is let go', () => {
    let fl = falling(200);
    fl = stepFlier(fl, HOLD, 0, undefined, null);
    expect(fl.air.s).toBe(GLIDING);
    fl = stepFlier(fl, HOLD, 0, undefined, 580);
    expect(fl.air).toMatchObject({ s: LIFTED, vz: UPDRAFT_RISE, h: 580 });
    for (let i = 0; i < steps(3000); i++) fl = stepFlier(fl, HOLD, 0, undefined, 580);
    expect(fl.air.z).toBe(580);
    expect(fl.air.s).toBe(LIFTED);
    // Let go: out of the leaves, falling from the top with the flaps it had.
    fl = stepFlier(fl, NONE, 0, undefined, 580);
    expect(fl.air.s).toBe(AIRBORNE);
    expect(fl.air.h).toBeUndefined();
    expect(fl.air.z).toBeLessThanOrEqual(580);
  });

  it('lifts no owl that is only falling (Jump not held), nor one still rising, and gives back no flaps', () => {
    expect(stepFlier(falling(200), NONE, 0, undefined, 580).air.s).toBe(AIRBORNE);
    const withFlap = stepFlier(stepFlier(falling(200, 1), HOLD, 0, undefined, null), HOLD, 0, undefined, 580);
    expect(withFlap.air).toMatchObject({ s: LIFTED, f: 1 });
    // The column switches off: it falls on, gliding while Jump is held.
    let fl = withFlap;
    for (let i = 0; i < 5; i++) fl = stepFlier(fl, HOLD, 0, undefined, null);
    expect(fl.air.s).toBe(GLIDING);
    expect(fl.air.f).toBe(1);
    // Spends the flap kept for the top (lost feather 4's way).
    const flap = stepFlier(withFlap, { pressed: true, held: true }, 0, undefined, 580);
    expect(flap.air).toMatchObject({ s: AIRBORNE, f: 0 });
  });

  it('is an air state every page carries on, and the room takes only at the pace and up to a top it allows', () => {
    const lifted = { z: 300, vz: UPDRAFT_RISE, s: LIFTED, f: 0, h: 560 } as const;
    expect(isAirShape(lifted)).toBe(true);
    expect(isAirShape({ ...lifted, h: undefined })).toBe(false);
    expect(isAirShape({ z: 300, vz: 0, s: GLIDING, f: 0, h: 560 })).toBe(false);
    expect(carryOn(lifted, 500).z).toBeCloseTo(300 + UPDRAFT_RISE * 0.5, 0);
    expect(carryOn(lifted, 5000).z).toBe(560);
    expect(checkAir(lifted, MAX_AIR_Z, null)).toEqual(lifted);
    expect(checkAir({ ...lifted, vz: 600 }, MAX_AIR_Z, null)).toBeNull();
    expect(checkAir({ ...lifted, z: 600 }, MAX_AIR_Z, null)).toBeNull();
    expect(checkAir({ ...lifted, h: MAX_AIR_Z + 1 }, MAX_AIR_Z, null)).toBeNull();
    expect(airChanged(lifted, { ...lifted, h: 580 })).toBe(true);
    expect(airChanged(lifted, { ...lifted, z: 400 })).toBe(false);
    expect(carryOn({ z: 0, vz: 0, s: GROUNDED, f: 0 }, 100).s).toBe(GROUNDED);
  });

  it('holds a lifted owl to a column with its top that is on, or was a moment ago', () => {
    expect(liftHolds([gust], 2300, 560, 1000)).toBe(true);
    expect(liftHolds([gust], 2300, 580, 1000)).toBe(false);
    expect(liftHolds([gust], 2100, 560, 1000)).toBe(false);
    expect(liftHolds([gust], 2100, 560, 1000, 150)).toBe(true);
    expect(liftHolds([gust], 2300, 560, 3000 + UPDRAFT_SLACK_MS - 1)).toBe(true);
    expect(liftHolds([gust], 2300, 560, 3000 + UPDRAFT_SLACK_MS + 1)).toBe(false);
    expect(liftHolds(undefined, 2300, 560, 1000)).toBe(false);
  });
});
