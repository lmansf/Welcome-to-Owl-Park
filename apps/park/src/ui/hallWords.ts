/**
 * What the Great Hollow says to an owl on its first flight (OP-347): the tips at its roots and the
 * line when the first glide lands. Drafts for the owner's approval, like every line a player reads.
 */
export const HALL_WORDS = {
  /** At a run's first root: how to get up it, by what this device plays with. */
  hop: {
    keys: 'Hop up the roots. Space to jump, and again in the air to flap.',
    touch: 'Hop up the roots. Tap Jump, and again in the air to flap.',
  },
  /** Up on the knot or the stump: how to leave it. */
  glide: {
    keys: 'Jump off the top and hold Space to glide.',
    touch: 'Jump off the top and hold Jump to glide.',
  },
  /** When the first glide off a root lands. */
  flown: 'That is flying! Every doorway round the hollow leads somewhere to play.',
} as const;
