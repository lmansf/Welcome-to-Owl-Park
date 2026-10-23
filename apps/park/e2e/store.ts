import { createHmac } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';
import { E2E_STORE } from './helpers';

/**
 * The store's side in the room-server tests: orders put in the stand-in store
 * (e2e/standInStore.mjs) and the store's signed webhooks for them.
 */
export const FREE = { totalPriceSet: { shopMoney: { amount: '0.0' } } };
export const LOW = { risk: { recommendation: 'ACCEPT', assessments: [{ riskLevel: 'LOW' }] } };

let made = 0;
/** A new order number: the room server keeps its ticket book from one test run to the next. */
export const orderId = (): string => String(Date.now() * 100 + (made++ % 100));

export const ticketLine = (n: number, kind: string, quantity = 1, start?: number) => ({
  id: `gid://shopify/LineItem/${n}`,
  quantity,
  product: { productType: 'Ticket', kind: { value: kind }, hours: null, start: start === undefined ? null : { value: new Date(start).toISOString() }, end: null },
});

/** An order in the stand-in store, as its Admin API would answer for it. */
export async function putOrder(request: APIRequestContext, id: string, lines: unknown[], extra: Record<string, unknown> = {}): Promise<void> {
  const r = await request.post(`${E2E_STORE.origin}/test/orders`, { data: { id, order: { id: `gid://shopify/Order/${id}`, name: `#${id}`, cancelledAt: null, lineItems: { nodes: lines }, ...extra } } });
  expect(r.ok()).toBe(true);
}

/** The store's webhook for an order, signed with the store's key. */
export async function webhook(request: APIRequestContext, topic: string, id: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const body = JSON.stringify({ id: Number(id), admin_graphql_api_id: `gid://shopify/Order/${id}`, ...extra });
  const signature = createHmac('sha256', E2E_STORE.webhookKey).update(body).digest('base64');
  const r = await request.post('/api/store/webhook', {
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Topic': topic, 'X-Shopify-Hmac-Sha256': signature, 'X-Shopify-Shop-Domain': E2E_STORE.shop },
    data: body,
  });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as Record<string, unknown>;
}

/** The claim link the store would have emailed for an order. */
export async function sentLink(request: APIRequestContext, id: string): Promise<string> {
  const { link } = (await (await request.get(`${E2E_STORE.origin}/test/sent?order=${id}`)).json()) as { link: string | null };
  expect(link).toMatch(/#claim=[A-Za-z0-9_-]{43}$/);
  return link!;
}
