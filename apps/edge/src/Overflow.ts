/**
 * The overflow object (OP-075): one Durable Object for the park that keeps the busy-night settings
 * (the line, the ribbon, copies of rooms) and the line itself. The Worker reads its state through
 * `/state` and keeps what it read for a few seconds (`overflowNow`); the keepers change it through
 * the admin routes. It counts the owls in the park by asking the room objects, only while the line
 * is on (auto or on) and someone is arriving or waiting, so a quiet park costs nothing here.
 *
 * Internal routes, called by the Worker (which has checked the pass or the admin key already):
 *   GET  /state           the settings, whether the line is in front of the park, its pace, the count
 *   POST /settings        {line?, ribbon?, copy?: {room, n, state}, realms?: {open?, portal?, night?}}: the keepers' changes
 *                         (`realms` is the stained-glass climb's switch, designs/the-stained-glass-climb.md)
 *   POST /line/join       {who}: a number in the line (its turn at once while a place is free), or go when there is no line
 *   POST /line/status     {n, who}: where that number stands; a called number takes its turn
 *   GET  /notice          the ribbon's words and the realms switch now (for the room objects)
 *   GET  /masks/<room>    a tree room's ledge draft as a keeper last saved it (OP-156), or 404
 *   POST /masks/<room>    {ledges, walls, hazards, fronts, spots}: keep it as the room's draft, checked
 *                         again here (checkMasks), with when it was saved; the old draft goes
 *
 * The ledge painter's drafts (OP-156) live here because this is the park's one object for what the
 * keepers set: one row of `overflow_settings` per room, under `masks:<room>`, read only when a
 * keeper's painter or the pull script asks. A draft kept before spots (OP-156, part 3) reads back with
 * none (`spots: []`).
 *
 * TODO-DOCS (OP-075): built. docs/CAPACITY.md still marks the line, the ribbon and the capacity
 * process PLANNED. OP-075's write-up of all three is docs/CAPACITY.md at commit 9f7326a (`git show
 * 9f7326a:docs/CAPACITY.md`), to fold in: the keepers' page (/admin/capacity) and its API, how the line
 * moves and what it costs, raising a cap, one object per room, opening, draining and closing a copy of
 * a room, the rehearsal on a throwaway copy (Load test run 4, 2026-10-23) and the defaults chosen. Two
 * changes since that commit: a turn given as an owl joins is taken then, so it counts only until the
 * owl is in a room; and a socket the line turns away is closed once its page says hello. The same
 * commit's docs/ARCHITECTURE.md (section 6, item 3: copies of a room and the overflow object) and
 * docs/PLAYBOOK.md (section 5: the capacity page) carry the matching edits. In the page, the ribbon sits
 * under the top bar (to the left of the activity cards on a wide screen) and the 2 s notices move below
 * it while it shows. The visitor-facing words, awaiting the owner's approval, are LINE_WORDS
 * (apps/park/src/ui/home.ts), RIBBON_WORDS (packages/shared/src/overflow.ts) and RIBBON_UI_WORDS
 * (apps/park/src/ui/ribbon.ts).
 */
import { DurableObject } from 'cloudflare:workers';
import {
  COPY_MAX,
  LINE_DEFAULTS,
  RIBBON_DEFAULTS,
  lineRate,
  ribbonNow,
  waitMinutes,
  withLineChanges,
  withRibbonChanges,
  type Copies,
  type CopyState,
  type LineSettings,
  type RibbonSettings,
  REALMS_DEFAULTS,
  isNightKey,
  sameRealms,
  withRealmsChanges,
  type RealmsSettings,
  hashForLog,
  type Logger,
  checkMasks,
  type SavedMasks,
} from '@owl-park/shared';
import { GATED_ROOMS } from '@owl-park/shared/rooms';
import { roomObjectNames, withCopy } from './copies';
import { Line, type LineEntry } from './line';
import { loggerFor, moduleLog } from './logs';
import { ROOMS, paintableRoom } from './rooms';
import type { Env } from './env';

