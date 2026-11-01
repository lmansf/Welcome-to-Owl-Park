import { beforeAll, describe, expect, it } from 'vitest';
import { CHECKOUT_KEEP_MS, CHECKOUT_TTL_MS, MemoryTicketStore, ORDER_LEASE_MS, TicketBook, type TicketStore } from '../src/TicketBook';
import { SqlTicketStore } from '../src/sqlTicketStore';
import type { TicketLine } from '../src/shopify';
import { DAY_MS, DEFAULT_LENGTH_MS, HOUR_MS, isTicketId } from '../src/tickets';
import { sqlStorage } from './sqlite';

const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);
const day = (quantity: number, line = 'L1'): TicketLine => ({ line, quantity, kind: 'day', lengthMs: DEFAULT_LENGTH_MS.day, validFrom: null, validUntil: null });

/** Deterministic randomness, so IDs and secrets repeat run to run. */
function seq(): (n: number) => Uint8Array {
  let x = 7;
  return (n) => Uint8Array.from({ length: n }, () => (x = (x * 1103515245 + 12345) >>> 0) >>> 16);
}

/** Every rule runs against both stores: in memory, and the Durable Object's SQLite tables. */
const STORES: Array<[string, () => TicketStore]> = [
  ['memory', () => new MemoryTicketStore()],
  ['sqlite', () => new SqlTicketStore(sqlStorage())],
];
let makeStore: () => TicketStore = STORES[0]![1];
const book = () => new TicketBook(makeStore(), seq());

