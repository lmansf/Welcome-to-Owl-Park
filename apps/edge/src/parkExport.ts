/**
 * The weekly export of the park's stored data (OP-185). The owls' collections, feathers, quests, nests
 * and accounts (the collections object), the tickets and the Realm Vote (the vote ledger) and the
 * busy-night settings (the overflow object) live only in those Durable Objects' SQLite storage; once a
 * week each object writes all of its tables to the park's private R2 bucket (`PARK_EXPORTS`,
 * `owl-park-exports`) as one dated file, `exports/<YYYY-MM-DD>/<kind>/<name>.json`, beside a manifest.
 * Files older than four weeks are deleted on the same run. A file loads back into a fresh object
 * (`POST /api/admin/restore`), never over one that holds records unless the keepers say so.
 *
 * What a file never holds: an account's sealed email address (`email_seal`, in `owl_accounts` and
 * `account_links`): the owl stays protected by its email's keyed hash, which goes in. Nor the analytics
 * log's outbox (`log_outbox`): rows on their way to the owner's analytics, which a restore would send
 * a second time. The room objects are not exported: they keep only a room's passing state (leaf piles,
 * lanterns, the quiz, copies of the overflow object's switches), and no owl's.
 *
 * The objects write their own files (the bucket is in their env too), so a large table never crosses
 * the RPC limit between the Worker and the object. Without the binding nothing breaks: the job logs
 * that it skipped, and the keepers' routes say there is no bucket.
 */
import type { Logger } from '@owl-park/shared';
import type { Env } from './env';

/** Where every export lives in the bucket. */
export const EXPORT_PREFIX = 'exports/';
/** Files dated more than this many days before a run are deleted on it (four weeks). */
export const EXPORT_KEEP_DAYS = 28;
/** The file's own marks, so a restore never loads something else. */
export const EXPORT_FORMAT = 'owl-park-export';
export const EXPORT_VERSION = 1;

/** The objects the export copies: one object each for the park. */
export const EXPORTED_OBJECTS = [
  { kind: 'collections', name: 'park' },
  { kind: 'votes', name: 'park' },
  { kind: 'overflow', name: 'park' },
] as const;
export type ExportKind = (typeof EXPORTED_OBJECTS)[number]['kind'];
export const EXPORT_KINDS: readonly ExportKind[] = EXPORTED_OBJECTS.map((o) => o.kind);

/** Columns no file holds: an account's sealed email address. */
export const LEFT_OUT_COLUMNS: readonly string[] = ['email_seal'];
/** Tables no file holds: the analytics log's outbox (a restore would send its rows again). */
export const LEFT_OUT_TABLES: readonly string[] = ['log_outbox'];
/** Tables an object writes for itself as it wakes (the collections' layout mark): not records, so a fresh object with only these is empty. */
export const SEEDED_TABLES: readonly string[] = ['meta'];

/** One file: what it is, when, and every table's rows. */
export interface ObjectDump {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  kind: ExportKind;
  name: string;
  date: string;
  at: string;
  /** What the file leaves out on purpose, as `table.column` and table names. */
  leftOut: string[];
  tables: Record<string, Array<Record<string, unknown>>>;
}

/** Which object a file is for, and the day it is dated. */
export interface ExportTarget {
  kind: ExportKind;
  name: string;
  date: string;
}

/** What an object answers after writing its file. */
export interface CopyOut {
  key: string;
  bytes: number;
  tables: number;
  rows: number;
}

export type RestoreRefusal = 'no-bucket' | 'no-file' | 'bad-file' | 'not-empty';
export type RestoreResult = { ok: true; key: string; tables: number; rows: number; skipped: string[] } | { ok: false; reason: RestoreRefusal; key: string; rows?: number };

/** The bucket, or null when the Worker runs without the binding (a copy without R2, a test). */
export function bucketOf(env: Env): R2Bucket | null {
  return (env as { PARK_EXPORTS?: R2Bucket }).PARK_EXPORTS ?? null;
}

/** The day of a moment, in UTC: what a file is dated. */
export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY.test(v)) return false;
  const ms = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(ms) && utcDay(ms) === v;
}

export const exportKey = (t: ExportTarget) => `${EXPORT_PREFIX}${t.date}/${t.kind}/${t.name}.json`;
export const manifestKey = (date: string) => `${EXPORT_PREFIX}${date}/manifest.json`;

/** The day a key in the bucket is dated, or null for one the export did not write. */
export function dayOfKey(key: string): string | null {
  if (!key.startsWith(EXPORT_PREFIX)) return null;
  const day = key.slice(EXPORT_PREFIX.length).split('/')[0] ?? '';
  return isDay(day) ? day : null;
}

// ---------- an object's tables, out and back ----------

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const quote = (name: string) => `"${name}"`;

