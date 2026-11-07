import { describe, expect, it } from 'vitest';
import { AIRBORNE, ALL_FLIGHT, GLIDING, LIFTED, checkAir, newFlier, stepFlier, type Flier } from './flight';
import { liftHolds } from './updraft';
import { WIND_CATCH_ABOVE, WIND_CATCH_BELOW, liftColumns, windAt, windEnd, windProblems, type WindCurrent } from './wind';

const east: WindCurrent = { id: 'gap', x0: 1000, x1: 1800, z: 400, dir: 1 };
const west: WindCurrent = { id: 'back', x0: 2400, x1: 3000, z: 300, dir: -1 };
const HOLD = { pressed: false, held: true };
const NONE = { pressed: false, held: false };
const can = ALL_FLIGHT;
const gliding = (z: number): Flier => ({ ...newFlier(), air: { z, vz: -60, s: GLIDING, f: 1 } });

describe('wind currents (OP-275)', () => {
  it('catches a glide inside its ends, near its height, and nothing else', () => {
    expect(windAt([east, west], 1200, 400)).toBe(east);
    expect(windAt([east, west], 1200, 400 - WIND_CATCH_BELOW)).toBe(east);
    expect(windAt([east, west], 1200, 400 + WIND_CATCH_ABOVE)).toBe(east);
    expect(windAt([east, west], 1200, 400 - WIND_CATCH_BELOW - 1)).toBeUndefined();
    expect(windAt([east, west], 1200, 400 + WIND_CATCH_ABOVE + 1)).toBeUndefined();
    expect(windAt([east, west], 999, 400)).toBeUndefined();
    expect(windAt([east, west], 2600, 300)).toBe(west);
    expect(windAt(undefined, 1200, 400)).toBeUndefined();
  });

  it('carries an owl to its downwind end', () => {
    expect(windEnd(east)).toBe(1800);
    expect(windEnd(west)).toBe(2400);
  });

  it('holds a gliding owl at its height as an updraft holds one at its top, and drops it when Jump is let go', () => {
    let fl = stepFlier(gliding(370), HOLD, 0, can, east.z);
    expect(fl.air.s).toBe(LIFTED);
    expect(fl.air.h).toBe(400);
    for (let i = 0; i < 20; i++) fl = stepFlier(fl, HOLD, 0, can, east.z);
    expect(fl.air.z).toBe(400);
    // The room takes that state: a lifted owl at the current's height, inside it.
    expect(checkAir(fl.air, 1000)).not.toBeNull();
    expect(liftHolds(liftColumns({ winds: [east] }), 1500, fl.air.h!, 0)).toBe(true);
    expect(liftHolds(liftColumns({ winds: [east] }), 2000, fl.air.h!, 0)).toBe(false);
    const off = stepFlier(fl, NONE, 0, can, east.z);
    expect(off.air.s).toBe(AIRBORNE);
  });

  it("is in a room's lift alongside its updrafts", () => {
    const cols = liftColumns({ updrafts: [{ id: 'u', x: 100, w: 120, top: 500 }], winds: [east] });
    expect(cols.map((c) => c.id)).toEqual(['u', 'wind:gap']);
    expect(cols[1]).toMatchObject({ x: 1000, w: 800, top: 400 });
    expect(liftColumns({})).toEqual([]);
  });

  it('finds what is wrong with a current', () => {
    expect(windProblems(east, 4800)).toEqual([]);
    expect(windProblems({ ...east, x1: 1050 }, 4800)).toHaveLength(1);
    expect(windProblems({ ...east, x1: 5000 }, 4800)).toHaveLength(1);
    expect(windProblems({ ...east, z: 10 }, 4800)).toHaveLength(1);
  });
});
