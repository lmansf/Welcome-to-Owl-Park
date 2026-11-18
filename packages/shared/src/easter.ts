/**
 * The painted egg and the Easter hatch (OP-261, OP-262; D7 of the Dec 1 plan). The egg is a pet
 * that only a code gives (OP-260, not built yet): it is never sold, given as the day's gift or drawn
 * as a prize. It rocks more as Easter 2027 nears, worked out on each page from the date alone, and
 * at the hatch every owl holding it also gets the Rainbow Bunny and keeps the egg (the owner's rule,
 * Nov 3: "Players should gain the bunny, and keep the egg").
 */

import type { OwlLook } from './protocol';

export const EGG_VARIANT = 'painted-egg~0';
export const BUNNY_VARIANT = 'rainbow-bunny~0';

/**
 * A free guest's egg and bunny (OP-264, the free guest rules of PR 84): kept in its collection and drawn
 * on its own page, but held back from what every other owl is shown until it has a ticket. The room
 * server takes the pet off the look it passes on; once a ticket lets the owl in, the look goes out whole.
 */
export const GUEST_HIDDEN_ITEMS: readonly string[] = ['painted-egg', 'rainbow-bunny'];

/** Whether a worn variant is one a free guest's look holds back from others (OP-264). */
export function hiddenForGuests(variant: string | undefined): boolean {
  return variant !== undefined && GUEST_HIDDEN_ITEMS.includes(variant.split('~')[0]!);
}

/** A free guest's look as other owls see it (OP-264): without the egg or the bunny as its pet. */
export function guestLookForOthers(look: OwlLook): OwlLook {
  if (!hiddenForGuests(look.wear?.pet)) return look;
  const { pet: _pet, ...wear } = look.wear!;
  const { wear: _wear, ...rest } = look;
  return Object.keys(wear).length ? { ...rest, wear } : rest;
}

/**
 * When every egg hatches: midnight park time (Eastern, daylight time by then) as Easter Sunday,
 * March 28, 2027 begins, so every owl's egg hatches together (the ticket's proposed default).
 */
export const EASTER_HATCH_AT = Date.UTC(2027, 2, 28, 4);

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** How the egg rocks just now: a rock of `degrees` each way every `everyMs`, and its cracks. */
export interface EggWobble {
  everyMs: number;
  degrees: number;
  crack: 'none' | 'light' | 'heavy';
  hatched: boolean;
}

/**
 * The egg's rock at `now`: a small one every few seconds while Easter is far off, a bigger one in
 * the last four weeks, quick rocking in the last week, a light crack on the last day and a heavy one
 * in its last three hours. Hatched, it rests still and whole: the owl keeps the egg it had.
 */
export function eggWobble(now: number): EggWobble {
  const left = EASTER_HATCH_AT - now;
  if (left <= 0) return { everyMs: 0, degrees: 0, crack: 'none', hatched: true };
  if (left <= 3 * HOUR) return { everyMs: 500, degrees: 16, crack: 'heavy', hatched: false };
  if (left <= DAY) return { everyMs: 700, degrees: 14, crack: 'light', hatched: false };
  if (left <= 7 * DAY) return { everyMs: 1200, degrees: 12, crack: 'none', hatched: false };
  if (left <= 28 * DAY) return { everyMs: 3000, degrees: 8, crack: 'none', hatched: false };
  return { everyMs: 6000, degrees: 4, crack: 'none', hatched: false };
}

/** The rock's angle at `now` (degrees): a short double rock at the start of each beat, still between. */
export function eggTilt(w: EggWobble, now: number): number {
  if (!w.everyMs || !w.degrees) return 0;
  const rockMs = Math.min(w.everyMs, 480);
  const t = (((now % w.everyMs) + w.everyMs) % w.everyMs) / rockMs;
  if (t >= 1) return 0;
  return Math.sin(t * Math.PI * 2) * w.degrees * (1 - t);
}

/** The park's day (Eastern) a time falls on, as a day count, to say "today". */
const parkDay = (t: number): number => Math.floor((t - 4 * HOUR) / DAY);

/** What tapping an egg says: the days left, or that it has hatched (visitor-facing). */
export function eggBubble(now: number): string {
  const left = EASTER_HATCH_AT - now;
  if (left <= 0) return parkDay(now) === parkDay(EASTER_HATCH_AT) ? 'Hatched today!' : 'Hatched on Easter 2027';
  const days = Math.ceil(left / DAY);
  return days === 1 ? 'Hatches tomorrow!' : `Hatches in ${days} days`;
}

/** What the page says once when the collection shows the bunny from a hatched egg (visitor-facing). */
export const HATCH_NOTE = 'Your egg hatched! A Rainbow Bunny is waiting in your collection.';

/**
 * What the hatch adds to a collection at `now`: the bunny, for an owl holding the egg once the hatch
 * time has come and that has no bunny yet. Nothing for an owl without the egg, and the egg is never
 * taken away. Owls offline at the hatch get it the next time their collection is read, and a code
 * redeemed after the hatch brings both at once.
 */
export function hatchGrants(owned: readonly string[], now: number): string[] {
  if (now < EASTER_HATCH_AT || !owned.includes(EGG_VARIANT) || owned.includes(BUNNY_VARIANT)) return [];
  return [BUNNY_VARIANT];
}