/** The object's own tables: none of SQLite's (`sqlite_*`) or the platform's (`_cf_*`), and only names that need no escaping. */
export function tablesOf(sql: SqlStorage): string[] {
  return sql
    .exec<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY name`)
    .toArray()
    .map((r) => r.name)
    .filter((n) => IDENT.test(n));
}

const columnsOf = (sql: SqlStorage, table: string) => sql.exec<{ name: string }>(`PRAGMA table_info(${quote(table)})`).toArray().map((r) => r.name);

/** A stored value as JSON can hold it: bytes as base64. */
function outValue(v: unknown): unknown {
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    const bytes = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return { $bytes: btoa(s) };
  }
  return v;
}

/** A value from a file as it is stored again. */
function inValue(v: unknown): SqlStorageValue {
  if (v && typeof v === 'object' && typeof (v as { $bytes?: unknown }).$bytes === 'string') {
    const s = atob((v as { $bytes: string }).$bytes);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out.buffer;
  }
  if (v === null || typeof v === 'string' || typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return JSON.stringify(v);
}

/** Every table's rows, with what a file never holds left out. */
export function dumpTables(sql: SqlStorage, t: ExportTarget, now: number): ObjectDump {
  const tables: ObjectDump['tables'] = {};
  const leftOut: string[] = [];
  for (const table of tablesOf(sql)) {
    if (LEFT_OUT_TABLES.includes(table)) {
      leftOut.push(table);
      continue;
    }
    const drop = columnsOf(sql, table).filter((c) => LEFT_OUT_COLUMNS.includes(c));
    leftOut.push(...drop.map((c) => `${table}.${c}`));
    tables[table] = sql
      .exec(`SELECT * FROM ${quote(table)}`)
      .toArray()
      .map((row) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) if (!drop.includes(k)) out[k] = outValue(v);
        return out;
      });
  }
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, kind: t.kind, name: t.name, date: t.date, at: new Date(now).toISOString(), leftOut, tables };
}

/** Rows the object holds that are records (not what it writes for itself as it wakes). */
export function recordsIn(sql: SqlStorage): number {
  return tablesOf(sql)
    .filter((t) => !SEEDED_TABLES.includes(t))
    .reduce((n, t) => n + sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM ${quote(t)}`).one().n, 0);
}

/** A file's text as a dump for this object, or null when it is not one. */
export function readDump(text: string, t: Omit<ExportTarget, 'date'>): ObjectDump | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  const d = v as Partial<ObjectDump> | null;
  if (!d || typeof d !== 'object' || d.format !== EXPORT_FORMAT || d.version !== EXPORT_VERSION || d.kind !== t.kind || d.name !== t.name) return null;
  if (!d.tables || typeof d.tables !== 'object' || Array.isArray(d.tables)) return null;
  for (const rows of Object.values(d.tables)) {
    if (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) return null;
  }
  return d as ObjectDump;
}

/**
 * A dump loaded into the object's tables, in one transaction. Refused while the object holds records,
 * unless `force`: then every table is emptied first. Tables and columns the object no longer has are
 * skipped and named; columns the file lacks take their defaults.
 */
