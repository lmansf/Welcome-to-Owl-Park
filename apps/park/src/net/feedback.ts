import type { FeedbackDraft, FeedbackReward, FeedbackRewardView } from '@owl-park/shared';
import type { ParkTransport } from './transport';

/**
 * What became of a visitor's feedback: `sent` to the park's keepers, `kept` in this browser (a park
 * without a server), refused as `busy` (one moments ago) or `full` (enough today), or an `error`.
 */
export type FeedbackOutcome = 'sent' | 'kept' | 'busy' | 'full' | 'error';

/** Where a park without a server keeps its visitors' feedback (development, the browser tests). */
export const KEPT_FEEDBACK_KEY = 'owl-park:feedback';
const KEEP_AT_MOST = 50;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** What became of a note, and what it brought from the thanks ladder (OP-272), when it climbed it. */
export interface FeedbackSent {
  outcome: FeedbackOutcome;
  reward?: FeedbackReward;
}

/**
 * Sends a visitor's feedback. The room server keeps it for the park's keepers, who read it on
 * /admin/feedback; a park without a server keeps the newest few notes in this browser instead.
 */
export async function sendFeedback(transport: ParkTransport, draft: FeedbackDraft, storage: Store | null, now = Date.now()): Promise<FeedbackOutcome> {
  return (await sendFeedbackNote(transport, draft, storage, now)).outcome;
}

/** As sendFeedback, with what the note brought (OP-272). */
export async function sendFeedbackNote(transport: ParkTransport, draft: FeedbackDraft, storage: Store | null, now = Date.now()): Promise<FeedbackSent> {
  if (!transport.feedback) return { outcome: keep(draft, storage, now) };
  try {
    const res = await transport.feedback(draft);
    if (res.ok) {
      const reward = rewardOf(((await res.json().catch(() => null)) as { reward?: unknown } | null)?.reward);
      return reward ? { outcome: 'sent', reward } : { outcome: 'sent' };
    }
    if (res.status !== 429) return { outcome: 'error' };
    const body = (await res.json()) as { reason?: unknown };
    return { outcome: body.reason === 'busy' ? 'busy' : 'full' };
  } catch {
    return { outcome: 'error' };
  }
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** A reward as the server sent it, checked; null for anything else. */
function rewardOf(v: unknown): FeedbackReward | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isCount(o['step']) || !isCount(o['feathers']) || !isCount(o['total'])) return null;
  if (o['item'] !== null && typeof o['item'] !== 'string') return null;
  return { step: o['step'], item: o['item'], dup: o['dup'] === true, feathers: o['feathers'], total: o['total'] };
}

/** The ladder's state as the server sent it; null without a server, or when it could not be read. */
function viewOf(v: unknown): FeedbackRewardView | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isCount(o['given']) || typeof o['earns'] !== 'boolean' || typeof o['closed'] !== 'boolean') return null;
  return { earns: o['earns'], given: o['given'], closed: o['closed'] };
}

/** Where this owl stands on the thanks ladder (OP-272); null without a server or on any failure. */
export async function feedbackRewards(transport: ParkTransport): Promise<FeedbackRewardView | null> {
  if (!transport.feedbackRewards) return null;
  try {
    const res = await transport.feedbackRewards();
    return res.ok ? viewOf(await res.json()) : null;
  } catch {
    return null;
  }
}

/** Close the card about the grey mouse for this owl; the ladder as it stands after, or null on a failure. */
export async function closeFeedbackCard(transport: ParkTransport): Promise<FeedbackRewardView | null> {
  if (!transport.closeFeedbackCard) return null;
  try {
    const res = await transport.closeFeedbackCard();
    return res.ok ? viewOf(await res.json()) : null;
  } catch {
    return null;
  }
}

/** The notes this browser already keeps; an unreadable list starts afresh. */
function kept(storage: Store): unknown[] {
  try {
    const v = JSON.parse(storage.getItem(KEPT_FEEDBACK_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function keep(draft: FeedbackDraft, storage: Store | null, now: number): FeedbackOutcome {
  if (!storage) return 'error';
  try {
    storage.setItem(KEPT_FEEDBACK_KEY, JSON.stringify([...kept(storage), { at: now, ...draft }].slice(-KEEP_AT_MOST)));
    return 'kept';
  } catch {
    return 'error'; // private mode, or the browser's storage is full
  }
}
