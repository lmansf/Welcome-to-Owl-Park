/**
 * Features hidden behind a URL flag: merge class 3 in the Owl Park merge gate. A feature listed here
 * is off for every visitor and shows only on an address that asks for it with `?<param>=1`, for
 * that page load alone: no build switch, no saved state, no keeper or server side. So it can merge
 * and go live unseen, and be played on the live park (or a pull request's preview) by adding the flag.
 *
 * Turning a feature on for everyone is a different change (take its flag out and the feature's
 * code off `flagOn`), and that one waits on the owner's merge word: tools/flags/flag-check.mjs
 * fails a flag-hidden pull request that removes or changes an entry here or touches `flagOn`.
 *
 * This file has no imports so the check can load it on its own (node strips the types).
 */
export interface FlagSpec {
  /** The query parameter that turns the feature on: `?<param>=1`. Lower case letters, digits and dashes. */
  readonly param: string;
  /** What the feature is, in a few words, for whoever plays it. */
  readonly note: string;
}

// One entry per flag-hidden feature, added by the pull request that brings the feature:
//   ropeSwings: { param: 'ropes', note: 'Rope swings between the canopy nests' },
export const FLAGS = {
  friends: { param: 'friends', note: 'Play with your friends preview: co-op escape room, party game, friend invites' },
  town: { param: 'town', note: 'The town view: a wider camera in the rooms seen from above, and an opening look over the Great Hollow' },
  thermal: { param: 'thermal', note: 'The thermal at the heart of the Great Hollow: glide in its moonbeam to rise, see the whole oval, and glide to any way' },
  sounds: { param: 'sfx', note: 'The park’s sounds for your own owl: a jump, a flap, a glide, a landing, a bell, a feather, a bench, a fall, a doorway' },
  sideCam: { param: 'cam', note: 'The camera in a course and the tree looks where your owl is going: it leads the way you travel and holds still through a hop' },
} as const satisfies Record<string, FlagSpec>;

export type FlagName = keyof typeof FLAGS;

// flagOn: keep below this line unchanged (the check compares it with main's).
/** Whether a flag-hidden feature is on for this page: only when its address says `?<param>=1`. */
export function flagOn(name: FlagName, search: string = globalThis.location?.search ?? ''): boolean {
  const spec: FlagSpec | undefined = (FLAGS as Record<string, FlagSpec>)[name];
  return spec !== undefined && new URLSearchParams(search).get(spec.param) === '1';
}
