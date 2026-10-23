import { beforeAll, describe, expect, it } from 'vitest';
import { Ledger, MemoryVoteStore, walletVoter, type VoteStore } from '../src/Ledger';
import { catalogueOf, freeOrder, fromTicketOf, gidTail, paidFor, passCartLink, storeTime, ticketLines, usedCode, type AdminOrder } from '../src/shopify';
import { claimLink, storeWebhook, type Desk, type HookDeps } from '../src/storeHooks';
import { SqlTicketStore } from '../src/sqlTicketStore';
import { SqlVoteStore } from '../src/sqlVoteStore';
import { MemoryTicketStore, TicketBook, type TicketStore } from '../src/TicketBook';
import { openingCsv, ticketDesk } from '../src/ticketDesk';
import { DAY_MS, DEFAULT_LENGTH_MS, HOUR_MS, scan, statusOf, type Ticket } from '../src/tickets';
import { sqlStorage } from './sqlite';

/** Opening night: 7 pm Eastern on a Friday in December (midnight UTC is 7 pm in New York then). */
const W0 = Date.UTC(2026, 11, 5, 0, 0, 0);
const NIGHT = { validFrom: W0, validUntil: W0 + DAY_MS };
const T0 = W0 + HOUR_MS;

function seq(): (n: number) => Uint8Array {
  let x = 41;
  return (n) => Uint8Array.from({ length: n }, () => (x = (x * 1103515245 + 12345) >>> 0) >>> 16);
}

const nightLine = (line = 'N1', quantity = 1) => ({ line, quantity, kind: 'opening-night' as const, lengthMs: null, ...NIGHT });
const passLine = (line = 'P1') => ({ line, quantity: 1, kind: 'annual' as const, lengthMs: DEFAULT_LENGTH_MS.annual, validFrom: null, validUntil: null });

describe('the Opening Night Ticket (C42)', () => {
  const ticket: Ticket = { id: 'OWL-AAAA-AAAA', kind: 'opening-night', lengthMs: null, order: '1', line: 'N1', unit: 1, created: W0 - DAY_MS, held: false, firstScan: null, revoked: null, ...NIGHT };

  it('goes through the gate on its night only, and the night is its time', () => {
    expect(scan(ticket, W0 - HOUR_MS)).toEqual({ ok: false, reason: 'not-yet' });
    const r = scan(ticket, W0 + 3 * HOUR_MS);
    expect(r).toMatchObject({ ok: true, started: true, ticket: { firstScan: W0 + 3 * HOUR_MS, validUntil: W0 + DAY_MS } });
    if (!r.ok) return;
    expect(statusOf(r.ticket, W0 + 20 * HOUR_MS)).toBe('active');
    // The day after: a scanned ticket is used, and one never scanned has expired.
    expect(statusOf(r.ticket, W0 + DAY_MS + HOUR_MS)).toBe('used');
    expect(statusOf(ticket, W0 + DAY_MS + HOUR_MS)).toBe('expired');
    expect(scan(ticket, W0 + DAY_MS + HOUR_MS)).toEqual({ ok: false, reason: 'expired' });
  });
});

const product = (kind: string | null, start?: string, end?: string, productType = 'Ticket') => ({
  productType,
  kind: kind === null ? null : { value: kind },
  hours: null,
  start: start === undefined ? null : { value: start },
  end: end === undefined ? null : { value: end },
});
const orderOf = (nodes: AdminOrder['lineItems']['nodes'], extra: Partial<AdminOrder> = {}): AdminOrder => ({ id: 'gid://shopify/Order/1', cancelledAt: null, lineItems: { nodes }, ...extra });

