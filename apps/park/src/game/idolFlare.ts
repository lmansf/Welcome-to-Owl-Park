/**
 * How an idol answers a pledge (OP-324): its glow swells a little and slowly, and a few faint sparks
 * rise. Gentle on purpose, for young and light-sensitive players: no sudden colour change on the idol,
 * a glow that peaks well short of white (it is drawn adding light, which reads whiter over a pale floor
 * such as the painted Great Hollow's), and one slow swell a pledge, far under three flashes a second.
 */
export const IDOL_FLARE = {
  /** The glow's highest alpha while it swells (its idle shimmer reaches about 0.4 to 0.48). */
  glowPeak: 0.55,
  /** How much bigger the glow grows at its peak. */
  glowSwell: 1.12,
  /** Time to the peak, and again back down (one swell takes twice this). */
  riseMs: 900,
  /** The sparks' starting alpha, fading to nothing. */
  sparkAlpha: 0.5,
  /** How many sparks rise. */
  sparks: 20,
} as const;
