import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_ROWS,
  checkFeedback,
  checkItem,
  checkPlayer,
  checkRealmVisit,
  checkRow,
  checkSession,
  gameTables,
  handle,
  type CatalogueRow,
  type Db,
  type FeedbackRow,
  type LogRow,
  type PlayerRow,
  type RealmVisitRow,
  type SessionRow,
  type Tables,
} from '../src/handler.ts';

const KEY = 'k'.repeat(32);
const A = 'a'.repeat(64);
const uuid = (i: number) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`;

/** A row as the park's collections object sends it (apps/edge/src/collectLog.ts). */
const row = (i: number, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  event_id: uuid(i),
  collector_id: A,
  collectible_id: 'cape~2',
  collectible_type: 'quest',
  realm: 'grove',
  acquired_at: '2026-10-19T16:12:00.000Z',
  session_id: uuid(900),
  device_class: 'phone',
  first_entry_at: '2026-10-19T16:00:00.000Z',
  backfill: false,
  ...extra,
});

/** The tables in memory, as the database keeps them: one row per event id, and per collector and collectible. */
function memoryTables(): Tables & { rows: LogRow[]; catalogue: Map<string, CatalogueRow & { in_catalogue: boolean }>; players: PlayerRow[]; sessions: SessionRow[]; realmVisits: RealmVisitRow[]; feedback: FeedbackRow[] } {
  const rows: LogRow[] = [];
  const catalogue = new Map<string, CatalogueRow & { in_catalogue: boolean }>();
  const players: PlayerRow[] = [];
  const sessions: SessionRow[] = [];
  const realmVisits: RealmVisitRow[] = [];
  const feedback: FeedbackRow[] = [];
  return {
    rows,
    catalogue,
    players,
    sessions,
    realmVisits,
    feedback,
    async check() {},
    async addFeedback(batch) {
      let kept = 0;
      for (const f of batch) if (!feedback.some((x) => x.event_id === f.event_id) && feedback.push(f)) kept++;
      return kept;
    },
    async addPlayers(batch) {
      let kept = 0;
      for (const p of batch) if (!players.some((x) => x.event_id === p.event_id) && players.push(p)) kept++;
      return kept;
    },
    async addSessions(batch) {
      let kept = 0;
      for (const v of batch) if (!sessions.some((x) => x.session_id === v.session_id) && sessions.push(v)) kept++;
      return kept;
    },
    async addRealmVisits(batch) {
      let kept = 0;
      for (const v of batch) {
        if (!sessions.some((x) => x.session_id === v.session_id) || realmVisits.some((x) => x.visit_id === v.visit_id)) continue;
        realmVisits.push(v);
        kept++;
      }
      return kept;
    },
    async addRows(batch) {
      let kept = 0;
      for (const r of batch) {
        if (rows.some((x) => x.event_id === r.event_id || (x.collector_id === r.collector_id && x.collectible_id === r.collectible_id))) continue;
        rows.push(r);
        kept++;
      }
      return kept;
    },
    async setCatalogue(items) {
      for (const c of catalogue.values()) c.in_catalogue = false;
      for (const i of items) catalogue.set(i.collectible_id, { ...i, in_catalogue: true });
    },
  };
}

function post(body: unknown, opts: { key?: string; tables?: Tables | null; auth?: string; method?: string } = {}) {
  const tables = opts.tables === undefined ? memoryTables() : opts.tables;
  const req = new Request('https://project.example/functions/v1/owl-park-log', {
    method: opts.method ?? 'POST',
    headers: { Authorization: opts.auth ?? `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    ...(opts.method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  return handle(req, { key: opts.key === undefined ? KEY : opts.key, tables });
}

afterEach(() => vi.restoreAllMocks());