describe("opening night's fields in the store", () => {
  it("reads the night's window from the product: its start, and 24 hours or the end it gives", () => {
    const lines = ticketLines(
      orderOf([
        { id: 'gid://shopify/LineItem/1', quantity: 1, product: product('opening-night', '2026-12-04T19:00:00-05:00') },
        { id: 'gid://shopify/LineItem/2', quantity: 1, product: product('opening-night', '2026-12-05T00:00:00Z', '2026-12-05T08:00:00Z') },
        // The store keeps a date and time without a zone as GMT.
        { id: 'gid://shopify/LineItem/3', quantity: 1, product: product('opening-night', '2026-12-05T00:00:00') },
        // No start yet: a ticket all the same, which the gate keeps out until the store sets one.
        { id: 'gid://shopify/LineItem/4', quantity: 1, product: product('opening-night') },
        // Opening night is a Ticket product, like every other kind but an event entry.
        { id: 'gid://shopify/LineItem/5', quantity: 1, product: product('opening-night', '2026-12-05T00:00:00Z', undefined, 'Pin') },
      ]),
    );
    expect(lines.map((l) => [l.line, l.kind, l.validFrom, l.validUntil])).toEqual([
      ['1', 'opening-night', W0, W0 + DAY_MS],
      ['2', 'opening-night', W0, W0 + 8 * HOUR_MS],
      ['3', 'opening-night', W0, W0 + DAY_MS],
      ['4', 'opening-night', null, null],
    ]);
  });

  it('takes times with a zone, a Z or none, and nothing else', () => {
    expect(storeTime('2026-12-05T00:00:00Z')).toBe(W0);
    expect(storeTime('2026-12-04T19:00-05:00')).toBe(W0);
    expect(storeTime('2026-12-05T00:00:00.000')).toBe(W0);
    expect(storeTime('2026-12-05')).toBeNull();
    expect(storeTime('next Friday')).toBeNull();
    expect(storeTime(null)).toBeNull();
  });

  it('knows a free order, the ticket a pass came from, and the code it used', () => {
    expect(freeOrder(orderOf([], { totalPriceSet: { shopMoney: { amount: '0.0' } } }))).toBe(true);
    expect(freeOrder(orderOf([], { totalPriceSet: { shopMoney: { amount: '14.99' } } }))).toBe(false);
    expect(freeOrder(orderOf([]))).toBe(false);
    const attrs = (value: string) => orderOf([], { customAttributes: [{ key: 'gift', value: 'no' }, { key: 'from_ticket', value }] });
    expect(fromTicketOf(attrs('OWL-7K3Q-PX9M'))).toBe('OWL-7K3Q-PX9M');
    expect(fromTicketOf(attrs(' owl-7k3q-px9m '))).toBe('OWL-7K3Q-PX9M');
    expect(fromTicketOf(attrs('OWL-0000-0000'))).toBeNull();
    expect(fromTicketOf(orderOf([]))).toBeNull();
    const coded = orderOf([], { discountCodes: ['WELCOME', 'OpenTonight'] });
    expect(usedCode(coded, 'OPENTONIGHT')).toBe(true);
    expect(usedCode(coded, 'OTHER')).toBe(false);
    expect(usedCode(coded, undefined)).toBe(false);
    expect(usedCode(coded, '  ')).toBe(false);
  });

  it('knows what the passes sold for: each pass line less every discount on it, the code among them', () => {
    const money = (amount: string) => ({ shopMoney: { amount } });
    const order = orderOf([
      // Two passes at half price with the night's code: $29.98 less $14.99.
      { id: 'gid://shopify/LineItem/1', quantity: 2, originalTotalSet: money('29.98'), discountAllocations: [{ allocatedAmountSet: money('14.99') }], product: product('annual') },
      // A third pass, with the code and a discount on the whole order shared out to it as well.
      { id: 'gid://shopify/LineItem/2', quantity: 1, originalTotalSet: money('14.99'), discountAllocations: [{ allocatedAmountSet: money('7.50') }, { allocatedAmountSet: money('0.75') }], product: product('annual') },
      // A day ticket in the same cart is not a pass.
      { id: 'gid://shopify/LineItem/3', quantity: 1, originalTotalSet: money('3.99'), product: product('day') },
      // A line the store gives no price for counts nothing.
      { id: 'gid://shopify/LineItem/4', quantity: 1, product: product('annual') },
    ]);
    expect(paidFor(order, ticketLines(order), 'annual')).toBe(1499 + 674);
    expect(paidFor(order, ticketLines(order), 'day')).toBe(399);
    expect(paidFor(order, [], 'annual')).toBe(0);
    // A discount bigger than the line never makes it less than nothing.
    const free = orderOf([{ id: 'gid://shopify/LineItem/1', quantity: 1, originalTotalSet: money('14.99'), discountAllocations: [{ allocatedAmountSet: money('20.00') }], product: product('annual') }]);
    expect(paidFor(free, ticketLines(free), 'annual')).toBe(0);
  });

  it("finds the annual pass and the night's window among the ticket products on sale", () => {
    const c = catalogueOf({
      products: {
        nodes: [
          { kind: { value: 'day' }, start: null, end: null, variants: { nodes: [{ id: 'gid://shopify/ProductVariant/100' }] } },
          { kind: { value: 'annual' }, start: null, end: null, variants: { nodes: [{ id: 'gid://shopify/ProductVariant/200' }] } },
          { kind: { value: 'opening-night' }, start: { value: '2026-12-05T00:00:00Z' }, end: null, variants: { nodes: [{ id: 'gid://shopify/ProductVariant/300' }] } },
        ],
      },
    });
    expect(c).toEqual({ passVariant: '200', opening: { from: W0, until: W0 + DAY_MS } });
    expect(catalogueOf({ products: { nodes: [] } })).toEqual({ passVariant: null, opening: null });
  });

  it('makes the cart link: the pass, the code that takes half off it, and the ticket it comes from', () => {
    const link = new URL(passCartLink('owl-test.myshopify.com', '200', 'OPEN TONIGHT', 'OWL-7K3Q-PX9M'));
    expect(link.origin + link.pathname).toBe('https://owl-test.myshopify.com/cart/200:1');
    expect(link.searchParams.get('discount')).toBe('OPEN TONIGHT');
    expect(link.searchParams.get('attributes[from_ticket]')).toBe('OWL-7K3Q-PX9M');
  });
});

