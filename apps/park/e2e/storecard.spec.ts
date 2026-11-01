import { devices, type APIRequestContext, type Browser, type BrowserContextOptions, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { E2E_ADMIN_KEY, E2E_STORE, STORE_CARD, doAction, expectStoreCard, openPark, state, storeContinue, walkToDoor } from './helpers';

/**
 * The card before the store (OP-153), through the room server and the stand-in store
 * (e2e/standInStore.mjs). Since OP-180 it shows once for each purchase, right before it: a
 * turnstile reached without a ticket asks it before checkout for a Day Ticket (what follows that
 * purchase, Back to checkout, Open checkout and the half-price pass, asks nothing more), and the gift
 * shop's door asks it before the store's page. Not now (or Escape) goes back to where the visitor
 * was and opens nothing; Continue goes on. Opening night's pass offer after the turnstiles, which no
 * purchase came before, asks it too: opening.spec.ts presses it through, with the pass after a Day
 * Ticket.
 */
const ADMIN = { 'X-Admin-Key': E2E_ADMIN_KEY };
const COMPUTER: BrowserContextOptions = { viewport: { width: 1280, height: 800 } };
const PHONE: BrowserContextOptions = { ...devices['Pixel 7'] };
/** How long "nothing opened" is watched for after Not now. */
const QUIET_MS = 800;

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

/** What the turnstiles say above the card's line, for an owl with no ticket (OP-180). */
const DAY_TICKET = 'You need a ticket to go in. You can get a Day Ticket right here.';

/** Into a turnstile with no ticket: the card before the store comes up, with the turnstiles' offer. */
async function intoTheGate(page: Page): Promise<void> {
  await walkToDoor(page, 'gate');
  await expect(card(page)).toBeVisible({ timeout: 15_000 });
  await expectStoreCard(page);
  await expect(page.locator(`${STORE_CARD} [data-store="say"]`)).toContainText(DAY_TICKET);
}

/** Back on the plaza, still outside: the turnstiles turned the owl back while the card asked. */
async function turnedBack(page: Page): Promise<void> {
  await expect.poll(async () => (await state(page)).walking, { timeout: 15_000 }).toBe(false);
  expect((await state(page)).room).toBe('lobby');
}

const card = (page: Page) => page.locator(STORE_CARD);
const continueOn = (page: Page) => page.locator(`${STORE_CARD} [data-store="continue"]`);
const notNowOn = (page: Page) => page.locator(`${STORE_CARD} [data-store="not-now"]`);

/** Not now: the card goes, the focus is back on what asked (if anything did), and nothing opens. */
async function notNow(page: Page, asked: Locator | null, opened: () => number): Promise<void> {
  await notNowOn(page).click();
  await expect(card(page)).toBeHidden();
  if (asked) {
    await expect(asked).toBeVisible();
    await expect(asked).toBeFocused();
  }
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
    test(`on ${name}: a turnstile without a ticket asks before checkout; Not now opens nothing, and Continue opens checkout`, async ({ browser, request }) => {
      await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
      const a = await arrive(browser, device);
      const shot = device === PHONE ? 'phone' : 'desktop';
      const opened = pagesOpened(a);

      await intoTheGate(a);
      // The card takes the focus, not Continue, so a stray key never buys; both buttons are 44 px or more.
      await expect(card(a)).toBeFocused();
      for (const b of [continueOn(a), notNowOn(a)]) {
        const box = (await b.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
      await a.screenshot({ path: `e2e-screenshots/storecard-gate-${shot}.png` });
      await notNow(a, null, opened);
      await turnedBack(a);
      await expect(a.locator('[data-gate-sale]')).toBeHidden();

      // Each time the owl walks into the turnstiles without a ticket, it asks again.
      await intoTheGate(a);
      if (device === COMPUTER) {
        // Escape is Not now: the card goes and nothing opens.
        await a.keyboard.press('Escape');
        await expect(card(a)).toBeHidden();
        await new Promise((r) => setTimeout(r, QUIET_MS));
        expect(opened()).toBe(0);
        await turnedBack(a);

        // The keyboard reaches both buttons, and Enter on Continue opens checkout.
        await intoTheGate(a);
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
      await expect(a.locator('[data-gate-sale] [data-checkout="status"]')).toContainText('Checkout is open in its own window');
      expect(opened()).toBe(1);

      // Into the turnstiles again while checkout is open: no second card, and nothing more opens.
      await turnedBack(a);
      await walkToDoor(a, 'gate');
      await expect(a.getByText('You need a ticket to go in.', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(card(a)).toBeHidden();
      expect(opened()).toBe(1);
      await a.context().close();
    });
  }

  test('Back to checkout, once its window was closed, opens it again with no second card', async ({ browser, request }) => {
    await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
    const a = await arrive(browser, COMPUTER);
    await intoTheGate(a);
    const [first] = await Promise.all([a.waitForEvent('popup'), storeContinue(a)]);
    await first.waitForURL(/\/cart\//);
    const cart = first.url();
    await first.close();

    const opened = pagesOpened(a);
    const back = a.locator('[data-gate-sale] [data-checkout="back"]');
    await expect(back).toHaveText('Back to checkout');
    const [again] = await Promise.all([a.waitForEvent('popup'), back.click()]);
    await again.waitForURL(/\/cart\//);
    expect(again.url()).toBe(cart);
    await expect(card(a)).toBeHidden();
    expect(opened()).toBe(1);
    await a.context().close();
  });

  test('a blocked checkout window: Open checkout is the cart link the card let through, with no second card', async ({ browser, request }) => {
    await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
    const a = await arrive(browser, COMPUTER, true);
    await intoTheGate(a);
    await storeContinue(a);
    await expect(a.locator('[data-gate-sale] [data-checkout="status"]')).toContainText('Your browser blocked the checkout window');

    const opened = pagesOpened(a);
    const link = a.locator('[data-gate-sale] [data-checkout="link"]');
    await expect(link).toHaveText('Open checkout');
    expect(new URL((await link.getAttribute('href'))!).pathname).toMatch(/^\/cart\//);
    const [tab] = await Promise.all([a.context().waitForEvent('page'), link.click()]);
    await tab.waitForURL(/\/cart\//);
    await expect(card(a)).toBeHidden();
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
});