describe('the park log (OP-107)', () => {
  it('refuses everything until its key is set, and anything without the key', async () => {
    expect((await post({ kind: 'collect', rows: [] }, { key: '' })).status).toBe(503);
    expect((await post({ kind: 'collect', rows: [] }, { auth: 'Bearer not-the-key-at-all' })).status).toBe(401);
    expect((await post({ kind: 'collect', rows: [] }, { auth: '' })).status).toBe(401);
    expect((await post(null, { method: 'GET' })).status).toBe(405);
    expect((await post('not json')).status).toBe(400);
    expect((await post({ kind: 'score' })).status).toBe(400);
  });

  it('says on a dry run whether its tables answer, and keeps nothing', async () => {
    const tables = memoryTables();
    expect(await (await post({ dry_run: true }, { tables })).json()).toEqual({ ok: true, dry_run: true, tables: 'ok' });
    expect(await (await post({ dry_run: true }, { tables: null })).json()).toMatchObject({ tables: 'not set up' });
    const down = { ...memoryTables(), check: () => Promise.reject(new Error('no route to the database')) };
    expect(await (await post({ dry_run: true }, { tables: down })).json()).toMatchObject({ tables: 'unreachable: no route to the database' });
    expect(tables.rows).toEqual([]);
  });

  it('keeps each collectible once, however often it is sent', async () => {
    const tables = memoryTables();
    const res = await post({ kind: 'collect', rows: [row(1), row(2, { collectible_id: 'hoot', collectible_type: 'starter' })] }, { tables });
    expect(await res.json()).toEqual({ ok: true, kept: 2, duplicates: 0, skipped: 0 });
    // The same batch again (a send the park thought failed), and the same acquisition under another id.
    expect(await (await post({ kind: 'collect', rows: [row(1), row(3)] }, { tables })).json()).toEqual({ ok: true, kept: 0, duplicates: 2, skipped: 0 });
    expect(tables.rows.map((r) => r.collectible_id)).toEqual(['cape~2', 'hoot']);
  });

  it('takes only the fields the table has, and leaves out a row that could name anyone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const tables = memoryTables();
    const res = await post(
      {
        kind: 'collect',
        rows: [
          row(1, { email: 'someone@example.com', ip: '203.0.113.9' }),
          row(2, { collector_id: 'c_abcdefghij' }), // a raw collector id, not its hash
          row(3, { session_id: 'v_visitAAAA1' }), // a raw pass id
          row(4, { device_class: 'iPhone 15 Pro' }),
          row(5, { realm: 'Some Place' }),
          row(6, { collectible_type: 'stolen' }),
          row(7, { acquired_at: 'yesterday' }),
        ],
      },
      { tables },
    );
    expect(await res.json()).toEqual({ ok: true, kept: 1, duplicates: 0, skipped: 6 });
    expect(Object.keys(tables.rows[0]!).sort()).toEqual(
      ['acquired_at', 'backfill', 'collectible_id', 'collectible_type', 'collector_id', 'device_class', 'event_id', 'first_entry_at', 'realm', 'session_id'].sort(),
    );
    // The function's log says which fields failed, never what was in them.
    const logged = vi.mocked(console.error).mock.calls.flat().join(' ');
    expect(logged).not.toContain('c_abcdefghij');
    expect(logged).not.toContain('someone@example.com');
  });

  it('checks every field of a row', () => {
    expect(checkRow(row(1))).toMatchObject({ event_id: uuid(1), backfill: false });
    expect(checkRow(row(1, { realm: null, session_id: null, device_class: null, first_entry_at: null, backfill: true }))).toMatchObject({ realm: null, session_id: null, backfill: true });
    expect(checkRow(row(1, { collectible_id: 'furniture:rug' }))).toMatchObject({ collectible_id: 'furniture:rug' });
    expect(checkRow(row(1, { collectible_id: 'Not An Id' }))).toBe('collectible_id');
    expect(checkRow(row(1, { first_entry_at: 'soon' }))).toBe('first_entry_at');
    expect(checkRow(row(1, { backfill: 'yes' }))).toBe('backfill');
    expect(checkRow(row(1, { event_id: 'nope' }))).toBe('event_id');
    expect(checkRow(null)).toBe('event_id');
  });

  it('refuses a batch larger than it takes', async () => {
    const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => row(i));
    expect((await post({ kind: 'collect', rows })).status).toBe(413);
    expect((await post({ kind: 'collect', rows: 'all of them' })).status).toBe(400);
  });

  it('makes the catalogue the list it is sent, marking out any collectible no longer in it', async () => {
    const tables = memoryTables();
    const items = [
      { id: 'hoot', kind: 'emote', rarity: 'common', realm: null },
      { id: 'cape~2', kind: 'wear', rarity: 'rare', realm: null },
      { id: 'furniture:rug', kind: 'furniture', rarity: null, realm: null },
    ];
    expect(await (await post({ kind: 'catalogue', version: 'a', items }, { tables })).json()).toEqual({ ok: true, items: 3 });
    expect(await (await post({ kind: 'catalogue', version: 'b', items: items.slice(0, 2) }, { tables })).json()).toEqual({ ok: true, items: 2 });
    expect(tables.catalogue.get('furniture:rug')?.in_catalogue).toBe(false);
    expect(tables.catalogue.get('hoot')).toEqual({ collectible_id: 'hoot', kind: 'emote', rarity: 'common', realm: null, in_catalogue: true });
    // All or nothing: a catalogue with one bad entry changes nothing.
    expect((await post({ kind: 'catalogue', items: [...items, { id: 'x', kind: 'Bad Kind' }] }, { tables })).status).toBe(400);
    expect(tables.catalogue.get('furniture:rug')?.in_catalogue).toBe(false);
    expect(checkItem({ id: 'witch-hat~3', kind: 'wear', rarity: 'uncommon', realm: 'grove' })).toEqual({ collectible_id: 'witch-hat~3', kind: 'wear', rarity: 'uncommon', realm: 'grove' });
  });

  it('answers 503 when its tables are not there or refuse, so the park sends again later', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await post({ kind: 'collect', rows: [row(1)] }, { tables: null })).status).toBe(503);
    const refusing = { ...memoryTables(), addRows: () => Promise.reject(new Error('relation "game.collect_log" does not exist')) };
    expect((await post({ kind: 'collect', rows: [row(1)] }, { tables: refusing })).status).toBe(503);
  });
});

