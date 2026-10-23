import { expect, test, type APIRequestContext } from '@playwright/test';
import { E2E_ADMIN_KEY, E2E_STORE } from './helpers';
import { LOW, orderId, putOrder, sentLink, ticketLine, webhook } from './store';

/**
 * The fraud link (C45) through the room server: the stand-in store (e2e/standInStore.mjs) plays the
 * fraud pipeline's scoring endpoint too, answering each order with the verdict a test set for it.
 */
const PAID = {
  totalPriceSet: { shopMoney: { amount: '3.99' } },
  subtotalPriceSet: { shopMoney: { amount: '3.99' } },
  customer: { id: 'gid://shopify/Customer/4242', state: 'DISABLED' },
  transactions: [{ kind: 'SALE', status: 'SUCCESS', gateway: 'shopify_payments', paymentDetails: { bin: '424242', number: '•••• •••• •••• 4242' } }],
  ...LOW,
};
const CLIENT = { client_details: { user_agent: 'Mozilla/5.0 (e2e)', accept_language: 'en-US', browser_width: 1280, browser_height: 800 } };

interface History {
  calls: Array<{ op: string; variables: Record<string, unknown> }>;
  scored: Array<Record<string, unknown>>;
  told: Array<{ kind: string; response: Record<string, unknown> }>;
}

async function verdict(request: APIRequestContext, order: string, answer: unknown, delayMs = 0): Promise<void> {
  expect((await request.post(`${E2E_STORE.origin}/test/verdict`, { data: { order, answer, delayMs } })).ok()).toBe(true);
}

/** What the stand-in saw for an order: the store calls naming it, the scoring requests and the checkout responses. */
async function history(request: APIRequestContext, order: string): Promise<History> {
  return (await (await request.get(`${E2E_STORE.origin}/test/order?order=${order}`)).json()) as History;
}

async function sentOrNull(request: APIRequestContext, order: string): Promise<string | null> {
  return ((await (await request.get(`${E2E_STORE.origin}/test/sent?order=${order}`)).json()) as { link: string | null }).link;
}

