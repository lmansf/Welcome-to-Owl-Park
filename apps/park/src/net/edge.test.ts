import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOSE, EDGE_PROTOCOL_VERSION, RESTART_NOTICE, type PlayerState, type Vec2, type Walk } from '@owl-park/shared';
import { EdgeTransport } from './edge';
import { EMOTE_SEND_EVERY_MS } from './budget';
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
    onSetup: vi.fn(),
    onQueued: vi.fn(),
  };
}

describe('whether the park is closed, as the home screen asks (OP-233)', () => {
  const answering = (answer: () => Response | Promise<Response>) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        asked.push(new URL(url).pathname);
        expect(init?.cache).toBeUndefined(); // the browser may keep it as long as the Worker says
        return answer();
      }),
    );

  it('reads the park’s answer, open or closed with its words and time', async () => {
    const park = new EdgeTransport('https://park.example/');
    answering(() => Response.json({ closed: true, words: 'Back soon', reopenAt: Date.UTC(2026, 10, 3) }));
    expect(await park.closed()).toEqual({ closed: true, words: 'Back soon', reopenAt: Date.UTC(2026, 10, 3) });
    answering(() => Response.json({ closed: false, words: null, reopenAt: null }));
    expect(await park.closed()).toEqual({ closed: false, words: null, reopenAt: null });
    expect(asked).toEqual(['/api/closed', '/api/closed']);
  });

  it('is no answer when the park is out of reach, says too many, or sends something else', async () => {
    const park = new EdgeTransport('https://park.example');
    answering(() => Response.json({ error: 'too-many' }, { status: 429 }));
    expect(await park.closed()).toBeNull();
    answering(() => Promise.reject(new TypeError('offline')));
    expect(await park.closed()).toBeNull();
    answering(() => new Response('<html>', { status: 200 }));
    expect(await park.closed()).toBeNull();
  });
});

describe('closed for setup on the page (OP-205)', () => {
  it('goes home with the closed card’s words on the setup code, and does not reconnect', async () => {
    const park = new EdgeTransport('https://park.example');
    const handlers = listening();
    await park.join('hub', SELF, handlers);
    const socket = FakeSocket.made[0]!;
    socket.open();
    socket.hear({ t: 'closed', room: 'hub', why: 'setup', sign: 'Back at 5:15' });
    expect(handlers.onSetup).not.toHaveBeenCalled();
    socket.shut(CLOSE.SETUP);
    expect(handlers.onSetup).toHaveBeenCalledWith('Back at 5:15');
    expect(handlers.statuses.at(-1)).toBe('offline');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.made).toHaveLength(1);
    expect(handlers.onRestart).not.toHaveBeenCalled();
  });
});

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

describe('emotes on the page (OP-210)', () => {
  const emotesSent = (socket: FakeSocket) => socket.sent.map((t) => JSON.parse(t) as { t: string; e?: string }).filter((f) => f.t === 'emote');

  it('sends one emote, drops the ones that come too soon after it, and sends the next once the spacing has passed', async () => {
    const park = new EdgeTransport('https://park.example');
    const conn = await park.join('hub', SELF, listening());
    const socket = FakeSocket.made[0]!;
    socket.open();
    // A child mashing the number keys: eight a second for three seconds.
    for (let i = 0; i < 24; i++) {
      conn.send({ t: 'emote', id: 'local', e: i % 2 ? 'hoot' : 'flap' });
      await vi.advanceTimersByTimeAsync(125);
    }
    const sent = emotesSent(socket);
    expect(sent.length).toBeGreaterThanOrEqual(2);
    expect(sent.length).toBeLessThanOrEqual(Math.ceil(3_000 / EMOTE_SEND_EVERY_MS));
    expect(sent[0]).toEqual({ t: 'emote', e: 'flap' }); // the first press goes at once
    // Nothing dropped is sent later: once the keys stop, no more emotes go.
    const before = socket.sent.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(socket.sent.slice(before).filter((t) => (JSON.parse(t) as { t: string }).t === 'emote')).toHaveLength(0);
  });
});

