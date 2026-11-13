import { distance, type Vec2 } from '@owl-park/shared';

/**
 * The first ways (OP-370): the two doorways a room seen from above names to an owl that has not played
 * from it yet. The owner's audit of Nov 12 asks that a newcomer in the Great Hollow can point to the
 * next thing to do in five seconds and reach a course or the arcade without guessing at doorways.
 * Measured before this, once the opening look was over a newcomer's screen held the knothole behind
 * it and no course or the arcade at any size, and no word but the way back; the look itself showed the
 * whole oval with nothing named.
 *
 * One sign at a time is the room's rule (OP-309, hints.ts signFocus: "We're back to clutter on screen
 * from all the directions"), and it stays the rule for every owl that knows its way. An owl that has
 * been through no doorway into play is the one case it leaves lost, so for that owl alone two more are
 * named: the arcade's hatch and the nearest course's gate, by the words their signs already carry.
 * While the opening look shows the whole room their signs stand at their doorways; as the camera comes
 * in on the owl the same words go to the screen's edge, each pointing where its doorway is. They are
 * gone for good once the owl has been through any doorway into play (featherTrail.ts keeps the doorways
 * tried on this device).
 *
 * Pure, so it is unit-tested; the room scene asks it once as the owl comes in.
 *
 * TODO-DOCS (OP-370): docs/ARCHITECTURE.md's note on doorway signs and chips (one at a time, OP-309)
 * gains the two named to an owl that has not played yet, and where they show (on their doorways during
 * the opening look, at the screen's edge after it).
 */

/** How many doorways a room names to a new owl. */
export const FIRST_WAYS = 2;

/** A doorway as the rule sees it. */
export interface FirstDoor {
  id: string;
  /** Where its sign stands (room px). */
  spot: Vec2;
  /** Whether it leads somewhere to play straight away (featherTrail.ts leadsToPlay): a course's gate, or the arcade's hatch. */
  play: boolean;
  /** Whether it is the arcade's. */
  arcade: boolean;
  /** Whether this device's owl has been through it (or came in by it). */
  tried: boolean;
}

/**
 * The doorways named to an owl that came in at `from`: none once it has been through any doorway into
 * play; else the arcade's and the nearest course's, or where the room has no arcade its nearest two
 * into play. The nearest first.
 */
export function firstWays(from: Vec2, doors: readonly FirstDoor[], most = FIRST_WAYS): string[] {
  const play = doors.filter((d) => d.play);
  if (play.some((d) => d.tried)) return [];
  const near = (ds: readonly FirstDoor[]) => [...ds].sort((a, b) => distance(from, a.spot) - distance(from, b.spot));
  const arcade = near(play.filter((d) => d.arcade))[0];
  const courses = near(play.filter((d) => !d.arcade));
  const picks = (arcade ? [arcade, ...courses] : courses).slice(0, Math.max(0, most));
  return near(picks).map((d) => d.id);
}
