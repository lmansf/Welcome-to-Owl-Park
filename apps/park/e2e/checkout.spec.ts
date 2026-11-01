import { createHmac } from 'node:crypto';
import { devices, type APIRequestContext, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { E2E_ADMIN_KEY, E2E_STORE, STORE_CARD, expectStoreCard, state, storeContinue, walkToDoor } from './helpers';

/**
 * Buying a ticket without leaving the park (OP-175), at the turnstiles (OP-180), through the room
 * server and the stand-in store (e2e/standInStore.mjs). A turnstile reached without a ticket asks
 * the card before the store once (OP-153; storecard.spec.ts), and its Continue opens the store's
 * checkout in a window of its own with this owl's one-time token in the cart; the store's own
 * checkout page is stood in for here (the test never reaches a real store), the paid order comes in
 * as a signed webhook, and the ticket lands on the owl with no email opened. Opening night is off
 * here, so no pass is offered after it (opening.spec.ts has that).
 */
const ADMIN = { 'X-Admin-Key': E2E_ADMIN_KEY };
const COMPUTER: BrowserContextOptions = { viewport: { width: 1280, height: 800 } };
const PHONE: BrowserContextOptions = { ...devices['Pixel 7'] };
const LOW = { risk: { recommendation: 'ACCEPT', assessments: [{ riskLevel: 'LOW' }] } };
/** The Day Ticket in the stand-in store's catalogue. */
const DAY_VARIANT = '41001';
/** What the turnstiles say above the card's line, for an owl with no ticket (OP-180). */
const DAY_TICKET = 'You need a ticket to go in. You can get a Day Ticket right here.';

let made = 0;
/** A new order number: the room server keeps its ticket book from one test run to the next. */
const orderId = () => String(Date.now() * 100 + 50 + (made++ % 50));

async function flip(request: APIRequestContext, mode: 'ticket' | 'deployed'): Promise<Record<string, unknown>> {
  const r = await request.post('/api/admin/gate', { headers: ADMIN, data: { mode } });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as Record<string, unknown>;
}

/** Passes are dated to the second: wait until a pass made now is dated after the gate closed. */
async function pastTheClose(closedAt: number): Promise<void> {
  await expect.poll(() => Date.now(), { intervals: [50] }).toBeGreaterThanOrEqual(Math.floor(closedAt / 1000) * 1000 + 1000);
}

/**
 * A visitor in the lobby, past the home screen, with the store's pages stood in for. `blockPopups`:
 * the browser refuses every new window, as a popup blocker would.
 */
async function arrive(browser: Browser, device: BrowserContextOptions, blockPopups = false): Promise<Page> {
  const context = await browser.newContext(device);
  await context.route(`https://${E2E_STORE.shop}/**`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Checkout</title><p>The store’s checkout, stood in for.</p>' }));
  const page = await context.newPage();
  if (blockPopups) await page.addInitScript(() => void (window.open = () => null));
  await page.goto('/?transport=edge&home=0');
  await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
  return page;
}

/** Into a turnstile with no ticket: it turns the owl back and offers a Day Ticket, on the card before the store. */
async function buyAtGate(page: Page): Promise<void> {
  await walkToDoor(page, 'gate');
  await expect(page.locator(STORE_CARD)).toBeVisible({ timeout: 15_000 });
  await expectStoreCard(page);
  await expect(page.locator(`${STORE_CARD} [data-store="say"]`)).toContainText(DAY_TICKET);
}

const status = (page: Page) => page.locator('[data-gate-sale] [data-checkout="status"]');

/** The token the cart link carries, from its address. */
function tokenOf(url: string): string {
  const u = new URL(url);
  expect(`${u.origin}${u.pathname}`).toBe(`https://${E2E_STORE.shop}/cart/${DAY_VARIANT}:1`);
  const token = u.searchParams.get('attributes[owl_checkout]') ?? '';
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return token;
}

/** The store's paid order for one Day Ticket bought with this token, and its signed webhook. */
async function pay(request: APIRequestContext, token: string): Promise<void> {
  const id = orderId();
  const order = {
    id: `gid://shopify/Order/${id}`,
    cancelledAt: null,
    totalPriceSet: { shopMoney: { amount: '1.60' } },
    customAttributes: [{ key: 'owl_checkout', value: token }],
    ...LOW,
    lineItems: { nodes: [{ id: 'gid://shopify/LineItem/1', quantity: 1, product: { productType: 'Ticket', kind: { value: 'day' }, hours: null, start: null, end: null } }] },
  };
  expect((await request.post(`${E2E_STORE.origin}/test/orders`, { data: { id, order } })).ok()).toBe(true);
  const body = JSON.stringify({ id: Number(id), admin_graphql_api_id: `gid://shopify/Order/${id}` });
  const signature = createHmac('sha256', E2E_STORE.webhookKey).update(body).digest('base64');
  const r = await request.post('/api/store/webhook', {
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Topic': 'orders/paid', 'X-Shopify-Hmac-Sha256': signature, 'X-Shopify-Shop-Domain': E2E_STORE.shop },
    data: body,
  });
  expect(r.status(), await r.text()).toBe(200);
  expect(await r.json()).toEqual({ tickets: 1, sent: true });
}

test.describe('buying a ticket without leaving the park (OP-175)', () => {
  test.afterEach(async ({ request }) => {
    await flip(request, 'deployed');
  });

  for (const [name, device] of [
    ['a computer', COMPUTER],
    ['a phone', PHONE],
  ] as const) {
    test(`on ${name}: a turnstile without a ticket opens checkout in its own window, and the paid ticket lands on the owl with no email`, async ({ browser, request }) => {
      await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
      const a = await arrive(browser, device);
      const shot = device === PHONE ? 'phone' : 'desktop';
      await buyAtGate(a);
      const [popup] = await Promise.all([a.waitForEvent('popup'), storeContinue(a)]);
      await expect(status(a)).toContainText('Checkout is open in its own window');
      await popup.waitForURL(/\/cart\//);
      const token = tokenOf(popup.url());
      expect((await state(a)).room).toBe('lobby');
      await a.screenshot({ path: `e2e-screenshots/checkout-open-${shot}.png` });

      await pay(request, token);
      await expect(a.getByText('Ticket added. Close checkout and walk through the turnstiles to enter the park.')).toBeVisible({ timeout: 15_000 });
      // The checkout window is cut off from the park, so the browser may not let the park close it
      // (Chromium does not, once it shows another site); the note asks the buyer to, and they do.
      if (!popup.isClosed()) await popup.close();
      await expect(a.locator('[data-gate-sale]')).toBeHidden();
      expect((await a.evaluate(() => window.owlPark.wallet())).map((t) => [t.kind, t.status])).toEqual([['day', 'unused']]);
      // Not opening night: no pass offer follows.
      await expect(a.locator('[data-free-pass]')).toBeHidden();
      await a.screenshot({ path: `e2e-screenshots/checkout-added-${shot}.png` });

      // And the turnstiles take it, with no card before the store.
      await walkToDoor(a, 'gate');
      await expect(a.locator('[data-ticket-card]')).toContainText('Your visit starts now', { timeout: 15_000 });
      await expect(a.locator(STORE_CARD)).toBeHidden();
      await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toBe('hub');
      await a.context().close();
    });
  }

  test('a blocked checkout window gives a link to tap with no second card, and Cancel says the ticket still lands if it was paid', async ({ browser, request }) => {
    await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
    const a = await arrive(browser, COMPUTER, true);
    await buyAtGate(a);
    await storeContinue(a);
    await expect(status(a)).toContainText('Your browser blocked the checkout window');
    const link = a.locator('[data-gate-sale] [data-checkout="link"]');
    await expect(link).toHaveText('Open checkout');
    // The card asked once, right before the purchase: the link is the cart, and asks nothing more.
    const token = tokenOf((await link.getAttribute('href'))!);
    await a.locator('[data-gate-sale] [data-checkout="cancel"]').click();
    await expect(status(a)).toHaveText('Checkout closed. If you paid, the ticket still lands on this owl, and your email has its link too.');
    await expect(a.locator(STORE_CARD)).toBeHidden();
    // Paid just before Cancel: it still lands, and the page still says so.
    await pay(request, token);
    await expect(a.getByText('Ticket added. Close checkout and walk through the turnstiles to enter the park.')).toBeVisible({ timeout: 15_000 });
    expect(await a.evaluate(() => window.owlPark.wallet())).toHaveLength(1);
    await a.context().close();
  });
});
