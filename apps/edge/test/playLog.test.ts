/**
 * Play events for the collection log (OP-304): a parkour run begun, its benches and parts, its falls
 * (where, to 10 px), its clear, and each thing an owl used, each with the visit the owl is in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COURSES, ROOMS } from '@owl-park/shared/rooms';
import { INTERACTABLES } from '@owl-park/shared';
import { CollectLog, PLAY_EVENTS_PER_MINUTE, saltedHash, saltedUuid, type LogConfig, type PlayEventRow } from '../src/collectLog';
import type { Env } from '../src/env';
import { sqlStorage } from './sqlite';

const MON = Date.UTC(2026, 9, 19, 16, 0, 0);
const CID = 'c_abcdefghij';
const PASS = 'v_visitAAAA1';
const CONFIG: LogConfig = { url: 'https://log.example/functions/v1/owl-park-log', key: 'k'.repeat(32), salt: 's'.repeat(24) };

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

const { Collections } = await import('../src/Collections');

function objectRig() {
  const pending: Promise<unknown>[] = [];
  let alarm: number | null = null;
  const ctx = {
    storage: { sql: sqlStorage(), getAlarm: async () => alarm, setAlarm: async (at: number) => void (alarm = at) },
    waitUntil: (p: Promise<unknown>) => void pending.push(p),
  };
  const played: PlayEventRow[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { kind: string; rows?: unknown[] };
      if (body.kind === 'play_event') played.push(...(body.rows as PlayEventRow[]));
      return new Response('{"ok":true}');
    }),
  );
  const env = { PARK_LOG_URL: CONFIG.url, FRAUD_SCORE_KEY: CONFIG.key, FRAUD_HASH_SALT: CONFIG.salt } as unknown as Env;
  const obj = new Collections(ctx as unknown as DurableObjectState, env);
  const settle = async () => {
    while (pending.length) await pending.shift();
  };
  return { obj, played, settle };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('play events (OP-304)', () => {
  it('sends a run from start to clear, with its falls and where they were, under one run id', async () => {
    vi.useFakeTimers({ now: MON, toFake: ['Date'] });
    const t = objectRig();
    await t.obj.seen({ cid: CID, pass: PASS, device: 'phone', room: 'trail-1', entered: true }, { species: 'barn', body: '#7A5C99' });
    expect((await t.obj.courseStart(CID, 'trail-1')).ok).toBe(true);
    vi.setSystemTime(MON + 2_000);
    await t.obj.courseFall(CID, 'trail-1', { x: 1234.4, y: 717.6 });
    await t.obj.courseReach(CID, 'trail-1', 'part', 'bell-1');
    // Reached again: nothing new, nothing sent.
    await t.obj.courseReach(CID, 'trail-1', 'part', 'bell-1');
    vi.setSystemTime(MON + 4_000);
    await t.obj.courseReach(CID, 'trail-2', 'part', 'bell-2');
    await t.obj.courseReach(CID, 'trail-3', 'part', 'bell-3');
    vi.setSystemTime(MON + 30_000);
    expect((await t.obj.courseFinish(CID, 'trail-3', { pass: PASS, room: 'trail-3' })).ok).toBe(true);
    await t.settle();

    expect(t.played.map((r) => r.event)).toEqual(['course_start', 'course_fall', 'course_part', 'course_part', 'course_part', 'course_clear']);
    const run = t.played[0]!.run_id;
    expect(run).toBe(await saltedUuid(CONFIG.salt, 'course-run', `${CID}|trail|${MON}`));
    expect(t.played.every((r) => r.run_id === run && r.course_id === 'trail')).toBe(true);
    expect(t.played[0]).toMatchObject({ collector_id: await saltedHash(CONFIG.salt, 'collector', CID), session_id: await saltedUuid(CONFIG.salt, 'session', PASS), realm: 'trail-1', practice: false });
    expect(t.played[1]).toMatchObject({ pos_x: 1230, pos_y: 720, realm: 'trail-1' });
    expect(t.played.filter((r) => r.event !== 'course_fall').every((r) => r.pos_x === null && r.pos_y === null)).toBe(true);
    expect(t.played[5]).toMatchObject({ ms: 30_000, realm: 'trail-3' });
    expect(new Set(t.played.map((r) => r.event_id)).size).toBe(t.played.length);
    // Nothing that names the owl or the visit leaves as it is.
    expect(JSON.stringify(t.played)).not.toContain(CID);
    expect(JSON.stringify(t.played)).not.toContain(PASS);
  });

  it('sends a fall outside a run, with no run id, and a spectator’s run as practice', async () => {
    vi.useFakeTimers({ now: MON, toFake: ['Date'] });
    const t = objectRig();
    await t.obj.courseFall(CID, 'trail-2', { x: 10, y: 20 });
    await t.obj.courseStart('c_spectator', 'trail-1', true);
    await t.settle();
    expect(t.played[0]).toMatchObject({ event: 'course_fall', run_id: null, course_id: 'trail', session_id: null, realm: 'trail-2' });
    expect(t.played[1]).toMatchObject({ event: 'course_start', practice: true });
  });

  it('sends each thing used, a guest’s included, by its kind and id', async () => {
    const t = objectRig();
    await t.obj.flop(CID, { kind: 'interact', what: 'leaf-pile', id: 'hub-leaves-1', room: 'hub' }, 'hub');
    await t.obj.questEvent(CID, { kind: 'interact', what: 'stall', id: 'glass-nest', room: 'glass' }, 'glass');
    await t.obj.questEvent(CID, { kind: 'talk', npc: 'pip' }, 'hub');
    await t.obj.practiceUsed('c_guestowlxx', 'leaf-pile', 'grove-leaves-1', 'grove');
    await t.settle();
    expect(t.played.map((r) => [r.event, r.thing, r.realm, r.practice])).toEqual([
      ['interact', 'leaf-pile:hub-leaves-1', 'hub', false],
      ['interact', 'stall:glass-nest', 'glass', false],
      ['interact', 'leaf-pile:grove-leaves-1', 'grove', true],
    ]);
    expect(t.played.every((r) => r.course_id === null && r.run_id === null)).toBe(true);
  });

  it('keeps at most a minute’s worth of play events an owl, and the next minute’s again', () => {
    let clock = MON;
    const log = new CollectLog(sqlStorage(), CONFIG, { fetch: vi.fn(), now: () => clock, wake: () => undefined });
    const ev = (cid: string) => log.playEvent({ event: 'interact', cid, at: clock, pass: null, room: 'hub', thing: 'leaf-pile:hub-leaves-1' });
    for (let i = 0; i < PLAY_EVENTS_PER_MINUTE; i++) expect(ev(CID)).toBe(true);
    expect(ev(CID)).toBe(false);
    expect(ev('c_otherowlxx')).toBe(true);
    clock += 60_000;
    expect(ev(CID)).toBe(true);
    expect(log.waiting()).toBe(PLAY_EVENTS_PER_MINUTE + 2);
  });

  it('names every course, piece and thing to use as the log takes them', () => {
    // As apps/park-log/src/handler.ts checks them: a row that fails there is dropped for good.
    const COURSE_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
    const THING = /^[a-z0-9][a-z0-9-]{0,47}(:[a-z0-9][a-z0-9-]{0,63})?$/;
    const ROOM = /^[a-z][a-z0-9-]{0,19}$/;
    for (const c of Object.values(COURSES)) expect(c.id).toMatch(COURSE_ID);
    for (const [id, room] of Object.entries(ROOMS)) {
      if (!room.course) continue;
      expect(id).toMatch(ROOM);
      for (const p of [...(room.course.benches ?? []), ...(room.course.parts ?? [])]) expect(p.id).toMatch(THING);
    }
    for (const it of INTERACTABLES) expect(`${it.kind}:${it.id}`).toMatch(THING);
  });
});
