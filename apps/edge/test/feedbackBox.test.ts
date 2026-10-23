import { beforeAll, describe, expect, it } from 'vitest';
import { FEEDBACK_EVERY_MS, FEEDBACK_PARK_PER_DAY, FEEDBACK_PER_DAY, type FeedbackDraft } from '@owl-park/shared';
import { FeedbackBox } from '../src/feedbackBox';

const NOW = Date.UTC(2026, 9, 21, 16, 0, 0);
const DAY = 24 * 3600_000;

// Node's built-in SQLite stands in for the Durable Object's: same engine, same SQL.
interface Statement {
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number | bigint };
}
type Database = new (path: string) => { prepare(sql: string): Statement };
let DatabaseSync: Database;

beforeAll(async () => {
  ({ DatabaseSync } = (await import('node:sqlite' as string)) as { DatabaseSync: Database });
});

/** The slice of `SqlStorage` the box uses: `exec(...).toArray()` and `rowsWritten`. */
function sqlStorage(): SqlStorage {
  const db = new DatabaseSync(':memory:');
  return {
    exec(query: string, ...bindings: unknown[]) {
      const st = db.prepare(query);
      if (/^\s*SELECT/i.test(query)) {
        const rows = st.all(...bindings);
        return { toArray: () => rows, rowsWritten: 0 };
      }
      return { toArray: () => [], rowsWritten: Number(st.run(...bindings).changes) };
    },
  } as unknown as SqlStorage;
}

const note = (text: string, kind: FeedbackDraft['kind'] = 'idea'): FeedbackDraft => ({ kind, text, room: 'hub', screen: '390x844' });

describe('the feedback box', () => {
  it('keeps each message with its kind, room, screen and browser, newest first, all open', () => {
    const box = new FeedbackBox(sqlStorage());
    expect(box.add('c_one', note('More ponds please'), 'Mozilla/5.0 test', NOW)).toEqual({ ok: true, id: 1 });
    expect(box.add('c_two', note('Stuck by the gate', 'bug'), null, NOW + 1000)).toEqual({ ok: true, id: 2 });
    expect(box.list('all', 50)).toEqual([
      { id: 2, at: NOW + 1000, cid: 'c_two', kind: 'bug', text: 'Stuck by the gate', room: 'hub', screen: '390x844', ua: null, status: 'open' },
      { id: 1, at: NOW, cid: 'c_one', kind: 'idea', text: 'More ponds please', room: 'hub', screen: '390x844', ua: 'Mozilla/5.0 test', status: 'open' },
    ]);
    expect(box.list('open', 1).map((r) => r.id)).toEqual([2]);
  });

  it('marks messages done, dropped or open again, and says when there is no such message', () => {
    const box = new FeedbackBox(sqlStorage());
    box.add('c_one', note('Lovely lanterns', 'praise'), null, NOW);
    box.add('c_two', note('Fishing line vanished', 'bug'), null, NOW);
    expect(box.setStatus(1, 'done')).toBe(true);
    expect(box.setStatus(2, 'dropped')).toBe(true);
    expect(box.setStatus(99, 'done')).toBe(false);
    expect(box.list('open', 50)).toEqual([]);
    expect(box.list('done', 50).map((r) => r.text)).toEqual(['Lovely lanterns']);
    expect(box.setStatus(2, 'open')).toBe(true);
    expect(box.list('open', 50).map((r) => r.text)).toEqual(['Fishing line vanished']);
  });

  it('takes one message a visitor every half minute and a few a day, and a cap for the whole park', () => {
    const box = new FeedbackBox(sqlStorage());
    expect(box.add('c_one', note('first'), null, NOW).ok).toBe(true);
    expect(box.add('c_one', note('too soon'), null, NOW + FEEDBACK_EVERY_MS - 1)).toEqual({ ok: false, reason: 'busy' });
    expect(box.add('c_two', note('someone else'), null, NOW + 1).ok).toBe(true);
    for (let i = 1; i < FEEDBACK_PER_DAY; i++) expect(box.add('c_one', note(`note ${i}`), null, NOW + i * FEEDBACK_EVERY_MS).ok).toBe(true);
    expect(box.add('c_one', note('one too many'), null, NOW + FEEDBACK_PER_DAY * FEEDBACK_EVERY_MS)).toEqual({ ok: false, reason: 'full' });
    expect(box.add('c_one', note('next day'), null, NOW + DAY + 1).ok).toBe(true);

    const park = new FeedbackBox(sqlStorage());
    for (let i = 0; i < FEEDBACK_PARK_PER_DAY; i++) park.add(`c_${i}`, note('hello'), null, NOW + i);
    expect(park.add('c_new', note('hello'), null, NOW + DAY - 1)).toEqual({ ok: false, reason: 'full' });
    expect(park.list('all', 1000)).toHaveLength(500); // a page holds at most 500
  });
});
