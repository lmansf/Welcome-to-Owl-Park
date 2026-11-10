import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_ROWS,
  checkContact,
  checkFeedback,
  checkItem,
  checkPurchase,
  checkPlayer,
  checkPlayEvent,
  checkRealmVisit,
  checkQuestProgress,
  checkQuestRef,
  checkQuestStepRef,
  checkRoomStay,
  checkRow,
  checkSession,
  gameTables,
  handle,
  type CatalogueRow,
  type ContactRow,
  type Db,
  type FeedbackRow,
  type LogRow,
  type PlayerRow,
  type PlayEventRow,
  type PurchaseRow,
  type QuestProgressRow,
  type QuestRefRow,
  type QuestStepRefRow,
  type RealmVisitRow,
  type RoomStayRow,
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
function memoryTables(): Tables & {
  rows: LogRow[];
  catalogue: Map<string, CatalogueRow & { in_catalogue: boolean }>;
  players: PlayerRow[];
  sessions: SessionRow[];
  realmVisits: RealmVisitRow[];
  feedback: FeedbackRow[];
  purchases: PurchaseRow[];
  contacts: ContactRow[];
  roomStays: Array<{ stay_id: string; session_id: string; realm: string; entered_at: string; left_at: string | null; exit_reason: string | null }>;
  questSteps: Array<{ progress_id: string; run_id: string; step_no: number; started_at: string; completed_at: string | null; outcome: string | null }>;
  quests: { quests: QuestRefRow[]; steps: QuestStepRefRow[] } | null;
  played: PlayEventRow[];
} {
  const rows: LogRow[] = [];
  const purchases: PurchaseRow[] = [];
  const contacts: ContactRow[] = [];
  const catalogue = new Map<string, CatalogueRow & { in_catalogue: boolean }>();
  const players: PlayerRow[] = [];
  const sessions: SessionRow[] = [];
  const realmVisits: RealmVisitRow[] = [];
  const feedback: FeedbackRow[] = [];
  const roomStays: Array<{ stay_id: string; session_id: string; realm: string; entered_at: string; left_at: string | null; exit_reason: string | null }> = [];
  const questSteps: Array<{ progress_id: string; run_id: string; step_no: number; started_at: string; completed_at: string | null; outcome: string | null }> = [];
  const tables = { quests: null as { quests: QuestRefRow[]; steps: QuestStepRefRow[] } | null };
  const played: PlayEventRow[] = [];
  return {
    played,
    async addPlayEvents(batch: PlayEventRow[]) {
      let kept = 0;
      for (const p of batch) if (!played.some((x) => x.event_id === p.event_id) && played.push(p)) kept++;
      return kept;
    },
    questSteps,
    get quests() {
      return tables.quests;
    },
    async setQuestCatalogue(quests: QuestRefRow[], steps: QuestStepRefRow[]) {
      tables.quests = { quests, steps };
    },
    // As game.apply_quest_progress does it (sql/quest_progress.sql), in order.
    async addQuestProgress(batch: QuestProgressRow[]) {
      let changed = 0;
      for (const e of batch) {
        if (e.event === 'start') {
          if (questSteps.some((x) => x.progress_id === e.progress_id)) continue;
          for (const x of questSteps) if (x.run_id === e.run_id && x.completed_at === null) Object.assign(x, { completed_at: e.at, outcome: 'done' });
          questSteps.push({ progress_id: e.progress_id, run_id: e.run_id, step_no: e.step_no, started_at: e.at, completed_at: null, outcome: null });
          changed++;
        } else {
          const x = questSteps.find((y) => y.progress_id === e.progress_id && y.completed_at === null);
          if (x && Object.assign(x, { completed_at: e.at, outcome: e.outcome })) changed++;
        }
      }
      return changed;
    },
    roomStays,
    // As game.apply_room_stays does it (sql/room_stays.sql), in order.
    async addRoomStays(batch: RoomStayRow[]) {
      let changed = 0;
      for (const e of batch) {
        if (e.event === 'enter') {
          if (roomStays.some((x) => x.stay_id === e.stay_id)) continue;
          for (const x of roomStays) if (x.session_id === e.session_id && x.left_at === null) Object.assign(x, { left_at: e.at, exit_reason: 'moved' });
          roomStays.push({ stay_id: e.stay_id, session_id: e.session_id, realm: e.realm, entered_at: e.at, left_at: null, exit_reason: null });
          changed++;
        } else {
          const x = roomStays.find((y) => y.stay_id === e.stay_id && y.left_at === null);
          if (x && Object.assign(x, { left_at: e.at, exit_reason: e.exit_reason })) changed++;
        }
      }
      return changed;
    },
    rows,
    catalogue,
    players,
    sessions,
    realmVisits,
    feedback,
    purchases,
    contacts,
    async check() {},
    async addPurchases(batch) {
      let kept = 0;
      for (const p of batch) if (!purchases.some((x) => x.event_id === p.event_id) && purchases.push(p)) kept++;
      return kept;
    },
    async addContacts(batch) {
      let kept = 0;
      for (const c of batch) if (!contacts.some((x) => x.shopify_order_id === c.shopify_order_id) && contacts.push(c)) kept++;
      return kept;
    },
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
    expect(checkRow(row(1, { realm: 'm3-hall' }))).toMatchObject({ realm: 'm3-hall' });
    expect(checkRow(row(1, { realm: 'nest-abcdefgh' }))).toBe('realm');
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
    expect(tables.sessions[0]).toEqual({ ...visit(10), visitor_kind: null, is_test: false });
  });

  it('takes an owl kind only from the fixed list and a colour only as a hex value, and a visit only forwards in time', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(checkPlayer(version(1))).toMatchObject({ owl_type: 'barn', color: '#7a5c99' });
    expect(checkPlayer(version(1, { owl_type: 'my favourite owl' }))).toBe('owl_type');
    expect(checkPlayer(version(1, { color: 'purple' }))).toBe('color');
    expect(checkPlayer(version(1, { change_reason: 'because' }))).toBe('change_reason');
    expect(checkPlayer(version(1, { collector_id: 'c_abcdefghij' }))).toBe('collector_id');
    // A visit from a Worker before OP-192 has no kind: kept without one.
    expect(checkSession(visit(1))).toEqual({ ...visit(1), visitor_kind: null, is_test: false });
    expect(checkSession(visit(1, { visitor_kind: 'spectator' }))).toEqual(visit(1, { visitor_kind: 'spectator', is_test: false }));
    // One of our own test visits is kept, marked; a Worker from before the mark sends none (a player's visit).
    expect(checkSession(visit(1, { is_test: true }))).toEqual({ ...visit(1), visitor_kind: null, is_test: true });
    expect(checkSession(visit(1, { is_test: 'yes' }))).toBe('is_test');
    expect(checkSession(visit(1, { visitor_kind: 'free' }))).toBe('visitor_kind');
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
    map_id: 1,
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

  it('takes only a neutral room slug, known kinds and entry sources, and time that goes forwards', () => {
    expect(checkRealmVisit(stay(1))).toEqual(stay(1));
    const hollow = stay(1, { realm: 'm3-hall', realm_kind: 'hub', map_id: 2 });
    expect(checkRealmVisit(hollow)).toEqual(hollow);
    expect(checkRealmVisit(stay(1, { realm: 'nest-abcdefgh' }))).toBe('realm');
    expect(checkRealmVisit(stay(1, { realm: null }))).toBe('realm');
    expect(checkRealmVisit(stay(1, { realm_kind: 'castle' }))).toBe('realm_kind');
    expect(checkRealmVisit(stay(1, { entry_source: 'teleport' }))).toBe('entry_source');
    // Come into by travel from the map (OP-130).
    expect(checkRealmVisit(stay(1, { entry_source: 'travel' }))).toEqual(stay(1, { entry_source: 'travel' }));
    // The tree (OP-128): its levels are rooms the log takes, and a time says which park it was in.
    expect(checkRealmVisit(stay(1, { realm: 'l1', realm_kind: 'hub', map_id: 2 }))).toEqual(stay(1, { realm: 'l1', realm_kind: 'hub', map_id: 2 }));
    expect(checkRealmVisit(stay(1, { realm: '1l' }))).toBe('realm');
    expect(checkRealmVisit(stay(1, { map_id: 3 }))).toBe('map_id');
    expect(checkRealmVisit(stay(1, { map_id: '2' }))).toBe('map_id');
    // A Worker from before the tree sends no park: today's.
    const { map_id: _none, ...old } = stay(1);
    expect(checkRealmVisit(old)).toEqual(stay(1));
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
    const hollow = note(1, { realm: 'm3-hall', realm_kind: 'hub' });
    expect(checkFeedback(hollow)).toEqual(hollow);
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

describe('tickets and buyers (OP-192)', () => {
  const B = 'b'.repeat(64);
  const event = (i: number, extra: Record<string, unknown> = {}) => ({
    event_id: uuid(i),
    event: 'paid',
    order_key: uuid(500),
    collector_id: null,
    occurred_at: '2026-11-02T16:00:00.000Z',
    ticket_kinds: ['day', 'annual'],
    tickets: 2,
    amount_cents: 4497,
    upsell: true,
    held: false,
    via: null,
    valid_until: null,
    ...extra,
  });
  const buyer = (extra: Record<string, unknown> = {}) => ({
    shopify_order_id: '1001',
    order_key: uuid(500),
    email: 'buyer@example.com',
    shopify_customer_id: '77',
    ordered_at: '2026-11-02T16:00:00.000Z',
    ...extra,
  });

  it('keeps each ticket event once, however often it is sent', async () => {
    const tables = memoryTables();
    const claimed = event(2, { event: 'claimed', collector_id: B, ticket_kinds: [], amount_cents: null, upsell: false, via: 'claim' });
    expect(await (await post({ kind: 'purchase', rows: [event(1), claimed, event(1)] }, { tables })).json()).toEqual({ ok: true, kept: 2, duplicates: 1, skipped: 0 });
    expect(tables.purchases).toEqual([event(1), claimed]);
  });

  it('takes an event and a ticket kind only from their lists, the order and the owl only as hashes, and nothing that names anyone', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(checkPurchase(event(1))).toEqual(event(1));
    expect(checkPurchase(event(1, { event: 'gifted' }))).toBe('event');
    expect(checkPurchase(event(1, { order_key: '1001' }))).toBe('order_key');
    expect(checkPurchase(event(1, { order_key: null }))).toBe('order_key');
    // A scan of a ticket the keepers gave has no order, but always an owl.
    const scan = event(3, { event: 'scanned', order_key: null, collector_id: B, ticket_kinds: ['day'], tickets: 1, amount_cents: null, upsell: false, valid_until: '2026-11-03T16:00:00.000Z' });
    expect(checkPurchase(scan)).toEqual(scan);
    expect(checkPurchase({ ...scan, collector_id: null })).toBe('collector_id');
    expect(checkPurchase(event(1, { collector_id: 'c_abcdefghij' }))).toBe('collector_id');
    expect(checkPurchase(event(1, { ticket_kinds: ['vip'] }))).toBe('ticket_kinds');
    expect(checkPurchase(event(1, { amount_cents: 12.5 }))).toBe('amount_cents');
    expect(checkPurchase(event(1, { via: 'email' }))).toBe('via');
    expect(checkPurchase(event(1, { valid_until: 'tomorrow' }))).toBe('valid_until');
    expect(Object.keys(checkPurchase({ ...event(1), email: 'buyer@example.com', order_id: '1001' }) as object)).toEqual(Object.keys(event(1)));
  });

  it('keeps a buyer by order, the email only in the shape the park keys emails, and refuses one into any other kind', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const tables = memoryTables();
    expect(await (await post({ kind: 'contact', rows: [buyer(), buyer()] }, { tables })).json()).toEqual({ ok: true, kept: 1, duplicates: 1, skipped: 0 });
    expect(tables.contacts).toEqual([buyer()]);
    expect(checkContact(buyer({ shopify_customer_id: null }))).toEqual(buyer({ shopify_customer_id: null }));
    expect(checkContact(buyer({ email: 'Buyer@Example.com' }))).toBe('email');
    expect(checkContact(buyer({ email: 'not an email' }))).toBe('email');
    expect(checkContact(buyer({ email: 'a\u0000b@example.com' }))).toBe('email');
    expect(checkContact(buyer({ shopify_order_id: 'comp-abc' }))).toBe('shopify_order_id');
    expect(checkContact(buyer({ shopify_customer_id: 'gid://shopify/Customer/77' }))).toBe('shopify_customer_id');
    expect(checkContact(buyer({ order_key: '1001' }))).toBe('order_key');
    expect(Object.keys(checkContact({ ...buyer(), name: 'Someone', address: '1 Owl Way' }) as object)).toEqual(Object.keys(buyer()));
    // An email never lands in a game table: a session or a ticket event takes no such field.
    expect(JSON.stringify(checkPurchase({ ...event(1), email: 'buyer@example.com' }))).not.toContain('example.com');
  });
});

describe('room stays, live (OP-265)', () => {
  const enter = (i: number, extra: Record<string, unknown> = {}) => ({
    event: 'enter',
    stay_id: uuid(i),
    session_id: uuid(900),
    collector_id: A,
    at: `2026-11-03T16:0${i}:00.000Z`,
    realm: 'grove',
    realm_kind: 'realm',
    map_id: 1,
    entry_source: 'walked',
    ...extra,
  });
  const leave = (i: number, at: string, reason: string) => ({ event: 'leave', stay_id: uuid(i), at, exit_reason: reason });

  it('opens a stay as the owl comes in, closes it as moved when the next opens, and changes nothing when sent again', async () => {
    const tables = memoryTables();
    const batch = { kind: 'room_stay', rows: [enter(1, { entry_source: 'spawn', realm: 'lobby', realm_kind: 'hub' }), enter(2, { realm: 'l5-street', realm_kind: 'hub' }), leave(2, '2026-11-03T16:05:00.000Z', 'logoff')] };
    expect(await (await post(batch, { tables })).json()).toEqual({ ok: true, kept: 3, duplicates: 0, skipped: 0 });
    expect(await (await post(batch, { tables })).json()).toEqual({ ok: true, kept: 0, duplicates: 3, skipped: 0 });
    expect(tables.roomStays.map((r) => [r.realm, r.left_at, r.exit_reason])).toEqual([
      ['lobby', '2026-11-03T16:02:00.000Z', 'moved'],
      ['l5-street', '2026-11-03T16:05:00.000Z', 'logoff'],
    ]);
  });

  it('takes an exit reason and an entry only from their lists, the owl and the visit only as hashes, and no other field', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(checkRoomStay(enter(1))).toEqual(enter(1));
    expect(checkRoomStay(enter(1, { map_id: undefined }))).toEqual(enter(1));
    expect(checkRoomStay(leave(1, '2026-11-03T16:05:00Z', 'server_restart'))).toEqual(leave(1, '2026-11-03T16:05:00.000Z', 'server_restart'));
    expect(checkRoomStay(leave(1, '2026-11-03T16:05:00Z', 'kicked'))).toBe('exit_reason');
    expect(checkRoomStay(enter(1, { entry_source: 'reconnect' }))).toBe('entry_source');
    expect(checkRoomStay(enter(1, { event: 'teleport' }))).toBe('event');
    expect(checkRoomStay(enter(1, { collector_id: 'c_abcdefghij' }))).toBe('collector_id');
    expect(checkRoomStay(enter(1, { session_id: 'v_visitAAAA1' }))).toBe('session_id');
    expect(checkRoomStay(enter(1, { realm: 'Grove!' }))).toBe('realm');
    expect(checkRoomStay(enter(1, { map_id: 3 }))).toBe('map_id');
    expect(checkRoomStay(enter(1, { at: 'now' }))).toBe('at');
    expect(checkRoomStay({ ...enter(1), stay_id: 'x' })).toBe('stay_id');
    // A position, a name or an address is never taken, even when sent.
    expect(Object.keys(checkRoomStay({ ...enter(1), x: 120, y: 300, name: 'Hoot', ip: '1.2.3.4' }) as object)).toEqual(Object.keys(enter(1)));
    expect(Object.keys(checkRoomStay({ ...leave(1, '2026-11-03T16:05:00Z', 'moved'), x: 1 }) as object)).toEqual(['event', 'stay_id', 'at', 'exit_reason']);
  });

});

