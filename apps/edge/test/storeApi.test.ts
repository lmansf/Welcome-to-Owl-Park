import { describe, expect, it } from 'vitest';
import { StoreError, adminQuery, fulfillmentInput, storeCheck, storeConfig, ticketUpsert, type FulfillmentOrders } from '../src/storeApi';

describe('the store connection', () => {
  it('needs a myshopify domain and a token', () => {
    expect(storeConfig({})).toBeNull();
    expect(storeConfig({ SHOPIFY_SHOP: 'example.myshopify.com' })).toBeNull();
    expect(storeConfig({ SHOPIFY_SHOP: 'https://example.myshopify.com', SHOPIFY_ADMIN_TOKEN: 't' })).toBeNull();
    expect(storeConfig({ SHOPIFY_SHOP: 'example.myshopify.com', SHOPIFY_ADMIN_TOKEN: ' t ' })).toEqual({ shop: 'example.myshopify.com', token: 't' });
  });

  it('or a Dev Dashboard app’s client ID and secret; a fixed token wins when both are set', () => {
    const shop = 'example.myshopify.com';
    expect(storeConfig({ SHOPIFY_SHOP: shop, SHOPIFY_CLIENT_ID: ' id ', SHOPIFY_CLIENT_SECRET: ' s ' })).toEqual({ shop, client: { id: 'id', secret: 's' } });
    expect(storeConfig({ SHOPIFY_SHOP: shop, SHOPIFY_CLIENT_ID: 'id' })).toBeNull();
    expect(storeConfig({ SHOPIFY_SHOP: shop, SHOPIFY_CLIENT_SECRET: 's' })).toBeNull();
    expect(storeConfig({ SHOPIFY_SHOP: shop, SHOPIFY_ADMIN_TOKEN: 't', SHOPIFY_CLIENT_ID: 'id', SHOPIFY_CLIENT_SECRET: 's' })).toEqual({ shop, token: 't' });
  });

  it('posts GraphQL with the token and turns errors into StoreError', async () => {
    const calls: Array<[string, RequestInit]> = [];
    const ok = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify({ data: { shop: { name: 'x' } } }));
    }) as unknown as typeof fetch;
    const cfg = { shop: 'example.myshopify.com', token: 'tok' };
    expect(await adminQuery(cfg, 'query { shop { name } }', {}, ok)).toEqual({ shop: { name: 'x' } });
    expect(calls[0]![0]).toMatch(/^https:\/\/example\.myshopify\.com\/admin\/api\/\d{4}-\d{2}\/graphql\.json$/);
    expect((calls[0]![1].headers as Record<string, string>)['X-Shopify-Access-Token']).toBe('tok');
    const bad = (async () => new Response(JSON.stringify({ errors: [{ message: 'Throttled' }] }))) as unknown as typeof fetch;
    await expect(adminQuery(cfg, 'q', {}, bad)).rejects.toThrow(StoreError);
    const down = (async () => new Response('no', { status: 502 })) as unknown as typeof fetch;
    await expect(adminQuery(cfg, 'q', {}, down)).rejects.toThrow('502');
  });
});

/** A store that trades an app's credentials for numbered tokens and answers GraphQL with the token it was given. */
function tradingStore(opts: { refuse?: string; stale?: string } = {}) {
  const trades: URLSearchParams[] = [];
  const used: string[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    if (url === 'https://example.myshopify.com/admin/oauth/access_token') {
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded');
      if (opts.refuse) return new Response(JSON.stringify({ error: opts.refuse, error_description: 'Client credentials cannot be performed on this shop.' }), { status: 400 });
      trades.push(new URLSearchParams(String(init.body)));
      return new Response(JSON.stringify({ access_token: `tok${trades.length}`, scope: 'read_orders', expires_in: 86399 }));
    }
    const token = (init.headers as Record<string, string>)['X-Shopify-Access-Token']!;
    used.push(token);
    if (token === opts.stale) return new Response('{"errors":"[API] Invalid API key or access token"}', { status: 401 });
    return new Response(JSON.stringify({ data: { ok: true } }));
  }) as unknown as typeof fetch;
  return { trades, used, fetchFn };
}

describe('signing in with a Dev Dashboard app', () => {
  // Each test uses its own app, since a traded token is kept for the next call.
  const app = (id: string) => ({ shop: 'example.myshopify.com', client: { id, secret: 'shh' } });

  it('trades the client credentials once, and the token serves the calls after it', async () => {
    const store = tradingStore();
    await adminQuery(app('app-once'), 'q', {}, store.fetchFn);
    await adminQuery(app('app-once'), 'q', {}, store.fetchFn);
    expect(store.trades).toHaveLength(1);
    expect(Object.fromEntries(store.trades[0]!)).toEqual({ client_id: 'app-once', client_secret: 'shh', grant_type: 'client_credentials' });
    expect(store.used).toEqual(['tok1', 'tok1']);
  });

  it('trades again, once, when the store stops taking the token', async () => {
    const store = tradingStore({ stale: 'tok1' });
    expect(await adminQuery(app('app-stale'), 'q', {}, store.fetchFn)).toEqual({ ok: true });
    expect(store.used).toEqual(['tok1', 'tok2']);
    const always = tradingStore({ stale: 'tok1' });
    const fixed = { shop: 'example.myshopify.com', token: 'tok1' };
    await expect(adminQuery(fixed, 'q', {}, always.fetchFn)).rejects.toThrow('401');
    expect(always.trades).toHaveLength(0);
  });

  it('a refused sign-in says why, without the secret', async () => {
    const store = tradingStore({ refuse: 'shop_not_permitted' });
    const err = await adminQuery(app('app-refused'), 'q', {}, store.fetchFn).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StoreError);
    expect((err as Error).message).toContain('shop_not_permitted');
    expect((err as Error).message).not.toContain('shh');
  });
});

