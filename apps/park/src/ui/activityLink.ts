/**
 * Arriving by an activity link (OP-392, Dec 1 plan D8): the park opened at `/?go=<activity>` (the
 * share page's Play button, apps/edge/src/activityPage.ts), behind the `golink` flag.
 *
 * Nothing is skipped on the way in. The address names no room, so the visitor gets the home screen,
 * the line on a busy night and Play like any visit, and Play lands the owl where it always does
 * (its nest, or the Treetop Commons for Play free now), outside the turnstiles. There it is told to
 * walk through them. The turnstiles then do what they always do: scan a ticket, or let a spectator
 * walk on, or turn the owl back, as the gate says. Only once the owl is through (the park's travel
 * state says so) does this fly it on to the place, with the Menu map's own travel, which the room
 * server turns away for an owl it has not seen come through the gate. A busy owl (the turnstiles'
 * welcome still playing, a game under way) is asked again a little later, and after a while it is
 * told to use the map instead.
 */
import { ACTIVITY_GO_PARAM, ACTIVITY_SHARE_WORDS as W, activityPlace, shareActivity, type ShareActivity, type TravelRefusal, type TravelState } from '@owl-park/shared';
import { flagOn } from '../flags';

/** The activity this page's address leads to, with the flag on; null otherwise (and always while the flag is off). */
export function linkedActivity(search: string): ShareActivity | null {
  if (!flagOn('golink', search)) return null;
  return shareActivity(new URLSearchParams(search).get(ACTIVITY_GO_PARAM));
}

export interface ActivityLinkDeps {
  /** The map the owl walks: 3 the new map, 1 or 2 today's park and the tree. */
  walking(): number;
  /** The map's travel, as the Menu's map does it: null on its way, otherwise why not ('busy' with no room up). */
  travel(place: string): TravelRefusal | null;
  toast(message: string, ms: number): void;
  later(fn: () => void, ms: number): void;
}

/** How long after the owl is through (or busy) the link asks travel again. */
export const ACTIVITY_LINK_RETRY_MS = 1_500;
/** How many times a busy owl is asked before it is told to use the map. */
export const ACTIVITY_LINK_TRIES = 20;
const TOAST_MS = 5_000;

export interface ActivityLink {
  readonly activity: ShareActivity;
  /** The park's travel state changed (a room joined, or the room server's word on it). */
  onTravel(state: TravelState): void;
  /** Still to take the owl there. */
  pending(): boolean;
}

export function activityLink(activity: ShareActivity, deps: ActivityLinkDeps): ActivityLink {
  let done = false;
  let waiting = false;
  let toldGate = false;
  let tries = 0;
  const finish = (message?: string) => {
    done = true;
    if (message) deps.toast(message, TOAST_MS);
  };
  const soon = () => {
    waiting = true;
    deps.later(attempt, ACTIVITY_LINK_RETRY_MS);
  };
  function attempt(): void {
    waiting = false;
    if (done) return;
    const place = activityPlace(activity, deps.walking());
    if (!place) return finish(W.missing(activity));
    const why = deps.travel(place);
    if (why === null) return finish(W.going(activity));
    if (why === 'here') return finish();
    if (why === 'not-yet') return finish(W.missing(activity));
    // Not through the gate after all: wait for the next word on it, as the turnstiles give it.
    if (why === 'gate') return;
    if (++tries >= ACTIVITY_LINK_TRIES) return finish(W.later(activity));
    soon();
  }
  return {
    activity,
    onTravel(state) {
      if (done || waiting) return;
      if (!state.gate) {
        if (!toldGate) {
          toldGate = true;
          deps.toast(W.gateFirst(activity), TOAST_MS);
        }
        return;
      }
      // Through the turnstiles: a moment for the room to settle (the welcome plays), then on.
      soon();
    },
    pending: () => !done,
  };
}