export function loadTables(sql: SqlStorage, dump: ObjectDump, force: boolean, txn: <T>(fn: () => T) => T): { ok: true; tables: number; rows: number; skipped: string[] } | { ok: false; reason: 'not-empty'; rows: number } {
  const held = recordsIn(sql);
  if (held > 0 && !force) return { ok: false, reason: 'not-empty', rows: held };
  return txn(() => {
    const have = tablesOf(sql);
    for (const table of have) sql.exec(`DELETE FROM ${quote(table)}`);
    const skipped: string[] = [];
    let tables = 0;
    let rows = 0;
    for (const [table, list] of Object.entries(dump.tables)) {
      if (!have.includes(table)) {
        skipped.push(table);
        continue;
      }
      const cols = columnsOf(sql, table);
      const gone = new Set<string>();
      for (const row of list) {
        const keys = Object.keys(row).filter((k) => {
          if (cols.includes(k)) return true;
          gone.add(k);
          return false;
        });
        if (!keys.length) continue;
        sql.exec(`INSERT OR REPLACE INTO ${quote(table)} (${keys.map(quote).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...keys.map((k) => inValue(row[k])));
        rows++;
      }
      skipped.push(...[...gone].map((c) => `${table}.${c}`));
      tables++;
    }
    return { ok: true as const, tables, rows, skipped };
  });
}

/** The object's side of the export: its tables to its dated file. Null without the bucket. */
export async function copyOut(storage: DurableObjectStorage, bucket: R2Bucket | null, t: ExportTarget, now = Date.now()): Promise<CopyOut | null> {
  if (!bucket) return null;
  const dump = dumpTables(storage.sql, t, now);
  const text = JSON.stringify(dump);
  const key = exportKey(t);
  await bucket.put(key, text, { httpMetadata: { contentType: 'application/json' } });
  const rows = Object.values(dump.tables).reduce((n, r) => n + r.length, 0);
  return { key, bytes: new TextEncoder().encode(text).byteLength, tables: Object.keys(dump.tables).length, rows };
}

/** The object's side of a restore: its dated file read back into its tables. */
export async function copyIn(storage: DurableObjectStorage, bucket: R2Bucket | null, t: ExportTarget, force: boolean): Promise<RestoreResult> {
  const key = exportKey(t);
  if (!bucket) return { ok: false, reason: 'no-bucket', key };
  const file = await bucket.get(key);
  if (!file) return { ok: false, reason: 'no-file', key };
  const dump = readDump(await file.text(), t);
  if (!dump) return { ok: false, reason: 'bad-file', key };
  const r = loadTables(storage.sql, dump, force, (fn) => storage.transactionSync(fn));
  return { ...r, key };
}

// ---------- the Worker's side: the weekly job, the keepers' reads ----------

/** What the object of a kind answers over RPC. */
interface Copier {
  exportCopy(t: ExportTarget): Promise<CopyOut | null>;
  restoreCopy(t: ExportTarget, force: boolean): Promise<RestoreResult>;
}

export function copierOf(env: Env, kind: ExportKind, name: string): Copier {
  if (kind === 'collections') return env.COLLECTIONS.getByName(name) as unknown as Copier;
  if (kind === 'votes') return env.VOTES.getByName(name) as unknown as Copier;
  return env.OVERFLOW.getByName(name) as unknown as Copier;
}

/** Every key under a prefix, page by page. */
async function keysUnder(bucket: R2Bucket, prefix: string): Promise<R2Object[]> {
  const out: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, ...(cursor ? { cursor } : {}) });
    out.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

/** Files dated more than four weeks before `today` deleted: their keys. Keys the export did not write stay. */
export async function pruneExports(bucket: R2Bucket, today: string): Promise<string[]> {
  const cutoff = utcDay(Date.parse(`${today}T00:00:00Z`) - EXPORT_KEEP_DAYS * 86_400_000);
  const old = (await keysUnder(bucket, EXPORT_PREFIX)).map((o) => o.key).filter((k) => {
    const day = dayOfKey(k);
    return day !== null && day < cutoff;
  });
  for (let i = 0; i < old.length; i += 1000) await bucket.delete(old.slice(i, i + 1000));
  return old;
}

export interface ExportSummary {
  date: string;
  objects: number;
  missed: number;
  bytes: number;
  rows: number;
  pruned: number;
}

/**
 * The weekly export (its cron, or a keeper's word): every object writes its file, the manifest goes
 * beside them, and files older than four weeks go. Null, logged, when the Worker has no bucket.
 */
export async function exportPark(env: Env, log: Logger, by: 'cron' | 'key', now = Date.now()): Promise<ExportSummary | null> {
  const bucket = bucketOf(env);
  if (!bucket) {
    log.warn('worker', 'park_export_skipped', 'The weekly export did not run: the Worker has no PARK_EXPORTS bucket bound.', { by, reason: 'no-bucket' });
    return null;
  }
  const date = utcDay(now);
  const done = await Promise.all(
    EXPORTED_OBJECTS.map(async ({ kind, name }) => {
      try {
        const r = await copierOf(env, kind, name).exportCopy({ kind, name, date });
        if (!r) throw new Error('the object has no bucket');
        return { kind, name, ...r };
      } catch (e) {
        log.error('worker', 'write_failed', 'An object was not copied to the export bucket this week: its last good copy stands.', { object: `${kind}:${name}`, by, error: e });
        return null;
      }
    }),
  );
  const files = done.filter((f) => f !== null);
  const bytes = files.reduce((n, f) => n + f.bytes, 0);
  const rows = files.reduce((n, f) => n + f.rows, 0);
  await bucket.put(manifestKey(date), JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, date, at: new Date(now).toISOString(), by, files, missed: done.length - files.length }), {
    httpMetadata: { contentType: 'application/json' },
  });
  let pruned = 0;
  try {
    pruned = (await pruneExports(bucket, date)).length;
  } catch (e) {
    log.error('worker', 'write_failed', 'Exports older than four weeks were not deleted: they go on the next run.', { by, error: e });
  }
  const summary = { date, objects: files.length, missed: done.length - files.length, bytes, rows, pruned };
  if (summary.missed) log.warn('worker', 'park_export', 'The weekly export ran, but not every object was copied.', { by, ...summary });
  else log.info('worker', 'park_export', 'The weekly export ran: every object is copied to the park’s bucket.', { by, ...summary });
  return summary;
}

/** The last export as the bucket holds it: its day, its files and their bytes, and whether its manifest was written; and every day kept. */
export async function lastExport(bucket: R2Bucket): Promise<{ date: string | null; objects: number; bytes: number; complete: boolean; files: string[]; kept: string[] }> {
  const all = await keysUnder(bucket, EXPORT_PREFIX);
  const kept = [...new Set(all.map((o) => dayOfKey(o.key)).filter((d) => d !== null))].sort();
  const date = kept.at(-1) ?? null;
  if (!date) return { date: null, objects: 0, bytes: 0, complete: false, files: [], kept };
  const ofDay = all.filter((o) => dayOfKey(o.key) === date);
  const files = ofDay.filter((o) => o.key !== manifestKey(date));
  return { date, objects: files.length, bytes: files.reduce((n, o) => n + o.size, 0), complete: ofDay.length > files.length, files: files.map((o) => o.key).sort(), kept };
}