describe('a press while the room is out of reach (OP-406, OP-407)', () => {
  it('is answered at once as offline once the socket has dropped, not after the reply time in silence', async () => {
    const park = new EdgeTransport('https://park.example');
    const conn = await park.join('grove', SELF, listening());
    // The socket closes as it opens, as on a network that lets pages through and not sockets.
    FakeSocket.made[0]!.shut(1006);
    let answer: unknown = null;
    void conn.acts!.cast().then((a) => (answer = a));
    await vi.advanceTimersByTimeAsync(50);
    expect(answer).toEqual({ ok: false, reason: 'offline' });
  });

  it('still waits for the welcome while the socket is opening again (so the test above is not vacuous)', async () => {
    const park = new EdgeTransport('https://park.example');
    const conn = await park.join('grove', SELF, listening());
    FakeSocket.made[0]!.shut(1006);
    await vi.advanceTimersByTimeAsync(10_000);
    const again = FakeSocket.made.at(-1)!;
    again.open();
    let answer: unknown = null;
    void conn.acts!.cast().then((a) => (answer = a));
    await vi.advanceTimersByTimeAsync(50);
    expect(answer).toBeNull();
  });
});

describe('feather tag knows this owl by the room’s id for it (OP-403)', () => {
  it('is no one before the welcome, and the welcome’s id after it, not the id the page made', async () => {
    const park = new EdgeTransport('https://park.example');
    const conn = await park.join('hub', SELF, listening());
    const socket = FakeSocket.made[0]!;
    expect(conn.tag?.self()).toBeNull();
    socket.open();
    socket.hear({ t: 'welcome', v: 1, id: 'room-owl-7', room: 'hub', now: Date.now(), cap: 80, you: { pos: { x: 100, y: 100 } }, owls: [], counts: {} });
    expect(conn.tag?.self()).toBe('room-owl-7');
    expect(conn.tag?.self()).not.toBe(SELF.id);
  });
});

