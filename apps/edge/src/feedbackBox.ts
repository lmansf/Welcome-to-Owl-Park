/**
 * Feedback from visitors, kept in the Collections object's SQLite beside the collections for the
 * park's keepers to read on the admin page (/admin/feedback). It keeps the visitor's words and
 * kind, the collector token, the room, the screen size and the browser's own description; never an
 * IP address or a name. Written without platform APIs beyond `SqlStorage`, so Node tests it.
 */
import {
  FEEDBACK_EVERY_MS,
  FEEDBACK_LADDER,
  FEEDBACK_PARK_PER_DAY,
  FEEDBACK_PER_DAY,
  noteCounts,
  type FeedbackDraft,
  type FeedbackKind,
  type FeedbackLadderState,
  type FeedbackReward,
  type CollectionBook,
} from '@owl-park/shared';

export const FEEDBACK_STATUSES = ['open', 'done', 'dropped'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export interface FeedbackRow {
  id: number;
  at: number;
  cid: string;
  kind: FeedbackKind;
  text: string;
  room: string | null;
  screen: string | null;
  ua: string | null;
  status: FeedbackStatus;
}

/** A kept note answers with what it brought from the ladder (OP-272), when it climbed it. */
export type FeedbackAdd = { ok: true; id: number; reward?: FeedbackReward } | { ok: false; reason: 'busy' | 'full' };

const DAY_MS = 24 * 3600_000;

export class FeedbackBox {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(
      `CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        cid TEXT NOT NULL,
        kind TEXT NOT NULL,
        text TEXT NOT NULL,
        room TEXT,
        screen TEXT,
        ua TEXT,
        status TEXT NOT NULL DEFAULT 'open'
      )`,
    );
    sql.exec('CREATE INDEX IF NOT EXISTS feedback_by_cid ON feedback (cid, at)');
    sql.exec('CREATE INDEX IF NOT EXISTS feedback_by_at ON feedback (at)');
    // The thanks ladder (OP-272): how many rungs each owl has had, and whether it closed the page's card.
    sql.exec(
      `CREATE TABLE IF NOT EXISTS feedback_reward (
        cid TEXT PRIMARY KEY,
        given INTEGER NOT NULL DEFAULT 0,
        closed INTEGER NOT NULL DEFAULT 0,
        at INTEGER NOT NULL
      )`,
    );
  }

  /** Where an owl stands on the thanks ladder (OP-272). */
  ladder(cid: string): FeedbackLadderState {
    const row = this.sql.exec('SELECT given, closed FROM feedback_reward WHERE cid = ?', cid).toArray()[0] as { given: number; closed: number } | undefined;
    return { given: Number(row?.given ?? 0), closed: Number(row?.closed ?? 0) === 1 };
  }

  /** The owl closed the page's card: it stays closed on every device the owl is on. */
  closeCard(cid: string, now: number): void {
    this.sql.exec('INSERT INTO feedback_reward (cid, given, closed, at) VALUES (?, 0, 1, ?) ON CONFLICT (cid) DO UPDATE SET closed = 1, at = excluded.at', cid, now);
  }

  /**
   * A kept note (`id`) climbs the owl's ladder when it counts (long enough, not words it sent before):
   * the rung's number (1 up), counted in this same step, or null when it does not count or the owl is at the top.
   */
  climb(cid: string, id: number, text: string, now: number): number | null {
    const { given } = this.ladder(cid);
    if (given >= FEEDBACK_LADDER.length) return null;
    const earlier = this.sql.exec('SELECT text FROM feedback WHERE cid = ? AND id <> ?', cid, id).toArray().map((r) => String((r as { text: unknown }).text));
    if (!noteCounts(text, earlier)) return null;
    this.sql.exec('INSERT INTO feedback_reward (cid, given, closed, at) VALUES (?, 1, 0, ?) ON CONFLICT (cid) DO UPDATE SET given = given + 1, at = excluded.at', cid, now);
    return given + 1;
  }

  private count(where: string, ...params: unknown[]): number {
    const row = this.sql.exec(`SELECT COUNT(*) AS n FROM feedback WHERE ${where}`, ...params).toArray()[0] as { n: number } | undefined;
    return Number(row?.n ?? 0);
  }

  /** Keep one message, unless this visitor sent one moments ago, or too many today (or the park did). */
  add(cid: string, draft: FeedbackDraft, ua: string | null, now: number): FeedbackAdd {
    if (this.count('cid = ? AND at > ?', cid, now - FEEDBACK_EVERY_MS)) return { ok: false, reason: 'busy' };
    if (this.count('cid = ? AND at > ?', cid, now - DAY_MS) >= FEEDBACK_PER_DAY) return { ok: false, reason: 'full' };
    if (this.count('at > ?', now - DAY_MS) >= FEEDBACK_PARK_PER_DAY) return { ok: false, reason: 'full' };
    this.sql.exec('INSERT INTO feedback (at, cid, kind, text, room, screen, ua) VALUES (?, ?, ?, ?, ?, ?, ?)', now, cid, draft.kind, draft.text, draft.room, draft.screen, ua);
    const row = this.sql.exec('SELECT last_insert_rowid() AS id').toArray()[0] as { id: number } | undefined;
    return { ok: true, id: Number(row?.id ?? 0) };
  }

  /** The newest messages first, with one status or all of them. */
  list(status: FeedbackStatus | 'all', limit: number): FeedbackRow[] {
    const n = Math.max(1, Math.min(500, Math.floor(limit)));
    const rows = status === 'all' ? this.sql.exec('SELECT * FROM feedback ORDER BY id DESC LIMIT ?', n).toArray() : this.sql.exec('SELECT * FROM feedback WHERE status = ? ORDER BY id DESC LIMIT ?', status, n).toArray();
    return rows.map((r) => {
      const o = r as Record<string, unknown>;
      return {
        id: Number(o['id']),
        at: Number(o['at']),
        cid: String(o['cid']),
        kind: String(o['kind']) as FeedbackKind,
        text: String(o['text']),
        room: (o['room'] as string | null) ?? null,
        screen: (o['screen'] as string | null) ?? null,
        ua: (o['ua'] as string | null) ?? null,
        status: String(o['status']) as FeedbackStatus,
      };
    });
  }

  /** Mark a message done, dropped or open again. False when there is no such message. */
  setStatus(id: number, status: FeedbackStatus): boolean {
    return this.sql.exec('UPDATE feedback SET status = ? WHERE id = ?', status, id).rowsWritten > 0;
  }
}

/**
 * Thank an owl for a kept note (OP-272): when the note climbs its ladder, the rung's collectible goes
 * into the collection (a duplicate pays as usual) or its feathers into the owl's purse. Null when the
 * note does not count or the owl has had every rung.
 */
export function thankForNote(book: Pick<CollectionBook, 'award' | 'addFeathers' | 'feathers'>, box: FeedbackBox, cid: string, id: number, text: string, now: number): FeedbackReward | null {
  const step = box.climb(cid, id, text, now);
  if (step === null) return null;
  const rung = FEEDBACK_LADDER[step - 1]!;
  if ('item' in rung) {
    const award = book.award(cid, rung.item, 'granted', now);
    return { step, item: rung.item, dup: award.dup, feathers: award.feathers, total: book.feathers(cid, now) };
  }
  return { step, item: null, dup: false, feathers: rung.feathers, total: book.addFeathers(cid, rung.feathers, now) };
}