describe('quest progress (OP-266)', () => {
  const start = (i: number, extra: Record<string, unknown> = {}) => ({
    event: 'start',
    progress_id: uuid(i),
    run_id: uuid(500),
    collector_id: A,
    session_id: uuid(900),
    quest_id: 'story-welcome',
    period: '',
    step_no: i,
    at: `2026-11-04T16:0${i}:00.000Z`,
    realm: 'hub',
    expires_at: null,
    ...extra,
  });
  const end = (i: number, outcome = 'done', extra: Record<string, unknown> = {}) => ({ event: 'end', progress_id: uuid(i), at: `2026-11-04T16:0${i}:30.000Z`, session_id: uuid(900), realm: 'grove', outcome, ...extra });
  const quest = (extra: Record<string, unknown> = {}) => ({
    quest_id: 'story-welcome',
    title: 'Welcome to Owl Park',
    giver_npc: 'bramble',
    giver_room: 'hub',
    quest_type: 'mixed',
    difficulty: 'easy',
    length: 'long',
    cadence: 'story',
    template: null,
    step_count: 1,
    reward_feathers: 50,
    reward_item: 'leaf-crown~0',
    requires: [],
    puzzle_id: null,
    ...extra,
  });
  const step = (n: number, extra: Record<string, unknown> = {}) => ({
    quest_id: 'story-welcome',
    step_no: n,
    goal_kind: n === 1 ? 'talk' : 'hand_in',
    target_room: 'hub',
    target_realm_kind: 'hub',
    target_npc: n === 1 ? 'pip' : 'bramble',
    target_thing: null,
    need_count: 1,
    distinct_only: false,
    step_text: n === 1 ? 'Talk to Pip at the hub' : 'Hand it in to Bramble',
    ...extra,
  });
  const post = (body: unknown) => new Request('https://log.example/owl-park-log', { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: JSON.stringify(body) });

  it('applies each step in order: a start closes the run step before it, an end closes its own, a batch sent twice changes nothing', async () => {
    const tables = memoryTables();
    const batch = { kind: 'quest_progress', rows: [start(1), end(1), start(2), start(3), end(3, 'abandoned')] };
    const res = await handle(post(batch), { key: KEY, tables });
    expect(await res.json()).toEqual({ ok: true, kept: 5, duplicates: 0, skipped: 0 });
    expect(tables.questSteps.map((x) => [x.step_no, x.outcome])).toEqual([
      [1, 'done'],
      [2, 'done'],
      [3, 'abandoned'],
    ]);
    const again = await handle(post(batch), { key: KEY, tables });
    expect(await again.json()).toEqual({ ok: true, kept: 0, duplicates: 5, skipped: 0 });
  });

  it('checks every field, and takes nothing it does not know: never a code, a name or a position', () => {
    expect(checkQuestProgress(start(1))).toEqual(start(1));
    expect(checkQuestProgress(start(1, { period: '2026-11-04', expires_at: '2026-11-05T05:00:00Z' }))).toMatchObject({ period: '2026-11-04', expires_at: '2026-11-05T05:00:00.000Z' });
    expect(checkQuestProgress(start(1, { period: 'W2026-11-02' }))).toMatchObject({ period: 'W2026-11-02' });
    expect(checkQuestProgress(start(1, { period: 'M2026-11', realm: null, session_id: null }))).toMatchObject({ realm: null, session_id: null });
    expect(checkQuestProgress(start(1, { collector_id: 'c_abcdefghij' }))).toBe('collector_id');
    expect(checkQuestProgress(start(1, { quest_id: 'Story Welcome' }))).toBe('quest_id');
    expect(checkQuestProgress(start(1, { period: 'yesterday' }))).toBe('period');
    expect(checkQuestProgress(start(1, { step_no: 0 }))).toBe('step_no');
    expect(checkQuestProgress(start(1, { expires_at: 'soon' }))).toBe('expires_at');
    expect(checkQuestProgress(start(1, { realm: 'The Grove' }))).toBe('realm');
    expect(checkQuestProgress(start(1, { run_id: 'x' }))).toBe('run_id');
    expect(checkQuestProgress(end(1, 'won'))).toBe('outcome');
    expect(checkQuestProgress({ ...end(1), event: 'peek' })).toBe('event');
    expect(Object.keys(checkQuestProgress({ ...start(1), code: ['moon', 'star'], name: 'Hoot', x: 1 }) as object)).toEqual(Object.keys(start(1)));
    expect(Object.keys(checkQuestProgress({ ...end(1), code: ['moon'] }) as object)).toEqual(['event', 'progress_id', 'at', 'session_id', 'realm', 'outcome']);
  });

  it('takes the quest catalogue whole, or refuses it whole', async () => {
    const tables = memoryTables();
    const ok = await handle(post({ kind: 'quest_catalogue', version: 'abc', quests: [quest()], steps: [step(1), step(2)] }), { key: KEY, tables });
    expect(await ok.json()).toEqual({ ok: true, quests: 1, steps: 2 });
    expect(tables.quests!.steps.map((s) => s.goal_kind)).toEqual(['talk', 'hand_in']);
    const bad = async (body: Record<string, unknown>) => (await handle(post({ kind: 'quest_catalogue', quests: [quest()], steps: [step(1)], ...body }), { key: KEY, tables })).status;
    expect(await bad({ quests: [quest({ cadence: 'hourly' })] })).toBe(400);
    expect(await bad({ quests: [quest(), quest()] })).toBe(400);
    expect(await bad({ steps: [step(1, { quest_id: 'not-listed' })] })).toBe(400);
    expect(await bad({ steps: [step(1, { step_text: 'Talk\u0000' })] })).toBe(400);
    expect(await bad({ steps: [] })).toBe(400);
    expect(checkQuestRef(quest({ reward_item: 'pick', template: 'leaves', requires: ['story-welcome'], puzzle_id: 'lockbox' }))).toMatchObject({ reward_item: 'pick', puzzle_id: 'lockbox' });
    expect(checkQuestRef(quest({ title: 'x'.repeat(201) }))).toBeNull();
    expect(checkQuestStepRef(step(1, { goal_kind: 'fly' }))).toBeNull();
    expect(checkQuestStepRef(step(1, { target_room: null, target_realm_kind: null, target_thing: 'leaf-pile', need_count: 3, distinct_only: true }))).toMatchObject({ target_room: null, need_count: 3 });
  });
});