/** Every rule runs against both stores: in memory, and the Durable Object's SQLite tables. */
const STORES: Array<[string, () => TicketStore]> = [
  ['memory', () => new MemoryTicketStore()],
  ['sqlite', () => new SqlTicketStore(sqlStorage())],
];
let makeStore: () => TicketStore = STORES[0]![1];

/** An Opening Night Ticket claimed onto a device and scanned at the gate. */
async function scannedNight(b: TicketBook, order = '501', device = 'c_owl') {
  const { claim, tickets } = await b.issue(order, [nightLine()], false, W0 - HOUR_MS);
  await b.claim(claim!, device);
  expect(b.scan(tickets[0]!.id, device, T0).ok).toBe(true);
  return tickets[0]!.id;
}

for (const [name, make] of STORES) {
  describe(`opening night in the ticket book (${name})`, () => {
    beforeAll(() => {
      makeStore = make;
    });
    const book = () => new TicketBook(makeStore(), seq());

    it("links a pass to the scanned ticket its link named, once, and puts it in that ticket's wallet", async () => {
      const b = book();
      const night = await scannedNight(b);
      await b.issue('601', [passLine()], false, T0);
      expect(b.linkPass('601', night, T0, 749)).toEqual({ order: '601', fromTicket: night, at: T0, cents: 749 });
      // The store sends the webhook again: the first link stands.
      expect(b.linkPass('601', null, T0 + 1, 0)).toEqual({ order: '601', fromTicket: night, at: T0, cents: 749 });
      const pass = b.orderOf('601')!.tickets[0]!;
      expect(pass.device).toBe('c_owl');
      expect(b.wallet('c_owl', T0).map((t) => [t.kind, t.freePass])).toEqual([
        ['annual', undefined],
        ['opening-night', 'claimed'],
      ]);
      expect(b.linkPass('nope', night, T0)).toBeNull();
    });

    it('counts a pass without a link when its ticket never went through the gate, or is no Opening Night Ticket', async () => {
      const b = book();
      const { tickets } = await b.issue('502', [nightLine()], false, W0 - HOUR_MS);
      await b.issue('602', [passLine()], false, T0);
      expect(b.linkPass('602', tickets[0]!.id, T0)!.fromTicket).toBeNull();
      expect(b.orderOf('602')!.tickets[0]!.device).toBeNull();
      const day = await b.issue('503', [{ ...passLine('D1'), kind: 'day', lengthMs: DAY_MS }], false, T0);
      await b.issue('603', [passLine()], false, T0);
      expect(b.linkPass('603', day.tickets[0]!.id, T0)!.fromTicket).toBeNull();
    });

    it('offers the pass once the ticket is through the gate, while the night runs, to its own wallet', async () => {
      const b = book();
      const { claim, tickets } = await b.issue('504', [nightLine()], false, W0 - HOUR_MS);
      const id = tickets[0]!.id;
      await b.claim(claim!, 'c_owl');
      expect(b.wallet('c_owl', T0)[0]!.freePass).toBeUndefined();
      expect(b.passOffer(id, 'c_owl', T0)).toEqual({ ok: false, reason: 'not-ready' });
      b.scan(id, 'c_owl', T0);
      expect(b.wallet('c_owl', T0)[0]!.freePass).toBe('ready');
      expect(b.passOffer(id, 'c_owl', T0)).toEqual({ ok: true });
      expect(b.passOffer(id, 'c_other', T0)).toEqual({ ok: false, reason: 'not-yours' });
      expect(b.passOffer('OWL-2222-2222', 'c_owl', T0)).toEqual({ ok: false, reason: 'unknown' });
      // After the night the offer is gone.
      expect(b.wallet('c_owl', W0 + DAY_MS)[0]!.freePass).toBeUndefined();
      await b.issue('604', [passLine()], false, T0);
      b.linkPass('604', id, T0);
      expect(b.passOffer(id, 'c_owl', T0)).toEqual({ ok: false, reason: 'claimed' });
    });

    it('switches a linked pass off with its ticket; a pass without a link stays', async () => {
      const b = book();
      const night = await scannedNight(b, '505');
      await b.issue('605', [passLine()], false, T0);
      b.linkPass('605', night, T0);
      await b.issue('606', [passLine()], false, T0);
      b.linkPass('606', null, T0);
      const off = b.revoke('505', 'all', T0 + HOUR_MS);
      expect(off.map((t) => [t.order, t.kind])).toEqual([
        ['505', 'opening-night'],
        ['605', 'annual'],
      ]);
      expect(b.status(b.orderOf('606')!.tickets[0]!.id, T0 + HOUR_MS)).toBe('unused');
    });

    it("counts the night: tickets issued and scanned, passes with and without the link, the conversion and the passes' revenue", async () => {
      const b = book();
      expect(b.opening(T0).counts).toEqual({ issued: 0, scanned: 0, linkedPasses: 0, unlinkedPasses: 0, converted: 0, conversion: null, passRevenue: 0, revoked: 0 });
      const a = await scannedNight(b, '511', 'c_a');
      await scannedNight(b, '512', 'c_b');
      await b.issue('513', [nightLine()], false, W0);
      const gone = await scannedNight(b, '514', 'c_d');
      await b.issue('611', [passLine()], false, T0);
      b.linkPass('611', a, T0, 749);
      await b.issue('612', [passLine()], false, T0);
      b.linkPass('612', null, T0, 750);
      await b.issue('614', [passLine()], false, T0);
      b.linkPass('614', gone, T0, 749);
      b.revoke('514', 'all', T0);
      const { counts, rows } = b.opening(T0);
      // The switched-off pass takes its $7.49 out of the night's revenue.
      expect(counts).toEqual({ issued: 3, scanned: 2, linkedPasses: 1, unlinkedPasses: 1, converted: 1, conversion: 0.5, passRevenue: 1499, revoked: 2 });
      expect(rows.filter((r) => r.kind === 'pass').map((r) => [r.order, r.fromTicket, r.status, r.paid])).toEqual([
        ['611', a, 'unused', 749],
        ['612', null, 'unused', 750],
        ['614', gone, 'revoked', 749],
      ]);
      const csv = openingCsv(rows).trim().split('\n');
      expect(csv[0]).toBe('kind,ticket,order,status,first_scan,from_ticket,paid');
      expect(csv).toContain(`opening-night,${a},511,active,${new Date(T0).toISOString()},,`);
      expect(csv).toContain(`pass,${b.orderOf('611')!.tickets[0]!.id},611,unused,,${a},7.49`);
      expect(csv.join('\n')).not.toMatch(/@/);
    });

    it("shares an order's amount out over its passes to the cent, and leaves another ticket in the cart out", async () => {
      const b = book();
      const night = await scannedNight(b, '521');
      // Three passes for $22.48 and a day ticket, in one order.
      await b.issue('621', [{ ...passLine('P1'), quantity: 3 }, { ...passLine('D1'), kind: 'day', lengthMs: DAY_MS }], false, T0);
      b.linkPass('621', night, T0, 2248);
      const passes = () => b.opening(T0).rows.filter((r) => r.kind === 'pass');
      expect(passes().map((r) => r.paid)).toEqual([750, 749, 749]);
      expect(b.opening(T0).counts).toMatchObject({ linkedPasses: 3, passRevenue: 2248 });
      // One pass refunded: its part comes out.
      b.revoke('621', [{ line: 'P1', quantity: 1 }], T0);
      expect(b.opening(T0).counts).toMatchObject({ linkedPasses: 2, passRevenue: 2248 - passes().find((r) => r.status === 'revoked')!.paid! });
      // A pass linked before the park kept amounts counts no revenue, and leaves its CSV cell empty.
      await b.issue('622', [passLine()], false, T0);
      b.linkPass('622', null, T0);
      expect(passes().find((r) => r.order === '622')!.paid).toBeNull();
      expect(openingCsv(b.opening(T0).rows)).toMatch(/,622,unused,,,\n/);
    });
  });
}

