/**
 * Prewritten chat (C44, approved 2026-10-22): there is no typing anywhere in the park. An owl says
 * one of these phrases by picking it from the Say wheel, and only the phrase's number travels: the
 * room server relays the number, never words, so nothing a visitor sends can be unsafe. Each phrase
 * is the owner's approved words. The list grows only with the owner's approval: a new phrase is one more
 * line here, under a number never used before (a number keeps its phrase for good, since pages and
 * the room server must agree on it).
 */

/** The Say wheel's six groups of four, in the wheel's order. */
export type PhraseGroup = 'hello' | 'cheers' | 'together' | 'things' | 'feelings' | 'help';

export interface PhraseGroupDef {
  id: PhraseGroup;
  /** Visitor-facing: the group's name on the wheel. */
  name: string;
}

export const PHRASE_GROUPS: readonly PhraseGroupDef[] = [
  { id: 'hello', name: 'Hello' },
  { id: 'cheers', name: 'Thanks and cheers' },
  { id: 'together', name: 'Together' },
  { id: 'things', name: 'Things to do' },
  { id: 'feelings', name: 'Feelings' },
  { id: 'help', name: 'Help and goodbye' },
];

export interface Phrase {
  /** What travels: the phrase's number. */
  n: number;
  group: PhraseGroup;
  /** Visitor-facing: the words in the bubble. */
  text: string;
}

/** Every phrase an owl can say, by group (C44's first set: all 24 for everyone). */
export const PHRASES: readonly Phrase[] = [
  { n: 1, group: 'hello', text: 'Hi!' },
  { n: 2, group: 'hello', text: 'Hoot hoot!' },
  { n: 3, group: 'hello', text: 'Nice to meet you!' },
  { n: 4, group: 'hello', text: 'Good night!' },
  { n: 5, group: 'cheers', text: 'Thank you!' },
  { n: 6, group: 'cheers', text: 'Great job!' },
  { n: 7, group: 'cheers', text: 'Nice owl!' },
  { n: 8, group: 'cheers', text: 'Well played!' },
  { n: 9, group: 'together', text: 'Follow me!' },
  { n: 10, group: 'together', text: "Let's go!" },
  { n: 11, group: 'together', text: 'Wait for me!' },
  { n: 12, group: 'together', text: 'Over here!' },
  { n: 13, group: 'things', text: "Let's light the lanterns!" },
  { n: 14, group: 'things', text: 'Fishing?' },
  { n: 15, group: 'things', text: 'Quiz time!' },
  { n: 16, group: 'things', text: 'Arcade?' },
  { n: 17, group: 'feelings', text: "I'm happy!" },
  { n: 18, group: 'feelings', text: 'So cosy.' },
  { n: 19, group: 'feelings', text: 'Sleepy...' },
  { n: 20, group: 'feelings', text: 'Wow!' },
  { n: 21, group: 'help', text: 'Where to?' },
  { n: 22, group: 'help', text: "I'm lost!" },
  { n: 23, group: 'help', text: 'Help me?' },
  { n: 24, group: 'help', text: 'Bye for now!' },
];

/** One phrase per owl this often; the room server drops quicker ones. */
export const SAY_EVERY_MS = 3_000;
/** A phrase's bubble shows above its owl this long. */
export const BUBBLE_MS = 4_000;
/** The highest number a frame may carry: room for the list to grow, nothing more. */
export const PHRASE_NUMBER_MAX = 999;

/** A phrase by its number; undefined for a number the list does not have. */
export function getPhrase(n: unknown): Phrase | undefined {
  return typeof n === 'number' ? PHRASES.find((p) => p.n === n) : undefined;
}

/** The number of a phrase in the list. */
export function isPhrase(n: unknown): n is number {
  return getPhrase(n) !== undefined;
}

/** A group's phrases, in the wheel's order. */
export function phrasesIn(group: PhraseGroup): Phrase[] {
  return PHRASES.filter((p) => p.group === group);
}
