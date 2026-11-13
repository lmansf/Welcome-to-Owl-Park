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
/**
 * How fast a jump or a flap still rises once Jump is let go on the way up (OP-343). The rise left
 * from 640 is 79 px, so the shortest press there is rises 83 px, a quick tap (50 ms) about 115, and a
 * press of a tenth of a second or more the whole jump: a tap is a jump that clears a first step, and
 * holding on is for the glide. (At 180 a tap was a hop of 13 to 58 px, under every course's first step.)
 */
export const JUMP_CUT_SPEED = 640;
export const DOUBLE_JUMP_IMPULSE = 760;
/** Ground this recent still counts for a jump: a step off an edge. */
export const COYOTE_MS = 90;
/** A press this recent is still honoured: pressed a moment before landing, it jumps on landing. */
export const JUMP_BUFFER_MS = 100;