describe('the player stats (OP-111)', () => {
  const version = (i: number, extra: Record<string, unknown> = {}) => ({
    event_id: uuid(i),
    collector_id: A,
    owl_type: 'barn',
    color: '#7a5c99',
    changed_at: '2026-10-19T16:00:00.000Z',
    change_reason: 'first',
    ...extra,
  });
  const visit = (i: number, extra: Record<string, unknown> = {}) => ({
    session_id: uuid(i),
    collector_id: A,
    started_at: '2026-10-19T16:00:00.000Z',
    ended_at: '2026-10-19T16:25:00.000Z',
    device_class: 'phone',
    realms_entered: 3,
    collectibles_gained: 2,
    ...extra,
  });

  it('keeps versions of owls and visits, each once', async () => {
    const tables = memoryTables();
    expect(await (await post({ kind: 'player', rows: [version(1), version(2, { owl_type: 'snowy', change_reason: 'chosen' })] }, { tables })).json()).toEqual({ ok: true, kept: 2, duplicates: 0, skipped: 0 });
    expect(await (await post({ kind: 'player', rows: [version(1)] }, { tables })).json()).toEqual({ ok: true, kept: 0, duplicates: 1, skipped: 0 });
    expect(await (await post({ kind: 'session', rows: [visit(10), visit(10)] }, { tables })).json()).toEqual({ ok: true, kept: 1, duplicates: 1, skipped: 0 });
    expect(tables.sessions[0]).toEqual(visit(10));
  });

  it('takes an owl kind only from the fixed list and a colour only as a hex value, and a visit only forwards in time', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(checkPlayer(version(1))).toMatchObject({ owl_type: 'barn', color: '#7a5c99' });
    expect(checkPlayer(version(1, { owl_type: 'my favourite owl' }))).toBe('owl_type');
    expect(checkPlayer(version(1, { color: 'purple' }))).toBe('color');
    expect(checkPlayer(version(1, { change_reason: 'because' }))).toBe('change_reason');
    expect(checkPlayer(version(1, { collector_id: 'c_abcdefghij' }))).toBe('collector_id');
    expect(checkSession(visit(1))).toEqual(visit(1));
    expect(checkSession(visit(1, { ended_at: '2026-10-19T15:59:00.000Z' }))).toBe('ended_at');
    expect(checkSession(visit(1, { realms_entered: -1 }))).toBe('realms_entered');
    expect(checkSession(visit(1, { collectibles_gained: 2.5 }))).toBe('collectibles_gained');
    expect(checkSession(visit(1, { device_class: 'Pixel 9' }))).toBe('device_class');
    expect(Object.keys(checkSession({ ...visit(1), name: 'someone' }) as object)).not.toContain('name');
  });
});

