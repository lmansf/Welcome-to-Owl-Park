/**
 * Flight (OP-084): the park's jump, its flaps and the glide, for every owl in every room. The
 * physics is the climb's (climb.ts), not a second one: its gravity, its jump and double-jump
 * impulses, its cut and its fall cap, its coyote and buffer windows and its 120 Hz step, taken in
 * room pixels, where the climb's jump lifts a park owl about one and a quarter times its height. The
 * park adds the glide: Jump held on the way down holds the fall to the walk's pace over GLIDE_SLOPE
 * (one down for three along). In the tree (map 2) an owl has a second flap after the first (OP-239,
 * the triple jump), at the first's strength; today's park keeps the one.
 *
 * Movement is state, not events (Logan, 2026-10-26). An owl's air state ({@link Air}) goes to the
 * room only when it changes (off the ground, a flap, the cut, a glide begun or ended, the landing),
 * and every page carries an owl on from its last state with the same step ({@link carryOn}), so all
 * draw the same arc. Nothing about flight is logged. The owl's place in the room stays its spot on
 * the floor plan: flight is a height above it, so doorways, spots and walks are as before.
 *
 * `ground` is the height of what the owl comes down on where it is: the floor (0), or the top of a
 * perch (perches.ts, groundAt). A landing on the floor is never sent; one on a perch is, since only
 * the owl's own page knows what was under it.
 */
import { landDash, type DashCharge } from './dash';
import { COYOTE_MS, DOUBLE_JUMP_IMPULSE, GRAVITY, JUMP_BUFFER_MS, JUMP_CUT_SPEED, JUMP_IMPULSE, JUMP_STEP_MS, MAX_FALL } from './jump';
import { MAX_PERCH_TOP, SLOPE_CATCH, type Standing } from './perches';
import { UPDRAFT_RISE } from './updraft';
import { WALK_SPEED } from './walk';

/** One step of flight: the climb's (jump.ts). */
export const FLIGHT_STEP_MS = JUMP_STEP_MS;
/** A glide falls one room pixel for this many along at the walk's pace (Logan: about one in three). */
export const GLIDE_SLOPE = 3;
/** How fast a glide falls (px/s): the walk's pace over the slope. */
export const GLIDE_SINK = WALK_SPEED / GLIDE_SLOPE;
/** How quickly spread wings bring a fall to the glide's (per second): the fall eases in, not snaps. */
export const GLIDE_EASE = 12;

/** On the ground, in the air, gliding, or lifted by an updraft (updraft.ts) up to its top. */
export type AirMode = 0 | 1 | 2 | 3;
export const GROUNDED: AirMode = 0;
export const AIRBORNE: AirMode = 1;
export const GLIDING: AirMode = 2;
export const LIFTED: AirMode = 3;

/**
 * An owl's air state, the part every page shares: how high it is above the floor (room px), how fast
 * it is rising (px/s, falling is negative), whether it is on the ground, in the air or gliding, and
 * the flaps it has left before it lands (two after leaving the ground in the tree, one in today's
 * park). On the ground above the floor, it stands on a perch.
 */
export interface Air {
  z: number;
  vz: number;
  s: AirMode;
  f: Flaps;
  /** Lifted only: the top of the updraft it rises to and hovers at. */
  h?: number;
}

/** Flaps an owl has left before it lands: 2, 1, 0 in the tree (the triple jump, OP-239), 1, 0 in today's park. */
export type Flaps = 0 | 1 | 2;
/** The most flaps any owl has: the tree's two. */
export const MAX_FLAPS = 2;

export const ON_GROUND: Air = { z: 0, vz: 0, s: GROUNDED, f: 0 };

/** The highest a jump alone carries an owl above what it took off from (px, about 149): a perch a quest may use is lower than this. */
export const JUMP_RISE = (JUMP_IMPULSE * JUMP_IMPULSE) / (2 * GRAVITY);
/** How much higher a flap at the top of a rise carries an owl (px, about 111): both flaps are the climb's double jump. */
export const FLAP_RISE = (DOUBLE_JUMP_IMPULSE * DOUBLE_JUMP_IMPULSE) / (2 * GRAVITY);
/** The highest a jump and both flaps, each at the top of the last, can carry an owl above what it took off from (about 371), with room to spare. */
export const MAX_RISE = Math.ceil(JUMP_RISE + MAX_FLAPS * FLAP_RISE) + 20;
/** The highest an owl can be in any room: a jump and both flaps from the highest top a perch may have. */
export const MAX_AIR_Z = MAX_PERCH_TOP + MAX_RISE;

