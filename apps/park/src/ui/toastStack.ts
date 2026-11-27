/**
 * One tip at a time for the same news (OP-458). Offline, the tips at the bottom of the screen stacked:
 * the room's "wandering alone" line, then the same line again from the next room, or the line that an
 * action needs the park, each tip standing over the last for the few seconds it lasts. A tip with words
 * already showing, or a second line that says the park could not connect, now takes the place of the
 * one showing instead of standing over it.
 *
 * Pure, on the words of the tips showing, so it is unit-tested; the HUD asks it before adding a tip.
 */
import { NEST_WORDS } from '@owl-park/shared';
import { ROOM_DOWN, WANDERING_ALONE } from '../game/roomDown';

/** The park's lines for "it could not connect": one of them on the screen says all of them. */
export const OFFLINE_LINES: ReadonlySet<string> = new Set([
  ROOM_DOWN,
  WANDERING_ALONE,
  NEST_WORDS.notAnswering,
  'The park can’t be reached just now. Try again in a moment.',
]);

/**
 * Which tip showing (by its place in `shown`, oldest first) a new tip with `message` takes the place of:
 * the same words, else another could-not-connect line when the new one is one too; -1 for none, when
 * the new tip stands with the others.
 */
export function toastToReplace(shown: readonly string[], message: string, offline: ReadonlySet<string> = OFFLINE_LINES): number {
  const same = shown.indexOf(message);
  if (same >= 0) return same;
  if (!offline.has(message)) return -1;
  return shown.findIndex((words) => offline.has(words));
}