describe('time per room (OP-113)', () => {
  const visit = { session_id: uuid(10), collector_id: A, started_at: '2026-10-19T16:00:00.000Z', ended_at: '2026-10-19T16:25:00.000Z', device_class: 'phone', realms_entered: 2, collectibles_gained: 1 };
  const stay = (i: number, extra: Record<string, unknown> = {}) => ({
    visit_id: uuid(i),
    session_id: uuid(10),
    collector_id: A,
    realm: 'glass',
    realm_kind: 'realm',
    entered_at: '2026-10-19T16:05:00.000Z',
    exited_at: '2026-10-19T16:25:00.000Z',
    entry_source: 'walked',
    collectibles_gained: 1,
    ...extra,
  });

  it("keeps each time in a room once, under its visit, and leaves out one whose visit is not there", async () => {
    const tables = memoryTables();
    await post({ kind: 'session', rows: [visit] }, { tables });
    expect(await (await post({ kind: 'realm_visit', rows: [stay(1), stay(1), stay(2, { session_id: uuid(11) })] }, { tables })).json()).toEqual({ ok: true, kept: 1, duplicates: 2, skipped: 0 });
    expect(tables.realmVisits).toEqual([stay(1)]);
  });

  it('takes a room only as a neutral word, its kind and how the owl came in only from their lists, and a time only forwards', () => {
    expect(checkRealmVisit(stay(1))).toEqual(stay(1));
    expect(checkRealmVisit(stay(1, { realm: 'nest-abcdefgh' }))).toBe('realm');
    expect(checkRealmVisit(stay(1, { realm: null }))).toBe('realm');
    expect(checkRealmVisit(stay(1, { realm_kind: 'castle' }))).toBe('realm_kind');
    expect(checkRealmVisit(stay(1, { entry_source: 'teleport' }))).toBe('entry_source');
    // Come into by travel from the map (OP-130).
    expect(checkRealmVisit(stay(1, { entry_source: 'travel' }))).toEqual(stay(1, { entry_source: 'travel' }));
    expect(checkRealmVisit(stay(1, { exited_at: '2026-10-19T16:04:59.000Z' }))).toBe('exited_at');
    expect(checkRealmVisit(stay(1, { collectibles_gained: -1 }))).toBe('collectibles_gained');
    expect(checkRealmVisit(stay(1, { visit_id: 'v_visitAAAA1' }))).toBe('visit_id');
    expect(Object.keys(checkRealmVisit({ ...stay(1), room: 'nest-abcdefgh', ip: '203.0.113.9' }) as object)).toEqual(Object.keys(stay(1)));
  });

  it('refuses a kind it does not know', async () => {
    const res = await post({ kind: 'realm_visits', rows: [stay(1)] });
    expect(res.status).toBe(400);
  });
});

describe("visitors' feedback (OP-166)", () => {
  const note = (i: number, extra: Record<string, unknown> = {}) => ({
    event_id: uuid(i),
    park_feedback_id: i,
    collector_id: A,
    session_id: uuid(10),
    kind: 'bug',
    body: 'The climb resets when I jump.\nOn my phone.',
    realm: 'glass',
    realm_kind: 'realm',
    device_class: 'phone',
    submitted_at: '2026-10-31T16:05:00.000Z',
    ...extra,
  });

  it('keeps each note once, however often it is sent', async () => {
    const tables = memoryTables();
    expect(await (await post({ kind: 'feedback', rows: [note(1), note(1), note(2)] }, { tables })).json()).toEqual({ ok: true, kept: 2, duplicates: 1, skipped: 0 });
    expect(tables.feedback[0]).toEqual(note(1));
  });

  it('takes the words only in the park\'s limits, the kind only from its list, and nothing that could name anyone', () => {
    expect(checkFeedback(note(1))).toEqual(note(1));
    expect(checkFeedback(note(1, { kind: 'complaint' }))).toBe('kind');
    expect(checkFeedback(note(1, { body: 'hi' }))).toBe('body');
    expect(checkFeedback(note(1, { body: 'x'.repeat(1001) }))).toBe('body');
    expect(checkFeedback(note(1, { body: 'bell\u0007 here' }))).toBe('body');
    expect(checkFeedback(note(1, { body: 42 }))).toBe('body');
    expect(checkFeedback(note(1, { collector_id: 'c_plainToken' }))).toBe('collector_id');
    expect(checkFeedback(note(1, { session_id: 'v_visitAAAA1' }))).toBe('session_id');
    expect(checkFeedback(note(1, { realm: 'nest-abcdefgh' }))).toBe('realm');
    expect(checkFeedback(note(1, { realm_kind: 'castle' }))).toBe('realm_kind');
    expect(checkFeedback(note(1, { device_class: 'Pixel 9' }))).toBe('device_class');
    expect(checkFeedback(note(1, { park_feedback_id: -1 }))).toBe('park_feedback_id');
    expect(checkFeedback(note(1, { submitted_at: 'yesterday' }))).toBe('submitted_at');
    expect(checkFeedback(note(1, { realm: null, realm_kind: null, session_id: null, device_class: null, park_feedback_id: null }))).toEqual(note(1, { realm: null, realm_kind: null, session_id: null, device_class: null, park_feedback_id: null }));
    expect(Object.keys(checkFeedback({ ...note(1), ua: 'Mozilla/5.0', screen: '390x844', ip: '203.0.113.9', email: 'a@b.c' }) as object)).toEqual(Object.keys(note(1)));
  });
});