describe("opening night's pass table, kept from before passes had a price", () => {
  it('gains the amount column, and the passes linked before it have none', () => {
    const sql = sqlStorage();
    sql.exec(`CREATE TABLE opening_passes (order_id TEXT PRIMARY KEY, from_ticket TEXT, at INTEGER NOT NULL)`);
    sql.exec(`INSERT INTO opening_passes (order_id, from_ticket, at) VALUES ('801', NULL, ?)`, T0);
    const store = new SqlTicketStore(sql);
    expect(store.passLink('801')).toEqual({ order: '801', fromTicket: null, at: T0, cents: null });
    store.putPassLink({ order: '802', fromTicket: null, at: T0, cents: 749 });
    expect(store.passLink('802')!.cents).toBe(749);
    // Opening the table again (the next time the object wakes) keeps it as it is.
    expect(new SqlTicketStore(sql).passLinks().map((l) => l.cents)).toEqual([null, 749]);
  });
});

const VOTE_STORES: Array<[string, () => VoteStore]> = [
  ['memory', () => new MemoryVoteStore()],
  ['sqlite', () => new SqlVoteStore(sqlStorage())],
];

for (const [name, make] of VOTE_STORES) {
  describe(`votes per wallet (${name})`, () => {
    const realms = ['grove', 'market'];

    it('one vote per wallet per park day, however many passes it holds', () => {
      const l = new Ledger(make(), realms);
      const w = walletVoter('c_owl');
      expect(l.vote(w, 'grove', '2026-12-05', 1, 'OWL-AAAA-AAAA').ok).toBe(true);
      expect(l.vote(w, 'market', '2026-12-05', 2, 'OWL-BBBB-BBBB')).toEqual({ ok: false, reason: 'already', votedFor: 'grove' });
      expect(l.status(w, '2026-12-05', 'OWL-BBBB-BBBB').votedFor).toBe('grove');
      expect(l.vote(w, 'market', '2026-12-06', 3, 'OWL-BBBB-BBBB').ok).toBe(true);
      expect(l.tally('2026-12').counts).toEqual({ grove: 1, market: 1 });
      expect([l.castBy('OWL-AAAA-AAAA'), l.castBy('OWL-BBBB-BBBB')]).toEqual([1, 1]);
    });

    it('a ticket moved to another wallet does not vote twice the same day', () => {
      const l = new Ledger(make(), realms);
      expect(l.vote(walletVoter('c_one'), 'grove', '2026-12-05', 1, 'OWL-AAAA-AAAA').ok).toBe(true);
      expect(l.vote(walletVoter('c_two'), 'market', '2026-12-05', 2, 'OWL-AAAA-AAAA')).toEqual({ ok: false, reason: 'already', votedFor: 'grove' });
      expect(l.status(walletVoter('c_two'), '2026-12-05', 'OWL-AAAA-AAAA').votedFor).toBe('grove');
      expect(l.status(walletVoter('c_two'), '2026-12-05').votedFor).toBeNull();
    });

    it('still knows the votes kept under the ticket itself, from before wallets counted', () => {
      const l = new Ledger(make(), realms);
      l.vote('OWL-AAAA-AAAA', 'grove', '2026-12-04', 1);
      expect(l.castBy('OWL-AAAA-AAAA')).toBe(1);
      expect(l.vote(walletVoter('c_one'), 'market', '2026-12-04', 2, 'OWL-AAAA-AAAA')).toMatchObject({ ok: false, votedFor: 'grove' });
    });
  });
}