test.describe('the fraud link (C45)', () => {
  test('approve: scored once with hashes only, the link goes out, and the pipeline hears ORDER_CONFIRMED', async ({ request }) => {
    const order = orderId();
    await putOrder(request, order, [ticketLine(1, 'day')], PAID);
    expect(await webhook(request, 'orders/paid', order, CLIENT)).toMatchObject({ tickets: 1, sent: true, check: 'approved' });
    await sentLink(request, order);
    // The store sends the webhook again: the first verdict stands, with no second score.
    await webhook(request, 'orders/paid', order, CLIENT);
    await expect.poll(async () => (await history(request, order)).told.length).toBe(1);
    const h = await history(request, order);
    expect(h.scored).toHaveLength(1);
    const tx = h.scored[0]!;
    expect(tx).toMatchObject({ source_system: 'shopify', channel: 'owl-park-web', order_number: `#${order}`, total: 3.99 });
    expect(String(tx['guest_id'])).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(String(tx['device_id'])).toMatch(/^[0-9a-f]{64}$/);
    expect(String(tx['payment_token'])).toMatch(/^[0-9a-f]{64}$/);
    for (const plain of ['Mozilla', 'Customer/4242', '424242']) expect(JSON.stringify(tx)).not.toContain(plain);
    expect(h.told[0]).toMatchObject({ kind: 'response', response: { response_status: 'approved', customer_message_code: 'ORDER_CONFIRMED', fallback_used: false } });
  });

  test("review: held and tagged with no link, listed on the keepers' page, and released from there", async ({ browser, request }) => {
    const order = orderId();
    await putOrder(request, order, [ticketLine(1, 'day', 2)], PAID);
    await verdict(request, order, { decision: 'review', score: 0.74, reason_codes: ['IP_BILLING_MISMATCH', 'HIGH_DEVICE_VELOCITY'], model_version: 'rules-v0' });
    expect(await webhook(request, 'orders/paid', order, CLIENT)).toMatchObject({ tickets: 2, held: true, check: 'held' });
    expect(await sentOrNull(request, order)).toBeNull();
    await expect.poll(async () => (await history(request, order)).told.map((t) => t.response['customer_message_code'])).toEqual(['VERIFY_IDENTITY']);
    expect((await history(request, order)).calls.map((c) => [c.op, c.variables['tags']])).toEqual([['OwlParkTagsAdd', ['owl:held']]]);

    // The keepers' page lists it with its score and reasons, behind the admin key.
    expect((await request.get('/api/admin/holds')).status()).toBe(403);
    const keeper = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await keeper.goto('/admin/holds');
    await keeper.getByLabel('Admin key').fill(E2E_ADMIN_KEY);
    await keeper.getByRole('button', { name: 'Open' }).click();
    await expect(keeper.locator('#state')).toContainText('The fraud check is on');
    const row = keeper.locator(`[data-held="${order}"]`);
    await expect(row).toContainText('0.74');
    await expect(row).toContainText('IP_BILLING_MISMATCH, HIGH_DEVICE_VELOCITY');
    await keeper.screenshot({ path: 'e2e-screenshots/fraud-holds.png', fullPage: true });

    // Release: the tickets work, the link goes out, the tag comes off and the pipeline is told.
    await row.locator('[data-act="release"]').click();
    await expect(keeper.locator(`[data-held="${order}"]`)).toHaveCount(0, { timeout: 10_000 });
    await expect(keeper.locator(`[data-check="${order}"]`)).toContainText('Released by the owner');
    await sentLink(request, order);
    await expect.poll(async () => (await history(request, order)).told.map((t) => t.response['outcome'])).toEqual(['held', 'released']);
    expect((await history(request, order)).calls.map((c) => c.op)).toEqual(['OwlParkTagsAdd', 'OwlParkTagsRemove']);
    await keeper.context().close();
  });

  test('decline: refunded through the store at once, with no ticket and no link', async ({ request }) => {
    const order = orderId();
    await putOrder(request, order, [ticketLine(1, 'annual')], { ...PAID, totalPriceSet: { shopMoney: { amount: '14.99' } } });
    await verdict(request, order, { decision: 'decline', score: 0.93, reason_codes: ['MANY_CARDS_ON_DEVICE'] });
    expect(await webhook(request, 'orders/paid', order, CLIENT)).toMatchObject({ tickets: 0, check: 'refunded' });
    expect(await sentOrNull(request, order)).toBeNull();
    const refund = (await history(request, order)).calls.find((c) => c.op === 'OwlParkRefund');
    expect(refund?.variables).toEqual({ orderId: `gid://shopify/Order/${order}`, refundMethod: { originalPaymentMethodsRefund: true } });
    await expect.poll(async () => (await history(request, order)).told.map((t) => t.response['customer_message_code'])).toEqual(['PAYMENT_NOT_PROCESSED']);
    // The store's cancellation webhook that follows changes nothing.
    expect(await webhook(request, 'orders/cancelled', order)).toMatchObject({ revoked: 0 });
  });

  test('no answer within 2 seconds: released (fail open), recorded as fallback_used with fail_open', async ({ request }) => {
    const order = orderId();
    await putOrder(request, order, [ticketLine(1, 'day')], PAID);
    await verdict(request, order, { decision: 'decline', score: 0.97 }, 3_500);
    expect(await webhook(request, 'orders/paid', order, CLIENT)).toMatchObject({ tickets: 1, sent: true, check: 'fail-open' });
    await sentLink(request, order);
    await expect.poll(async () => (await history(request, order)).told.length).toBe(1);
    expect((await history(request, order)).told[0]!.response).toMatchObject({ customer_message_code: 'ORDER_CONFIRMED', fraud_timeout: true, fallback_used: true, fallback_policy: 'fail_open' });
    // The verdict that comes late changes nothing: no refund.
    await new Promise((r) => setTimeout(r, 2_000));
    expect((await history(request, order)).calls.some((c) => c.op === 'OwlParkRefund')).toBe(false);
  });
});
