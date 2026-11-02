/**
 * The walking shuffle (OP-199): a walking owl waddles, its body tipping a little side to side about
 * its feet, in step with the walk's bob (Owl.ts: one bob a step, one tip each way every two steps, so
 * it leans over each foot as it rises onto it). The waddle eases in as a walk starts and out after it
 * ends, never snapping, and is never there in the air (flight, a glide, Moon Flap) or in calm motion.
 *
 * Only the drawing tips, so every page draws other owls' waddles from the walks it already has:
 * nothing is sent. The art painted today has no separate feet, and its folded wings are painted into
 * the body, so the whole drawing (with what the owl wears) waddles as one.
 */
export const SHUFFLE = {
  /** The most the body tips either way (radians, about 2.9 degrees). */
  tilt: 0.05,
  /** How long the waddle takes to come in once walking (ms), and to die away after (ms). */
  inMs: 220,
  outMs: 320,
  /** The walk's bob is |sin(now / stepMs)|, so the waddle is sin(now / stepMs): the same clock. */
  stepMs: 140,
} as const;

export interface WalkPoseIn {
  /** How far the waddle had come in when last drawn (0..1; 0 at rest). */
  amount: number;
  /** On a walk now. */
  walking: boolean;
  /** Its feet are on something (not flying, gliding or held aloft). */
  grounded: boolean;
  /** Seconds since it was last drawn. */
  dt: number;
  /** This page's clock (ms): the same one the bob runs on. */
  now: number;
  /** The visitor asked for calm motion: the waddle dies away and stays away. */
  calm: boolean;
}

export interface WalkPose {
  /** How far the waddle has come in now, for the next frame. */
  amount: number;
  /** How far to tip the body about its feet (radians; positive is clockwise). */
  tilt: number;
}

const REST: WalkPose = { amount: 0, tilt: 0 };

/** The waddle for this frame: `amount` ramps toward walking (or not), eased so it starts and stops softly. */
export function walkPose(p: WalkPoseIn): WalkPose {
  // In the air the feet are off the ground: no waddle, and none left over to come down with.
  if (!p.grounded) return REST;
  const target = p.walking && !p.calm ? 1 : 0;
  if (target === 0 && p.amount <= 0) return REST;
  const ms = Math.max(0, p.dt) * 1000;
  const step = target === 1 ? ms / SHUFFLE.inMs : -ms / SHUFFLE.outMs;
  const amount = Math.min(1, Math.max(0, p.amount + step));
  if (amount === 0) return REST;
  // Smoothstep: no jolt as it begins, none as it settles.
  const eased = amount * amount * (3 - 2 * amount);
  return { amount, tilt: SHUFFLE.tilt * eased * Math.sin(p.now / SHUFFLE.stepMs) };
}
