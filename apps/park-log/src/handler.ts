/**
 * The park's analytics log (OP-107): a Supabase Edge Function in the owner's fraud pipeline project,
 * beside the park's orders, so one project holds all of Owl Park's analytics. The park's collections
 * object posts a batch of rows whenever owls come by collectibles (`apps/edge/src/collectLog.ts`),
 * and the catalogue of every collectible whenever a deploy changes it:
 *
 * - `kind: "collect"`: the rows into `game.collect_log`, one per collector and collectible; a row
 *   already there (by its event id, or for that collector and collectible) is skipped, so a batch sent
 *   twice lands once.
 * - `kind: "catalogue"`: every collectible there is, into `game.collectible_catalogue`, which the
 *   views count for "% collected"; one no longer listed stays, marked out of the catalogue.
 * - `dry_run: true` (the owner's check, never the park): keeps nothing, and says whether the tables answer.
 *
 * The rows are anonymous by construction, and checked again here before anything is kept: the
 * collector and the visit are hashes, the device is phone or desktop, the place a room's neutral id,
 * and no other field is taken. A row that fails the check is left out and the rest are kept. The
 * park's key (`FRAUD_SCORE_KEY`, the fraud link's, sent as a bearer token) is checked here: the
 * function is deployed with the platform's JWT check off. This file is plain web code, so the tests
 * run it under Node.
 */

/** The largest request taken: the catalogue of about 1,200 collectibles is under 100 kB. */
const MAX_BODY = 512 * 1024;
/** The most rows in one batch (the park sends 100) and collectibles in one catalogue. */
export const MAX_ROWS = 500;
export const MAX_ITEMS = 10_000;

/** The shortest key taken: the Worker's is a long random string. */
const MIN_KEY = 16;

export const COLLECTIBLE_TYPES = ['quest', 'shop', 'gift', 'seasonal', 'starter', 'grant', 'purchase', 'find'] as const;
export type CollectibleType = (typeof COLLECTIBLE_TYPES)[number];

/** A row of `game.collect_log` as the park sends it, after the check. */
export interface LogRow {
  event_id: string;
  collector_id: string;
  collectible_id: string;
  collectible_type: CollectibleType;
  realm: string | null;
  acquired_at: string;
  session_id: string | null;
  device_class: 'phone' | 'desktop' | null;
  first_entry_at: string | null;
  backfill: boolean;
}

/** A row of `game.collectible_catalogue`. */
export interface CatalogueRow {
  collectible_id: string;
  kind: string;
  rarity: string | null;
  realm: string | null;
}

/** Where the rows go: the `game` schema through a database connection (`gameTables`), or a fake in tests. */
export interface Tables {
  /** Throws unless the tables answer (the dry run's check of the key). */
  check(): Promise<void>;
  /** Keeps the rows not there yet (by event id, or collector and collectible); returns how many those were. */
  addRows(rows: LogRow[]): Promise<number>;
  /** Makes the catalogue this list: each one in it, and every other one marked out of the catalogue. */
  setCatalogue(items: CatalogueRow[]): Promise<void>;
}

export interface Deps {
  /** FRAUD_SCORE_KEY, the key the park's Worker sends. Unset: every request is refused. */
  key: string | undefined;
  /** Null when the function cannot reach the tables: it says so, and the park sends again later. */
  tables: Tables | null;
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
/** A collection variant (`witch-hat~3`, `hoot`) or a piece of nest furniture (`furniture:rug`). */
const COLLECTIBLE = /^(furniture:)?[a-z0-9][a-z0-9-]{0,47}(~[0-9]{1,2})?$/;
/** A room's neutral id, a collectible's kind or a rarity: a short lower-case word. */
const WORD = /^[a-z]{1,20}$/;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function iso(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** A word or nothing: undefined when the value is neither (the row is then left out). */
function wordOrNull(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' && WORD.test(v) ? v : undefined;
}

/** Whether two keys are the same, compared by their digests so the time taken says nothing of either. */
async function sameKey(given: string, want: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(given)), crypto.subtle.digest('SHA-256', enc.encode(want))]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i]! ^ y[i]!;
  return d === 0;
}

