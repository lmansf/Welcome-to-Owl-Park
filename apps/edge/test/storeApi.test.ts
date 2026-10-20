import { describe, expect, it } from 'vitest';
import { StoreError, adminQuery, fulfillmentInput, storeConfig, ticketUpsert, type FulfillmentOrders } from '../src/storeApi';

describe('the store connection', () => {
  it('needs a myshopify domain and a token', () => {
    expect(storeConfig({})).toBeNull();
    expect(storeConfig({ SHOPIFY_SHOP: 'example.myshopify.com' })).toBeNull();
    expect(storeConfig({ SHOPIFY_SHOP: 'https://example.myshopify.com', SHOPIFY_ADMIN_TOKEN: 't' })).toBeNull();
    expect(storeConfig({ SHOPIFY_SHOP: 'example.myshopify.com', SHOPIFY_ADMIN_TOKEN: ' t ' })).toEqual({ shop: 'example.myshopify.com', token: 't' });
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
