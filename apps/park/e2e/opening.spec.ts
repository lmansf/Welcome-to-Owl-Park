import { createHmac } from 'node:crypto';
import { devices, expect, test, type APIRequestContext, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { E2E_ADMIN_KEY, E2E_STORE, state, walkToDoor } from './helpers';

/**
 * Opening night (C42) through the room server and the stand-in store (e2e/standInStore.mjs): the
 * store's orders come in as signed webhooks, the way the store sends them, and the room server reads
 * each order back from the stand-in.
 */
const HOUR = 3_600_000;
const FREE = { totalPriceSet: { shopMoney: { amount: '0.0' } } };
const LOW = { risk: { recommendation: 'ACCEPT', assessments: [{ riskLevel: 'LOW' }] } };

let made = 0;
/** A new order number: the room server keeps its ticket book from one test run to the next. */
const orderId = () => String(Date.now() * 100 + (made++ % 100));

const ticketLine = (n: number, kind: string, quantity = 1, start?: number) => ({
  id: `gid://shopify/LineItem/${n}`,
  quantity,
  product: { productType: 'Ticket', kind: { value: kind }, hours: null, start: start === undefined ? null : { value: new Date(start).toISOString() }, end: null },
});

/** An order in the stand-in store, as its Admin API would answer for it. */
async function putOrder(request: APIRequestContext, id: string, lines: unknown[], extra: Record<string, unknown> = {}): Promise<void> {
  const r = await request.post(`${E2E_STORE.origin}/test/orders`, { data: { id, order: { id: `gid://shopify/Order/${id}`, cancelledAt: null, lineItems: { nodes: lines }, ...extra } } });
  expect(r.ok()).toBe(true);
}

/** The store's webhook for an order, signed with the store's key. */
async function webhook(request: APIRequestContext, topic: string, id: string): Promise<Record<string, unknown>> {
  const body = JSON.stringify({ id: Number(id), admin_graphql_api_id: `gid://shopify/Order/${id}` });
  const signature = createHmac('sha256', E2E_STORE.webhookKey).update(body).digest('base64');
  const r = await request.post('/api/store/webhook', {
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Topic': topic, 'X-Shopify-Hmac-Sha256': signature, 'X-Shopify-Shop-Domain': E2E_STORE.shop },
    data: body,
  });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as Record<string, unknown>;
}

/** Opening the claim link the store emailed for an order, on a computer or a phone. */
async function claim(browser: Browser, request: APIRequestContext, order: string, device: BrowserContextOptions): Promise<Page> {
  const { link } = (await (await request.get(`${E2E_STORE.origin}/test/sent?order=${order}`)).json()) as { link: string | null };
  expect(link).toMatch(/#claim=[A-Za-z0-9_-]{43}$/);
  const page = await (await browser.newContext(device)).newPage();
  await page.goto(`/?transport=edge&home=0${new URL(link!).hash}`);
  await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
  await expect(page.getByText('Your ticket is in your wallet')).toBeVisible({ timeout: 10_000 });
  return page;
}

const COMPUTER: BrowserContextOptions = { viewport: { width: 1280, height: 800 } };
const PHONE: BrowserContextOptions = { ...devices['Pixel 7'] };

test.describe('opening night (C42)', () => {
  test.beforeAll(async ({ request }) => {
    await request.post(`${E2E_STORE.origin}/test/night`, { data: { on: true } });
  });
  test.afterAll(async ({ request }) => {
    await request.post(`${E2E_STORE.origin}/test/night`, { data: { on: false } });
  });

  for (const [name, device] of [
    ['a computer', COMPUTER],
    ['a phone', PHONE],
  ] as const) {
    test(`on ${name}: a free ticket goes out at once, the gate takes it, and its free pass comes back linked to it`, async ({ browser, request }) => {
      // The store sells the Opening Night Ticket for nothing: a free order, with no risk rating to wait for.
      const order = orderId();
      await putOrder(request, order, [ticketLine(1, 'opening-night', 1, Date.now() - HOUR)], FREE);
      expect(await webhook(request, 'orders/paid', order)).toEqual({ tickets: 1, sent: true });
      const a = await claim(browser, request, order, device);
      const [night] = await a.evaluate(() => window.owlPark.wallet());
      expect(night).toMatchObject({ kind: 'opening-night', status: 'unused' });

      // The booth says every pass is free tonight.
      await walkToDoor(a, 'booth');
      await a.locator('[data-action="booth"]').click({ timeout: 15_000 });
      await expect(a.locator('[data-booth="opening"]')).toHaveText('Opening night: every pass is free');
      await expect(a.locator('[data-booth="wallet"] li')).toContainText('Opening Night Ticket');
      await a.screenshot({ path: `e2e-screenshots/opening-booth-${device === PHONE ? 'phone' : 'desktop'}.png` });
      await a.keyboard.press('Escape');

      // Through the turnstiles: the ticket card, then the free pass with the store's cart link.
      await walkToDoor(a, 'gate');
      await expect(a.locator('[data-ticket-card]')).toContainText('Your night starts now', { timeout: 15_000 });
      const offer = a.locator('[data-free-pass]');
      await expect(offer).toBeVisible({ timeout: 15_000 });
      await expect(offer).toContainText('Your pass is free tonight.');
      const claimIt = offer.getByRole('link', { name: 'Claim it' });
      const cart = new URL((await claimIt.getAttribute('href'))!);
      expect(cart.origin + cart.pathname).toBe(`https://${E2E_STORE.shop}/cart/41002:1`);
      expect(cart.searchParams.get('discount')).toBe(E2E_STORE.passCode);
      expect(cart.searchParams.get('attributes[from_ticket]')).toBe(night!.id);
      await a.screenshot({ path: `e2e-screenshots/opening-free-pass-${device === PHONE ? 'phone' : 'desktop'}.png` });

      // Claim it: the store's checkout opens in a new tab (a stand-in page here).
      await a.context().route(`https://${E2E_STORE.shop}/**`, (route) => route.fulfill({ contentType: 'text/html', body: '<p>Checkout</p>' }));
      const [checkout] = await Promise.all([a.context().waitForEvent('page'), claimIt.click()]);
      await checkout.close();

      // The buyer checks out: a free pass order with the code and the ticket, back through the webhook.
      const pass = orderId();
      await putOrder(request, pass, [ticketLine(2, 'annual')], { ...FREE, discountCodes: [E2E_STORE.passCode], customAttributes: [{ key: 'from_ticket', value: night!.id }] });
      expect(await webhook(request, 'orders/paid', pass)).toEqual({ tickets: 1, sent: true });

      // The pass comes straight into this wallet, and the page says so.
      await expect(a.getByText('Your annual pass is in your wallet')).toBeVisible({ timeout: 20_000 });
      const wallet = await a.evaluate(() => window.owlPark.wallet());
      expect(wallet.find((t) => t.kind === 'annual')).toMatchObject({ status: 'unused' });
      expect(wallet.find((t) => t.id === night!.id)).toMatchObject({ status: 'active', freePass: 'claimed' });
      await a.context().close();
    });
  }

  test('a ticket for a night that has passed is turned away the day after', async ({ browser, request }) => {
    const order = orderId();
    await putOrder(request, order, [ticketLine(1, 'opening-night', 1, Date.now() - 26 * HOUR)], FREE);
    expect(await webhook(request, 'orders/create', order)).toEqual({ tickets: 1, sent: true });
    const { link } = (await (await request.get(`${E2E_STORE.origin}/test/sent?order=${order}`)).json()) as { link: string };
    const a = await (await browser.newContext(COMPUTER)).newPage();
    await a.goto(`/?transport=edge&home=0${new URL(link).hash}`);
    await expect(a.getByText('The tickets on that link were refunded or have run out.')).toBeVisible({ timeout: 20_000 });
    const [night] = await a.evaluate(() => window.owlPark.wallet());
    expect(night).toMatchObject({ kind: 'opening-night', status: 'expired' });
    expect(await a.evaluate((id) => window.owlPark.scan(id), night!.id)).toMatchObject({ ok: false, reason: 'expired' });
    await a.context().close();
  });

  test('one vote a day for a wallet holding two passes', async ({ browser, request }) => {
    const order = orderId();
    await putOrder(request, order, [ticketLine(1, 'annual', 2)], { totalPriceSet: { shopMoney: { amount: '29.98' } }, ...LOW });
    expect(await webhook(request, 'orders/paid', order)).toEqual({ tickets: 2, sent: true });
    const { link } = (await (await request.get(`${E2E_STORE.origin}/test/sent?order=${order}`)).json()) as { link: string };
    const a = await (await browser.newContext(COMPUTER)).newPage();
    await a.goto(`/?transport=edge&home=0${new URL(link).hash}`);
    await expect(a.getByText('Your tickets are in your wallet')).toBeVisible({ timeout: 20_000 });
    const [first, second] = await a.evaluate(() => window.owlPark.wallet());

    // The first pass lets the owl in, and it votes at a realm's idol.
    expect(await a.evaluate((id) => window.owlPark.scan(id), first!.id)).toMatchObject({ ok: true });
    await walkToDoor(a, 'gate');
    await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toBe('hub');
    await walkToDoor(a, 'to-market');
    await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toBe('market');
    await walkToDoor(a, 'idol');
    const vote = a.getByRole('button', { name: 'Vote for this realm', exact: true });
    await vote.click({ timeout: 15_000 });
    await expect(a.getByText('Your vote for this realm is in')).toBeVisible({ timeout: 10_000 });

    // The second pass lets it in as well, but the wallet has had its vote today.
    expect(await a.evaluate((id) => window.owlPark.scan(id), second!.id)).toMatchObject({ ok: true });
    await vote.click();
    await expect(a.getByText('You already voted for this realm today.')).toBeVisible({ timeout: 10_000 });
    const wallet = await a.evaluate(() => window.owlPark.wallet());
    expect(wallet.map((t) => t.voteToday)).toEqual(['used', 'used']);
    await a.context().close();
  });

  test("the keepers' page counts the night: tickets, passes with and without the link, the conversion", async ({ browser, request }) => {
    // A pass bought with the night's code but not through the park's link.
    const order = orderId();
    await putOrder(request, order, [ticketLine(1, 'annual')], { ...FREE, discountCodes: [E2E_STORE.passCode.toLowerCase()] });
    await webhook(request, 'orders/paid', order);

    expect((await request.get('/api/admin/opening')).status()).toBe(403);
    const r = await request.get('/api/admin/opening', { headers: { 'X-Admin-Key': E2E_ADMIN_KEY } });
    const { counts, window, link } = (await r.json()) as { counts: Record<string, number>; window: { from: number; until: number } | null; link: { code: boolean; pass: boolean } };
    // The tests before this one: two tickets through the gate, each turned into a linked pass.
    expect(counts['issued']).toBeGreaterThanOrEqual(3);
    expect(counts['scanned']).toBeGreaterThanOrEqual(2);
    expect(counts['linkedPasses']).toBeGreaterThanOrEqual(2);
    expect(counts['unlinkedPasses']).toBeGreaterThanOrEqual(1);
    expect(counts['conversion']).toBeGreaterThan(0);
    expect(window!.until - window!.from).toBe(24 * HOUR);
    expect(link).toEqual({ code: true, pass: true });
    const csv = await (await request.get('/api/admin/opening?csv', { headers: { 'X-Admin-Key': E2E_ADMIN_KEY } })).text();
    expect(csv.split('\n')[0]).toBe('kind,ticket,order,status,first_scan,from_ticket');
    expect(csv).toContain(`,${order},`);

    // The page itself, opened with the key.
    const keeper = await (await browser.newContext(COMPUTER)).newPage();
    await keeper.goto('/admin/opening');
    await keeper.getByLabel('Admin key').fill(E2E_ADMIN_KEY);
    await keeper.getByRole('button', { name: 'Open' }).click();
    await expect(keeper.locator('[data-stat="issued"] dd')).toHaveText(String(counts['issued']), { timeout: 10_000 });
    await expect(keeper.locator('[data-stat="linked"] dd')).toHaveText(String(counts['linkedPasses']));
    await expect(keeper.locator('#link')).toHaveText('The free-pass link is ready.');
    await keeper.screenshot({ path: 'e2e-screenshots/opening-admin.png', fullPage: true });
    await keeper.context().close();
  });
});
