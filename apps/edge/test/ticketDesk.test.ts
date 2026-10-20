import { describe, expect, it } from 'vitest';
import { MemoryTicketStore, TicketBook, type WalletTicket } from '../src/TicketBook';
import { pickForGate, ticketDesk, type VotesOf } from '../src/ticketDesk';
import { DAY_MS, DEFAULT_LENGTH_MS, HOUR_MS } from '../src/tickets';

const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);
const LINE = { line: 'L1', quantity: 2, kind: 'day', lengthMs: DEFAULT_LENGTH_MS.day, validFrom: null, validUntil: null };

function seq(): (n: number) => Uint8Array {
  let x = 11;
  return (n) => Uint8Array.from({ length: n }, () => (x = (x * 1103515245 + 12345) >>> 0) >>> 16);
}

const noVotes: VotesOf = () => ({ cast: 0, today: false });

/** One desk call, the way the Worker makes it. */
async function call(book: TicketBook, path: string, body?: unknown, now = T0, votesOf = noVotes) {
  const request = body === undefined ? new Request(`https://park/tickets${path}`) : new Request(`https://park/tickets${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
  const r = await ticketDesk(book, request, now, votesOf);
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}

describe('the ticket desk', () => {
  it('issues an order, claims it onto a device and scans it at the gate', async () => {
    const book = new TicketBook(new MemoryTicketStore(), seq());
    const issued = await call(book, '/issue', { order: '2001', lines: [LINE], held: false });
    expect(issued.status).toBe(200);
    const ids = issued.body['tickets'] as string[];
    expect(ids).toHaveLength(2);
    const claimed = await call(book, '/claim', { secret: issued.body['claim'], device: 'c_one' });
    expect((claimed.body['tickets'] as WalletTicket[]).map((t) => t.status)).toEqual(['unused', 'unused']);
    // The gate picks a ticket when the visitor does not name one, and keeps picking the running one.
    const first = await call(book, '/scan', { device: 'c_one' }, T0 + HOUR_MS);
    expect(first.body).toMatchObject({ ok: true, started: true, kind: 'day', validUntil: T0 + HOUR_MS + DAY_MS });
    const again = await call(book, '/scan', { device: 'c_one' }, T0 + 2 * HOUR_MS);
    expect(again.body).toMatchObject({ ok: true, started: false, id: first.body['id'] });
    expect((await call(book, '/scan', { device: 'c_two' })).body).toEqual({ ok: false, reason: 'none' });
    expect((await call(book, '/scan', { device: 'c_two', id: first.body['id'] })).body).toEqual({ ok: false, reason: 'elsewhere', id: first.body['id'] });
    const wallet = await call(book, '/wallet?device=c_one', undefined, T0 + 2 * HOUR_MS);
    expect((wallet.body['tickets'] as WalletTicket[]).map((t) => t.status).sort()).toEqual(['active', 'unused']);
  });

  it('mirrors a ticket, or a whole order, for the store with its votes', async () => {
    const book = new TicketBook(new MemoryTicketStore(), seq());
    const { body } = await call(book, '/issue', { order: '2002', lines: [{ ...LINE, quantity: 1 }], held: false });
    const id = (body['tickets'] as string[])[0]!;
    await call(book, '/claim', { secret: body['claim'], device: 'c_one' });
    expect((await call(book, '/mirror', { id })).body['tickets']).toEqual([{ id, kind: 'day', status: 'unused', order: '2002', firstScan: null, validUntil: null, votesCast: 0, voteToday: 'none' }]);
    await call(book, '/scan', { device: 'c_one', id }, T0 + HOUR_MS);
    const votes: VotesOf = (t) => (t === id ? { cast: 3, today: true } : { cast: 0, today: false });
    expect((await call(book, '/mirror', { order: '2002' }, T0 + 2 * HOUR_MS, votes)).body['tickets']).toMatchObject([{ status: 'active', votesCast: 3, voteToday: 'used', firstScan: T0 + HOUR_MS }]);
    // The wallet shows the same vote.
    expect((await call(book, '/wallet?device=c_one', undefined, T0 + 2 * HOUR_MS, votes)).body['tickets']).toMatchObject([{ id, voteToday: 'used' }]);
    expect((await call(book, '/mirror', { id: 'OWL-2222-2222' })).status).toBe(404);
    expect((await call(book, '/mirror', { order: 'nope' })).body).toEqual({ tickets: [] });
  });

  it('tells the store side what it knows about an order', async () => {
    const book = new TicketBook(new MemoryTicketStore(), seq());
    const held = await call(book, '/issue', { order: '2006', lines: [LINE], held: true });
    expect(held.body).toMatchObject({ claim: null, held: true, sent: false });
    expect((await call(book, '/order?order=2006')).body).toEqual({ order: '2006', held: true, sent: false, tickets: held.body['tickets'], lines: ['L1'] });
    await call(book, '/release', { order: '2006' });
    await call(book, '/sent', { order: '2006' });
    expect((await call(book, '/order?order=2006')).body).toMatchObject({ held: false, sent: true });
    // The store sends the paid webhook again: nothing new, and the book says the link went out.
    expect((await call(book, '/issue', { order: '2006', lines: [LINE], held: false })).body).toMatchObject({ claim: null, held: false, sent: true });
    expect((await call(book, '/order?order=2007')).status).toBe(404);
  });

  it('passes a ticket on with a share link, from its holder only', async () => {
    const book = new TicketBook(new MemoryTicketStore(), seq());
    const { body } = await call(book, '/issue', { order: '2003', lines: [LINE], held: false });
    const id = (body['tickets'] as string[])[1]!;
    await call(book, '/claim', { secret: body['claim'], device: 'c_buyer' });
    expect((await call(book, '/share', { id, device: 'c_friend' })).status).toBe(403);
    const share = await call(book, '/share', { id, device: 'c_buyer' });
    const taken = await call(book, '/take', { secret: share.body['secret'], device: 'c_friend' });
    expect((taken.body['tickets'] as WalletTicket[]).map((t) => t.id)).toEqual([id]);
    expect((await call(book, '/take', { secret: share.body['secret'], device: 'c_other' })).status).toBe(404);
  });

  it('holds an order until it is released, and revokes on a refund', async () => {
    const book = new TicketBook(new MemoryTicketStore(), seq());
    const held = await call(book, '/issue', { order: '2004', lines: [LINE], held: true });
    expect(held.body['claim']).toBeNull();
    const released = await call(book, '/release', { order: '2004' });
    expect(released.body['claim']).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const revoked = await call(book, '/revoke', { order: '2004', which: [{ line: 'L1', quantity: 1 }] });
    expect(revoked.body['revoked']).toHaveLength(1);
    expect((await call(book, '/revoke', { order: '2004', which: 'all' })).body['revoked']).toHaveLength(1);
  });

  it('refuses requests it cannot read', async () => {
    const book = new TicketBook(new MemoryTicketStore(), seq());
    expect((await call(book, '/issue', 'not json')).status).toBe(400);
    expect((await call(book, '/issue', { order: '2005', lines: [{ ...LINE, kind: 'vip' }], held: false })).status).toBe(400);
    expect((await call(book, '/issue', { order: '2005', lines: [{ ...LINE, quantity: 0 }], held: false })).status).toBe(400);
    expect((await call(book, '/issue', { order: '2005', lines: [LINE] })).status).toBe(400);
    expect((await call(book, '/revoke', { order: '2005', which: 'some' })).status).toBe(400);
    expect((await call(book, '/wallet')).status).toBe(400);
    // A ticket named badly is refused, never swapped for another one in the wallet.
    expect((await call(book, '/scan', { device: 'c_one', id: 42 })).status).toBe(400);
    expect((await call(book, '/somewhere', {})).status).toBe(404);
    expect((await call(book, '/somewhere')).status).toBe(404);
  });
});

describe('the ticket the gate picks', () => {
  const w = (id: string, status: WalletTicket['status'], msLeft: number | null): WalletTicket => ({ id, kind: 'day', status, msLeft, firstScan: null, validFrom: null, validUntil: null });
  const night = (id: string, from: number): WalletTicket => ({ id, kind: 'event', status: 'unused', msLeft: null, firstScan: null, validFrom: from, validUntil: from + 4 * HOUR_MS });

  it('takes a running ticket first, then the unused one that runs out soonest', () => {
    expect(pickForGate([w('A', 'unused', 5), w('B', 'active', 9)], T0)?.id).toBe('B');
    expect(pickForGate([w('A', 'unused', 9), w('B', 'unused', 5), w('C', 'unused', null)], T0)?.id).toBe('B');
    expect(pickForGate([w('A', 'used', 0), w('B', 'revoked', null)], T0)).toBeNull();
    // Nothing that could go through: a ticket waiting on the store's check, so the gate says so.
    expect(pickForGate([w('A', 'used', 0), w('B', 'held', null)], T0)?.id).toBe('B');
    expect(pickForGate([], T0)).toBeNull();
  });

  it('uses an event ticket on its night, and keeps it for its night otherwise', () => {
    expect(pickForGate([w('A', 'unused', 5), night('E', T0 - HOUR_MS)], T0)?.id).toBe('E');
    expect(pickForGate([night('E', T0 + DAY_MS), w('A', 'unused', 5)], T0)?.id).toBe('A');
    // With nothing else, the gate scans it and says it is not time yet.
    expect(pickForGate([night('E', T0 + DAY_MS)], T0)?.id).toBe('E');
  });
});
