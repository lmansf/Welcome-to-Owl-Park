/**
 * Flight (OP-084): the park's jump, its second flap and the glide, for every owl in every room. The
 * physics is the climb's (climb.ts), not a second one: its gravity, its jump and double-jump
 * impulses, its cut and its fall cap, its coyote and buffer windows and its 120 Hz step, taken in
 * room pixels, where the climb's jump lifts a park owl about one and a quarter times its height. The
 * park adds the glide: Jump held on the way down holds the fall to the walk's pace over GLIDE_SLOPE
 * (one down for three along).
 *
 * Movement is state, not events (Logan, 2026-10-26). An owl's air state ({@link Air}) goes to the
 * room only when it changes (off the ground, a flap, the cut, a glide begun or ended, the landing),
 * and every page carries an owl on from its last state with the same step ({@link carryOn}), so all
 * draw the same arc. Nothing about flight is logged. The owl's place in the room stays its spot on
 * the floor: flight is a height above it, so doorways, spots and walks are as before.
 *
 * `ground` is the height of what the owl stands on where it is: the floor (0) until rooms have upper
 * levels to land on.
 *
 * TODO-DOCS (OP-084): docs/ARCHITECTURE.md (movement): the air state, when it is sent, how other
 * pages carry it on, the room server's checks; docs/PLAYBOOK.md (controls): Jump, a second flap in
 * the air, Jump held to glide, on the pad and the space bar.
 */
import { COYOTE_MS, DOUBLE_JUMP_IMPULSE, GRAVITY, JUMP_BUFFER_MS, JUMP_CUT_SPEED, JUMP_IMPULSE, JUMP_STEP_MS, MAX_FALL } from './jump';
import { WALK_SPEED } from './walk';

/** One step of flight: the climb's (jump.ts). */
export const FLIGHT_STEP_MS = JUMP_STEP_MS;
/** A glide falls one room pixel for this many along at the walk's pace (Logan: about one in three). */
export const GLIDE_SLOPE = 3;
/** How fast a glide falls (px/s): the walk's pace over the slope. */
export const GLIDE_SINK = WALK_SPEED / GLIDE_SLOPE;
/** How quickly spread wings bring a fall to the glide's (per second): the fall eases in, not snaps. */
export const GLIDE_EASE = 12;

/** On the ground, in the air, or gliding. */
export type AirMode = 0 | 1 | 2;
export const GROUNDED: AirMode = 0;
export const AIRBORNE: AirMode = 1;
export const GLIDING: AirMode = 2;

/**
 * An owl's air state, the part every page shares: how high it is above what it stands on (room px),
 * how fast it is rising (px/s, falling is negative), whether it is on the ground, in the air or
 * gliding, and the flaps it has left before it lands (one after leaving the ground).
 */
export interface Air {
  z: number;
  vz: number;
  s: AirMode;
  f: 0 | 1;
}

export const ON_GROUND: Air = { z: 0, vz: 0, s: GROUNDED, f: 0 };

/** The highest a jump and a flap at its top can carry an owl above what it took off from, with room to spare. */
export const MAX_RISE = Math.ceil((JUMP_IMPULSE * JUMP_IMPULSE + DOUBLE_JUMP_IMPULSE * DOUBLE_JUMP_IMPULSE) / (2 * GRAVITY)) + 20;

/** The visitor's own owl: its air state and the timers only its own page keeps. */
export interface Flier {
  air: Air;
  /** A press of Jump this recent is still honoured (ms): pressed a moment before landing, it jumps on landing. */
  bufferMs: number;
  /** Ground this recent still counts for a jump (ms): a step off an edge. */
  coyoteMs: number;
  /** Rising from a press still held: let go and the rise is cut short. */
  rising: boolean;
}

export const newFlier = (): Flier => ({ air: ON_GROUND, bufferMs: 0, coyoteMs: 0, rising: false });

/**
 * What an owl can do in the air: each one of the keys of the lock-and-key game (OP-115), to be earned
 * one day; all three on until then. Without the jump it stays on the ground, without the flap it has
 * no second one, without the glide a held Jump only holds the jump.
 */
export interface FlightAbilities {
  jump: boolean;
  flap: boolean;
  glide: boolean;
}

export const ALL_FLIGHT: Readonly<FlightAbilities> = { jump: true, flap: true, glide: true };

export interface FlightInput {
  /** Jump went down since the last step. */
  pressed: boolean;
  /** Jump is held down. */
  held: boolean;
}

