import { describe, expect, it } from 'vitest';
import { CollectionBook, QUESTS, QuestBook, getQuest, nextParkDayAt, parkDay, type QuestDef } from '@owl-park/shared';
import { CollectLog, questCatalogue, saltedHash, type LogConfig, type QuestCatalogueStep, type QuestProgressData, type QuestProgressRow } from '../src/collectLog';
import { questExpiry, questProgressEvents, type QuestState } from '../src/questLog';
import { SqlCollectionStore } from '../src/sqlStore';
import { sqlStorage } from './sqlite';

/** 2026-10-19 12:00 Eastern (16:00 UTC), a Monday. */
const MON = Date.UTC(2026, 9, 19, 16, 0, 0);
const HOUR = 3600_000;
const CID = 'c_abcdefghij';
const PASS = 'v_visitAAAA1';
const CONFIG: LogConfig = { url: 'https://log.example/functions/v1/owl-park-log', key: 'k'.repeat(32), salt: 's'.repeat(24) };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HERE = { pass: PASS, room: 'hub' };

const welcome = getQuest('story-welcome')!;
const daily = QUESTS.find((q) => q.cadence === 'daily')!;
const row = (q: QuestDef, over: Partial<QuestState> = {}): QuestState => ({ cid: CID, quest: q.id, period: q.cadence === 'story' ? '' : parkDay(MON), step: 0, acceptedAt: MON, doneAt: null, ...over });
/** The events as (event, step, outcome) for reading at a glance. */
const brief = (es: QuestProgressData[]) => es.map((e) => `${e.event} ${e.step}${e.event === 'end' ? ` ${e.outcome}` : ''}`);

describe('quest progress events (OP-266)', () => {
  it('begins the first step when a quest is taken, with where it happened and when its period ends', () => {
    const es = questProgressEvents(null, row(daily), MON, HERE);
    expect(brief(es)).toEqual(['start 0']);
    expect(es[0]).toMatchObject({ cid: CID, quest: daily.id, accepted: MON, at: MON, pass: PASS, room: 'hub', expires: nextParkDayAt(MON) });
    expect(questProgressEvents(null, row(welcome), MON, HERE)[0]).toMatchObject({ expires: null });
  });

  it('ends at once the steps a quest is already past when taken (a visit to the room the owl stands in)', () => {
    expect(brief(questProgressEvents(null, row(welcome, { step: 2 }), MON, HERE))).toEqual(['start 0', 'end 0 done', 'start 1', 'end 1 done', 'start 2']);
  });

  it('sends nothing for a count within a step, and ends each step done as the next begins', () => {
    expect(questProgressEvents(row(welcome), row(welcome), MON, HERE)).toEqual([]);
    expect(brief(questProgressEvents(row(welcome), row(welcome, { step: 1 }), MON + HOUR, HERE))).toEqual(['end 0 done', 'start 1']);
    // A step done that also passes a visit to the room the owl is in.
    expect(brief(questProgressEvents(row(welcome), row(welcome, { step: 3 }), MON, HERE))).toEqual(['end 0 done', 'start 1', 'end 1 done', 'start 2', 'end 2 done', 'start 3']);
  });

  it('makes handing in the step after the last, ended when the quest is handed in', () => {
    const n = welcome.steps.length;
    expect(brief(questProgressEvents(row(welcome, { step: n - 1 }), row(welcome, { step: n }), MON, HERE))).toEqual([`end ${n - 1} done`, `start ${n}`]);
    const done = questProgressEvents(row(welcome, { step: n }), row(welcome, { step: n, doneAt: MON + HOUR }), MON + HOUR, HERE);
    expect(brief(done)).toEqual([`end ${n} done`]);
    expect(done[0]!.at).toBe(MON + HOUR);
    // Nothing more once it is handed in.
    expect(questProgressEvents(row(welcome, { step: n, doneAt: MON }), null, MON + HOUR, HERE)).toEqual([]);
  });

  it('ends the step a quest stood on as abandoned, expired at its period end, or retired', () => {
    expect(brief(questProgressEvents(row(daily, { step: 1 }), null, MON + HOUR, HERE))).toEqual(['end 1 abandoned']);
    const later = MON + 30 * HOUR;
    const expired = questProgressEvents(row(daily), null, later, HERE);
    expect(brief(expired)).toEqual(['end 0 expired']);
    expect(expired[0]!.at).toBe(nextParkDayAt(MON));
    expect(brief(questProgressEvents({ ...row(daily), quest: 'gone-from-the-catalogue' }, null, MON, HERE))).toEqual(['end 0 retired']);
  });

  it('treats a quest given up and taken again as a new run', () => {
    const es = questProgressEvents(row(daily, { step: 1 }), row(daily, { acceptedAt: MON + HOUR }), MON + HOUR, HERE);
    expect(brief(es)).toEqual(['end 1 abandoned', 'start 0']);
    expect(es.map((e) => e.accepted)).toEqual([MON, MON + HOUR]);
  });

  it('knows when each kind of quest runs out', () => {
    expect(questExpiry({ cadence: 'story' }, MON)).toBeNull();
    expect(questExpiry({ cadence: 'daily' }, MON)).toBe(nextParkDayAt(MON));
    expect(questExpiry({ cadence: 'weekly' }, MON)! - MON).toBeGreaterThan(6 * 24 * HOUR);
    expect(questExpiry({ cadence: 'monthly' }, MON)).toBeGreaterThan(questExpiry({ cadence: 'weekly' }, MON)!);
  });
});