for (const [name, make] of STORES) {
  describe(`the ticket book (${name})`, () => {
    beforeAll(() => {
      makeStore = make;
    });

    describe('issuing tickets for a paid order', () => {
      it('makes one ticket per unit, once, with a claim secret for a new order only', async () => {
        const b = book();
        const first = await b.issue('1001', [day(2), { ...day(1, 'L2'), kind: 'annual', lengthMs: DEFAULT_LENGTH_MS.annual }], false, T0);
        expect(first.claim).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(first.tickets.map((t) => [t.line, t.unit, t.kind])).toEqual([['L1', 1, 'day'], ['L1', 2, 'day'], ['L2', 1, 'annual']]);
        expect(first.tickets.every((t) => isTicketId(t.id))).toBe(true);
        expect(new Set(first.tickets.map((t) => t.id)).size).toBe(3);
        // The store sends the webhook again: nothing new, and no second claim secret.
        const again = await b.issue('1001', [day(2)], false, T0 + 1000);
        expect(again.claim).toBeNull();
        expect(again.tickets.map((t) => t.id)).toEqual(first.tickets.map((t) => t.id));
      });

      it('holds an order for the fraud check: no link until it is released', async () => {
        const b = book();
        const held = await b.issue('1002', [day(1)], true, T0);
        expect(held.claim).toBeNull();
        const { claim, tickets } = await b.release('1002');
        expect(claim).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(tickets.map((t) => t.held)).toEqual([false]);
        // Released once: a second release makes no second link.
        expect((await b.release('1002')).claim).toBeNull();
        await b.claim(claim!, 'c_device1');
        expect(b.scan(tickets[0]!.id, 'c_device1', T0 + HOUR_MS).ok).toBe(true);
      });

      it('a resent link replaces the old one', async () => {
        const b = book();
        const { claim } = await b.issue('1006', [day(1)], false, T0);
        const again = (await b.newClaim('1006'))!;
        expect(again).not.toBe(claim);
        expect(await b.claim(claim!, 'c_x')).toBeNull();
        expect(await b.claim(again, 'c_x')).toHaveLength(1);
        expect(await b.newClaim('nope')).toBeNull();
      });
    });

    describe('the claim link, the wallet and the gate', () => {
      it('puts the order on the device that opens the link; the first scan starts the clock', async () => {
        const b = book();
        const { claim, tickets } = await b.issue('1003', [day(2)], false, T0);
        expect(await b.claim('not-the-secret', 'c_device1')).toBeNull();
        expect((await b.claim(claim!, 'c_device1'))!.map((t) => t.device)).toEqual(['c_device1', 'c_device1']);
        expect(b.wallet('c_device1', T0).map((w) => w.status)).toEqual(['unused', 'unused']);
        const id = tickets[0]!.id;
        expect(b.scan(id, 'c_other', T0 + DAY_MS)).toEqual({ ok: false, reason: 'elsewhere' });
        const r = b.scan(id, 'c_device1', T0 + DAY_MS);
        expect(r.ok && r.started).toBe(true);
        const w = b.wallet('c_device1', T0 + DAY_MS + HOUR_MS).find((x) => x.id === id)!;
        expect([w.status, w.msLeft]).toEqual(['active', 23 * HOUR_MS]);
        expect(b.status(id, T0 + 2 * DAY_MS)).toBe('used');
        expect(b.scan('OWL-2222-2222', 'c_device1', T0)).toEqual({ ok: false, reason: 'unknown' });
      });

      it('lives on one device at a time: a share link moves it, and only its holder can make one', async () => {
        const b = book();
        const { claim, tickets } = await b.issue('1004', [day(2)], false, T0);
        await b.claim(claim!, 'c_buyer');
        const id = tickets[1]!.id;
        expect(await b.share(id, 'c_friend', T0)).toBeNull();
        const link = (await b.share(id, 'c_buyer', T0))!;
        expect((await b.take(link, 'c_friend'))!.device).toBe('c_friend');
        expect(b.wallet('c_buyer', T0).map((w) => w.id)).toEqual([tickets[0]!.id]);
        expect(b.wallet('c_friend', T0).map((w) => w.id)).toEqual([id]);
        // A share link works once.
        expect(await b.take(link, 'c_someone')).toBeNull();
        // Opening the order's link again brings every live ticket of the order back to that device.
        await b.claim(claim!, 'c_buyer');
        expect(b.wallet('c_buyer', T0)).toHaveLength(2);
        // A running ticket stays with the visitor it admitted.
        b.scan(id, 'c_buyer', T0 + HOUR_MS);
        expect(await b.share(id, 'c_buyer', T0 + 2 * HOUR_MS)).toBeNull();
      });
    });

    describe('the booth’s checkout (OP-175)', () => {
      it('a paid order with the owl’s token puts its tickets on that owl at once, and the token works once', async () => {
        const b = book();
        const token = await b.newCheckout('c_buyer', T0);
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        await b.issue('2001', [day(2)], false, T0 + 60_000);
        const r = await b.placeByCheckout('2001', token, T0 + 60_000);
        expect(r).toEqual({ device: 'c_buyer', tickets: expect.any(Array) });
        expect(b.wallet('c_buyer', T0 + 60_000).map((t) => t.status)).toEqual(['unused', 'unused']);
        // The same order's webhook again moves nothing; another order with the same token gets nothing.
        expect(await b.placeByCheckout('2001', token, T0 + 70_000)).toEqual({ refused: 'repeat' });
        await b.issue('2002', [day(1)], false, T0 + 80_000);
        expect(await b.placeByCheckout('2002', token, T0 + 80_000)).toEqual({ refused: 'used' });
        expect(b.wallet('c_buyer', T0 + 80_000)).toHaveLength(2);
      });

      it('refuses a token it never made, one past its day, and an order it does not know (and keeps that token for the order)', async () => {
        const b = book();
        await b.issue('2003', [day(1)], false, T0);
        expect(await b.placeByCheckout('2003', 'A'.repeat(43), T0)).toEqual({ refused: 'unknown' });
        const late = await b.newCheckout('c_late', T0);
        expect(await b.placeByCheckout('2003', late, T0 + CHECKOUT_TTL_MS + 1)).toEqual({ refused: 'expired' });
        const early = await b.newCheckout('c_early', T0);
        expect(await b.placeByCheckout('9999', early, T0)).toEqual({ refused: 'no-order' });
        expect(await b.placeByCheckout('2003', early, T0)).toMatchObject({ device: 'c_early' });
      });

      it('moves only tickets never scanned (OP-174’s rule), and a held order’s tickets wait on the owl, held', async () => {
        const b = book();
        const { claim, tickets } = await b.issue('2004', [day(2)], false, T0);
        await b.claim(claim!, 'c_first');
        expect(b.scan(tickets[0]!.id, 'c_first', T0 + HOUR_MS).ok).toBe(true);
        const token = await b.newCheckout('c_second', T0);
        const r = await b.placeByCheckout('2004', token, T0 + HOUR_MS);
        expect('tickets' in r && r.tickets.map((t) => t.id)).toEqual([tickets[1]!.id]);
        expect(b.wallet('c_first', T0 + HOUR_MS).map((t) => t.id)).toEqual([tickets[0]!.id]);
        const held = await b.newCheckout('c_held', T0);
        await b.issue('2005', [day(1)], true, T0);
        await b.placeByCheckout('2005', held, T0);
        expect(b.wallet('c_held', T0).map((t) => t.status)).toEqual(['held']);
      });

      it('forgets checkouts a week old when it makes a new one', async () => {
        const b = book();
        const old = await b.newCheckout('c_old', T0);
        await b.newCheckout('c_new', T0 + CHECKOUT_KEEP_MS + 1);
        await b.issue('2006', [day(1)], false, T0);
        expect(await b.placeByCheckout('2006', old, T0)).toEqual({ refused: 'unknown' });
      });
    });

    describe('refunds and cancellations', () => {
      it('a refund switches off that many tickets of the line, unused ones first; a cancellation all of them', async () => {
        const b = book();
        const { claim, tickets } = await b.issue('1005', [day(3)], false, T0);
        await b.claim(claim!, 'c_d');
        b.scan(tickets[0]!.id, 'c_d', T0 + HOUR_MS);
        const off = b.revoke('1005', [{ line: 'L1', quantity: 1 }], T0 + 2 * HOUR_MS);
        expect(off).toHaveLength(1);
        expect(off[0]!.firstScan).toBeNull();
        expect(b.status(tickets[0]!.id, T0 + 3 * HOUR_MS)).toBe('active');
        b.revoke('1005', 'all', T0 + 4 * HOUR_MS);
        expect(b.wallet('c_d', T0 + 5 * HOUR_MS).map((w) => w.status)).toEqual(['revoked', 'revoked', 'revoked']);
        expect(b.scan(tickets[0]!.id, 'c_d', T0 + 5 * HOUR_MS)).toEqual({ ok: false, reason: 'revoked' });
        // A revoked ticket cannot be passed on, and a later claim leaves it behind.
        expect(await b.share(tickets[0]!.id, 'c_d', T0 + 5 * HOUR_MS)).toBeNull();
        expect(await b.claim(claim!, 'c_new')).toEqual([]);
      });
    });
  });
}

describe('one webhook at a time per order', () => {
  it('an order is held until it is let go, or until a webhook that died would have finished', () => {
    const b = new TicketBook(new MemoryTicketStore(), seq());
    expect(b.lease('1001', T0)).toBe(true);
    expect(b.lease('1001', T0 + 1)).toBe(false);
    expect(b.lease('1002', T0 + 1)).toBe(true);
    b.unlease('1001');
    expect(b.lease('1001', T0 + 2)).toBe(true);
    expect(b.lease('1001', T0 + 1 + ORDER_LEASE_MS)).toBe(false);
    expect(b.lease('1001', T0 + 2 + ORDER_LEASE_MS)).toBe(true);
  });
});