describe('the vote table from before wallets counted', () => {
  it('gains its ticket column and keeps its votes', () => {
    const sql = sqlStorage();
    sql.exec(`CREATE TABLE votes (day TEXT NOT NULL, visitor TEXT NOT NULL, realm TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (day, visitor))`);
    sql.exec(`INSERT INTO votes (day, visitor, realm, at) VALUES ('2026-12-04', 'OWL-AAAA-AAAA', 'grove', 1)`);
    const l = new Ledger(new SqlVoteStore(sql), ['grove', 'market']);
    expect(l.castBy('OWL-AAAA-AAAA')).toBe(1);
    expect(l.vote(walletVoter('c_one'), 'market', '2026-12-05', 2, 'OWL-AAAA-AAAA').ok).toBe(true);
    expect(l.castBy('OWL-AAAA-AAAA')).toBe(2);
    // A second start finds the column there.
    expect(() => new SqlVoteStore(sql)).not.toThrow();
  });
});

/** A store selling opening night: orders by number, each with its lines, total, codes and cart attributes. */
class NightStore {
  readonly orders = new Map<string, AdminOrder>();
  readonly fulfilled = new Set<string>();
  /** The claim link each order's email carried. */
  readonly links = new Map<string, string>();
  /** How long the store takes to make a fulfillment (and send its email). */
  fulfilDelayMs = 0;