/** A row as the table takes it, or the reason it is left out. Only the table's fields are copied: anything else sent is dropped. */
export function checkRow(v: unknown): LogRow | string {
  const r = obj(v);
  if (typeof r['event_id'] !== 'string' || !UUID.test(r['event_id'])) return 'event_id';
  if (typeof r['collector_id'] !== 'string' || !HASH.test(r['collector_id'])) return 'collector_id';
  if (typeof r['collectible_id'] !== 'string' || !COLLECTIBLE.test(r['collectible_id'])) return 'collectible_id';
  if (!COLLECTIBLE_TYPES.includes(r['collectible_type'] as CollectibleType)) return 'collectible_type';
  const realm = wordOrNull(r['realm']);
  if (realm === undefined) return 'realm';
  const acquired = iso(r['acquired_at']);
  if (!acquired) return 'acquired_at';
  const session = r['session_id'] ?? null;
  if (session !== null && (typeof session !== 'string' || !UUID.test(session))) return 'session_id';
  const device = r['device_class'] ?? null;
  if (device !== null && device !== 'phone' && device !== 'desktop') return 'device_class';
  const firstSent = r['first_entry_at'] ?? null;
  const first = firstSent === null ? null : iso(firstSent);
  if (firstSent !== null && first === null) return 'first_entry_at';
  const backfill = r['backfill'] ?? false;
  if (typeof backfill !== 'boolean') return 'backfill';
  return {
    event_id: r['event_id'],
    collector_id: r['collector_id'],
    collectible_id: r['collectible_id'],
    collectible_type: r['collectible_type'] as CollectibleType,
    realm,
    acquired_at: acquired,
    session_id: session as string | null,
    device_class: device as LogRow['device_class'],
    first_entry_at: first,
    backfill,
  };
}

/** A catalogue entry as the table takes it (the park sends `id`), or null to leave it out. */
export function checkItem(v: unknown): CatalogueRow | null {
  const i = obj(v);
  if (typeof i['id'] !== 'string' || !COLLECTIBLE.test(i['id'])) return null;
  if (typeof i['kind'] !== 'string' || !WORD.test(i['kind'])) return null;
  const rarity = wordOrNull(i['rarity']);
  const realm = wordOrNull(i['realm']);
  if (rarity === undefined || realm === undefined) return null;
  return { collectible_id: i['id'], kind: i['kind'], rarity, realm };
}

async function collect(body: Record<string, unknown>, tables: Tables): Promise<Response> {
  const sent = Array.isArray(body['rows']) ? body['rows'] : null;
  if (!sent) return json({ error: 'rows must be a list' }, 400);
  if (sent.length > MAX_ROWS) return json({ error: `at most ${MAX_ROWS} rows a batch` }, 413);
  const rows: LogRow[] = [];
  const skipped: Record<string, number> = {};
  for (const v of sent) {
    const r = checkRow(v);
    if (typeof r === 'string') skipped[r] = (skipped[r] ?? 0) + 1;
    else rows.push(r);
  }
  const left = sent.length - rows.length;
  // Which field failed, never what was in it.
  if (left) console.error(`[owl-park-log] ${left} of ${sent.length} rows left out:`, JSON.stringify(skipped));
  const kept = rows.length ? await tables.addRows(rows) : 0;
  return json({ ok: true, kept, duplicates: rows.length - kept, skipped: left });
}

