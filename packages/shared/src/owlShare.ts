/**
 * A shareable quiz result (OP-392, Dec 1 plan D8): one stable address per kind of owl the quiz can give,
 * `/owl/<nature>` (say /owl/gentle for the barn owl). It opens on any phone, signed in or not, and shows
 * that owl's name, a true owl fact and a way into the park, with the park's share picture for link
 * previews. It holds nothing personal: no owl name, no colours, nothing a player typed (OP-093), only
 * which of the five owls it is. The room server draws the page (apps/edge/src/owlPage.ts); the quiz's
 * Share button (behind the park's `share` flag) hands out its address.
 */
import { NATURES, type Nature, type NatureDef } from './whichOwlBank';

export const OWL_SHARE_PREFIX = '/owl/';

/** The share address's path for a kind of owl. */
export function owlSharePath(n: Nature): string {
  return `${OWL_SHARE_PREFIX}${n}`;
}

/** The kind of owl a share path names, or null for any other path (a trailing slash is fine). */
export function natureOfSharePath(path: string): NatureDef | null {
  if (!path.startsWith(OWL_SHARE_PREFIX)) return null;
  const id = path.slice(OWL_SHARE_PREFIX.length).replace(/\/$/, '');
  return NATURES.find((d) => d.id === id) ?? null;
}

/** "a barn owl", "an owl of the tree". */
export function owlWithArticle(def: NatureDef): string {
  const name = def.title.toLowerCase();
  return `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
}

/** The shared result's words: short, plain, for a ten year old, and true of whoever opens the link. */
export const OWL_SHARE_WORDS = {
  /** The quiz reveal's button. */
  share: 'Share my owl',
  copied: 'Link copied',
  /** What goes with the link when the device's share sheet sends it. */
  text: (def: NatureDef) => `I'm ${owlWithArticle(def)} in Owl Park! Which owl are you?`,
  pageTitle: (def: NatureDef) => `${def.title} | Which owl are you? | Owl Park`,
  ask: 'Which owl are you?',
  play: 'Find your owl',
  free: 'Free to play in your browser. No download.',
} as const;
