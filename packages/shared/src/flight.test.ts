import { describe, expect, it } from 'vitest';
import { DOUBLE_JUMP_IMPULSE, GRAVITY, JUMP_CUT_SPEED, JUMP_IMPULSE } from './jump';
import { AIRBORNE, ALL_FLIGHT, FLAP_RISE, FLIGHT_STEP_MS, GLIDE_SINK, GLIDING, GROUNDED, JUMP_RISE, LIFTED, MAX_RISE, ON_GROUND, PARK_FLIGHT, airOut, carryOn, checkAir, flightFor, newFlier, stepFlier, type Air, type Flier, type FlightAbilities, type FlightInput } from './flight';
import { UPDRAFT_RISE } from './updraft';

const NONE: FlightInput = { pressed: false, held: false };
const PRESS: FlightInput = { pressed: true, held: true };
const HOLD: FlightInput = { pressed: false, held: true };

/** Steps an owl through a list of inputs, each held for `steps` steps; returns every state on the way. */
function run(start: Flier, plan: Array<[FlightInput, number]>, ground = 0, can: Readonly<FlightAbilities> = ALL_FLIGHT): Flier[] {
  const out: Flier[] = [];
  let fl = start;
  for (const [input, steps] of plan) {
    for (let i = 0; i < steps; i++) {
      fl = stepFlier(fl, i === 0 ? input : { ...input, pressed: false }, ground, can);
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

  it("flaps once more in today's park, and only once", () => {
    const park = (start: Flier, plan: Array<[FlightInput, number]>) => run(start, plan, 0, PARK_FLIGHT);
    const up = park(newFlier(), [[PRESS, steps(300)]]);
    expect(up.at(-1)!.air.f).toBe(1);
    const flap = stepFlier(up.at(-1)!, PRESS, 0, PARK_FLIGHT);
    expect(flap.air.vz).toBeGreaterThan(DOUBLE_JUMP_IMPULSE - GRAVITY * (FLIGHT_STEP_MS / 1000) - 1);
    expect(flap.air.f).toBe(0);
    const third = stepFlier(park(flap, [[HOLD, steps(200)]]).at(-1)!, PRESS, 0, PARK_FLIGHT);
    expect(third.air.vz).toBeLessThan(DOUBLE_JUMP_IMPULSE / 2);
    // Jump and flap together reach higher than the jump alone, and never past MAX_RISE.
    const both = park(newFlier(), [[PRESS, steps(330)], [PRESS, steps(330)], [NONE, steps(1500)]]);
    expect(top(both)).toBeGreaterThan(top(park(newFlier(), [[PRESS, steps(330)], [NONE, steps(800)]])) + 80);
    expect(top(both)).toBeLessThan(MAX_RISE);
  });

  it('jumps three times in the tree: a jump and two flaps, about 149, 260 and 371 px, and never a fourth (OP-239)', () => {
    expect(flightFor(2)).toBe(ALL_FLIGHT);
    expect(flightFor(1)).toBe(PARK_FLIGHT);
    // Each press held to the top of the last rise: the jump's 0.34 s, then each flap's 0.29 s.
    const jump = run(newFlier(), [[PRESS, steps(340)], [NONE, steps(1200)]]);
    const two = run(newFlier(), [[PRESS, steps(340)], [PRESS, steps(295)], [NONE, steps(1500)]]);
    const three = run(newFlier(), [[PRESS, steps(340)], [PRESS, steps(295)], [PRESS, steps(295)], [NONE, steps(2000)]]);
    // Within a few px of the sums: the 120 Hz step gives a little up at each top.
    const near = (z: number, want: number) => z > want - 12 && z < want + 1;
    expect(near(top(jump), JUMP_RISE), `${top(jump)}`).toBe(true);
    expect(near(top(two), JUMP_RISE + FLAP_RISE), `${top(two)}`).toBe(true);
    expect(near(top(three), JUMP_RISE + 2 * FLAP_RISE), `${top(three)}`).toBe(true);
    expect(top(three) - top(two)).toBeGreaterThan(FLAP_RISE - 12);
    expect(Math.round(JUMP_RISE)).toBe(149);
    expect(Math.round(JUMP_RISE + FLAP_RISE)).toBe(260);
    expect(Math.round(JUMP_RISE + 2 * FLAP_RISE)).toBe(371);
    expect(top(three)).toBeLessThan(MAX_RISE);
    // The flaps count down 2, 1, 0, and a fourth press in the air does nothing.
    const up = run(newFlier(), [[PRESS, steps(340)]]).at(-1)!;
    expect(up.air.f).toBe(2);
    const first = stepFlier(up, PRESS);
    expect(first.air.f).toBe(1);
    const second = stepFlier(run(first, [[HOLD, steps(200)]]).at(-1)!, PRESS);
    expect(second.air.f).toBe(0);
    expect(second.air.vz).toBeGreaterThan(DOUBLE_JUMP_IMPULSE - GRAVITY * (FLIGHT_STEP_MS / 1000) - 1);
    const fourth = stepFlier(run(second, [[HOLD, steps(200)]]).at(-1)!, PRESS);
    expect(fourth.air.vz).toBeLessThan(DOUBLE_JUMP_IMPULSE / 2);
    expect(fourth.air.f).toBe(0);
    // Off an edge, both flaps are still to come; landed, the count is back to none until the next jump.
    const off = stepFlier({ ...newFlier(), air: { z: 80, vz: 0, s: GROUNDED, f: 0 } }, { pressed: false, held: false }, 0);
    expect(off.air.f).toBe(2);
    expect(three.at(-1)!.air).toEqual(ON_GROUND);
  });

  it('a second flap needs its own ability: held back, the tree flies as today', () => {
    const can: FlightAbilities = { ...ALL_FLIGHT, secondFlap: false };
    const plan: Array<[FlightInput, number]> = [[PRESS, steps(340)], [PRESS, steps(295)], [PRESS, steps(295)], [NONE, steps(2000)]];
    const oneFlap = top(run(newFlier(), plan, 0, can));
    expect(oneFlap).toBeGreaterThan(JUMP_RISE + FLAP_RISE - 12);
    expect(oneFlap).toBeLessThan(JUMP_RISE + FLAP_RISE + 1);
    expect(top(run(newFlier(), plan, 0, { ...ALL_FLIGHT, flap: false }))).toBeLessThan(JUMP_RISE + 1);
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

  it('does only what the owl can do in the air: each of the three can be held back (OP-115)', () => {
    const can = (o: Partial<FlightAbilities>): FlightAbilities => ({ ...ALL_FLIGHT, ...o });
    const go = (abilities: FlightAbilities, plan: Array<[FlightInput, number]>) => {
      const out: Flier[] = [];
      let fl = newFlier();
      for (const [input, n] of plan) for (let i = 0; i < n; i++) out.push((fl = stepFlier(fl, i === 0 ? input : { ...input, pressed: false }, 0, abilities)));
      return out;
    };
    // No jump: Jump does nothing at all.
    expect(top(go(can({ jump: false }), [[PRESS, steps(400)]]))).toBe(0);
    // No flap: the second press in the air does nothing, so it goes no higher than the jump.
    const flapLess = go(can({ flap: false }), [[PRESS, steps(330)], [PRESS, steps(330)], [NONE, steps(1500)]]);
    expect(top(flapLess)).toBeLessThan(top(go(ALL_FLIGHT, [[PRESS, steps(330)], [NONE, steps(800)]])) + 1);
    // No glide: held on the way down it only falls.
    const glideLess = go(can({ glide: false }), [[PRESS, steps(1200)]]);
    expect(glideLess.some((p) => p.air.s === GLIDING)).toBe(false);
    expect(glideLess.at(-1)!.air).toEqual(ON_GROUND);
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
    expect(checkAir({ z: 200, vz: 700, s: 1, f: 1 }, MAX_RISE)).toEqual({ z: 200, vz: 700, s: 1, f: 1 }); // the first of the tree's two flaps
    expect(checkAir({ z: 40, vz: 860, s: 1, f: 2 }, MAX_RISE)).toEqual({ z: 40, vz: 860, s: 1, f: 2 });
    for (const bad of [
      { z: 10, vz: 0, s: 0, f: 0 }, // on the ground, but not at it
      { z: 0, vz: 50, s: 0, f: 0 },
      { z: MAX_RISE + 1, vz: 0, s: 1, f: 1 },
      { z: -5, vz: 0, s: 1, f: 0 },
      { z: 10, vz: 5000, s: 1, f: 0 },
      { z: 10, vz: 0, s: 3, f: 0 },
      { z: 10, vz: 0, s: 1, f: 3 }, // a fourth take-off's worth of flaps
      { z: Number.NaN, vz: 0, s: 1, f: 0 },
      'up',
      null,
    ]) {
      expect(checkAir(bad, MAX_RISE), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('an air state as a page tells it to the room (airOut)', () => {
  it('rounds its numbers to a tenth and sends nothing a page does not need', () => {
    expect(airOut({ z: 120.26, vz: -86.666, s: GLIDING, f: 1 })).toEqual({ z: 120.3, vz: -86.7, s: GLIDING, f: 1 });
    // The top is a lifted owl's alone: a stale one on any other state is not sent.
    expect(airOut({ z: 300, vz: 0, s: AIRBORNE, f: 0, h: 300 })).toEqual({ z: 300, vz: 0, s: AIRBORNE, f: 0 });
  });

  it('keeps the top a lifted owl rises to, which the room server needs to take the state at all', () => {
    const lifted: Air = { z: 120.04, vz: UPDRAFT_RISE, s: LIFTED, f: 0, h: 300 };
    expect(airOut(lifted)).toEqual({ z: 120, vz: UPDRAFT_RISE, s: LIFTED, f: 0, h: 300 });
    expect(checkAir(airOut(lifted), 700, null)).toEqual({ z: 120, vz: UPDRAFT_RISE, s: LIFTED, f: 0, h: 300 });
    // As the page sent it before: no top, and the room server dropped it.
    expect(checkAir({ z: 120, vz: UPDRAFT_RISE, s: LIFTED, f: 0 }, 700, null)).toBeNull();
  });
});