async function catalogue(body: Record<string, unknown>, tables: Tables): Promise<Response> {
  const sent = Array.isArray(body['items']) ? body['items'] : null;
  if (!sent || !sent.length) return json({ error: 'items must be a list' }, 400);
  if (sent.length > MAX_ITEMS) return json({ error: `at most ${MAX_ITEMS} items` }, 413);
  const items = sent.map(checkItem);
  // A catalogue is all or nothing: a part of it would mark the rest out of the catalogue.
  if (items.some((i) => i === null)) return json({ error: 'an item is not a collectible' }, 400);
  await tables.setCatalogue(items as CatalogueRow[]);
  return json({ ok: true, items: items.length });
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const key = deps.key?.trim() ?? '';
  if (key.length < MIN_KEY) return json({ error: 'not set up' }, 503);
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ') || !(await sameKey(auth.slice(7).trim(), key))) return json({ error: 'unauthorized' }, 401);
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (Number(req.headers.get('Content-Length') ?? 0) > MAX_BODY) return json({ error: 'too large' }, 413);
  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: 'too large' }, 413);
  let body: Record<string, unknown>;
  try {
    body = obj(JSON.parse(text));
  } catch {
    return json({ error: 'not JSON' }, 400);
  }
  if (body['dry_run'] === true) {
    const tables = deps.tables ? await deps.tables.check().then(() => 'ok', (e) => `unreachable: ${message(e)}`) : 'not set up';
    return json({ ok: true, dry_run: true, tables });
  }
  if (body['kind'] !== 'collect' && body['kind'] !== 'catalogue') return json({ error: 'kind must be collect or catalogue' }, 400);
  // Without its tables the function keeps nothing, and says so: the park keeps the rows and sends them again.
  if (!deps.tables) return json({ error: 'no tables' }, 503);
  try {
    return body['kind'] === 'collect' ? await collect(body, deps.tables) : await catalogue(body, deps.tables);
  } catch (e) {
    console.error(`[owl-park-log] the ${String(body['kind'])} was not kept:`, message(e));
    return json({ error: 'not kept' }, 503);
  }
}

/** The schema the park's rows go to, in the fraud pipeline's project (as the park's orders, OP-052). */
export const SCHEMA = 'game';

/** What the tables need of a Postgres client: a query with numbered parameters. postgres.js's `sql.unsafe` is one. */
export interface Db {
  unsafe(query: string, params: unknown[]): PromiseLike<unknown>;
}

const LOG_COLUMNS = 'event_id, collector_id, collectible_id, collectible_type, realm, acquired_at, session_id, device_class, first_entry_at, backfill';
const CATALOGUE_COLUMNS = 'collectible_id, kind, rarity, realm';

/**
 * The park's tables in the `game` schema, over a direct connection to the project's database (the
 * function's own SUPABASE_DB_URL): the schema is not in the project's public API at all, and the
 * connection's role owns it. A batch goes as one parameter, its JSON, and the database gives each
 * value its column's type, so nothing the park sends is spliced into the query.
 */
export function gameTables(db: Db): Tables {
  return {
    async check() {
      await db.unsafe(`select 1 from ${SCHEMA}.collect_log limit 1`, []);
    },
    async addRows(rows) {
      // Sent as text and read as JSON by the database: a client that encodes JSON parameters itself
      // (postgres.js does) would otherwise encode it twice and keep a string.
      const kept = await db.unsafe(
        `insert into ${SCHEMA}.collect_log (${LOG_COLUMNS}) select ${LOG_COLUMNS} from jsonb_populate_recordset(null::${SCHEMA}.collect_log, $1::text::jsonb) on conflict do nothing returning event_id`,
        [JSON.stringify(rows)],
      );
      return Array.isArray(kept) ? kept.length : 0;
    },
    async setCatalogue(items) {
      // One statement: every item in, and anything not among them marked out (the same snapshot throughout).
      await db.unsafe(
        `with items as (select ${CATALOGUE_COLUMNS} from jsonb_populate_recordset(null::${SCHEMA}.collectible_catalogue, $1::text::jsonb)),
        upserted as (
          insert into ${SCHEMA}.collectible_catalogue (${CATALOGUE_COLUMNS}, in_catalogue, updated_at)
          select ${CATALOGUE_COLUMNS}, true, now() from items
          on conflict (collectible_id) do update set kind = excluded.kind, rarity = excluded.rarity, realm = excluded.realm, in_catalogue = true, updated_at = now()
          returning collectible_id
        )
        update ${SCHEMA}.collectible_catalogue c set in_catalogue = false, updated_at = now()
        where c.in_catalogue and not exists (select 1 from items i where i.collectible_id = c.collectible_id)`,
        [JSON.stringify(items)],
      );
    },
  };
}
