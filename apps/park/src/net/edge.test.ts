import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOSE, RESTART_NOTICE, type PlayerState } from '@owl-park/shared';
import { EdgeTransport } from './edge';
import type { RoomHandlers } from './transport';

// The park's nightly restart (OP-181) as the page hears it: the room's words, then its close code,
// and no reconnect; the next Play starts on a fresh pass, so the owl goes through the turnstiles again.

class FakeSocket {
  static readonly OPEN = 1;
  static made: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.made.push(this);
  }
  send(text: string) {
    this.sent.push(text);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  hear(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
  shut(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const storage = () => {
  const kept = new Map<string, string>();
  return { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
};

/** What the page asked of the park: each path, in order. */
let asked: string[] = [];
let passes = 0;

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.made = [];
  asked = [];
  passes = 0;
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('sessionStorage', storage());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      asked.push(path);
      if (path === '/api/pass') return Response.json({ pass: `pass-${++passes}`, exp: Math.floor(Date.now() / 1000) + 43_200, gate: 'ticket', adm: false });
      if (path === '/api/tickets/scan') return Response.json({ ok: true, id: 'OWL-AAAA-BBBB', kind: 'day', started: true, validUntil: null, pass: 'admitted-pass', exp: Math.floor(Date.now() / 1000) + 43_200 });
      return Response.json({});
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const SELF = { id: 'local', look: { body: '#3E6B48', belly: '#F6F1E3', accent: '#C9A227' }, pos: { x: 100, y: 100 }, walk: null, v: 1 } as unknown as PlayerState;

function listening(): RoomHandlers & { statuses: string[] } {
  const statuses: string[] = [];
  return {
    statuses,
    onPeerState: vi.fn(),
    onPeerMove: vi.fn(),
    onPeerLeave: vi.fn(),
    onStatus: (s) => void statuses.push(s),
    onRestartNotice: vi.fn(),
    onRestart: vi.fn(),
    onQueued: vi.fn(),
  };
}

describe('the park’s nightly restart on the page (OP-181)', () => {
  it('shows the room’s words, then goes home on the restart code and does not reconnect', async () => {
    const park = new EdgeTransport('https://park.example');
    const handlers = listening();
    await park.join('hub', SELF, handlers);
    const socket = FakeSocket.made[0]!;
    socket.open();
    socket.hear({ t: 'restart', words: RESTART_NOTICE, ms: 10_000 });
    expect(handlers.onRestartNotice).toHaveBeenCalledWith(RESTART_NOTICE);
    expect(handlers.onRestart).not.toHaveBeenCalled();
    socket.shut(CLOSE.RESTART);
    expect(handlers.onRestart).toHaveBeenCalledTimes(1);
    expect(handlers.statuses.at(-1)).toBe('offline');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.made).toHaveLength(1);
    expect(handlers.onQueued).not.toHaveBeenCalled();
  });

  it('lets a connection that dropped reconnect as before (so the test above is not vacuous)', async () => {
    const park = new EdgeTransport('https://park.example');
    const handlers = listening();
    await park.join('hub', SELF, handlers);
    FakeSocket.made[0]!.open();
    FakeSocket.made[0]!.shut(1006);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(FakeSocket.made).toHaveLength(2);
    expect(handlers.onRestart).not.toHaveBeenCalled();
  });

  it('starts the next Play on a fresh guest pass, with no ticket scanned on its own: the turnstiles scan it again', async () => {
    const park = new EdgeTransport('https://park.example');
    // Through the turnstiles before the restart: the admitted pass, and the ticket that gave it.
    expect(await park.tickets.scan()).toMatchObject({ ok: true });
    const handlers = listening();
    await park.join('hub', SELF, handlers);
    expect(FakeSocket.made[0]!.url).toContain('pass=admitted-pass');
    FakeSocket.made[0]!.open();
    FakeSocket.made[0]!.shut(CLOSE.RESTART);
    // Play: into the owl's own nest, outside the turnstiles.
    asked = [];
    await park.join('nest-abc', SELF, listening());
    expect(FakeSocket.made[1]!.url).toContain('pass=pass-2');
    expect(asked).toEqual(['/api/pass']);
  });
});