  put(id: string, nodes: AdminOrder['lineItems']['nodes'], extra: Partial<AdminOrder> = {}): void {
    this.orders.set(id, { id: `gid://shopify/Order/${id}`, cancelledAt: null, lineItems: { nodes }, ...extra });
  }

  readonly fetch = (async (_url: string, init: RequestInit) => {
    const { query, variables } = JSON.parse(String(init.body)) as { query: string; variables: Record<string, unknown> };
    const op = /(?:query|mutation)\s+(\w+)/.exec(query)![1]!;
    const data = (d: unknown) => Response.json({ data: d });
    const id = gidTail(String(variables['id'] ?? ''));
    switch (op) {
      case 'OwlParkOrder':
        return data({ order: this.orders.get(id) ?? null });
      case 'OwlParkFulfillmentOrders': {
        const done = this.fulfilled.has(id);
        const nodes = this.orders.get(id)!.lineItems.nodes.map((li) => ({ id: `${li.id}0`, remainingQuantity: done ? 0 : li.quantity, lineItem: { id: li.id } }));
        return data({ order: { fulfillmentOrders: { nodes: [{ id: `gid://shopify/FulfillmentOrder/${id}`, status: done ? 'CLOSED' : 'OPEN', lineItems: { nodes } }] } } });
      }
      case 'OwlParkSendTickets': {
        const f = variables['fulfillment'] as { lineItemsByFulfillmentOrder: Array<{ fulfillmentOrderId: string }>; trackingInfo: { url: string } };
        const order = gidTail(f.lineItemsByFulfillmentOrder[0]!.fulfillmentOrderId);
        if (this.fulfilDelayMs) await new Promise((r) => setTimeout(r, this.fulfilDelayMs));
        // As the store does: an order's ticket line can be fulfilled once.
        if (this.fulfilled.has(order)) return data({ fulfillmentCreate: { fulfillment: null, userErrors: [{ field: ['fulfillment'], message: 'Fulfillment order has no remaining quantity' }] } });
        this.fulfilled.add(order);
        this.links.set(order, f.trackingInfo.url);
        return data({ fulfillmentCreate: { fulfillment: { id: 'gid://shopify/Fulfillment/1', status: 'SUCCESS' }, userErrors: [] } });
      }
      default:
        return data(null);
    }
  }) as typeof fetch;
}

