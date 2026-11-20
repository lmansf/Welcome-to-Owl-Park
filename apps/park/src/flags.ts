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
  friends: { param: 'friends', note: 'Bring a friend preview: the friend invite card in the Menu (the co-op escape room and the party game are on for everyone)' },
  movers: { param: 'movers', note: 'Owls move like owls: a dive down a knot hole in place of the Great Hollow’s hatch, a knot-hole tunnel up from the arcade, and a glide lane along its cabinets' },
  desk: { param: 'desk', note: 'The vote desk in the Great Hollow: each realm’s share of this month’s Realm Vote, in percents, moving as owls vote' },
  look: { param: 'look', note: 'Look around: an emote every owl has, its head turning on its own through front, three-quarter, side and back while the body stays still' },
  snow: { param: 'snow', note: 'The first snow (OP-074): snow falling in every room open to the sky and lying thin on the floors seen from above, drawn in code' },
  bowl: { param: 'bowl', note: 'Pinecone bowling in the Great Hollow (OP-403): its six pins and the pinecone in code, three rolls a game at the head of the lane, played on this page' },
  petswap: { param: 'petswap', note: 'Swap pet (OP-263): a tap on your own pet, with two pets or more, offers Swap pet for a few seconds, cycling your pets and no pet' },
  tag: { param: 'tag', note: 'Feather tag in the Great Hollow (OP-403): its game spaces as size boxes, and tag for 2 to 8 owls in the ring, played on the room server' },
  standin: { param: 'standin', note: 'Never a one-owl game (OP-426): an owl alone in the tag ring, or alone at the Old Stump, plays with a park owl (Pip in feather tag) until another owl comes' },
  share: { param: 'share', note: 'Share my owl (OP-392): a button on the Which owl are you result that shares a link to that owl’s own page' },
  golink: { param: 'golink', note: 'Activity links (OP-392): /?go=<place> from a /play/<place> page flies the owl on to that place once it has walked through the turnstiles' },
  eggcode: { param: 'eggcode', note: 'Egg codes (OP-260): the Redeem a code card in the Menu’s Settings tab, for a code from the portfolio site’s SQL console' },
} as const satisfies Record<string, FlagSpec>;

export type FlagName = keyof typeof FLAGS;

// flagOn: keep below this line unchanged (the check compares it with main's).
/** Whether a flag-hidden feature is on for this page: only when its address says `?<param>=1`. */
export function flagOn(name: FlagName, search: string = globalThis.location?.search ?? ''): boolean {
  const spec: FlagSpec | undefined = (FLAGS as Record<string, FlagSpec>)[name];
  return spec !== undefined && new URLSearchParams(search).get(spec.param) === '1';
}
