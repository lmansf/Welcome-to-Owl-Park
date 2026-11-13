import { describe, expect, it } from 'vitest';
import { GLIDE_SLOPE, GLIDING, LIFTED, newFlier, stepFlier, FLIGHT_STEP_MS, type Flier } from './flight';
import { inThermal, thermalAt, thermalHolds, thermalProblems, thermalTop, type Thermal } from './thermal';
import { UPDRAFT_RISE } from './updraft';
import { WALK_SPEED } from './walk';

const heart: Thermal = { id: 'heart', pos: { x: 3200, y: 1140 }, r: 160, top: 900 };

describe('a thermal: warm air over a spot of a room seen from above (OP-340)', () => {
  it('is a circle on the plan: inside it up to its edge, outside it past it, whichever way', () => {
    expect(inThermal(heart, heart.pos)).toBe(true);
    for (const [dx, dy] of [[160, 0], [-160, 0], [0, 160], [0, -160], [113, 113]] as const) expect(inThermal(heart, { x: 3200 + dx, y: 1140 + dy }), `${dx},${dy}`).toBe(true);
    for (const [dx, dy] of [[161, 0], [0, -161], [120, 120]] as const) expect(inThermal(heart, { x: 3200 + dx, y: 1140 + dy }), `${dx},${dy}`).toBe(false);
    // A room seen from the side has updrafts across its whole depth; a thermal is a place: straight up the room from it is outside.
    expect(inThermal(heart, { x: 3200, y: 520 })).toBe(false);
  });

  it('lifts an owl inside it and below its top, and no other', () => {
    expect(thermalAt([heart], heart.pos, 0)).toBe(heart);
    expect(thermalAt([heart], heart.pos, 900)).toBe(heart);
    expect(thermalAt([heart], heart.pos, 902)).toBeUndefined();
    expect(thermalAt([heart], { x: 2000, y: 1140 }, 0)).toBeUndefined();
    expect(thermalAt(undefined, heart.pos, 0)).toBeUndefined();
  });

  it('holds a lifted owl for the room server only at its own top, with a little slack past its edge', () => {
    expect(thermalHolds([heart], heart.pos, 900)).toBe(true);
    expect(thermalHolds([heart], heart.pos, 880)).toBe(false);
    expect(thermalHolds([heart], { x: 3380, y: 1140 }, 900)).toBe(false);
    expect(thermalHolds([heart], { x: 3380, y: 1140 }, 900, 24)).toBe(true);
    expect(thermalHolds(undefined, heart.pos, 900)).toBe(false);
  });

  it('knows the highest a room’s thermals lift, and when one makes no sense', () => {
    expect(thermalTop({ thermals: [heart, { ...heart, id: 'low', top: 300 }] })).toBe(900);
    expect(thermalTop({})).toBe(0);
    expect(thermalProblems(heart)).toEqual([]);
    expect(thermalProblems({ ...heart, r: 20 })).toHaveLength(1);
    expect(thermalProblems({ ...heart, top: 0 })).toHaveLength(1);
  });

  it('carries a gliding owl up to its top at an updraft’s pace, and a glide held from there goes three along for one down', () => {
    // Jump, hold: the wings spread at the top of the jump, the thermal takes the owl, and it rises to the top and hovers.
    let fl: Flier = stepFlier(newFlier(), { pressed: true, held: true }, 0, undefined, heart.top);
    let steps = 0;
    while (fl.air.s !== LIFTED && steps++ < 400) fl = stepFlier(fl, { pressed: false, held: true }, 0, undefined, heart.top);
    expect(fl.air.s).toBe(LIFTED);
    expect(fl.air.vz).toBe(UPDRAFT_RISE);
    for (let i = 0; i < 2000 && fl.air.z < heart.top; i++) fl = stepFlier(fl, { pressed: false, held: true }, 0, undefined, heart.top);
    expect(fl.air.z).toBe(heart.top);
    expect(fl.air.s).toBe(LIFTED);
    // Out of the column (no lift), Jump still held: a glide, all the way down.
    let ms = 0;
    fl = stepFlier(fl, { pressed: false, held: true }, 0, undefined, null);
    for (let i = 0; i < 20000 && fl.air.z > 0; i++) {
      fl = stepFlier(fl, { pressed: false, held: true }, 0, undefined, null);
      ms += FLIGHT_STEP_MS;
      if (fl.air.z > 0) expect(fl.air.s).toBe(GLIDING);
    }
    const along = (ms / 1000) * WALK_SPEED;
    expect(along).toBeGreaterThanOrEqual(heart.top * GLIDE_SLOPE);
    expect(along).toBeLessThan(heart.top * GLIDE_SLOPE * 1.05);
  });
});