const FREE = { totalPriceSet: { shopMoney: { amount: '0.0' } } };
const LOW = { risk: { recommendation: 'ACCEPT', assessments: [{ riskLevel: 'LOW' }] } };
const ticketItem = (n: number, kind: string, start?: string) => ({ id: `gid://shopify/LineItem/${n}`, quantity: 1, product: product(kind, start) });
/** The annual pass at half price with the night's code (OP-062): $14.99 less $7.50, and tax on top. */
const halfPricePass = (n: number) => ({ ...ticketItem(n, 'annual'), originalTotalSet: { shopMoney: { amount: '14.99' } }, discountAllocations: [{ allocatedAmountSet: { shopMoney: { amount: '7.50' } } }] });
const HALF_PRICE = { totalPriceSet: { shopMoney: { amount: '8.01' } }, ...LOW };

describe("opening night's orders through the store webhooks", () => {
  function setup() {
    const store = new NightStore();
    const book = new TicketBook(new MemoryTicketStore(), seq());
    const desk: Desk = async (path, body) => {
      const req = body === undefined ? new Request(`https://park${path}`) : new Request(`https://park${path}`, { method: 'POST', body: JSON.stringify(body) });
      const r = await ticketDesk(book, req, T0, () => ({ cast: 0, today: false }));
      return { status: r.status, body: (await r.json()) as Record<string, unknown> };
    };
    let waited = 0;
    const deps: HookDeps = {
      store: { shop: 'owl-test.myshopify.com', token: 'shpat_test' },
      desk,
      claimUrl: (s) => claimLink('https://park.example', s),
      fetchFn: store.fetch,
      wait: async () => {
        waited++;
      },
      openingCode: 'OPENTONIGHT',
    };
    return { store, book, deps, waited: () => waited };
  }
  const hook = (id: string) => ({ id: Number(id), admin_graphql_api_id: `gid://shopify/Order/${id}` });

  it('a free order has nothing to rate: its ticket goes out at once, from orders/paid or orders/create', async () => {
    const { store, book, deps, waited } = setup();
    store.put('701', [ticketItem(71, 'opening-night', '2026-12-05T00:00:00Z')], FREE);
    expect((await storeWebhook('orders/create', hook('701'), deps)).body).toEqual({ tickets: 1, sent: true });
    expect(waited()).toBe(0);
    const t = book.orderOf('701')!.tickets[0]!;
    expect([t.kind, t.held, t.validFrom, t.validUntil]).toEqual(['opening-night', false, W0, W0 + DAY_MS]);
    // orders/paid after it changes nothing.
    expect((await storeWebhook('orders/paid', hook('701'), deps)).body).toEqual({ tickets: 1, sent: true });
    expect(store.fulfilled.has('701')).toBe(true);
    // A paid order on orders/create waits for orders/paid and its rating.
    store.put('702', [ticketItem(72, 'day')], { totalPriceSet: { shopMoney: { amount: '3.99' } } });
    expect((await storeWebhook('orders/create', hook('702'), deps)).body).toEqual({ tickets: 0 });
    expect(book.orderOf('702')).toBeNull();
  });

  it('a free order’s orders/create and orders/paid at the same moment: one email, and its link opens the ticket', async () => {
    const { store, book, deps } = setup();
    store.put('705', [ticketItem(75, 'opening-night', '2026-12-05T00:00:00Z')], FREE);
    store.fulfilDelayMs = 30;
    const live: HookDeps = { ...deps, wait: (ms) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 10))) };
    const both = await Promise.all([storeWebhook('orders/create', hook('705'), live), storeWebhook('orders/paid', hook('705'), live)]);
    expect(both.map((r) => r.body)).toEqual([
      { tickets: 1, sent: true },
      { tickets: 1, sent: true },
    ]);
    expect(book.orderOf('705')!.tickets).toHaveLength(1);
    expect(await book.claim(store.links.get('705')!.split('#claim=')[1]!, 'c_owl')).toHaveLength(1);
  });

  it("links the half-price pass from the park's link to its ticket with what it sold for, and counts the code used without it", async () => {
    const { store, book, deps } = setup();
    store.put('711', [ticketItem(81, 'opening-night', '2026-12-05T00:00:00Z')], FREE);
    await storeWebhook('orders/paid', hook('711'), deps);
    const night = book.orderOf('711')!.tickets[0]!.id;
    const secret = (await book.newClaim('711'))!;
    await book.claim(secret, 'c_owl');
    book.scan(night, 'c_owl', T0);
    store.put('712', [halfPricePass(82)], { ...HALF_PRICE, discountCodes: ['opentonight'], customAttributes: [{ key: 'from_ticket', value: night }] });
    expect((await storeWebhook('orders/paid', hook('712'), deps)).body).toEqual({ tickets: 1, sent: true });
    expect(book.opening(T0).rows.find((r) => r.order === '712')).toMatchObject({ fromTicket: night, paid: 749 });
    store.put('713', [halfPricePass(83)], { ...HALF_PRICE, discountCodes: ['OPENTONIGHT'] });
    await storeWebhook('orders/paid', hook('713'), deps);
    // A pass bought at its price, with no code and no link, is no part of the night.
    store.put('714', [{ ...ticketItem(84, 'annual'), originalTotalSet: { shopMoney: { amount: '14.99' } } }], { totalPriceSet: { shopMoney: { amount: '16.04' } }, ...LOW });
    await storeWebhook('orders/paid', hook('714'), deps);
    expect(book.opening(T0).counts).toMatchObject({ issued: 1, scanned: 1, linkedPasses: 1, unlinkedPasses: 1, converted: 1, conversion: 1, passRevenue: 1498 });
    expect(book.wallet('c_owl', T0).map((t) => [t.kind, t.freePass])).toEqual([
      ['annual', undefined],
      ['opening-night', 'claimed'],
    ]);
  });

  it('a half-price pass is a paid order: one the store has not rated low waits like any other, linked and counted already', async () => {
    const { store, book, deps } = setup();
    store.put('721', [ticketItem(91, 'opening-night', '2026-12-05T00:00:00Z')], FREE);
    await storeWebhook('orders/paid', hook('721'), deps);
    const night = book.orderOf('721')!.tickets[0]!.id;
    await book.claim((await book.newClaim('721'))!, 'c_owl');
    book.scan(night, 'c_owl', T0);
    store.put('722', [halfPricePass(92)], { totalPriceSet: { shopMoney: { amount: '8.01' } }, risk: { recommendation: 'INVESTIGATE', assessments: [{ riskLevel: 'MEDIUM' }] }, discountCodes: ['OPENTONIGHT'], customAttributes: [{ key: 'from_ticket', value: night }] });
    expect((await storeWebhook('orders/paid', hook('722'), deps)).body).toEqual({ tickets: 1, held: true });
    expect(store.fulfilled.has('722')).toBe(false);
    // The pass is in the wallet, waiting on the store's check (a waiting ticket lists last).
    expect(book.wallet('c_owl', T0).map((t) => [t.kind, t.status, t.freePass])).toEqual([
      ['opening-night', 'active', 'claimed'],
      ['annual', 'held', undefined],
    ]);
    expect(book.opening(T0).counts).toMatchObject({ linkedPasses: 1, passRevenue: 749 });
  });

  it('the desk keeps an amount in whole cents only', async () => {
    const { book, deps } = setup();
    await book.issue('731', [passLine()], false, T0);
    for (const cents of [-1, 7.49, '749', Number.MAX_SAFE_INTEGER + 2]) expect((await deps.desk('/tickets/link-pass', { order: '731', from: null, cents })).status).toBe(400);
    expect((await deps.desk('/tickets/link-pass', { order: '731', from: null, cents: 749 })).body).toEqual({ linked: false, from: null });
    expect(book.opening(T0).counts.passRevenue).toBe(749);
  });
});