/** The quest book on a fresh object's SQLite, its store telling the log of each change, and a stand-in for the log. */
function rig() {
  const sql = sqlStorage();
  const bodies: Array<Record<string, unknown>> = [];
  let clock = MON;
  const log = new CollectLog(sql, CONFIG, {
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response('{"ok":true}');
    },
    now: () => clock,
    wake: () => undefined,
  });
  const store = new SqlCollectionStore(sql, undefined, (before, after) => {
    for (const e of questProgressEvents(before, after, clock, HERE)) log.questProgress(e);
  });
  const book = new CollectionBook(store);
  const quests = new QuestBook(store, book, {});
  return {
    quests,
    tick: (ms: number) => (clock += ms),
    now: () => clock,
    bodies,
    rows: async () => {
      await log.flush();
      return bodies.filter((b) => b.kind === 'quest_progress').flatMap((b) => b.rows as QuestProgressRow[]);
    },
  };
}

describe('the quest progress log (OP-266)', () => {
  it('sends each step of the welcome quest from start to hand-in, naming no one', async () => {
    const t = rig();
    expect(t.quests.accept(CID, 'story-welcome', t.now(), 'hub').ok).toBe(true);
    t.tick(60_000);
    t.quests.event(CID, { kind: 'talk', npc: 'pip' }, t.now(), 'hub');
    t.tick(60_000);
    t.quests.event(CID, { kind: 'visit', room: 'grove' }, t.now(), 'grove');
    t.quests.event(CID, { kind: 'interact', what: 'leaf-pile', id: 'grove-leaves-1', room: 'grove' }, t.now(), 'grove');
    t.quests.event(CID, { kind: 'talk', npc: 'nova' }, t.now(), 'market');
    t.quests.event(CID, { kind: 'emote', emote: 'hoot', room: 'hub', near: ['bramble'] }, t.now(), 'hub');
    t.tick(60_000);
    expect(t.quests.handIn(CID, 'story-welcome', 'bramble', t.now(), () => 0.5).ok).toBe(true);
    const rows = await t.rows();
    const starts = rows.filter((r) => r.event === 'start');
    const ends = rows.filter((r) => r.event === 'end');
    // Five steps and the hand-in: each begun once and ended once, done.
    expect(starts.map((r) => r.step_no)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ends.map((r) => r.outcome)).toEqual(Array(6).fill('done'));
    expect(new Set(rows.map((r) => r.progress_id)).size).toBe(6);
    for (const s of starts) {
      expect(s).toMatchObject({ quest_id: 'story-welcome', period: '', session_id: expect.stringMatching(UUID), realm: 'hub', expires_at: null });
      expect(s.collector_id).toBe(await saltedHash(CONFIG.salt, 'collector', CID));
      expect(s.run_id).toBe(starts[0]!.run_id);
    }
    // Each step ends where the next begins, and the hand-in ends as it is handed in.
    expect(ends[0]!.at).toBe(new Date(MON + 60_000).toISOString());
    expect(ends.at(-1)!.at).toBe(new Date(t.now()).toISOString());
    // The owl's own id never leaves the object.
    expect(JSON.stringify(t.bodies)).not.toContain(CID);
    expect(JSON.stringify(t.bodies)).not.toContain(PASS);
  });

  it('ends a quest given up as abandoned, and a run taken again under new ids', async () => {
    const t = rig();
    const id = Object.values(t.quests.board(CID, t.now()).offers).flat().find((o) => o.cadence === 'daily')!.id;
    expect(t.quests.accept(CID, id, t.now()).ok).toBe(true);
    t.tick(60_000);
    expect(t.quests.abandon(CID, id, t.now()).ok).toBe(true);
    t.tick(60_000);
    expect(t.quests.accept(CID, id, t.now()).ok).toBe(true);
    const rows = await t.rows();
    expect(rows.map((r) => (r.event === 'end' ? `end ${r.outcome}` : `start ${r.step_no}`))).toEqual(['start 1', 'end abandoned', 'start 1']);
    const [first, , again] = rows as [Extract<QuestProgressRow, { event: 'start' }>, QuestProgressRow, Extract<QuestProgressRow, { event: 'start' }>];
    expect(again.run_id).not.toBe(first.run_id);
    expect(again.progress_id).not.toBe(first.progress_id);
    expect(first.expires_at).toBe(new Date(nextParkDayAt(MON)).toISOString());
  });

  it('ends a daily quest left over the night as expired at midnight, once the book notices', async () => {
    const t = rig();
    const id = Object.values(t.quests.board(CID, t.now()).offers).flat().find((o) => o.cadence === 'daily')!.id;
    t.quests.accept(CID, id, t.now());
    t.tick(2 * 24 * HOUR);
    t.quests.board(CID, t.now());
    const rows = await t.rows();
    expect(rows.at(-1)).toMatchObject({ event: 'end', outcome: 'expired', at: new Date(nextParkDayAt(MON)).toISOString() });
  });

  it('sends the quest catalogue after the collectibles, once, and again only when it changes', async () => {
    const t = rig();
    t.quests.accept(CID, 'story-welcome', t.now(), 'hub');
    await t.rows();
    expect(t.bodies.map((b) => b.kind)).toEqual(['quest_progress', 'catalogue', 'quest_catalogue']);
    const cat = t.bodies[2] as { version: string; quests: unknown[]; steps: QuestCatalogueStep[] };
    expect(cat.version).toMatch(/^[0-9a-f]{16}$/);
    expect(cat.quests).toHaveLength(QUESTS.length);
    t.quests.event(CID, { kind: 'talk', npc: 'pip' }, t.now(), 'hub');
    await t.rows();
    expect(t.bodies.map((b) => b.kind)).toEqual(['quest_progress', 'catalogue', 'quest_catalogue', 'quest_progress']);
  });
});

