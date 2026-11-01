import { createHmac } from 'node:crypto';
import { devices, type APIRequestContext, type Browser, type BrowserContextOptions, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { E2E_ADMIN_KEY, E2E_STORE, STORE_CARD, doAction, expectStoreCard, openPark, storeContinue, walkToDoor } from './helpers';

/**
 * The card before the store (OP-153), through the room server and the stand-in store
 * (e2e/standInStore.mjs): every way from the park to the store's pages shows it first, every time.
 * Not now (or Escape) goes back to where the visitor was and opens nothing; Continue goes on as the
 * way did before. The ways: the booth's Get a ticket, its Open checkout when the window was blocked
 * and Back to checkout once it was closed, opening night's pass in the booth's wallet, and the gift
 * shop's door. Opening night's pass offer after the turnstiles is pressed through in opening.spec.ts.
 */
const ADMIN = { 'X-Admin-Key': E2E_ADMIN_KEY };
const COMPUTER: BrowserContextOptions = { viewport: { width: 1280, height: 800 } };
const PHONE: BrowserContextOptions = { ...devices['Pixel 7'] };
const HOUR = 3_600_000;
const FREE = { totalPriceSet: { shopMoney: { amount: '0.0' } } };
/** How long "nothing opened" is watched for after Not now. */
const QUIET_MS = 800;

let made = 0;
/** A new order number: the room server keeps its ticket book from one test run to the next. */
const orderId = () => String(Date.now() * 100 + 25 + (made++ % 25));

async function flip(request: APIRequestContext, mode: 'ticket' | 'deployed'): Promise<Record<string, unknown>> {
  const r = await request.post('/api/admin/gate', { headers: ADMIN, data: { mode } });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as Record<string, unknown>;
}

/** Passes are dated to the second: wait until a pass made now is dated after the gate closed. */
async function pastTheClose(closedAt: number): Promise<void> {
  await expect.poll(() => Date.now(), { intervals: [50] }).toBeGreaterThanOrEqual(Math.floor(closedAt / 1000) * 1000 + 1000);
}

/** The store's pages, stood in for in this context: the test never reaches a real store. */
async function standInStore(page: Page): Promise<void> {
  await page.context().route(`https://${E2E_STORE.shop}/**`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Store</title><p>The store, stood in for.</p>' }));
}

/** Counts the pages (tabs and windows) this page's context opens from now on. */
function pagesOpened(page: Page): () => number {
  let n = 0;
  page.context().on('page', () => n++);
  return () => n;
}

/** A visitor in the lobby, past the home screen. `blockPopups`: the browser refuses every new window. */
async function arrive(browser: Browser, device: BrowserContextOptions, blockPopups = false): Promise<Page> {
  const page = await (await browser.newContext(device)).newPage();
  await standInStore(page);
  if (blockPopups) await page.addInitScript(() => void (window.open = () => null));
  await page.goto('/?transport=edge&home=0');
  await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
  return page;
}

async function openBooth(page: Page): Promise<void> {
  await walkToDoor(page, 'booth');
  await page.locator('[data-action="booth"]').click({ timeout: 15_000 });
  await expect(page.locator('.booth [data-booth="say"]')).toBeVisible();
}

const card = (page: Page) => page.locator(STORE_CARD);
const continueOn = (page: Page) => page.locator(`${STORE_CARD} [data-store="continue"]`);
const notNowOn = (page: Page) => page.locator(`${STORE_CARD} [data-store="not-now"]`);

/** Not now: the card goes, the focus is back on what asked, and nothing opens. */
async function notNow(page: Page, asked: Locator, opened: () => number): Promise<void> {
  await notNowOn(page).click();
  await expect(card(page)).toBeHidden();
  await expect(asked).toBeVisible();
  await expect(asked).toBeFocused();
  await new Promise((r) => setTimeout(r, QUIET_MS));
  expect(opened(), 'pages opened after Not now').toBe(0);
}

test.describe('the card before the store (OP-153)', () => {
  test.afterEach(async ({ request }) => {
    await flip(request, 'deployed');
  });

  for (const [name, device] of [
    ['a computer', COMPUTER],
    ['a phone', PHONE],
  ] as const) {
    test(`on ${name}: Get a ticket asks every time; Not now goes back to the booth with no checkout, and Continue opens checkout`, async ({ browser, request }) => {
      await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
      const a = await arrive(browser, device);
      const shot = device === PHONE ? 'phone' : 'desktop';
      const opened = pagesOpened(a);
      await openBooth(a);
      const buy = a.locator('[data-booth="buy"]');
      await expect(buy).toHaveText('Get a ticket');

      await buy.click();
      await expectStoreCard(a);
      // The card takes the focus, not Continue, so a stray key never buys; both buttons are 44 px or more.
      await expect(card(a)).toBeFocused();
      for (const b of [continueOn(a), notNowOn(a)]) {
        const box = (await b.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
      await a.screenshot({ path: `e2e-screenshots/storecard-booth-${shot}.png` });
      await notNow(a, buy, opened);
      await expect(a.locator('[data-booth="checkout"]')).toHaveText('');
      await expect(buy).toBeEnabled();

      // Every time: the next tap asks again.
      await buy.click();
      await expectStoreCard(a);
      if (device === COMPUTER) {
        // Escape is Not now: the card goes and the booth stays open.
        await a.keyboard.press('Escape');
        await expect(card(a)).toBeHidden();
        await expect(buy).toBeVisible();
        await new Promise((r) => setTimeout(r, QUIET_MS));
        expect(opened()).toBe(0);

        // The keyboard reaches both buttons, and Enter on Continue opens checkout.
        await buy.click();
        await expectStoreCard(a);
        await a.keyboard.press('Tab');
        await expect(notNowOn(a)).toBeFocused();
        await a.keyboard.press('Tab');
        await expect(continueOn(a)).toBeFocused();
        const [popup] = await Promise.all([a.waitForEvent('popup'), a.keyboard.press('Enter')]);
        await popup.waitForURL(/\/cart\//);
      } else {
        const [popup] = await Promise.all([a.waitForEvent('popup'), storeContinue(a)]);
        await popup.waitForURL(/\/cart\//);
      }
      await expect(card(a)).toBeHidden();
      await expect(a.locator('[data-booth="checkout"]')).toContainText('Checkout is open in its own window');
      expect(opened()).toBe(1);
      await a.context().close();
    });
  }

  test('Back to checkout, once its window was closed, asks again before opening it', async ({ browser, request }) => {
    await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
    const a = await arrive(browser, COMPUTER);
    await openBooth(a);
    await a.locator('[data-booth="buy"]').click();
    const [first] = await Promise.all([a.waitForEvent('popup'), storeContinue(a)]);
    await first.waitForURL(/\/cart\//);
    const cart = first.url();
    await first.close();

    const opened = pagesOpened(a);
    const back = a.locator('[data-booth="checkout-back"]');
    await back.click();
    await expectStoreCard(a);
    await notNow(a, back, opened);
    await back.click();
    const [again] = await Promise.all([a.waitForEvent('popup'), storeContinue(a)]);
    await again.waitForURL(/\/cart\//);
    expect(again.url()).toBe(cart);
    await a.context().close();
  });

  test('a blocked checkout window: Open checkout asks first, and its Continue is the cart link', async ({ browser, request }) => {
    await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
    const a = await arrive(browser, COMPUTER, true);
    await openBooth(a);
    await a.locator('[data-booth="buy"]').click();
    await storeContinue(a);
    await expect(a.locator('[data-booth="checkout"]')).toContainText('Your browser blocked the checkout window');

    const opened = pagesOpened(a);
    const link = a.locator('[data-booth="checkout-link"]');
    await expect(link).toHaveText('Open checkout');
    // Nothing on the booth links to the store itself: only the card's Continue does.
    await expect(a.locator('.booth a[href]')).toHaveCount(0);
    await link.click();
    await expectStoreCard(a);
    await notNow(a, link, opened);

    await link.click();
    await expectStoreCard(a);
    const href = (await continueOn(a).getAttribute('href'))!;
    expect(new URL(href).pathname).toMatch(/^\/cart\//);
    const [tab] = await Promise.all([a.context().waitForEvent('page'), storeContinue(a)]);
    await tab.waitForURL(/\/cart\//);
    expect(opened()).toBe(1);
    await a.context().close();
  });

  test('the gift shop’s door asks first; Continue opens the store’s page', async ({ browser }) => {
    const page = await (await browser.newContext(COMPUTER)).newPage();
    await standInStore(page);
    await openPark(page, { transport: 'edge', room: 'market' });
    const opened = pagesOpened(page);
    await walkToDoor(page, 'shop');
    await doAction(page, 'shop');
    await expectStoreCard(page);
    await notNowOn(page).click();
    await expect(card(page)).toBeHidden();
    await new Promise((r) => setTimeout(r, QUIET_MS));
    expect(opened()).toBe(0);

    // Interact (E) asks again; while the card is up, E does nothing more.
    await page.keyboard.press('e');
    await expectStoreCard(page);
    await page.keyboard.press('e');
    await new Promise((r) => setTimeout(r, QUIET_MS));
    expect(opened()).toBe(0);
    const [shop] = await Promise.all([page.context().waitForEvent('page'), storeContinue(page)]);
    await shop.waitForLoadState();
    expect(shop.url()).toBe(E2E_STORE.shopUrl);
    expect(opened()).toBe(1);
    await page.context().close();
  });

  test('opening night’s pass in the booth’s wallet asks first; Continue opens its cart', async ({ browser, request }) => {
    await request.post(`${E2E_STORE.origin}/test/night`, { data: { on: true } });
    try {
      // A free Opening Night Ticket, claimed on this device and scanned tonight: its pass is ready.
      const order = orderId();
      const line = { id: 'gid://shopify/LineItem/1', quantity: 1, product: { productType: 'Ticket', kind: { value: 'opening-night' }, hours: null, start: { value: new Date(Date.now() - HOUR).toISOString() }, end: null } };
      expect((await request.post(`${E2E_STORE.origin}/test/orders`, { data: { id: order, order: { id: `gid://shopify/Order/${order}`, cancelledAt: null, lineItems: { nodes: [line] }, ...FREE } } })).ok()).toBe(true);
      const body = JSON.stringify({ id: Number(order), admin_graphql_api_id: `gid://shopify/Order/${order}` });
      const hook = await request.post('/api/store/webhook', {
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Topic': 'orders/paid', 'X-Shopify-Hmac-Sha256': createHmac('sha256', E2E_STORE.webhookKey).update(body).digest('base64'), 'X-Shopify-Shop-Domain': E2E_STORE.shop },
        data: body,
      });
      expect(hook.status(), await hook.text()).toBe(200);
      const { link } = (await (await request.get(`${E2E_STORE.origin}/test/sent?order=${order}`)).json()) as { link: string };
      const a = await (await browser.newContext(COMPUTER)).newPage();
      await standInStore(a);
      await a.goto(`/?transport=edge&home=0${new URL(link).hash}`);
      await a.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
      await expect(a.getByText('Your ticket is in your wallet')).toBeVisible({ timeout: 10_000 });
      const [night] = await a.evaluate(() => window.owlPark.wallet());
      expect(await a.evaluate((id) => window.owlPark.scan(id), night!.id)).toMatchObject({ ok: true });
      await expect.poll(async () => (await a.evaluate(() => window.owlPark.wallet())).find((t) => t.id === night!.id)?.freePass, { timeout: 10_000 }).toBe('ready');

      const opened = pagesOpened(a);
      await openBooth(a);
      const claim = a.locator('[data-booth="free-pass"] button');
      await expect(claim).toHaveText('Claim it');
      await claim.click();
      await expectStoreCard(a);
      await notNow(a, claim, opened);

      await claim.click();
      await expectStoreCard(a);
      const cart = new URL((await continueOn(a).getAttribute('href'))!);
      expect(cart.origin + cart.pathname).toBe(`https://${E2E_STORE.shop}/cart/41002:1`);
      expect(cart.searchParams.get('attributes[from_ticket]')).toBe(night!.id);
      const [tab] = await Promise.all([a.context().waitForEvent('page'), storeContinue(a)]);
      await tab.waitForURL(/\/cart\//);
      expect(opened()).toBe(1);
      await a.context().close();
    } finally {
      await request.post(`${E2E_STORE.origin}/test/night`, { data: { on: false } });
    }
  });
});
