import { beforeAll, describe, expect, it } from 'vitest';
import {
  CollectionBook,
  DUPLICATE_FEATHERS,
  FEEDBACK_EVERY_MS,
  FEEDBACK_LADDER,
  FEEDBACK_MOUSE,
  FEEDBACK_PARK_PER_DAY,
  FEEDBACK_PER_DAY,
  MemoryCollectionStore,
  type FeedbackDraft,
} from '@owl-park/shared';
import { FeedbackBox, thankForNote } from '../src/feedbackBox';

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

// ---- The thanks ladder (OP-272): the grey mouse for the first note that counts, then feathers ----

describe('the thanks ladder (OP-272)', () => {
  const setup = () => {
    const box = new FeedbackBox(sqlStorage());
    const book = new CollectionBook(new MemoryCollectionStore());
    const thank = (cid: string, text: string, at: number) => {
      const r = box.add(cid, note(text), null, at);
      if (!r.ok) throw new Error(r.reason);
      return thankForNote(book, box, cid, r.id, text, at);
    };
    return { box, book, thank };
  };
  const words = ['The gate froze when I tapped it', 'More ponds in the grove please', 'I love the climb, it is so fun', 'The shop needs more pets in it', 'One more note after the top'];

  it('gives the grey mouse first, then 10, 15 and 20 feathers, then nothing', () => {
    const { book, thank, box } = setup();
    const got = words.map((w, i) => thank('c_one', w, NOW + i * FEEDBACK_EVERY_MS));
    expect(got[0]).toEqual({ step: 1, item: FEEDBACK_MOUSE, dup: false, feathers: 0, total: 0 });
    expect(got.slice(1, 4).map((r) => r && [r.step, r.feathers, r.total])).toEqual([
      [2, 10, 10],
      [3, 15, 25],
      [4, 20, 45],
    ]);
    expect(got[4]).toBeNull();
    expect(book.inventory('c_one', undefined, NOW).owned).toContain(FEEDBACK_MOUSE);
    expect(box.ladder('c_one')).toEqual({ given: FEEDBACK_LADDER.length, closed: false });
  });

  it('keeps a short note or the same words again off the ladder, and keeps every owl on its own', () => {
    const { thank, box } = setup();
    expect(thank('c_one', 'Too short', NOW)).toBeNull();
    expect(thank('c_one', words[0]!, NOW + FEEDBACK_EVERY_MS)?.step).toBe(1);
    expect(thank('c_one', `  ${words[0]!.toUpperCase()}!! `, NOW + 2 * FEEDBACK_EVERY_MS)).toBeNull();
    expect(box.ladder('c_one').given).toBe(1);
    expect(thank('c_two', words[0]!, NOW + 3 * FEEDBACK_EVERY_MS)?.step).toBe(1);
  });

  it('pays the usual duplicate feathers to an owl that already has the grey mouse', () => {
    const { book, thank } = setup();
    book.grant('c_one', FEEDBACK_MOUSE, 'shop', NOW);
    expect(thank('c_one', words[0]!, NOW)).toEqual({ step: 1, item: FEEDBACK_MOUSE, dup: true, feathers: DUPLICATE_FEATHERS.common, total: DUPLICATE_FEATHERS.common });
  });

  it('remembers the card closed for the owl, and keeps its place on the ladder', () => {
    const { box, thank } = setup();
    expect(box.ladder('c_one')).toEqual({ given: 0, closed: false });
    box.closeCard('c_one', NOW);
    expect(box.ladder('c_one')).toEqual({ given: 0, closed: true });
    expect(thank('c_one', words[0]!, NOW)?.step).toBe(1);
    expect(box.ladder('c_one')).toEqual({ given: 1, closed: true });
    expect(box.ladder('c_two')).toEqual({ given: 0, closed: false });
  });
});