describe('play events (OP-304)', () => {
  const ev = (i: number, extra: Record<string, unknown> = {}) => ({
    event_id: uuid(i),
    event: 'course_fall',
    collector_id: A,
    session_id: uuid(900),
    run_id: uuid(500),
    occurred_at: '2026-11-08T02:00:00.000Z',
    realm: 'trail-1',
    course_id: 'trail',
    thing: null,
    pos_x: 1230,
    pos_y: 720,
    ms: null,
    practice: false,
    ...extra,
  });
  const post = (body: unknown) => new Request('https://log.example/owl-park-log', { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: JSON.stringify(body) });

  it('keeps each event once by its event id, and leaves out a row that fails its check', async () => {
    const tables = memoryTables();
    const rows = [ev(1), ev(2, { event: 'course_start', pos_x: null, pos_y: null }), ev(3, { event: 'interact', course_id: null, run_id: null, thing: 'leaf-pile:hub-leaves-1', pos_x: null, pos_y: null }), ev(4, { event: 'teleport' })];
    const res = await handle(post({ kind: 'play_event', rows }), { key: KEY, tables });
    expect(await res.json()).toEqual({ ok: true, kept: 3, duplicates: 0, skipped: 1 });
    const again = await handle(post({ kind: 'play_event', rows: rows.slice(0, 3) }), { key: KEY, tables });
    expect(await again.json()).toEqual({ ok: true, kept: 0, duplicates: 3, skipped: 0 });
  });

  it('checks every field, keeps a position for a fall alone, and takes nothing it does not know', () => {
    expect(checkPlayEvent(ev(1))).toEqual(ev(1));
    expect(checkPlayEvent(ev(1, { event: 'course_clear', pos_x: null, pos_y: null, ms: 30_000 }))).toMatchObject({ ms: 30_000 });
    expect(checkPlayEvent(ev(1, { event: 'course_start', pos_x: 10, pos_y: null }))).toBe('pos_x');
    expect(checkPlayEvent(ev(1, { pos_x: 1.5 }))).toBe('pos_x');
    expect(checkPlayEvent(ev(1, { pos_y: 1e9 }))).toBe('pos_y');
    expect(checkPlayEvent(ev(1, { collector_id: 'c_abcdefghij' }))).toBe('collector_id');
    expect(checkPlayEvent(ev(1, { course_id: null }))).toBe('course_id');
    expect(checkPlayEvent(ev(1, { course_id: 'Trail One' }))).toBe('course_id');
    expect(checkPlayEvent(ev(1, { event: 'interact', course_id: null, thing: null, pos_x: null, pos_y: null }))).toBe('thing');
    expect(checkPlayEvent(ev(1, { thing: '<b>' }))).toBe('thing');
    expect(checkPlayEvent(ev(1, { realm: 'The Grove' }))).toBe('realm');
    expect(checkPlayEvent(ev(1, { ms: -1 }))).toBe('ms');
    expect(checkPlayEvent(ev(1, { practice: 'yes' }))).toBe('practice');
    expect(checkPlayEvent(ev(1, { occurred_at: 'now' }))).toBe('occurred_at');
    expect(checkPlayEvent(ev(1, { run_id: 'x' }))).toBe('run_id');
    expect(Object.keys(checkPlayEvent({ ...ev(1), name: 'Hoot', ip: '1.2.3.4' }) as object)).toEqual(Object.keys(ev(1)));
  });
});

