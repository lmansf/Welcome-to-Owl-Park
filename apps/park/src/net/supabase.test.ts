import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerState } from '@owl-park/shared';

type Handler = (payload: any) => void;

/** A minimal stand-in for a Supabase RealtimeChannel that records what the transport does. */
class FakeChannel {
  handlers: Array<{ type: string; filter: { event: string }; fn: Handler }> = [];
  tracked: unknown[] = [];
  sent: unknown[] = [];
  untracked = 0;
  presence: Record<string, unknown[]> = {};
  on(type: string, filter: { event: string }, fn: Handler) {
    this.handlers.push({ type, filter, fn });
    return this;
  }
  subscribe(cb: (status: string) => void) {
    queueMicrotask(() => cb('SUBSCRIBED'));
    return this;
  }
  async track(state: unknown) {
    this.tracked.push(state);
    return 'ok';
  }
  async untrack() {
    this.untracked += 1;
    return 'ok';
  }
  async send(msg: unknown) {
    this.sent.push(msg);
    return 'ok';
  }
  presenceState() {
    return this.presence;
  }
  fire(type: string, event: string, payload: unknown) {
    for (const h of this.handlers) if (h.type === type && h.filter.event === event) h.fn(payload);
  }
}

const channels: FakeChannel[] = [];
let removed = 0;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    channel: () => {
      const c = new FakeChannel();
      channels.push(c);
      return c;
    },
    removeChannel: async () => {
      removed += 1;
    },
  }),
}));

const { SupabaseTransport } = await import('./supabase');

const me: PlayerState = { id: 'me', look: { body: '#111111', belly: '#222222', accent: '#333333' }, pos: { x: 1, y: 2 }, walk: null, v: 1 };
const other: PlayerState = { ...me, id: 'other', pos: { x: 9, y: 9 } };

describe('SupabaseTransport', () => {
  const handlers = { onPeerState: vi.fn(), onPeerMove: vi.fn(), onPeerLeave: vi.fn(), onStatus: vi.fn() };
  beforeEach(() => {
    channels.length = 0;
    removed = 0;
    vi.useFakeTimers();
    for (const h of Object.values(handlers)) h.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('tracks itself once subscribed and reports online', async () => {
    const t = new SupabaseTransport('https://example.supabase.co', 'anon');
    await t.join('hub', me, handlers);
    const ch = channels[0]!;
    expect(handlers.onStatus).toHaveBeenCalledWith('connecting');
    expect(handlers.onStatus).toHaveBeenLastCalledWith('online');
    expect(ch.tracked).toEqual([me]);
  });

  it('turns presence and broadcast events into peer callbacks and ignores itself', async () => {
    const t = new SupabaseTransport('https://example.supabase.co', 'anon');
    await t.join('hub', me, handlers);
    const ch = channels[0]!;
    ch.presence = { me: [me], other: [other] };
    ch.fire('presence', 'sync', {});
    expect(handlers.onPeerState).toHaveBeenCalledTimes(1);
    expect(handlers.onPeerState).toHaveBeenCalledWith(other);

    const walk = { from: { x: 0, y: 0 }, to: { x: 5, y: 5 }, startedAt: 1 };
    ch.fire('broadcast', 'park', { payload: { t: 'move', id: 'other', walk } });
    ch.fire('broadcast', 'park', { payload: { t: 'move', id: 'me', walk } });
    expect(handlers.onPeerMove).toHaveBeenCalledTimes(1);
    expect(handlers.onPeerMove).toHaveBeenCalledWith('other', walk);

    ch.fire('broadcast', 'park', { payload: { nonsense: true } });
    ch.presence = { me: [me] };
    ch.fire('presence', 'sync', {});
    expect(handlers.onPeerLeave).toHaveBeenCalledWith('other');
    ch.fire('presence', 'leave', { key: 'someone', leftPresences: [] });
    expect(handlers.onPeerLeave).toHaveBeenLastCalledWith('someone');
  });

  it('broadcasts sends and throttles presence re-tracking', async () => {
    const t = new SupabaseTransport('https://example.supabase.co', 'anon');
    const conn = await t.join('hub', me, handlers);
    const ch = channels[0]!;
    conn.send({ t: 'bye', id: 'me' });
    expect(ch.sent).toEqual([{ type: 'broadcast', event: 'park', payload: { t: 'bye', id: 'me' } }]);

    const s1 = { ...me, pos: { x: 10, y: 10 } };
    const s2 = { ...me, pos: { x: 20, y: 20 } };
    conn.track(s1);
    conn.track(s2);
    expect(ch.tracked).toHaveLength(1); // initial only; the rest is throttled
    await vi.advanceTimersByTimeAsync(3100);
    expect(ch.tracked).toHaveLength(2);
    expect(ch.tracked[1]).toEqual(s2); // latest state wins

    await conn.leave();
    expect(ch.untracked).toBe(1);
    expect(removed).toBe(1);
  });
});
