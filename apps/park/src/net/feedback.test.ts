import { describe, expect, it } from 'vitest';
import type { FeedbackDraft } from '@owl-park/shared';
import { KEPT_FEEDBACK_KEY, sendFeedback } from './feedback';
import type { ParkTransport } from './transport';

class MemoryStorage {
  readonly map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

const draft: FeedbackDraft = { kind: 'bug', text: 'The fishing line vanished', room: 'grove', screen: '390x844' };
const NOW = Date.UTC(2026, 9, 21, 16, 0, 0);

/** A transport without a server, and one whose server answers with `reply`. */
const serverless = { kind: 'local' } as ParkTransport;
const answering = (reply: () => Response | Promise<Response>) => ({ kind: 'edge', feedback: async () => reply() }) as unknown as ParkTransport;

describe('sending feedback', () => {
  it("goes to the park's server when there is one, which may ask the visitor to wait", async () => {
    expect(await sendFeedback(answering(() => Response.json({ ok: true, id: 7 })), draft, null)).toBe('sent');
    expect(await sendFeedback(answering(() => Response.json({ ok: false, reason: 'busy' }, { status: 429 })), draft, null)).toBe('busy');
    expect(await sendFeedback(answering(() => Response.json({ ok: false, reason: 'full' }, { status: 429 })), draft, null)).toBe('full');
    expect(await sendFeedback(answering(() => Response.json({ error: 'bad request' }, { status: 400 })), draft, null)).toBe('error');
    expect(
      await sendFeedback(
        answering(() => Promise.reject(new TypeError('offline'))),
        draft,
        null,
      ),
    ).toBe('error');
  });

  it('stays in this browser without a server, the newest fifty notes', async () => {
    const storage = new MemoryStorage();
    expect(await sendFeedback(serverless, draft, storage, NOW)).toBe('kept');
    expect(JSON.parse(storage.getItem(KEPT_FEEDBACK_KEY)!)).toEqual([{ at: NOW, ...draft }]);
    for (let i = 1; i <= 60; i++) await sendFeedback(serverless, { ...draft, text: `note ${i}` }, storage, NOW + i);
    const kept = JSON.parse(storage.getItem(KEPT_FEEDBACK_KEY)!) as FeedbackDraft[];
    expect(kept).toHaveLength(50);
    expect(kept.at(-1)?.text).toBe('note 60');
    storage.setItem(KEPT_FEEDBACK_KEY, 'not json');
    expect(await sendFeedback(serverless, draft, storage, NOW)).toBe('kept');
    expect(await sendFeedback(serverless, draft, null, NOW)).toBe('error');
  });
});