describe("the game schema's tables", () => {
  it('keeps play events (OP-304) once by event id, the rows only in the JSON parameter', async () => {
    const calls: Array<{ query: string; params: unknown[] }> = [];
    const db: Db = { unsafe: async (query, params) => (calls.push({ query, params }), [{ event_id: 'x' }]) };
    const r = checkPlayEvent({ event_id: uuid(1), event: 'interact', collector_id: A, session_id: null, run_id: null, occurred_at: '2026-11-08T02:00:00Z', realm: 'hub', course_id: null, thing: 'leaf-pile:hub-leaves-1', pos_x: null, pos_y: null, ms: null, practice: false }) as PlayEventRow;
    expect(await gameTables(db).addPlayEvents([r])).toBe(1);
    expect(calls[0]!.query).toContain('insert into game.play_event');
    expect(calls[0]!.query).toContain('on conflict (event_id) do nothing');
    expect(calls[0]!.params).toEqual([JSON.stringify([r])]);
    expect(calls[0]!.query).not.toContain(A);
  });

  function recorder(answer: unknown = []): Db & { calls: Array<{ query: string; params: unknown[] }> } {
    const calls: Array<{ query: string; params: unknown[] }> = [];
    return { calls, unsafe: async (query, params) => (calls.push({ query, params }), answer) };
  }

  it('applies quest steps and sets the quest catalogue (OP-266) through database functions, the rows only in JSON parameters', async () => {
    const db = recorder([{ kept: 1 }]);
    const rows = [checkQuestProgress({ event: 'end', progress_id: uuid(1), at: '2026-11-04T16:00:00Z', session_id: null, realm: null, outcome: 'expired' })] as QuestProgressRow[];
    expect(await gameTables(db).addQuestProgress(rows)).toBe(1);
    expect(db.calls[0]!.query).toBe('select game.apply_quest_progress($1::text::jsonb) as kept');
    expect(db.calls[0]!.params).toEqual([JSON.stringify(rows)]);
    await gameTables(db).setQuestCatalogue([], []);
    expect(db.calls[1]!.query).toBe('select game.set_quest_catalogue($1::text::jsonb, $2::text::jsonb)');
    expect(db.calls[1]!.params).toEqual(['[]', '[]']);
  });

  it('applies live room stays (OP-265) through the database function, the events only in its JSON parameter', async () => {
    const db = recorder([{ kept: 2 }]);
    const rows = [checkRoomStay({ event: 'enter', stay_id: uuid(1), session_id: uuid(900), collector_id: A, at: '2026-11-03T16:00:00Z', realm: 'grove', realm_kind: 'realm', map_id: 1, entry_source: 'walked' }), checkRoomStay({ event: 'leave', stay_id: uuid(1), at: '2026-11-03T16:05:00Z', exit_reason: 'timeout' })] as RoomStayRow[];
    expect(await gameTables(db).addRoomStays(rows)).toBe(2);
    expect(db.calls[0]!.query).toBe('select game.apply_room_stays($1::text::jsonb) as kept');
    expect(db.calls[0]!.params).toEqual([JSON.stringify(rows)]);
  });
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

  it('keeps a ticket event once by its event id in the game schema, and a buyer only through the contacts schema (OP-192)', async () => {
    const db = recorder([{ event_id: uuid(1) }]);
    const p = checkPurchase({ event_id: uuid(1), event: 'claimed', order_key: uuid(2), collector_id: A, occurred_at: '2026-11-02T16:00:00Z', ticket_kinds: [], tickets: 2, amount_cents: null, upsell: false, held: false, via: 'checkout', valid_until: null }) as PurchaseRow;
    expect(await gameTables(db).addPurchases([p])).toBe(1);
    expect(db.calls[0]!.query).toContain('insert into game.fact_purchase');
    expect(db.calls[0]!.query).toContain('on conflict (event_id) do nothing');
    expect(db.calls[0]!.params).toEqual([JSON.stringify([p])]);
    const c2 = recorder([{ kept: 1 }]);
    const c = checkContact({ shopify_order_id: '1001', order_key: uuid(2), email: "o'brien@example.com", shopify_customer_id: null, ordered_at: '2026-11-02T16:00:00Z' }) as ContactRow;
    expect(await gameTables(c2).addContacts([c])).toBe(1);
    expect(c2.calls[0]!.query).toBe('select contacts.add_contacts($1::text::jsonb) as kept');
    expect(c2.calls[0]!.params).toEqual([JSON.stringify([c])]);
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
