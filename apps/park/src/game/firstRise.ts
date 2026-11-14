import { thermalTop, type RoomDef } from '@owl-park/shared';

/**
 * The first ride on rising air (OP-363). The Treetop Commons has warm air rising in its moonbeam
 * (rooms/index.ts, COMMONS_THERMAL), so an owl new to the park can fly before the turnstiles and before
 * anything asks about a ticket. The first time this device's owl rides it up and comes down, the room
 * says so in one line and the feather trail leads on to the turnstiles; after that the Commons is as
 * quiet as it was. The Great Hollow has its own first flight, off its roots (hallTips.ts), so a room
 * with those does not mark this one as well.
 *
 * Pure, so it is unit-tested; the room scene asks it as a flight lands.
 *
 * TODO-DOCS (OP-363): docs/ARCHITECTURE.md's flight notes gain the Treetop Commons' rising air beside the
 * Great Hollow's, and docs/PLAYBOOK.md's first visit gains where the home screen's free way in (Play free
 * now) lands a new owl (the Commons, beside the moonbeam, not the nest).
 */

/** The mark this device keeps once its owl has ridden a room's rising air (with the doorways tried, featherTrail.ts). */
export const FIRST_RISE_MARK = 'first-rise';

/** How much of the way to the rising air's top an owl must have been carried for the ride to count. */
export const RISE_SHARE = 0.5;

/** Whether a room marks an owl's first ride: one with rising air and no first flight of its own off roots. */
export function marksFirstRise(room: Pick<RoomDef, 'thermals'>, rootTips: boolean): boolean {
  return !rootTips && thermalTop(room) > 0;
}

/** Whether a flight just landed was a ride: the rising air took the owl, and carried it at least RISE_SHARE of the way to its top. */
export function rodeUp(lifted: boolean, peak: number, top: number): boolean {
  return lifted && top > 0 && peak >= top * RISE_SHARE;
}
