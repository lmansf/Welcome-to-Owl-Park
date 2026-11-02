import { describe, expect, it } from 'vitest';
import { orderContact, sendContact } from '../src/buyerLog';
import { orderKey, type LogConfig } from '../src/collectLog';
import { FakeStore } from './fakeStore';

// The owner's contacts (OP-192): a paid order's buyer, read from the store and sent on, kept by nobody in the park.

const STORE = { shop: 'owl-test.myshopify.com', token: 'shpat_test' };
const LOG: LogConfig = { url: 'https://log.example/functions/v1/owl-park-log', key: 'k'.repeat(32), salt: 's'.repeat(24) };
const T0 = Date.UTC(2026, 10, 2, 16, 0, 0);

/** The store, and the log's address answering with `status`; what was posted to the log. */
function rig(status = 200) {
  const store = new FakeStore();
  const posted: Array<{ auth: string | null; body: { kind: string; rows: Array<Record<string, unknown>> } }> = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    if (url === LOG.url) {
      posted.push({ auth: new Headers(init.headers).get('Authorization'), body: JSON.parse(String(init.body)) });
      return Response.json({ ok: status === 200 }, { status });
    }
    return store.fetch(url, init);
  }) as typeof fetch;
  return { store, posted, fetchFn };
}

describe("the owner's contacts (OP-192)", () => {
  it("reads only the order's email and its customer's id, the email as the park keys emails", async () => {
    const t = rig();
    expect(await orderContact(STORE, '1001', t.fetchFn)).toEqual({ email: 'buyer@example.com', customer: '77' });
    expect(t.store.calls.map((c) => c.op)).toEqual(['OwlParkOrderContact']);
    // A guest checkout has no customer; a store that keeps the customer from the app still says the email.
    t.store.contact = { email: 'guest@example.com', customer: null };
    expect(await orderContact(STORE, '1001', t.fetchFn)).toEqual({ email: 'guest@example.com', customer: null });
    t.store.contact = 'refused';
    expect(await orderContact(STORE, '1001', t.fetchFn)).toEqual({ email: 'buyer@example.com', customer: null });
  });

  it("sends a store order's buyer to the log once, under the order's salted key, with the log's key", async () => {
    const t = rig();
    expect(await sendContact(LOG, STORE, '1001', T0, t.fetchFn)).toBe(true);
    expect(t.posted).toEqual([
      {
        auth: `Bearer ${LOG.key}`,
        body: { kind: 'contact', rows: [{ shopify_order_id: '1001', order_key: await orderKey(LOG.salt, '1001'), email: 'buyer@example.com', shopify_customer_id: '77', ordered_at: new Date(T0).toISOString() }] },
      },
    ]);
  });

  it('sends nothing for an order the store did not sell or a buyer it will not name, and throws when the log refuses', async () => {
    const t = rig();
    expect(await sendContact(LOG, STORE, 'comp-abc', T0, t.fetchFn)).toBe(false);
    t.store.contact = { email: null, customer: '77' };
    expect(await sendContact(LOG, STORE, '1001', T0, t.fetchFn)).toBe(false);
    expect(t.posted).toEqual([]);
    const down = rig(503);
    await expect(sendContact(LOG, STORE, '1001', T0, down.fetchFn)).rejects.toThrow('503');
  });
});
