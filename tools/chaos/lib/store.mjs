/**
 * The store as the chaos harness plays it (OP-132): a day ticket bought in the stand-in store
 * (apps/park/e2e/standInStore.mjs), its paid webhook signed and sent as the store sends it, what the
 * store emailed, and the stand-in's faults on cue.
 */
import { createHmac } from 'node:crypto';
import { STORE } from './park.mjs';

let made = 0;
/** A fresh order number, as the store's are: digits only. */
export const orderNumber = () => String(Date.now() * 100 + (made++ % 100));

/** A day ticket order in the stand-in store, rated low risk, as the Admin API would answer for it. */
export async function putOrder(park, id) {
  const order = {
    id: `gid://shopify/Order/${id}`,
    cancelledAt: null,
    lineItems: { nodes: [{ id: 'gid://shopify/LineItem/1', quantity: 1, product: { productType: 'Ticket', kind: { value: 'day' }, hours: null, start: null, end: null } }] },
    totalPriceSet: { shopMoney: { amount: '4.99' } },
    risk: { recommendation: 'ACCEPT', assessments: [{ riskLevel: 'LOW' }] },
  };
  const r = await fetch(`${park.storeOrigin}/test/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, order }) });
  if (!r.ok) throw new Error(`the stand-in store took no order: HTTP ${r.status}`);
}

/**
 * The order's orders/paid webhook, signed with the store's key, as one delivery: `webhookId` the
 * same on each try of it (the store's X-Shopify-Webhook-Id), `timeoutMs` how long the store waits
 * for the answer before it gives up. The Worker's answer, or `timedOut` when none came in time.
 */
export async function deliverPaid(park, run, id, { webhookId = `chaos-${id}`, timeoutMs = 10_000 } = {}) {
  const body = JSON.stringify({ id: Number(id), admin_graphql_api_id: `gid://shopify/Order/${id}` });
  const t0 = Date.now();
  try {
    const r = await fetch(`${park.base}/api/store/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Topic': 'orders/paid',
        'X-Shopify-Hmac-Sha256': createHmac('sha256', STORE.webhookKey).update(body).digest('base64'),
        'X-Shopify-Shop-Domain': STORE.shop,
        'X-Shopify-Webhook-Id': webhookId,
        'X-Chaos-Run': run,
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: r.status, body: r.ok ? await r.json() : await r.text(), ms: Date.now() - t0 };
  } catch (e) {
    if (e.name === 'TimeoutError') return { status: null, timedOut: true, ms: Date.now() - t0 };
    throw e;
  }
}

/** The claim link the store emailed for an order, and how many times it emailed one. */
export async function sentFor(park, id) {
  return (await fetch(`${park.storeOrigin}/test/sent?order=${id}`)).json();
}

/**
 * The stand-in store's next answers to the park fail: `mode` 'error' answers HTTP 500, 'hang' holds
 * the answer `ms` before giving it. `op` and `order` narrow it to one query about one order;
 * `times` is how many answers it takes. `{ clear: true }` takes every fault away.
 */
export async function storeFault(park, fault) {
  const r = await fetch(`${park.storeOrigin}/test/fault`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fault) });
  if (!r.ok) throw new Error(`the stand-in store took no fault: HTTP ${r.status}`);
}
