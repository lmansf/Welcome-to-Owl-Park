import { describe, expect, it } from 'vitest';
import { DOUBLE_JUMP_IMPULSE, GRAVITY, JUMP_CUT_SPEED, JUMP_IMPULSE } from './jump';
import { AIRBORNE, FLIGHT_STEP_MS, GLIDE_SINK, GLIDING, GROUNDED, MAX_RISE, ON_GROUND, carryOn, checkAir, newFlier, stepFlier, type Flier, type FlightInput } from './flight';

const NONE: FlightInput = { pressed: false, held: false };
const PRESS: FlightInput = { pressed: true, held: true };
const HOLD: FlightInput = { pressed: false, held: true };

/** Steps an owl through a list of inputs, each held for `steps` steps; returns every state on the way. */
function run(start: Flier, plan: Array<[FlightInput, number]>, ground = 0): Flier[] {
  const out: Flier[] = [];
  let fl = start;
  for (const [input, steps] of plan) {
    for (let i = 0; i < steps; i++) {
      fl = stepFlier(fl, i === 0 ? input : { ...input, pressed: false }, ground);
      out.push(fl);
    }
  }
  return out;
}
const top = (path: Flier[]) => Math.max(...path.map((p) => p.air.z));
const steps = (ms: number) => Math.round(ms / FLIGHT_STEP_MS);

describe('flight (OP-084)', () => {
  it("jumps the climb's jump: about an owl and a quarter, up and back down to the floor", () => {
    const path = run(newFlier(), [[PRESS, steps(360)], [NONE, steps(800)]]);
    const apex = (JUMP_IMPULSE * JUMP_IMPULSE) / (2 * GRAVITY);
    expect(top(path)).toBeGreaterThan(apex - 8);
    expect(top(path)).toBeLessThan(apex + 1);
    expect(path.at(-1)!.air).toEqual(ON_GROUND);
  });

  it('a tap rises less than a press held: let go on the way up and the rise is cut', () => {
    const tap = run(newFlier(), [[PRESS, 1], [NONE, steps(800)]]);
    const held = run(newFlier(), [[PRESS, steps(340)], [NONE, steps(800)]]);
    expect(tap[1]!.air.vz).toBeLessThanOrEqual(JUMP_CUT_SPEED);
    expect(top(tap)).toBeLessThan(top(held) / 4);
  });

  it('flaps once more in the air, and only once', () => {
    const up = run(newFlier(), [[PRESS, steps(300)]]);
    expect(up.at(-1)!.air.f).toBe(1);
    const flap = stepFlier(up.at(-1)!, PRESS);
    expect(flap.air.vz).toBeGreaterThan(DOUBLE_JUMP_IMPULSE - GRAVITY * (FLIGHT_STEP_MS / 1000) - 1);
    expect(flap.air.f).toBe(0);
    const third = stepFlier(run(flap, [[HOLD, steps(200)]]).at(-1)!, PRESS);
    expect(third.air.vz).toBeLessThan(DOUBLE_JUMP_IMPULSE / 2);
    // Jump and flap together reach higher than the jump alone, and never past MAX_RISE.
    const both = run(newFlier(), [[PRESS, steps(330)], [PRESS, steps(330)], [NONE, steps(1500)]]);
    expect(top(both)).toBeGreaterThan(top(run(newFlier(), [[PRESS, steps(330)], [NONE, steps(800)]])) + 80);
    expect(top(both)).toBeLessThan(MAX_RISE);
  });

  it('held on the way down, it glides: one down for three along at the walk, longer in the air than a fall', () => {
    // From the jump's top (0.34 s up) a glide takes about 1.7 s more to come down.
    const glide = run(newFlier(), [[PRESS, steps(1200)]]);
    const late = glide.at(-1)!;
    expect(late.air.s).toBe(GLIDING);
    expect(late.air.vz).toBeCloseTo(-GLIDE_SINK, 0);
    const landedAt = (path: Flier[]) => path.findIndex((p, i) => i > 5 && p.air.s === GROUNDED);
    const fallPath = run(newFlier(), [[PRESS, steps(340)], [NONE, steps(3000)]]);
    const glidePath = run(newFlier(), [[PRESS, steps(10_000)]]);
    expect(landedAt(glidePath)).toBeGreaterThan(landedAt(fallPath) * 2);
    // Let go and it falls again.
    const dropped = run(late, [[NONE, steps(200)]]).at(-1)!;
    expect(dropped.air.s === AIRBORNE || dropped.air.s === GROUNDED).toBe(true);
    expect(dropped.air.vz).toBeLessThan(-GLIDE_SINK);
  });

  it('honours a press a moment before landing, and lands on what is under it', () => {
    // Falling just above the floor with the flap spent: the press does nothing in the air, then jumps on landing.
    const spent: Flier = { air: { z: 10, vz: -300, s: AIRBORNE, f: 0 }, bufferMs: 0, coyoteMs: 0, rising: false };
    const after = run(spent, [[PRESS, steps(150)]]);
    const jumped = after.findIndex((p) => p.air.vz > JUMP_IMPULSE / 2);
    expect(jumped).toBeGreaterThan(2);
    expect(after.slice(0, jumped).some((p) => p.air.s === GROUNDED)).toBe(true);
    // Over higher ground, a fall stops on it.
    const onLedge = run(newFlier(), [[PRESS, steps(300)], [NONE, steps(800)]], 40);
    expect(onLedge.at(-1)!.air).toEqual({ z: 40, vz: 0, s: GROUNDED, f: 0 });
  });

  it('carries another owl on from its last state as its own page moves it', () => {
    const own = run(newFlier(), [[PRESS, steps(120)], [NONE, steps(900)]]);
    const told = own[steps(200)]!.air;
    for (const later of [steps(100), steps(300), steps(700)]) {
      const mine = own[steps(200) + later]!.air;
      const theirs = carryOn(told, later * FLIGHT_STEP_MS);
      expect(theirs.s).toBe(mine.s);
      expect(theirs.z).toBeCloseTo(mine.z, 3);
    }
    // A glide is carried on as a glide, down to the floor.
    const gliding = run(newFlier(), [[PRESS, steps(1000)]]).at(-1)!.air;
    expect(carryOn(gliding, 500).s).toBe(GLIDING);
    expect(carryOn(gliding, 60_000)).toEqual(ON_GROUND);
  });

  it('the room takes only air it can believe', () => {
    expect(checkAir({ z: 120.04, vz: -300, s: 1, f: 1 }, MAX_RISE)).toEqual({ z: 120, vz: -300, s: 1, f: 1 });
    expect(checkAir(ON_GROUND, MAX_RISE)).toEqual(ON_GROUND);
    for (const bad of [
      { z: 10, vz: 0, s: 0, f: 0 }, // on the ground, but not at it
      { z: 0, vz: 50, s: 0, f: 0 },
      { z: MAX_RISE + 1, vz: 0, s: 1, f: 1 },
      { z: -5, vz: 0, s: 1, f: 0 },
      { z: 10, vz: 5000, s: 1, f: 0 },
      { z: 10, vz: 0, s: 3, f: 0 },
      { z: 10, vz: 0, s: 1, f: 2 },
      { z: Number.NaN, vz: 0, s: 1, f: 0 },
      'up',
      null,
    ]) {
      expect(checkAir(bad, MAX_RISE), JSON.stringify(bad)).toBeNull();
    }
  });
});