describe('a glide lane’s carry on the page (OP-287)', () => {
  type Sent = { t: string; to?: Vec2; seq?: number; lane?: true };
  const sent = (socket: FakeSocket) => socket.sent.map((t) => JSON.parse(t) as Sent).filter((f) => f.t === 'move' || f.t === 'dash');
  const WEST = { x: 300, y: 880 };
  const EAST = { x: 4300, y: 880 };
  const LOOK = SELF.look;

  /** A page the arcade has let in: its link, its socket, and what its scene is told. */
  const inArcade = async (owls: unknown[] = []) => {
    const park = new EdgeTransport('https://park.example');
    const heard = { ...listening(), onSelfWalk: vi.fn<(walk: Walk) => void>() };
    const conn = await park.join('arcade', SELF, heard);
    const socket = FakeSocket.made[0]!;
    socket.open();
    socket.hear({ t: 'welcome', v: EDGE_PROTOCOL_VERSION, id: 'me', room: 'arcade', now: Date.now(), cap: 80, you: { pos: WEST }, owls, counts: {} });
    expect(heard.statuses.at(-1)).toBe('online');
    return { conn, socket, heard };
  };
  /** The scene's own walk as it sends it: a lane's carry says so. */
  const walk = (to: Vec2, pace: Pick<Walk, 'dash' | 'lane'> = {}) => ({ t: 'move' as const, id: 'local', walk: { from: WEST, to, startedAt: Date.now(), ...pace } });
  /** The room's echo of the page's newest move. */
  const echo = (socket: FakeSocket, to: Vec2, pace: Pick<Walk, 'dash' | 'lane'> = {}) => socket.hear({ t: 'move', id: 'me', from: WEST, to, at: Date.now(), seq: sent(socket).at(-1)!.seq, ...pace });

  it('asks the room for the lane’s pace on the carry’s move, and on no other', async () => {
    const { conn, socket } = await inArcade();
    conn.send(walk(EAST, { lane: true }));
    conn.send(walk({ x: 900, y: 700 }));
    conn.send(walk({ x: 600, y: 900 }, { dash: true }));
    expect(sent(socket)).toEqual([
      { t: 'move', to: EAST, seq: 1, lane: true },
      { t: 'move', to: { x: 900, y: 700 }, seq: 2 },
      { t: 'dash', to: { x: 600, y: 900 }, seq: 3 },
    ]);
    expect(sent(socket)[1]).not.toHaveProperty('lane');
    expect(sent(socket)[2]).not.toHaveProperty('lane');
  });

  it('takes the room’s echo of the walk it set off on as said: a carry, a walk or a dash starts nothing again', async () => {
    const { conn, socket, heard } = await inArcade();
    conn.send(walk(EAST, { lane: true }));
    echo(socket, EAST, { lane: true });
    conn.send(walk({ x: 900, y: 700 }));
    echo(socket, { x: 900, y: 700 });
    conn.send(walk({ x: 600, y: 900 }, { dash: true }));
    echo(socket, { x: 600, y: 900 }, { dash: true });
    expect(heard.onSelfWalk).not.toHaveBeenCalled();
  });

  it('hands the scene the walk the room gave when a carry was asked for and a walk’s pace was given', async () => {
    const { conn, socket, heard } = await inArcade();
    conn.send(walk(EAST, { lane: true }));
    echo(socket, EAST);
    expect(heard.onSelfWalk).toHaveBeenCalledTimes(1);
    const given = heard.onSelfWalk.mock.calls[0]![0];
    expect(given).toEqual({ from: WEST, to: EAST, startedAt: Date.now() });
    expect(given).not.toHaveProperty('lane');
  });

  it('hands the scene where the room ends a carry short, another owl resting at the lane’s end, still at the lane’s pace', async () => {
    const { conn, socket, heard } = await inArcade();
    const short = { x: EAST.x - 26, y: EAST.y };
    conn.send(walk(EAST, { lane: true }));
    echo(socket, short, { lane: true });
    expect(heard.onSelfWalk).toHaveBeenCalledTimes(1);
    expect(heard.onSelfWalk.mock.calls[0]![0]).toEqual({ from: WEST, to: short, startedAt: Date.now(), lane: true });
  });

  it('keeps a carry a carry while it waits for the move budget, and when it is sent again for want of an echo', async () => {
    const { conn, socket } = await inArcade();
    // The budget's burst spent on three walks: the carry asked for next has to wait its turn.
    for (const x of [400, 500, 600]) conn.send(walk({ x, y: 880 }));
    conn.send(walk(EAST, { lane: true }));
    expect(sent(socket)).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(700);
    expect(sent(socket)).toHaveLength(4);
    expect(sent(socket)[3]).toEqual({ t: 'move', to: EAST, seq: 4, lane: true });
    // No echo comes: the one resend is the same move, a carry still.
    await vi.advanceTimersByTimeAsync(1_500);
    expect(sent(socket)).toHaveLength(5);
    expect(sent(socket)[4]).toEqual(sent(socket)[3]);
  });

  it('sends the newest of the moves that waited: a tap in a waiting carry’s place is a walk, a carry in a waiting walk’s place a carry', async () => {
    const { conn, socket } = await inArcade();
    for (const x of [400, 500, 600]) conn.send(walk({ x, y: 880 }));
    conn.send(walk(EAST, { lane: true }));
    conn.send(walk({ x: 900, y: 700 }));
    await vi.advanceTimersByTimeAsync(700);
    expect(sent(socket)).toHaveLength(4);
    expect(sent(socket)[3]).toEqual({ t: 'move', to: { x: 900, y: 700 }, seq: 4 });
    expect(sent(socket)[3]).not.toHaveProperty('lane');
    // The budget is spent again: a walk waits, and the carry asked for after it goes in its place.
    conn.send(walk({ x: 500, y: 880 }));
    conn.send(walk(EAST, { lane: true }));
    expect(sent(socket)).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(700);
    expect(sent(socket)).toHaveLength(5);
    expect(sent(socket)[4]).toEqual({ t: 'move', to: EAST, seq: 5, lane: true });
  });

  it('draws another owl’s carry at the lane’s pace: in a move, in a newcomer’s walk and in the welcome’s', async () => {
    const at = Date.now();
    const carried = { id: 'rider', look: LOOK, pos: WEST, walk: { from: WEST, to: EAST, at, lane: true } };
    const { socket, heard } = await inArcade([carried]);
    const first = vi.mocked(heard.onPeerState).mock.calls[0]![0];
    expect(first.walk).toMatchObject({ from: WEST, to: EAST, lane: true });
    socket.hear({ t: 'enter', owl: { ...carried, id: 'late' } });
    expect(vi.mocked(heard.onPeerState).mock.calls[1]![0]).toMatchObject({ id: 'late', walk: { lane: true } });
    socket.hear({ t: 'move', id: 'rider', from: EAST, to: WEST, at, lane: true });
    socket.hear({ t: 'move', id: 'rider', from: WEST, to: { x: 900, y: 700 }, at });
    socket.hear({ t: 'move', id: 'rider', from: WEST, to: { x: 600, y: 900 }, at, dash: true });
    const moves = vi.mocked(heard.onPeerMove).mock.calls.map(([id, w]) => ({ id, lane: w.lane, dash: w.dash, to: w.to }));
    expect(moves).toEqual([
      { id: 'rider', lane: true, dash: undefined, to: WEST },
      { id: 'rider', lane: undefined, dash: undefined, to: { x: 900, y: 700 } },
      { id: 'rider', lane: undefined, dash: true, to: { x: 600, y: 900 } },
    ]);
    // A walk that is no carry says nothing of a lane, so it is timed at a walk's pace.
    expect(vi.mocked(heard.onPeerMove).mock.calls[1]![1]).not.toHaveProperty('lane');
  });
});