describe('the owner’s check of the store setup', () => {
  it('says what is missing before the store is set up', async () => {
    expect(await storeCheck({})).toEqual({ shop: null, signIn: null, webhooks: { storeKey: false, appSecret: false }, error: 'the store is not set up' });
    const typo = await storeCheck({ SHOPIFY_SHOP: 'https://example.myshopify.com', SHOPIFY_CLIENT_ID: 'id', SHOPIFY_CLIENT_SECRET: 's' });
    expect(typo).toMatchObject({ shop: null, signIn: null, webhooks: { storeKey: false, appSecret: true } });
    expect(typo.error).toContain('myshopify');
  });

  /** A store answering the check: its name, the app's scopes, and orders unless it keeps them from the app. */
  const checking = (scopes: string[], orders: boolean) =>
    (async (_url: string, init: RequestInit) => {
      if (String(init.body).includes('OwlParkOrdersCheck')) {
        return new Response(JSON.stringify(orders ? { data: { orders: { nodes: [] } } } : { errors: [{ message: 'This app is not approved to access the Order object.' }] }));
      }
      return new Response(JSON.stringify({ data: { shop: { name: 'Example' }, currentAppInstallation: { accessScopes: scopes.map((handle) => ({ handle })) } } }));
    }) as unknown as typeof fetch;
  const env = { SHOPIFY_SHOP: 'example.myshopify.com', SHOPIFY_ADMIN_TOKEN: 't', SHOPIFY_WEBHOOK_SECRET: 'k' };

  it('signs in, lists the scopes the app lacks (a write scope brings its read) and reads an order', async () => {
    const scopes = ['write_orders', 'read_products', 'write_merchant_managed_fulfillment_orders'];
    expect(await storeCheck(env, checking(scopes, true))).toEqual({
      shop: 'example.myshopify.com',
      signIn: 'token',
      webhooks: { storeKey: true, appSecret: false },
      store: { name: 'Example', missing: ['write_metaobjects'], orders: true },
    });
    const down = (async () => new Response('no', { status: 502 })) as unknown as typeof fetch;
    expect((await storeCheck(env, down)).error).toContain('502');
  });

  it('says so when the store keeps its orders from the app', async () => {
    const all = ['read_orders', 'write_orders', 'read_products', 'read_merchant_managed_fulfillment_orders', 'write_merchant_managed_fulfillment_orders', 'write_metaobjects'];
    const check = await storeCheck(env, checking(all, false));
    expect(check.store).toEqual({ name: 'Example', missing: [], orders: false });
    expect(check.error).toContain('not approved to access the Order object');
    // Without the scope to read orders, the check does not try.
    expect((await storeCheck(env, checking(['read_products'], true))).store?.orders).toBe(false);
  });
});

describe('sending the claim link', () => {
  const fo: FulfillmentOrders = {
    order: {
      fulfillmentOrders: {
        nodes: [
          {
            id: 'gid://shopify/FulfillmentOrder/1',
            status: 'OPEN',
            lineItems: {
              nodes: [
                { id: 'gid://shopify/FulfillmentOrderLineItem/11', remainingQuantity: 2, lineItem: { id: 'gid://shopify/LineItem/501' } },
                { id: 'gid://shopify/FulfillmentOrderLineItem/12', remainingQuantity: 1, lineItem: { id: 'gid://shopify/LineItem/502' } },
              ],
            },
          },
          { id: 'gid://shopify/FulfillmentOrder/2', status: 'CLOSED', lineItems: { nodes: [{ id: 'gid://shopify/FulfillmentOrderLineItem/21', remainingQuantity: 1, lineItem: { id: 'gid://shopify/LineItem/501' } }] } },
        ],
      },
    },
  };

  it('fulfils only the ticket lines, with the IDs as tracking numbers and the claim link as the tracking link', () => {
    expect(fulfillmentInput(fo, ['501'], ['OWL-2345-WXYZ', 'OWL-6789-ABCD'], 'https://park.example/claim#k')).toEqual({
      notifyCustomer: true,
      trackingInfo: { company: 'Owl Park', numbers: ['OWL-2345-WXYZ', 'OWL-6789-ABCD'], url: 'https://park.example/claim#k' },
      lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: 'gid://shopify/FulfillmentOrder/1', fulfillmentOrderLineItems: [{ id: 'gid://shopify/FulfillmentOrderLineItem/11', quantity: 2 }] }],
    });
    expect(fulfillmentInput(fo, ['999'], [], 'https://park.example/claim#k')).toBeNull();
  });
});

describe('the ticket mirror in the store', () => {
  it('is a metaobject per ticket, its handle the ID', () => {
    const m = ticketUpsert({ id: 'OWL-2345-WXYZ', kind: 'day', status: 'active', order: '1001', firstScan: Date.UTC(2026, 10, 1), validUntil: Date.UTC(2026, 10, 2), votesCast: 1, voteToday: 'used' });
    expect(m['handle']).toEqual({ type: 'owl_park_ticket', handle: 'owl-2345-wxyz' });
    const fields = Object.fromEntries((m['metaobject'] as { fields: Array<{ key: string; value: string }> }).fields.map((f) => [f.key, f.value]));
    expect(fields).toEqual({
      ticket_id: 'OWL-2345-WXYZ', kind: 'day', status: 'active', order_id: '1001',
      first_scan: '2026-11-01T00:00:00.000Z', valid_until: '2026-11-02T00:00:00.000Z', votes_cast: '1', todays_vote: 'used',
    });
  });
});
