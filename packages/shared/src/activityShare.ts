/**
 * Shareable activity links (OP-392, Dec 1 plan D8): one stable address per place to play,
 * `/play/<activity>` (say /play/arcade). It opens on any phone, signed in or not, and shows the place's
 * name, a line about it and a way into the park, with the park's share picture for link previews. It
 * holds nothing personal. The room server draws the page (apps/edge/src/activityPage.ts).
 *
 * The page's Play button opens the park at `/?go=<activity>`. That address does not skip anything:
 * the visitor comes in the way every visit does (the home screen, the line on a busy night, Play,
 * then the turnstiles, where a ticket is scanned or a spectator walks on as the gate says). Only once
 * the owl has walked through the turnstiles does the park fly it on to the place, by the map's own
 * travel, which the room server already turns away for an owl that has not come through the gate.
 * While the park's `golink` flag is off, `go` does nothing.
 */
import { ARCADE_NAME } from './arcade';

export const ACTIVITY_SHARE_PREFIX = '/play/';
/** The park's query parameter that names the place a link leads to. */
export const ACTIVITY_GO_PARAM = 'go';

export interface ShareActivity {
  /** The address's last part: lower case letters and dashes, never changed once shared. */
  readonly id: string;
  /** The page's heading. */
  readonly title: string;
  /** The place inside a sentence: "the arcade". */
  readonly to: string;
  /** One line about what is there. */
  readonly line: string;
  /** The map's place travel goes to: on the new map (3), and on today's park and the tree (1, 2); null where that map has none. */
  readonly place: { readonly newMap: string | null; readonly oldMap: string | null };
}

export const SHARE_ACTIVITIES: readonly ShareActivity[] = [
  { id: 'great-hollow', title: 'The Great Hollow', to: 'the Great Hollow', line: 'The moonlit heart of the great tree, where every way to play begins.', place: { newMap: 'm3-hall', oldMap: null } },
  { id: 'arcade', title: `${ARCADE_NAME}, the arcade`, to: 'the arcade', line: 'Skill games in the arcade under the great tree.', place: { newMap: 'arcade', oldMap: 'arcade' } },
  // The Party Grove's games, in the Great Hollow since Nov 21 (folded in); the id stays, for links already shared.
  { id: 'party-grove', title: 'Lanterns and the quiz', to: 'the lanterns and the quiz in the Great Hollow', line: 'Lanterns to light together and a quiz on the answer plates.', place: { newMap: 'm3-hall', oldMap: null } },
  { id: 'glass-realm', title: 'The glass realm', to: 'the glass realm', line: 'The stained-glass climb, one window at a time.', place: { newMap: 'glass', oldMap: null } },
  { id: 'ink-garden', title: 'The ink garden', to: 'the ink garden', line: 'Brushstroke Bridges, the ink-wash course.', place: { newMap: 'ink', oldMap: null } },
  { id: 'treehouse-clearing', title: 'The treehouse clearing', to: 'the treehouse clearing', line: 'Fishing from the jetty.', place: { newMap: 'grove', oldMap: 'grove' } },
  { id: 'neon-street', title: 'The neon street', to: 'the neon street', line: 'The robot owl’s copy game.', place: { newMap: 'market', oldMap: 'market' } },
];

/** The activity with this id, or null. */
export function shareActivity(id: string | null | undefined): ShareActivity | null {
  return SHARE_ACTIVITIES.find((a) => a.id === id) ?? null;
}

/** The share address's path for an activity. */
export function activitySharePath(id: string): string {
  return `${ACTIVITY_SHARE_PREFIX}${id}`;
}

/** The activity a share path names, or null for any other path (a trailing slash is fine). */
export function activityOfSharePath(path: string): ShareActivity | null {
  if (!path.startsWith(ACTIVITY_SHARE_PREFIX)) return null;
  return shareActivity(path.slice(ACTIVITY_SHARE_PREFIX.length).replace(/\/$/, ''));
}

/** The map's place an activity travels to for an owl walking `walking` (3 the new map), or null where that map has none. */
export function activityPlace(a: ShareActivity, walking: number): string | null {
  return walking === 3 ? a.place.newMap : a.place.oldMap;
}

/** The park's address for an activity: in through the usual way, then on to it. `keepFlag` carries the park's `golink` flag. */
export function activityParkPath(a: ShareActivity, keepFlag = false): string {
  return `/?${ACTIVITY_GO_PARAM}=${a.id}${keepFlag ? '&golink=1' : ''}`;
}

/** The activity link's words: short, plain, for a ten year old. */
export const ACTIVITY_SHARE_WORDS = {
  pageTitle: (a: ShareActivity) => `${a.title} | Owl Park`,
  ask: 'Come play in Owl Park',
  play: (a: ShareActivity) => `Play in ${a.to}`,
  way: 'You come in through the turnstiles like every owl, then fly straight there.',
  free: 'Free to play in your browser. No download.',
  /** On the home screen, over Play. */
  home: (a: ShareActivity) => `Your link goes to ${a.to}, past the turnstiles.`,
  /** In the park, before the turnstiles. */
  gateFirst: (a: ShareActivity) => `Walk through the turnstiles, then you fly on to ${a.to}.`,
  going: (a: ShareActivity) => `Off to ${a.to}!`,
  missing: (a: ShareActivity) => `${a.title} is not on this map yet. The Menu’s map shows every place.`,
  later: (a: ShareActivity) => `Open the Menu’s map to fly to ${a.to}.`,
} as const;