/** The visitor's own owl: its air state and the timers only its own page keeps. */
export interface Flier {
  air: Air;
  /** A press of Jump this recent is still honoured (ms): pressed a moment before landing, it jumps on landing. */
  bufferMs: number;
  /** Ground this recent still counts for a jump (ms): a step off an edge. */
  coyoteMs: number;
  /** Rising from a press still held: let go and the rise is cut short. */
  rising: boolean;
  /** The dash, in a course (OP-224, dash.ts): flight brings it back as the owl lands. Absent where the owl does not hold it. */
  dash?: DashCharge;
}

export const newFlier = (): Flier => ({ air: ON_GROUND, bufferMs: 0, coyoteMs: 0, rising: false });

/**
 * What an owl can do in the air: each one of the keys of the lock-and-key game (OP-115), to be earned
 * one day; all on until then. Without the jump it stays on the ground, without the flap it has no
 * flap at all, without the second flap only the one (the triple jump's slot, OP-239), without the
 * glide a held Jump only holds the jump.
 */
export interface FlightAbilities {
  jump: boolean;
  flap: boolean;
  secondFlap: boolean;
  glide: boolean;
}

/** The tree's flight (map 2): the jump, both flaps and the glide. */
export const ALL_FLIGHT: Readonly<FlightAbilities> = { jump: true, flap: true, secondFlap: true, glide: true };
/** Today's park (map 1): one flap, as before the triple jump. */
export const PARK_FLIGHT: Readonly<FlightAbilities> = { ...ALL_FLIGHT, secondFlap: false };

/** The flight an owl has in a park (1 today's, 2 the tree). */
export function flightFor(map: 1 | 2): Readonly<FlightAbilities> {
  return map === 2 ? ALL_FLIGHT : PARK_FLIGHT;
}

/** The flaps an owl with these abilities has as it leaves the ground. */
export function flapsOf(can: Readonly<FlightAbilities>): Flaps {
  return !can.flap ? 0 : can.secondFlap ? 2 : 1;
}

export interface FlightInput {
  /** Jump went down since the last step. */
  pressed: boolean;
  /** Jump is held down. */
  held: boolean;
}

/**
 * One step of the visitor's own owl (FLIGHT_STEP_MS), with what it can do in the air. `lift` is the
 * top of the updraft the owl is inside now, while that column is on (updraft.ts, liftAt), else null.
 */
