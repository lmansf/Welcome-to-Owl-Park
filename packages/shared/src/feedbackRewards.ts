/**
 * Thanks for feedback (OP-272, Logan, 2026-11-05): an owl's first note that counts brings a grey
 * mouse (the Mouse pet's Original colourway, whose art is grey), and its 2nd, 3rd and 4th bring
 * feathers; nothing after. One ladder per owl (collector id), climbed only past the turnstiles, since
 * guests keep nothing they win. Shared so the collections object, the local tests and the page agree.
 */

/** The grey mouse: Mouse · Original. */
export const FEEDBACK_MOUSE = 'mouse~0';

/** One rung of the ladder: a collectible, or feathers. */
export type FeedbackRung = { item: string } | { feathers: number };

/**
 * The ladder, first note first (defaults the owner may change). 45 feathers in all, about one common
 * item in the shop (40).
 */
export const FEEDBACK_LADDER: readonly FeedbackRung[] = [{ item: FEEDBACK_MOUSE }, { feathers: 10 }, { feathers: 15 }, { feathers: 20 }];

/** A note climbs the ladder only with at least this many characters (after personal details are taken out). */
export const FEEDBACK_REWARD_MIN_CHARS = 20;

/** Where an owl stands on the ladder: how many rungs it has had, and whether it closed the page's card. */
export interface FeedbackLadderState {
  given: number;
  closed: boolean;
}

/** What the page is told: the ladder, and whether this owl's notes climb it (past the turnstiles). */
export interface FeedbackRewardView extends FeedbackLadderState {
  earns: boolean;
}

/** What one note brought: the rung (1 up), the collectible (or null), feathers paid and the new balance. */
export interface FeedbackReward {
  step: number;
  item: string | null;
  /** The collectible was already in the collection, so its duplicate pay came instead. */
  dup: boolean;
  feathers: number;
  total: number;
}

/** The next rung for an owl that has had `given`, or null at the top. */
export function nextFeedbackRung(given: number): FeedbackRung | null {
  return FEEDBACK_LADDER[Math.max(0, Math.floor(given))] ?? null;
}

/** The same words, whatever the case, spacing and punctuation. */
const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Whether a kept note climbs the ladder: long enough, and not the same words as one of the owl's earlier notes. */
export function noteCounts(text: string, earlier: readonly string[]): boolean {
  if (text.trim().length < FEEDBACK_REWARD_MIN_CHARS) return false;
  const mine = wordsOf(text);
  return !earlier.some((e) => wordsOf(e) === mine);
}

/** Whether the page's card (by the feedback bug) shows: the owl earns, has not had the mouse, and has not closed it. */
export function feedbackCardShown(view: FeedbackRewardView | null): boolean {
  return view !== null && view.earns && view.given === 0 && !view.closed;
}
