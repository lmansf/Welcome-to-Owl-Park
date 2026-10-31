/**
 * A scripted visitor for chaos runs (OP-132), speaking the room server's protocol as a page does: it
 * takes a pass, joins a room with a hello, walks, emotes and leaves, and, as a page does, comes back
 * after its connection drops (half a second, doubling to 8 s), saying where its owl stands. Every
 * request and socket carries the run's id (X-Chaos-Run), so each line the park logs about it names
 * the run. Each visitor says an address of its own (X-Forwarded-For, which the chaos park trusts).
 */
import WebSocket from 'ws';
import { distance, distanceToRect, EDGE_PROTOCOL_VERSION, isWalkable, resolveTarget, ROOMS, WALK_SPEED } from './shared.mjs';

const LOOK = { body: '#8B5A2B', belly: '#F6F1E3', accent: '#C9A227' };
const HEARTBEAT_MS = 25_000;
const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 8_000;
const ECHO_TIMEOUT_MS = 5_000;
const WELCOME_TIMEOUT_MS = 10_000;
const SAW_KEPT = 500;

const HOP_MIN_PX = 40;
// A walk over before the fleet's next tap (1.5 s at the soonest), so the owl stands where its visitor
// thinks when it asks again.
const HOP_MAX_PX = WALK_SPEED * 1.2;
const CLEAR_OF_DOORS_PX = 60;

/**
 * Somewhere a short walk from `from` that the room walks to in full, by the room server's own rule
 * (resolveTarget), on the floor and clear of the doorways. The room echoes every such move; a tap
 * into a wall it may answer with nothing (it ignores a walk to where the owl already stands), and
 * the fleet would count that as a lost move. Null when no such place is found near.
 */
export function hop(roomId, from) {
  const room = ROOMS[roomId];
  for (let i = 0; i < 100; i++) {
    const a = Math.random() * 2 * Math.PI;
    const r = HOP_MIN_PX + Math.random() * (HOP_MAX_PX - HOP_MIN_PX);
    const to = { x: Math.round(from.x + Math.cos(a) * r), y: Math.round(from.y + Math.sin(a) * r) };
    if (!isWalkable(to, room.walkable) || room.doors.some((d) => distanceToRect(to, d.rect) < CLEAR_OF_DOORS_PX)) continue;
    if (distance(resolveTarget(from, to, room.walkable), to) <= 1) return to;
  }
  return null;
}

export class Visitor {
  /**
   * @param {{ base: string, run: string, n: number, events?: (e: object) => void, comeBack?: boolean }} o
   *   The park, the run's id, the visitor's number (its address is made from it), where its events
   *   go, and whether it comes back after its socket closes (a page does; a flooder the room closed,
   *   or a newcomer the line turned away, does not).
   */
  constructor({ base, run, n, events = () => {}, comeBack = true }) {
    this.base = base.replace(/\/$/, '');
    this.run = run;
    this.n = n;
    this.comeBack = comeBack;
    this.lastClose = null;
    this.emit = (e) => events({ at: Date.now(), visitor: n, ...e });
    this.headers = { 'X-Chaos-Run': run, 'X-Forwarded-For': `10.42.${(n >> 8) & 255}.${n & 255}`, Origin: this.base };
    this.room = null;
    this.id = null;
    this.pos = null;
    this.ws = null;
    this.seq = 0;
    this.pending = new Map();
    this.stopped = false;
    this.backoff = BACKOFF_MIN_MS;
    this.droppedAt = null;
    this.welcomes = 0;
    this.waiters = [];
    this.heartbeat = null;
    /** The emotes this visitor saw each other owl play, by its id. */
    this.heardEmotes = new Map();
    /** Where this visitor was told each other owl is or walks to, by its id (the last SAW_KEPT of each, OP-149). */
    this.sawAt = new Map();
    /** How many air states this visitor was told of each other owl, by its id (OP-149). */
    this.heardAir = new Map();
  }

  /** Another owl told at `p`: kept, the latest few hundred of each. */
  saw(id, p) {
    if (!p) return;
    const at = this.sawAt.get(id) ?? [];
    at.push({ x: p.x, y: p.y });
    if (at.length > SAW_KEPT) at.shift();
    this.sawAt.set(id, at);
  }