export function stepFlier(fl: Flier, input: FlightInput, ground = 0, can: Readonly<FlightAbilities> = ALL_FLIGHT, lift: number | null = null): Flier {
  let { z, vz, s, f } = fl.air;
  let h = fl.air.h;
  let { bufferMs, coyoteMs, rising } = fl;
  // Down a slope (OP-238): ground a step lower underfoot keeps the owl on it, at its height, never sliding.
  if (s === GROUNDED && z > ground && z - ground <= SLOPE_CATCH) z = ground;
  // Off an edge: what was underfoot is lower now, so the owl falls, its flaps still to come.
  if (s === GROUNDED && z > ground) {
    s = AIRBORNE;
    f = flapsOf(can);
  }
  coyoteMs = s === GROUNDED ? COYOTE_MS : Math.max(0, coyoteMs - FLIGHT_STEP_MS);
  bufferMs = input.pressed ? JUMP_BUFFER_MS : Math.max(0, bufferMs - FLIGHT_STEP_MS);
  if (bufferMs > 0 && can.jump && (s === GROUNDED || coyoteMs > 0)) {
    // Off the ground (or just after it): the climb's jump.
    vz = JUMP_IMPULSE;
    s = AIRBORNE;
    f = flapsOf(can);
    rising = true;
    bufferMs = 0;
    coyoteMs = 0;
  } else if (bufferMs > 0 && can.flap && f > 0 && s !== GROUNDED) {
    // A flap, in the air or out of a glide: the climb's double jump, and in the tree once more after it.
    vz = DOUBLE_JUMP_IMPULSE;
    s = AIRBORNE;
    f = f === 2 ? 1 : 0;
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
  // Gliding into a column that is on, the leaves carry the owl up; out of it, or Jump let go, it falls on from there.
  if (lift !== null && input.held && (s === GLIDING || s === LIFTED)) {
    s = LIFTED;
    vz = UPDRAFT_RISE;
    h = lift;
  } else if (s === LIFTED) {
    s = AIRBORNE;
    vz = 0;
  }
  if (s !== LIFTED) h = undefined;
  const air = fall(h === undefined ? { z, vz, s, f } : { z, vz, s, f, h }, FLIGHT_STEP_MS, ground);
  const out: Flier = { air, bufferMs, coyoteMs, rising: air.s === GROUNDED ? false : rising };
  // Standing on something again: a dash spent in the air is back (OP-224).
  if (fl.dash) out.dash = air.s === GROUNDED ? landDash(fl.dash) : fl.dash;
  return out;
}

/**
 * The air carried on `ms` with no presses: gravity, or the glide's fall while gliding, until the owl
 * lands on `ground`. How every page moves an owl between the states it is told.
 */
export function fall(a: Air, ms: number, ground = 0): Air {
  if (a.s === GROUNDED) return a.z === ground ? a : { ...a, z: ground };
  const dt = ms / 1000;
  // Lifted: up at the updraft's pace to its top, and held there.
  if (a.s === LIFTED) return { ...a, z: Math.min(a.h ?? a.z, a.z + a.vz * dt) };
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
  return a.s !== b.s || a.f !== b.f || a.h !== b.h || Math.abs(a.vz - b.vz) > 1;
}

/** Whether a value has an air state's shape: two numbers, a mode and flaps it knows (0 to MAX_FLAPS). */
export function isAirShape(v: unknown): v is Air {
  if (typeof v !== 'object' || v === null) return false;
  const { z, vz, s, f, h } = v as Record<string, unknown>;
  const lifted = s === LIFTED ? typeof h === 'number' && Number.isFinite(h) : h === undefined;
  return typeof z === 'number' && typeof vz === 'number' && Number.isFinite(z) && Number.isFinite(vz) && (s === GROUNDED || s === AIRBORNE || s === GLIDING || s === LIFTED) && (f === 0 || f === 1 || f === 2) && lifted;
}

/**
 * An air state as the room server accepts it from a visitor (null for one it drops): its shape, its
 * numbers in range, and on the ground only at a height an owl can stand at, which it is put at
 * exactly. `maxZ` is the highest an owl can be in the room, `standing` the heights it can stand at
 * there (the floor and its perches' tops, a sloped perch's range, perches.ts), or null where any
 * height up to `maxZ` will do.
 * Rounded to a tenth, as it goes out.
 */
export function checkAir(v: unknown, maxZ: number, standing: readonly Standing[] | null = [0]): Air | null {
  if (!isAirShape(v)) return null;
  const { z, vz, s, f } = v;
  if (z < -0.5 || z > maxZ || vz < -MAX_FALL - 1 || vz > JUMP_IMPULSE + 1) return null;
  if (s === GROUNDED) {
    // A flat height is put at exactly; a sloped perch's range (OP-238) takes any height along it.
    const fit = (h: Standing) => (typeof h === 'number' ? Math.abs(z - h) <= 0.5 : z >= h[0] - 0.5 && z <= h[1] + 0.5);
    const hit = standing === null ? z : standing.find(fit);
    const at = hit === undefined ? undefined : typeof hit === 'number' ? hit : Math.min(hit[1], Math.max(hit[0], z));
    return at === undefined || vz !== 0 ? null : { z: Math.round(Math.max(0, at) * 10) / 10, vz: 0, s, f };
  }
  // Lifted: at the updraft's pace, to a top an owl may reach; which column it is in is the room's to check.
  if (s === LIFTED) {
    const h = v.h!;
    if (Math.abs(vz - UPDRAFT_RISE) > 1 || h < 0 || h > maxZ || z > h + 0.5) return null;
    return { z: Math.round(z * 10) / 10, vz: UPDRAFT_RISE, s, f, h: Math.round(h * 10) / 10 };
  }
  return { z: Math.round(z * 10) / 10, vz: Math.round(vz * 10) / 10, s, f };
}
