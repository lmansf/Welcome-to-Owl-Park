import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerState } from '@owl-park/shared';
import { LocalTransport } from './local';

/** In-memory BroadcastChannel: every instance with the same name hears every other instance. */
class FakeBroadcastChannel {
  static all: FakeBroadcastChannel[] = [];
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) {
    FakeBroadcastChannel.all.push(this);
  }
  postMessage(data: unknown) {
    for (const c of FakeBroadcastChannel.all) if (c !== this && c.name === this.name) c.onmessage?.({ data });
  }
  close() {
    FakeBroadcastChannel.all = FakeBroadcastChannel.all.filter((c) => c !== this);
  }
}

const state = (id: string): PlayerState => ({ id, look: { body: '#111111', belly: '#222222', accent: '#333333' }, pos: { x: 0, y: 0 }, walk: null, v: 1 });
const mkHandlers = () => ({ onPeerState: vi.fn(), onPeerMove: vi.fn(), onPeerLeave: vi.fn(), onStatus: vi.fn() });

describe('LocalTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeBroadcastChannel.all = [];
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('introduces peers to each other and relays moves', async () => {
    const t = new LocalTransport();
    const ha = mkHandlers();
    const hb = mkHandlers();
    const a = await t.join('hub', state('a'), ha);
    await t.join('hub', state('b'), hb);
    // b said hello; a replied with its state.
    expect(ha.onPeerState).toHaveBeenCalledWith(state('b'));
    expect(hb.onPeerState).toHaveBeenCalledWith(state('a'));
    expect(ha.onStatus).toHaveBeenCalledWith('online');

    const walk = { from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, startedAt: 0 };
    a.send({ t: 'move', id: 'a', walk });
    expect(hb.onPeerMove).toHaveBeenCalledWith('a', walk);
    expect(ha.onPeerMove).not.toHaveBeenCalled();
  });

  it('does not hear other rooms', async () => {
    const t = new LocalTransport();
    const ha = mkHandlers();
    const hb = mkHandlers();
    await t.join('hub', state('a'), ha);
    await t.join('grove', state('b'), hb);
    expect(ha.onPeerState).not.toHaveBeenCalled();
    expect(hb.onPeerState).not.toHaveBeenCalled();
  });

  it('announces leaving and expires silent peers', async () => {
    const t = new LocalTransport();
    const ha = mkHandlers();
    const hb = mkHandlers();
    const a = await t.join('hub', state('a'), ha);
    const b = await t.join('hub', state('b'), hb);
    await b.leave();
    expect(ha.onPeerLeave).toHaveBeenCalledWith('b');

    const hc = mkHandlers();
    const c = await t.join('hub', state('c'), hc);
    // c's channel goes silent (simulate a crashed tab): a stops hearing heartbeats.
    const cChannel = FakeBroadcastChannel.all.find((ch) => ch.onmessage && ch !== FakeBroadcastChannel.all[0]);
    void c;
    if (cChannel) cChannel.postMessage = () => {};
    await vi.advanceTimersByTimeAsync(20_000);
    expect(ha.onPeerLeave).toHaveBeenCalledWith('c');
    await a.leave();
  });
});