/** One step of the visitor's own owl (FLIGHT_STEP_MS), with what it can do in the air. */
export function stepFlier(fl: Flier, input: FlightInput, ground = 0, can: Readonly<FlightAbilities> = ALL_FLIGHT): Flier {
  let { z, vz, s, f } = fl.air;
  let { bufferMs, coyoteMs, rising } = fl;
  // Off an edge: what was underfoot is lower now, so the owl falls, its flap still to come.
  if (s === GROUNDED && z > ground) {
    s = AIRBORNE;
    f = 1;
  }
  coyoteMs = s === GROUNDED ? COYOTE_MS : Math.max(0, coyoteMs - FLIGHT_STEP_MS);
  bufferMs = input.pressed ? JUMP_BUFFER_MS : Math.max(0, bufferMs - FLIGHT_STEP_MS);
  if (bufferMs > 0 && can.jump && (s === GROUNDED || coyoteMs > 0)) {
    // Off the ground (or just after it): the climb's jump.
    vz = JUMP_IMPULSE;
    s = AIRBORNE;
    f = 1;
    rising = true;
    bufferMs = 0;
    coyoteMs = 0;
  } else if (bufferMs > 0 && can.flap && f === 1 && s !== GROUNDED) {
    // The second flap, in the air or out of a glide: the climb's double jump.
    vz = DOUBLE_JUMP_IMPULSE;
    s = AIRBORNE;
    f = 0;
    rising = true;
    bufferMs = 0;
  }
  // Let go on the way up and the rise is cut short; held on the way down, the wings spread.
  if (rising && vz > 0 && !input.held) {
    vz = Math.min(vz, JUMP_CUT_SPEED);
    rising = false;
  }
  if (vz <= 0) rising = false;
  if (s === AIRBORNE && can.glide && input.held && vz <= 0) s = GLIDING;
  else if (s === GLIDING && !input.held) s = AIRBORNE;
  const air = fall({ z, vz, s, f }, FLIGHT_STEP_MS, ground);
  return { air, bufferMs, coyoteMs, rising: air.s === GROUNDED ? false : rising };
}

/**
 * The air carried on `ms` with no presses: gravity, or the glide's fall while gliding, until the owl
 * lands on `ground`. How every page moves an owl between the states it is told.
 */
export function fall(a: Air, ms: number, ground = 0): Air {
  if (a.s === GROUNDED) return a.z === ground ? a : { ...a, z: ground };
  const dt = ms / 1000;
  let vz = a.vz;
  if (a.s === GLIDING) vz += (-GLIDE_SINK - vz) * Math.min(1, GLIDE_EASE * dt);
  else vz = Math.max(-MAX_FALL, vz - GRAVITY * dt);
  const z = a.z + vz * dt;
  if (z <= ground && vz <= 0) return { z: ground, vz: 0, s: GROUNDED, f: 0 };
  return { z, vz, s: a.s, f: a.f };
}

/** The air `ms` on from a state, in whole steps and a last part step: another owl, between the states it sends. */
export function carryOn(a: Air, ms: number, ground = 0): Air {
  let out = a;
  let left = Math.max(0, ms);
  while (left >= FLIGHT_STEP_MS && out.s !== GROUNDED) {
    out = fall(out, FLIGHT_STEP_MS, ground);
    left -= FLIGHT_STEP_MS;
  }
  return left > 0 && out.s !== GROUNDED ? fall(out, left, ground) : out;
}

/** Whether two air states differ enough that the room should be told: a new mode, a flap, or a speed the other pages would not reckon. */
export function airChanged(a: Air, b: Air): boolean {
  return a.s !== b.s || a.f !== b.f || Math.abs(a.vz - b.vz) > 1;
}

/** Whether a value has an air state's shape: two numbers, a mode and flaps it knows. */
export function isAirShape(v: unknown): v is Air {
  if (typeof v !== 'object' || v === null) return false;
  const { z, vz, s, f } = v as Record<string, unknown>;
  return typeof z === 'number' && typeof vz === 'number' && Number.isFinite(z) && Number.isFinite(vz) && (s === GROUNDED || s === AIRBORNE || s === GLIDING) && (f === 0 || f === 1);
}

/**
 * An air state as the room server accepts it from a visitor (null for one it drops): its shape, its
 * numbers in range, and on the ground only at the ground. `maxZ` is the highest an owl can be in the
 * room. Rounded to a tenth, as it goes out.
 */
export function checkAir(v: unknown, maxZ: number, ground = 0): Air | null {
  if (!isAirShape(v)) return null;
  const { z, vz, s, f } = v;
  if (z < ground - 0.5 || z > maxZ || vz < -MAX_FALL - 1 || vz > JUMP_IMPULSE + 1) return null;
  if (s === GROUNDED && (Math.abs(z - ground) > 0.5 || vz !== 0)) return null;
  return { z: Math.round(z * 10) / 10, vz: Math.round(vz * 10) / 10, s, f };
}
