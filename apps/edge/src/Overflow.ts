/**
 * The overflow object (OP-075): one Durable Object for the park that keeps the busy-night settings
 * (the line, the ribbon, copies of rooms) and the line itself. The Worker reads its state through
 * `/state` and keeps what it read for a few seconds (`overflowNow`); the keepers change it through
 * the admin routes. It counts the owls in the park by asking the room objects, only while the line
 * is on (auto or on) and someone is arriving or waiting, so a quiet park costs nothing here.
 *
 * Internal routes, called by the Worker (which has checked the pass or the admin key already):
 *   GET  /state           the settings, whether the line is in front of the park, its pace, the count
 *   POST /settings        {line?, ribbon?, copy?: {room, n, state}}: the keepers' changes
 *   POST /line/join       {who}: a number in the line, or go when there is no line
 *   POST /line/status     {n, who}: where that number stands; a called number takes its turn
 *   GET  /notice          the ribbon's words now (for the room objects)
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
} from '@owl-park/shared';
import { copiesIn, copyObjectName, withCopy } from './copies';
import { Line, type LineEntry } from './line';
import { ROOMS } from './rooms';
import type { Env } from './env';

/** A count older than this is taken again before the line decides anything with it. */
export const COUNT_FRESH_MS = 5_000;
/** The line moves on this often while anyone is in it or has a place held. */
export const TICK_MS = 5_000;

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
    } catch {
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
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export class Overflow extends DurableObject<Env> {
  private readonly settings: Settings;
  private readonly line: Line;
  private count: { n: number; at: number } | null = null;
  /** The ribbon's words as last sent to the room objects (undefined: not sent since waking). */
  private sent: string | null | undefined = undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.settings = new Settings(ctx.storage.sql);
    this.line = new Line(ctx.storage.sql);
  }

  private holdMs(): number {
    return this.settings.line().holdMin * 60_000;
  }

  /** The room objects of the park as it runs: the one object, or every room and copy in its own. */
  private roomObjects(): string[] {
    if (this.env.ROOM_SHARDING !== 'room') return ['park'];
    const copies = this.settings.copies();
    const names: string[] = [];
    for (const room of Object.keys(ROOMS)) {
      names.push(copyObjectName(room, 1));
      const { open, draining } = copiesIn(copies, room);
      for (const n of [...open, ...draining]) names.push(copyObjectName(room, n));
    }
    return names;
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
      console.error('[owl-park] the rooms could not be counted:', e instanceof Error ? e.message : e);
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
    if (this.line.waiting() > 0 || this.line.outstanding(now, hold) > 0) await this.wakeIn(TICK_MS);
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
    };
  }

  /** Tell every room object the ribbon's words when they changed (they also ask every minute on their own). */
  private async sendNotice(words: string | null): Promise<void> {
    if (words === this.sent) return;
    this.sent = words;
    const body = JSON.stringify({ words });
    await Promise.all(
      this.roomObjects().map((name) =>
        this.stub(name)
          .fetch('https://park/notice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
          .catch(() => undefined),
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

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = Date.now();
    if (url.pathname === '/state') return Response.json(await this.state(now));
    if (url.pathname === '/notice') return Response.json({ words: ribbonNow(this.settings.ribbon(), await this.isActive(now, false)) });
    if (request.method !== 'POST') return new Response('not found', { status: 404 });
    const body = (await request.json().catch(() => null)) as unknown;
    if (!isRecord(body)) return Response.json({ error: 'bad request' }, { status: 400 });

    if (url.pathname === '/settings') {
      let line = this.settings.line();
      let ribbon = this.settings.ribbon();
      let copies = this.settings.copies();
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
      const n = this.line.join(who, now, this.holdMs());
      // A place may be free already: the line moves before answering.
      await this.step(now);
      await this.sendNotice(ribbonNow(this.settings.ribbon(), true));
      return Response.json(this.answer(n, this.line.status(n, who, now, this.holdMs()), now));
    }
    if (url.pathname === '/line/status') {
      const n = body['n'];
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return Response.json({ error: 'bad request' }, { status: 400 });
      if (!(await this.isActive(now))) return Response.json({ state: 'go' } satisfies LineAnswer);
      await this.step(now);
      const hold = this.holdMs();
      const e = this.line.status(n, who, now, hold);
      // Its turn: it takes its place now (the Worker hands it the entry with this answer).
      if (e.state === 'called' && !this.line.claim(n, who, now, hold)) return Response.json({ state: 'expired' } satisfies LineAnswer);
      if (e.state === 'claimed') return Response.json({ state: 'go' } satisfies LineAnswer);
      return Response.json(this.answer(n, e, now));
    }
    return new Response('not found', { status: 404 });
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