/** A count older than this is taken again before the line decides anything with it. */
export const COUNT_FRESH_MS = 5_000;
/** The line moves on this often while anyone is in it or has a place held. */
export const TICK_MS = 5_000;
/** While the line is in front of the park, its depth is logged this often (OP-134's queue_depth). */
export const DEPTH_EVERY_MS = 10_000;

/** What the Worker reads (and keeps for a few seconds). */
export interface OverflowState {
  line: LineSettings;
  /** New arrivals go through the line now. */
  active: boolean;
  waiting: number;
  /** The number just before the first owl waiting: a waiting number's place is how far above it it is. */
  front: number;
  /** Owls called per minute, lately. */
  rate: number;
  ribbon: RibbonSettings;
  /** The ribbon's words now (on by itself while the line is active); null when it is off. */
  notice: string | null;
  copies: Copies;
  /** Owls in the park when last counted, and when (null: not counted since the object woke). */
  count: number | null;
  countedAt: number | null;
  /** The realms switch: open gated rooms, the climb's portal, the special night. */
  realms: RealmsSettings;
}

/** The overflow object's answer to a line request, before the Worker adds the entry. */
export type LineAnswer = { state: 'go' } | { state: 'waiting'; n: number; place: number; waitMin: number | null } | { state: 'called'; n: number; holdUntil: number } | { state: 'expired' };