describe('the quest catalogue (OP-266)', () => {
  const { quests, steps } = questCatalogue();

  it('lists every quest, and every step of each with the hand-in last', () => {
    expect(quests.map((q) => q.quest_id)).toEqual(QUESTS.map((q) => q.id));
    expect(steps).toHaveLength(QUESTS.reduce((n, q) => n + q.steps.length + 1, 0));
    for (const q of quests) {
      const mine = steps.filter((s) => s.quest_id === q.quest_id);
      expect(mine.map((s) => s.step_no)).toEqual(Array.from({ length: q.step_count + 1 }, (_, i) => i + 1));
      expect(mine.at(-1)).toMatchObject({ goal_kind: 'hand_in', target_npc: q.giver_npc, target_room: q.giver_room });
      expect(q.giver_room).not.toBeNull();
    }
  });

  it('places each step where it happens: a talk at the NPC, a visit in its room, a puzzle by its id alone', () => {
    const w = steps.filter((s) => s.quest_id === 'story-welcome');
    expect(w.map((s) => [s.goal_kind, s.target_room, s.target_npc, s.target_thing])).toEqual([
      ['talk', 'hub', 'pip', null],
      ['visit', 'grove', null, null],
      ['interact', null, null, 'leaf-pile'],
      ['talk', 'market', 'nova', null],
      ['emote', 'hub', 'bramble', 'hoot'],
      ['hand_in', 'hub', 'bramble', null],
    ]);
    const puzzle = steps.find((s) => s.goal_kind === 'puzzle')!;
    expect(puzzle.target_room).toBeNull();
    expect(quests.find((q) => q.quest_id === puzzle.quest_id)!.puzzle_id).toBe(puzzle.target_thing);
    for (const s of steps) {
      expect(s.need_count).toBeGreaterThanOrEqual(1);
      expect(s.step_text.length).toBeGreaterThan(0);
      if (s.target_room) expect(s.target_realm_kind).not.toBeNull();
    }
  });
});