  /** A pass for this visitor, as a page asks for one (a new collector each time unless it has a token). */
  async pass() {
    const r = await fetch(`${this.base}/api/pass`, { headers: { ...this.headers, ...(this.collector ? { 'X-Collector': this.collector } : {}) }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`GET /api/pass: HTTP ${r.status}`);
    const body = await r.json();
    if (body.collector) this.collector = body.collector;
    return body.pass;
  }

  /** Join `room` and wait for its welcome; resolves with the welcome's frame. */
  async join(room) {
    this.room = room;
    this.stopped = false;
    const welcomed = this.nextWelcome(WELCOME_TIMEOUT_MS);
    await this.connect();
    return welcomed;
  }

  /** The next welcome; for a visitor that does not come back, a close before it fails the join at once. */
  nextWelcome(ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no welcome within ${ms / 1000} s`)), ms);
      this.waiters.push((f, close) => {
        clearTimeout(timer);
        if (f) resolve(f);
        else reject(Object.assign(new Error(`closed before a welcome: code ${close.code}`), { code: close.code }));
      });
    });
  }

  async connect() {
    if (this.stopped) return;
    let pass;
    try {
      pass = await this.pass();
    } catch (e) {
      this.emit({ kind: 'error', what: 'pass', message: e.message });
      return this.retry();
    }
    this.lastPass = pass;
    const ws = new WebSocket(`${this.base.replace(/^http/, 'ws')}/ws/${this.room}?pass=${encodeURIComponent(pass)}`, { headers: this.headers });
    this.ws = ws;
    ws.on('open', () => {
      const hello = { t: 'hello', v: EDGE_PROTOCOL_VERSION, look: LOOK };
      if (this.pos) hello.pos = { x: Math.round(this.pos.x), y: Math.round(this.pos.y) };
      ws.send(JSON.stringify(hello));
      clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('hb'), HEARTBEAT_MS);
    });
    ws.on('message', (data) => this.onFrame(String(data)));
    ws.on('error', (e) => this.emit({ kind: 'error', what: 'socket', message: e.message }));
    ws.on('close', (code, reason) => {
      clearInterval(this.heartbeat);
      if (this.ws !== ws) return;
      this.ws = null;
      this.lastClose = { at: Date.now(), code, reason: String(reason) };
      for (const p of this.pending.values()) p.resolve(null);
      this.pending.clear();
      if (this.stopped) return;
      this.droppedAt ??= Date.now();
      this.emit({ kind: 'dropped', code, reason: String(reason) });
      if (this.comeBack) return this.retry();
      this.stopped = true;
      for (const w of this.waiters.splice(0)) w(null, this.lastClose);
    });
  }

  retry() {
    if (this.stopped) return;
    const wait = this.backoff;
    this.backoff = Math.min(BACKOFF_MAX_MS, this.backoff * 2);
    setTimeout(() => void this.connect(), wait).unref?.();
  }

  onFrame(text) {
    if (text === 'hb') return;
    let f;
    try {
      f = JSON.parse(text);
    } catch {
      return this.emit({ kind: 'error', what: 'frame', message: 'a frame that is not JSON' });
    }
    if (f.t === 'welcome') {
      const before = this.pos;
      this.id = f.id;
      this.welcomes += 1;
      this.backoff = BACKOFF_MIN_MS;
      const back = this.droppedAt !== null;
      this.emit({ kind: back ? 'rejoined' : 'welcome', room: f.room, pos: f.you.pos, ...(back ? { gapMs: Date.now() - this.droppedAt, was: before } : {}) });
      this.droppedAt = null;
      this.pos = f.you.pos;
      for (const o of f.owls ?? []) {
        this.saw(o.id, o.pos);
        this.saw(o.id, o.walk?.to);
      }
      for (const w of this.waiters.splice(0)) w(f);
    } else if (f.t === 'enter') {
      this.saw(f.owl.id, f.owl.pos);
    } else if (f.t === 'air') {
      this.heardAir.set(f.id, (this.heardAir.get(f.id) ?? 0) + 1);
    } else if (f.t === 'emote') {
      this.heardEmotes.set(f.id, (this.heardEmotes.get(f.id) ?? 0) + 1);
    } else if (f.t === 'move' && f.id === this.id) {
      this.pos = f.to;
      const p = this.pending.get(f.seq);
      if (p) {
        this.pending.delete(f.seq);
        p.resolve(Date.now() - p.at);
      }
    } else if (f.t === 'move') {
      this.saw(f.id, f.from);
      this.saw(f.id, f.to);
    }
  }

  /** Walk to `to`; resolves with how long the room took to echo the move (ms), or null when it never did. */
  walk(to) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve(null);
    const seq = this.seq++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        resolve(null);
      }, ECHO_TIMEOUT_MS);
      this.pending.set(seq, {
        at: Date.now(),
        resolve: (ms) => {
          clearTimeout(timer);
          resolve(ms);
        },
      });
      ws.send(JSON.stringify({ t: 'move', to, seq }));
    });
  }

  /** Take a number in the line, as a page does when the room server sends it to wait (close 4012). */
  async takeNumber() {
    const r = await fetch(`${this.base}/api/line`, {
      method: 'POST',
      headers: { ...this.headers, Authorization: `Bearer ${this.lastPass}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`POST /api/line: HTTP ${r.status}`);
    return r.json();
  }

  /** Send a frame as it is, as a page's console can (OP-149): whatever the room makes of it. */
  raw(frame) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(frame));
  }

  /** Play an emote (the room may drop it quietly when they come too fast). */
  emote(e) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'emote', e }));
  }

  get open() {
    return this.ws?.readyState === WebSocket.OPEN && this.id !== null;
  }

  /** Leave as a page does: a bye, then the socket closed. */
  async leave() {
    this.stopped = true;
    clearInterval(this.heartbeat);
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'bye' }));
    await new Promise((resolve) => {
      ws.once('close', resolve);
      ws.close(1000, 'leaving');
      setTimeout(() => (ws.terminate(), resolve()), 2_000).unref?.();
    });
  }
}
