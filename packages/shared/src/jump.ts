/**
 * The jump an owl has, wherever it jumps: the stained-glass climb (climb.ts) and the park's flight
 * (flight.ts, OP-084) both run on these, so the two feel the same and there is one physics, not two.
 * Units are pixels and seconds; up is positive. A leaf module (no imports), so either can use it.
 */

/** One simulation step: the arcade's pace, so a run plays the same on every device. */
export const JUMP_STEP_MS = 1000 / 120;
export const GRAVITY = 2600;
export const MAX_FALL = 1150;
/** The jump: 880 px/s rises 149 px in 0.34 s; a release early cuts it to the cut speed. */
export const JUMP_IMPULSE = 880;
export const JUMP_CUT_SPEED = 180;
export const DOUBLE_JUMP_IMPULSE = 760;
/** Ground this recent still counts for a jump: a step off an edge. */
export const COYOTE_MS = 90;
/** A press this recent is still honoured: pressed a moment before landing, it jumps on landing. */
export const JUMP_BUFFER_MS = 100;