describe("the game schema's tables", () => {
  function recorder(answer: unknown = []): Db & { calls: Array<{ query: string; params: unknown[] }> } {
    const calls: Array<{ query: string; params: unknown[] }> = [];
    return { calls, unsafe: async (query, params) => (calls.push({ query, params }), answer) };
  }

  it('sends a batch as one JSON parameter, skipping rows already there, and counts what the database kept', async () => {
    const db = recorder([{ event_id: uuid(1) }]);
    const r = checkRow(row(1)) as LogRow;
    expect(await gameTables(db).addRows([r])).toBe(1);
    const { query, params } = db.calls[0]!;
    expect(query).toContain('insert into game.collect_log');
    expect(query).toContain('jsonb_populate_recordset(null::game.collect_log, $1::text::jsonb)');
    expect(query).toContain('on conflict do nothing');
    expect(params).toEqual([JSON.stringify([r])]);
    // Nothing the park sends is in the query itself.
    expect(query).not.toContain(A);
  });

  it('replaces the catalogue in one statement', async () => {
    const db = recorder();
    await gameTables(db).setCatalogue([{ collectible_id: 'hoot', kind: 'emote', rarity: 'common', realm: null }]);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]!.query).toContain('insert into game.collectible_catalogue');
    expect(db.calls[0]!.query).toContain('set in_catalogue = false');
    expect(db.calls[0]!.params).toEqual([JSON.stringify([{ collectible_id: 'hoot', kind: 'emote', rarity: 'common', realm: null }])]);
  });

  it('applies versions through the database function, and ties each visit to the version it began in', async () => {
    const db = recorder([{ kept: 2 }]);
    const p = checkPlayer({ event_id: uuid(1), collector_id: A, owl_type: 'barn', color: '#7a5c99', changed_at: '2026-10-19T16:00:00Z', change_reason: 'first' }) as PlayerRow;
    expect(await gameTables(db).addPlayers([p])).toBe(2);
    expect(db.calls[0]!.query).toBe('select game.add_player_versions($1::text::jsonb) as kept');
    expect(db.calls[0]!.params).toEqual([JSON.stringify([p])]);
    const s2 = recorder([{ session_id: uuid(9) }]);
    expect(await gameTables(s2).addSessions([checkSession({ session_id: uuid(9), collector_id: A, started_at: '2026-10-19T16:00:00Z', ended_at: '2026-10-19T16:01:00Z', device_class: null, realms_entered: 0, collectibles_gained: 0 }) as SessionRow])).toBe(1);
    expect(s2.calls[0]!.query).toContain('insert into game.fact_session');
    expect(s2.calls[0]!.query).toContain('d.valid_from <= s.started_at');
    expect(s2.calls[0]!.query).toContain('on conflict (session_id) do nothing');
  });

  it('keeps a note once by its event id, its words only in the JSON parameter (OP-166)', async () => {
    const db = recorder([{ event_id: uuid(1) }]);
    const f = checkFeedback({ event_id: uuid(1), park_feedback_id: 3, collector_id: A, session_id: null, kind: 'idea', body: "'); drop table game.feedback; --", realm: 'hub', realm_kind: 'hub', device_class: 'desktop', submitted_at: '2026-10-31T16:00:00Z' }) as FeedbackRow;
    expect(await gameTables(db).addFeedback([f])).toBe(1);
    const { query, params } = db.calls[0]!;
    expect(query).toContain('insert into game.feedback');
    expect(query).toContain('jsonb_populate_recordset(null::game.feedback, $1::text::jsonb)');
    expect(query).toContain('on conflict (event_id) do nothing');
    expect(params).toEqual([JSON.stringify([f])]);
    expect(query).not.toContain('drop table');
  });

  it("keeps a time in a room only under a visit that is there, tied to the owl's version when it came in (OP-113)", async () => {
    const db = recorder([{ visit_id: uuid(1) }]);
    const v = checkRealmVisit({ visit_id: uuid(1), session_id: uuid(9), collector_id: A, realm: 'hub', realm_kind: 'hub', entered_at: '2026-10-19T16:00:00Z', exited_at: '2026-10-19T16:01:00Z', entry_source: 'spawn', collectibles_gained: 0 }) as RealmVisitRow;
    expect(await gameTables(db).addRealmVisits([v])).toBe(1);
    const { query, params } = db.calls[0]!;
    expect(query).toContain('insert into game.fact_realm_visit');
    expect(query).toContain('where exists (select 1 from game.fact_session s where s.session_id = r.session_id)');
    expect(query).toContain('d.valid_from <= r.entered_at');
    expect(query).toContain('on conflict (visit_id) do nothing');
    expect(params).toEqual([JSON.stringify([v])]);
    expect(query).not.toContain(A);
  });
});
