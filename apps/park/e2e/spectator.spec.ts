import { createHmac } from 'node:crypto';
import type { APIRequestContext, Browser, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { flyThrough, playAt, untilOver } from './arcadePlay';
import { E2E_ADMIN_KEY, E2E_STORE, GATE_ASK, GATE_ASK_LINE, STORE_CARD, doAction, enterAsGuest, expectStoreCard, openPark, state, storeContinue, walkToDoor } from './helpers';

/**
 * Spectators (OP-191), the page's half, through the room server with SPECTATORS on (as every browser
 * test's room server has it, playwright.config.ts) and the gate taking tickets. An owl without a ticket
 * that works walks on past the turnstiles as a spectator, with one line and the Day Ticket on a button;
 * in the park a "Just looking" badge offers it too. The quests, the NPC owls, the Realm Vote and the
 * gift shop's door sell a Day Ticket instead; the leaf piles and the stalls play as anyone's and turn
 * up nothing (OP-243); the games play and earn nothing, and the
 * arcade's result card offers the Day Ticket before Play again. A Day Ticket bought from inside makes
 * the owl a full visitor where it stands, with no reload. Every test hands the gate back to the
 * deployed setting (open) when it ends.
 *
 * A HUD card that was never made is not in the page at all: these tests ask for none of it
 * (`toHaveCount(0)`), not for a hidden one.
 */
const ADMIN = { 'X-Admin-Key': E2E_ADMIN_KEY };
const LOW = { risk: { recommendation: 'ACCEPT', assessments: [{ riskLevel: 'LOW' }] } };
/** The words, drafts for the owner (ui/spectator.ts). */
const LOCKED = 'Quests and the shops are for ticket holders. You can get a Day Ticket right here.';
const IDOL = 'Ticket holders vote here, one vote a day.';
const KEEP = 'A Day Ticket lets you keep what you win. You can get a Day Ticket right here.';
const ADMITTED = 'Your Day Ticket is in. Have fun!';
const LEAVES = 'With a Day Ticket, leaf piles can turn up feathers.';
const STALL_LINES = /Neon trinkets|A tray of buttons|Paper lanterns/;

let made = 0;
/** A new order number: the room server keeps its ticket book from one test run to the next. */
const orderId = () => String(Date.now() * 100 + 70 + (made++ % 30));

async function flip(request: APIRequestContext, mode: 'ticket' | 'deployed'): Promise<Record<string, unknown>> {
  const r = await request.post('/api/admin/gate', { headers: ADMIN, data: { mode } });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as Record<string, unknown>;
}

/** Passes are dated to the second: wait until a pass made now is dated after the gate closed. */
async function pastTheClose(closedAt: number): Promise<void> {
  await expect.poll(() => Date.now(), { intervals: [50] }).toBeGreaterThanOrEqual(Math.floor(closedAt / 1000) * 1000 + 1000);
}

/** A visitor in the lobby, past the home screen, with the store's pages stood in for. */
async function arrive(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.route(`https://${E2E_STORE.shop}/**`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Checkout</title><p>The store’s checkout, stood in for.</p>' }));
  const page = await context.newPage();
  await page.goto('/?transport=edge&home=0');
  await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
  expect((await state(page)).room).toBe('lobby');
  return page;
}

/** In a room of the park, as its welcome says a spectator is (the room server decides, OP-191). */
async function spectating(page: Page, room: string): Promise<void> {
  await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe(room);
  await expect.poll(async () => (await state(page)).spectator, { timeout: 15_000 }).toBe(true);
  await expect(page.locator('[data-spectator].show')).toContainText('Just looking');
}

/** The card before the store is up, with `say` above its line: the turnstiles' own sale (OP-180). */
async function sale(page: Page, say: string): Promise<void> {
  await expect(page.locator(STORE_CARD)).toBeVisible({ timeout: 15_000 });
  await expectStoreCard(page);
  await expect(page.locator(`${STORE_CARD} [data-store="say"]`)).toContainText(say);
}

async function notNow(page: Page): Promise<void> {
  await page.locator(`${STORE_CARD} [data-store="not-now"]`).click();
  await expect(page.locator(STORE_CARD)).toBeHidden();
}

/** The token the cart link carries, from its address. */
function tokenOf(url: string): string {
  const token = new URL(url).searchParams.get('attributes[owl_checkout]') ?? '';
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
}

test.describe('spectators (OP-191)', () => {
  test.afterEach(async ({ request }) => {
    await flip(request, 'deployed');
  });

  test('an owl without a ticket walks on in as a spectator: one line with the Day Ticket, the badge, and the Quests tab locked', { tag: '@smoke' }, async ({ browser, request }) => {
    test.slow(); // Gate entry, two ticket offers, a room change and context cleanup share one budget.
    await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
    // The park says spectators come in (only while SPECTATORS is on).
    const { pass } = (await (await request.get('/api/pass')).json()) as { pass: string };
    expect(await (await request.get('/api/entry', { headers: { Authorization: `Bearer ${pass}` } })).json()).toEqual({ gate: 'ticket', admitted: false, spectators: true });

    const a = await arrive(browser);
    expect((await state(a)).spectator).toBe(false);
    await expect(a.locator('[data-spectator].show')).toHaveCount(0);
    await walkToDoor(a, 'gate');
    // The turnstiles ask first (OP-198): no card before the store comes up by itself, and the owl waits.
    await expect(a.locator(GATE_ASK)).toContainText(GATE_ASK_LINE, { timeout: 15_000 });
    await expect(a.locator(STORE_CARD)).toBeHidden();
    await expect(a.locator('[data-ticket-card].up')).toHaveCount(0);
    expect((await state(a)).room).toBe('lobby');
    await a.screenshot({ path: 'e2e-screenshots/gate-ask.png' });
    await enterAsGuest(a);
    await expect(a.getByText('Welcome in! You can get a Day Ticket any time from the button up top.')).toBeVisible({ timeout: 15_000 });
    await spectating(a, 'hub');
    await a.screenshot({ path: 'e2e-screenshots/spectator-hub.png' });

    // The badge's Get a Day Ticket is the turnstiles' sale.
    await a.locator('[data-spectator-get="badge"]').click();
    await sale(a, KEEP);
    await notNow(a);

    // The Quests tab says the quests are ticket holders', with the Day Ticket.
    await a.keyboard.press('KeyJ');
    const menu = a.getByRole('dialog', { name: 'Menu' });
    await expect(menu.getByText(LOCKED)).toBeVisible();
    await menu.locator('[data-spectator-get="quests"]').click();
    await expect(menu).toBeHidden();
    await sale(a, LOCKED);
    await notNow(a);
    // Spectators go from room to room as anyone.
    await walkToDoor(a, 'to-market');
    await spectating(a, 'market');
    await a.context().close();
  });

  test('in the market: Nova, the gift shop’s door and the idol sell a Day Ticket instead; a stall is browsed for nothing', async ({ browser, request }) => {
    await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await openPark(page, { transport: 'edge', room: 'market' });
    await spectating(page, 'market');
    // No quest marks over the NPC owls and no quest items for a spectator.
    expect((await state(page)).npcs.every((n) => n.mark === null)).toBe(true);
    expect((await state(page)).items).toEqual([]);

    // The feather shop's keeper: no dialogue, the Day Ticket.
    expect(await page.evaluate(() => window.owlPark.talk('nova'))).toBe(true);
    await sale(page, LOCKED);
    await expect(page.locator('.dialogue[data-npc="nova"]')).toBeHidden();
    await notNow(page);

    // A stall is browsed as by anyone (OP-243): its line, no card, no feathers.
    const feathers = await page.evaluate(() => window.owlPark.collection()?.feathers ?? 0);
    expect(await page.evaluate(() => window.owlPark.use('market-stall-1'))).toBe(true);
    await expect(page.locator('.toast').filter({ hasText: STALL_LINES })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(STORE_CARD)).toBeHidden();
    expect(await page.evaluate(() => window.owlPark.collection()?.feathers ?? 0)).toBe(feathers);

    // The gift shop's door sells the Day Ticket rather than opening the store.
    await walkToDoor(page, 'shop');
    await doAction(page, 'shop');
    await sale(page, LOCKED);
    await notNow(page);

    // The Realm Vote: its line, then the Day Ticket.
    await walkToDoor(page, 'idol');
    await page.getByRole('button', { name: 'Vote for this realm', exact: true }).click({ timeout: 15_000 });
    await expect(page.getByText(IDOL, { exact: true })).toBeVisible();
    await sale(page, IDOL);
    await page.screenshot({ path: 'e2e-screenshots/spectator-idol.png' });
    await notNow(page);
    await page.context().close();
  });

  test('a spectator flops into a leaf pile: gone for it as for anyone, nothing turns up, and it is told once (OP-243)', async ({ browser, request }) => {
    await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await openPark(page, { transport: 'edge', room: 'grove' });
    await spectating(page, 'grove');
    const feathers = await page.evaluate(() => window.owlPark.collection()?.feathers ?? 0);
    const pile = (await state(page)).objects.find((o) => o.kind === 'leaf-pile' && o.here)!;
    expect(await page.evaluate((id) => window.owlPark.use(id), pile.id)).toBe(true);
    await expect.poll(async () => (await state(page)).objects.find((o) => o.id === pile.id)?.here, { timeout: 20_000 }).toBe(false);
    await expect(page.locator('.toast').filter({ hasText: LEAVES })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(STORE_CARD)).toBeHidden();
    expect(await page.evaluate(() => window.owlPark.collection()?.feathers ?? 0)).toBe(feathers);
    await page.screenshot({ path: 'e2e-screenshots/spectator-leaves.png' });
    await page.context().close();
  });

  test('a spectator’s arcade run earns nothing, and its card offers the Day Ticket before Play again', async ({ browser, request }) => {
    await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await openPark(page, { transport: 'edge', room: 'arcade' });
    await spectating(page, 'arcade');
    const before = await page.evaluate(() => window.owlPark.collection()?.feathers ?? 0);
    await playAt(page, 'flight');
    await flyThrough(page, 2);
    await untilOver(page);
    const card = page.locator('.arcade [data-result]');
    await expect(card).toBeVisible();
    await expect(card.locator('[data-offer]')).toHaveText(/^(Nice run! With a Day Ticket this would have earned \d+ feathers?\.|With a Day Ticket, games earn feathers\.)$/);
    await expect(card.locator('[data-paid]')).toHaveText('');
    const buttons = card.locator('.a-buttons button:visible');
    await expect(buttons).toHaveText(['Get a Day Ticket', 'Play again', 'Close']);
    await page.screenshot({ path: 'e2e-screenshots/spectator-arcade.png' });
    expect(await page.evaluate(() => window.owlPark.collection()?.feathers ?? 0)).toBe(before);
    // Its Get a Day Ticket closes the game for the turnstiles' sale, with the run's line above the card.
    const line = (await card.locator('[data-offer]').textContent()) ?? '';
    await card.locator('[data-spectator-get="arcade"]').click();
    await sale(page, line);
    await expect(page.locator('.arcade [data-result]')).toBeHidden();
    await notNow(page);
    await page.context().close();
  });

  test('a Day Ticket bought from inside makes the spectator a full visitor where it stands, with no reload', async ({ browser, request }) => {
    await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
    const a = await arrive(browser);
    await walkToDoor(a, 'gate');
    await enterAsGuest(a);
    await spectating(a, 'hub');
    // A mark on this page: a reload would lose it.
    await a.evaluate(() => void ((window as unknown as { stillHere: boolean }).stillHere = true));

    await a.locator('[data-spectator-get="badge"]').click();
    await sale(a, KEEP);
    const [popup] = await Promise.all([a.waitForEvent('popup'), storeContinue(a)]);
    await popup.waitForURL(/\/cart\//);
    await pay(request, tokenOf(popup.url()));
    if (!popup.isClosed()) await popup.close();

    // The ticket comes: the turnstiles scan it where the owl stands, and the room takes the admitted pass.
    await expect(a.getByText(ADMITTED, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await state(a)).spectator, { timeout: 15_000 }).toBe(false);
    expect((await state(a)).room).toBe('hub');
    await expect(a.locator('[data-spectator].show')).toHaveCount(0);
    expect(await a.evaluate(() => (window as unknown as { stillHere?: boolean }).stillHere)).toBe(true);
    expect((await a.evaluate(() => window.owlPark.wallet())).map((t) => [t.kind, t.status])).toEqual([['day', 'active']]);
    await a.screenshot({ path: 'e2e-screenshots/spectator-admitted.png' });

    // No half-price pass after the ticket (OP-198: the Annual Pass was offered on the card); the quests are open.
    await expect(a.locator('[data-free-pass]')).toHaveCount(0);
    await a.keyboard.press('KeyJ');
    const menu = a.getByRole('dialog', { name: 'Menu' });
    await expect(menu).toBeVisible();
    await expect(menu.getByText(LOCKED)).toHaveCount(0);
    await a.context().close();
  });
});
