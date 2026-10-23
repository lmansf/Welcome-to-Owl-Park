import type { FeedbackDraft } from '@owl-park/shared';
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

/**
 * Sends a visitor's feedback. The room server keeps it for the park's keepers, who read it on
 * /admin/feedback; a park without a server keeps the newest few notes in this browser instead.
 */
export async function sendFeedback(transport: ParkTransport, draft: FeedbackDraft, storage: Store | null, now = Date.now()): Promise<FeedbackOutcome> {
  if (!transport.feedback) return keep(draft, storage, now);
  try {
    const res = await transport.feedback(draft);
    if (res.ok) return 'sent';
    if (res.status !== 429) return 'error';
    const body = (await res.json()) as { reason?: unknown };
    return body.reason === 'busy' ? 'busy' : 'full';
  } catch {
    return 'error';
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