class Settings {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS overflow_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  }

  private read<T>(key: string, fallback: T): T {
    const r = this.sql.exec<{ value: string }>(`SELECT value FROM overflow_settings WHERE key = ?`, key).toArray()[0];
    if (!r) return fallback;
    try {
      return { ...fallback, ...(JSON.parse(r.value) as T) };
    } catch (e) {
      moduleLog.error('overflow', 'read_failed', 'A busy-night setting in storage could not be read: its default is used.', { key, error: e });
      return fallback;
    }
  }

  private write(key: string, value: unknown): void {
    this.sql.exec(`INSERT OR REPLACE INTO overflow_settings (key, value) VALUES (?, ?)`, key, JSON.stringify(value));
  }

  line(): LineSettings {
    return this.read('line', LINE_DEFAULTS);
  }
  setLine(v: LineSettings): void {
    this.write('line', v);
  }
  ribbon(): RibbonSettings {
    return this.read('ribbon', RIBBON_DEFAULTS);
  }
  setRibbon(v: RibbonSettings): void {
    this.write('ribbon', v);
  }
  copies(): Copies {
    return this.read<Copies>('copies', {});
  }
  setCopies(v: Copies): void {
    this.write('copies', v);
  }
  realms(): RealmsSettings {
    return this.read('realms', REALMS_DEFAULTS);
  }
  setRealms(v: RealmsSettings): void {
    this.write('realms', v);
  }

  /** A tree room's ledge draft (OP-156), kept under `masks:<room>`; null before one is saved. One kept before spots has none. */
  masks(room: string): SavedMasks | null {
    const r = this.sql.exec<{ value: string }>(`SELECT value FROM overflow_settings WHERE key = ?`, `masks:${room}`).toArray()[0];
    if (!r) return null;
    try {
      const kept = JSON.parse(r.value) as (Omit<SavedMasks, 'spots'> & Partial<Pick<SavedMasks, 'spots'>>) | null;
      return kept && { ...kept, spots: kept.spots ?? [] };
    } catch (e) {
      moduleLog.error('overflow', 'read_failed', 'A tree room’s ledge draft in storage could not be read: it reads as none, and the next save replaces it.', { room, error: e });
      return null;
    }
  }
  setMasks(room: string, v: SavedMasks): void {
    this.write(`masks:${room}`, v);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export class Overflow extends DurableObject<Env> {
  private readonly settings: Settings;
  private readonly line: Line;
  private count: { n: number; at: number } | null = null;
  /** The ribbon's words and the realms switch as last sent to the room objects, as JSON (undefined: not sent since waking). */
  private sent: string | undefined = undefined;
  /** The overflow object's log (OP-134). */
  private readonly log: Logger;
  /** When the line's depth was last logged, and whether anyone was in it then. */
  private depthAt = Number.NEGATIVE_INFINITY;
  private depthBusy = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.log = loggerFor(env);
    this.settings = new Settings(ctx.storage.sql);
    this.line = new Line(ctx.storage.sql);
  }

  private holdMs(): number {
    return this.settings.line().holdMin * 60_000;
  }

  /** The room objects of the park as it runs: the one object, or every room and copy in its own. */
  private roomObjects(): string[] {
    return roomObjectNames(this.env.ROOM_SHARDING, Object.keys(ROOMS), this.settings.copies());
  }

  private stub(name: string): DurableObjectStub {
    return this.env.ROOMS.get(this.env.ROOMS.idFromName(name));
  }

  /** Owls in the park's rooms now (the nests, each its own object with one object per room, are left out there). */
  private async parkCount(): Promise<number> {
    const totals = await Promise.all(
      this.roomObjects().map(async (name) => {
        const r = await this.stub(name).fetch('https://park/counts');
        const c = (await r.json()) as Record<string, number>;
        return Object.values(c).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
      }),
    );
    return totals.reduce((a, b) => a + b, 0);
  }

  /** Count again when the count is older than COUNT_FRESH_MS (or always, `force`); the last count stands if the rooms do not answer. */
  private async freshCount(now: number, force = false): Promise<number> {
    if (!force && this.count && now - this.count.at < COUNT_FRESH_MS) return this.count.n;
    try {
      this.count = { n: await this.parkCount(), at: now };
    } catch (e) {
      this.log.error('overflow', 'read_failed', 'The rooms could not be counted: the last count stands.', { error: e });
      this.count = { n: this.count?.n ?? 0, at: now };
    }
    return this.count.n;
  }

  /**
   * Whether new arrivals go through the line now: counting the park first when that matters, or, for
   * the rooms' minute-by-minute look at the ribbon (`counted: false`), by the last count, so a park of
   * many room objects never has each of them make the count again.
   */
  private async isActive(now: number, counted = true): Promise<boolean> {
    const s = this.settings.line();
    if (s.mode === 'off') return false;
    if (s.mode === 'on') return true;
    if (this.line.waiting() > 0 || this.line.outstanding(now, s.holdMin * 60_000) > 0) return true;
    return (counted ? await this.freshCount(now) : (this.count?.n ?? 0)) >= s.threshold;
  }

  /** Let owls in as places free up: the threshold, less the owls in the park and those already called. */
  private async step(now: number): Promise<void> {
    const s = this.settings.line();
    const hold = s.holdMin * 60_000;
    const busy = this.line.waiting() > 0;
    const count = busy ? await this.freshCount(now) : (this.count?.n ?? 0);
    const free = s.mode === 'off' ? 0 : s.threshold - count - this.line.outstanding(now, hold);
    this.line.tick(now, hold, free);
    const waiting = this.line.waiting();
    const held = this.line.outstanding(now, hold);
    this.sampleDepth(now, waiting, held, count);
    if (waiting > 0 || held > 0) await this.wakeIn(TICK_MS);
  }

  /** The line's depth, every DEPTH_EVERY_MS while anyone is in it or has a place held, and once more as it empties (OP-134). */
  private sampleDepth(now: number, waiting: number, held: number, count: number): void {
    const busy = waiting > 0 || held > 0;
    if (!busy && !this.depthBusy) return;
    if (busy && this.depthBusy && now - this.depthAt < DEPTH_EVERY_MS) return;
    this.depthAt = now;
    this.depthBusy = busy;
    this.log.info('room.queue', 'queue_depth', 'How the line in front of the park stands.', { waiting, held, front: this.line.front(), owls: count, rate: lineRate(this.line.calledTimes(now), now) });
  }

  private async wakeIn(ms: number): Promise<void> {
    const at = await this.ctx.storage.getAlarm();
    if (at === null || at > Date.now() + ms) await this.ctx.storage.setAlarm(Date.now() + ms);
  }

  private async state(now: number): Promise<OverflowState> {
    const line = this.settings.line();
    const active = await this.isActive(now);
    const ribbon = this.settings.ribbon();
    return {
      line,
      active,
      waiting: this.line.waiting(),
      front: this.line.front(),
      rate: lineRate(this.line.calledTimes(now), now),
      ribbon,
      notice: ribbonNow(ribbon, active),
      copies: this.settings.copies(),
      count: this.count?.n ?? null,
      countedAt: this.count?.at ?? null,
      realms: this.settings.realms(),
    };
  }

  /** Tell every room object the ribbon's words and the realms switch when either changed (they also ask every minute on their own). */
  private async sendNotice(words: string | null, realms: RealmsSettings = this.settings.realms()): Promise<void> {
    const body = JSON.stringify({ words, realms });
    if (body === this.sent) return;
    this.sent = body;
    await Promise.all(
      this.roomObjects().map((name) =>
        this.stub(name)
          .fetch('https://park/notice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
          .catch((e: unknown) => this.log.warn('overflow', 'write_failed', 'A room object was not told the ribbon or the realms switch: it asks again within a minute.', { object: name, error: e })),
      ),
    );
  }

  private answer(n: number, e: LineEntry, now: number): LineAnswer {
    switch (e.state) {
      case 'waiting':
        return { state: 'waiting', n, place: e.place, waitMin: waitMinutes(e.place, lineRate(this.line.calledTimes(now), now)) };
      case 'called':
        return { state: 'called', n, holdUntil: e.holdUntil };
      default:
        return { state: 'expired' };
    }
  }

  /**
   * Where number `n` stands for `who`. A called number takes its turn with this answer (the page walks
   * in on it, and the Worker hands it the entry), so its place stops being held for it: from then on
   * it counts only until it is in a room. Asked again, a number that took its turn goes in.
   */
  private take(n: number, who: string, now: number): LineAnswer {
    const hold = this.holdMs();
    const e = this.line.status(n, who, now, hold);
    if (e.state === 'called') {
      if (!this.line.claim(n, who, now, hold)) return { state: 'expired' };
      const joined = this.line.joinedAt(n);
      this.log.info('room.queue', 'queue_admit', 'An owl’s turn came, and it went in from the line.', { n, who_hash: hashForLog(who), ...(joined !== null ? { waited_ms: now - joined } : {}) });
      return this.answer(n, e, now);
    }
    if (e.state === 'claimed') return { state: 'go' };
    return this.answer(n, e, now);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = Date.now();
    if (url.pathname === '/state') return Response.json(await this.state(now));
    if (url.pathname === '/notice') return Response.json({ words: ribbonNow(this.settings.ribbon(), await this.isActive(now, false)), realms: this.settings.realms() });
    if (url.pathname.startsWith('/masks/')) return this.masks(request, url.pathname.slice('/masks/'.length), now);
    if (request.method !== 'POST') return new Response('not found', { status: 404 });
    const body = (await request.json().catch(() => null)) as unknown;
    if (!isRecord(body)) return Response.json({ error: 'bad request' }, { status: 400 });

    if (url.pathname === '/settings') {
      let line = this.settings.line();
      let ribbon = this.settings.ribbon();
      let copies = this.settings.copies();
      let realms = this.settings.realms();
      if (body['realms'] !== undefined) {
        const next = withRealmsChanges(realms, body['realms'], (r) => GATED_ROOMS.includes(r), isNightKey);
        if (!next) return Response.json({ error: 'bad realms' }, { status: 400 });
        if (!sameRealms(next, realms)) this.log.info('overflow', 'realms_set', 'The keepers changed the realms switch.', { open: next.open, portal: next.portal, night: next.night ?? 'moon' });
        realms = next;
      }
      if (body['line'] !== undefined) {
        const next = withLineChanges(line, body['line']);
        if (!next) return Response.json({ error: 'bad line' }, { status: 400 });
        line = next;
      }
      if (body['ribbon'] !== undefined) {
        const next = withRibbonChanges(ribbon, body['ribbon']);
        if (!next) return Response.json({ error: 'bad ribbon' }, { status: 400 });
        ribbon = next;
      }
      if (body['copy'] !== undefined) {
        const c = body['copy'];
        const states: Array<CopyState | 'closed'> = ['open', 'draining', 'closed'];
        if (!isRecord(c) || typeof c['room'] !== 'string' || !Object.hasOwn(ROOMS, c['room']) || !Number.isInteger(c['n']) || (c['n'] as number) < 2 || (c['n'] as number) > COPY_MAX || !states.includes(c['state'] as CopyState)) {
          return Response.json({ error: 'bad copy' }, { status: 400 });
        }
        if (this.env.ROOM_SHARDING !== 'room') return Response.json({ error: 'copies need one object per room (ROOM_SHARDING=room)' }, { status: 409 });
        copies = withCopy(copies, c['room'], c['n'] as number, c['state'] as CopyState | 'closed');
      }
      this.settings.setLine(line);
      this.settings.setRibbon(ribbon);
      this.settings.setCopies(copies);
      this.settings.setRealms(realms);
      // Turned on: the line counts the park now. Turned off: everyone waiting goes in on their next
      // look, so the line is taken down, and a line started later begins afresh rather than calling them.
      this.count = null;
      if (line.mode === 'off') this.line.clear(now);
      await this.step(now);
      const st = await this.state(now);
      await this.sendNotice(st.notice);
      return Response.json(st);
    }

    const who = body['who'];
    if (typeof who !== 'string' || who.length < 3 || who.length > 40) return Response.json({ error: 'bad request' }, { status: 400 });
    if (url.pathname === '/line/join') {
      if (!(await this.isActive(now))) return Response.json({ state: 'go' } satisfies LineAnswer);
      // A number taken just now, or the one this browser already held (a page loaded again).
      const again = this.line.held(who, now, this.holdMs()) !== null;
      const n = this.line.join(who, now, this.holdMs());
      this.log.info('room.queue', 'queue_enter', 'An owl arrived while the line is in front of the park, and holds a number.', { n, who_hash: hashForLog(who), again, waiting: this.line.waiting() });
      // A place may be free already: the line moves before answering, and a newcomer called at once takes its turn now.
      await this.step(now);
      await this.sendNotice(ribbonNow(this.settings.ribbon(), true));
      return Response.json(this.take(n, who, now));
    }
    if (url.pathname === '/line/status') {
      const n = body['n'];
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return Response.json({ error: 'bad request' }, { status: 400 });
      if (!(await this.isActive(now))) return Response.json({ state: 'go' } satisfies LineAnswer);
      await this.step(now);
      return Response.json(this.take(n, who, now));
    }
    return new Response('not found', { status: 404 });
  }

  /**
   * A tree room's ledge draft (OP-156): read it, or keep a new one with when it was saved. The Worker
   * has checked the keeper and the draft; the draft is checked again here, so nothing else is kept.
   */
  private async masks(request: Request, roomId: string, now: number): Promise<Response> {
    const room = paintableRoom(roomId);
    if (!room) return Response.json({ error: 'not found' }, { status: 404 });
    if (request.method === 'GET') {
      const kept = this.settings.masks(roomId);
      return kept ? Response.json(kept) : Response.json({ error: 'not found' }, { status: 404 });
    }
    if (request.method !== 'POST') return new Response('not found', { status: 404 });
    const checked = checkMasks(await request.json().catch(() => null), room.size);
    if (!checked.ok) return Response.json({ error: 'bad masks', reason: checked.reason }, { status: 400 });
    const saved: SavedMasks = { room: roomId, ...checked.draft, savedAt: now };
    this.settings.setMasks(roomId, saved);
    return Response.json(saved);
  }

  /** While anyone is in the line or has a place held: count the park, move the line, and keep the ribbon in step. */
  override async alarm(): Promise<void> {
    const now = Date.now();
    await this.freshCount(now, true);
    await this.step(now);
    const st = await this.state(now);
    await this.sendNotice(st.notice);
  }
}
