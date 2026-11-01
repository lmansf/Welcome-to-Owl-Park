import type { APIRequestContext, Browser, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { E2E_ADMIN_KEY, STORE_CARD, state, walkAndStop, walkToDoor } from './helpers';

/**
 * A ticket's status shows only at the turnstiles (OP-180, in place of OP-172's card on the plaza),
 * through the room server: nothing comes up on the plaza before the gate, ticket or none; going
 * through shows the scan card; an owl without a ticket is offered a Day Ticket by the card before the
 * store (gate.spec.ts, storecard.spec.ts). The Menu's Settings keep the tickets in a closed row. With
 * the gate open nothing shows at all. Every test hands the gate back to the deployed setting (open)
 * when it ends.
 */
const ADMIN = { 'X-Admin-Key': E2E_ADMIN_KEY };
/** On the plaza before the middle turnstile, where OP-172's status card used to come up. */
const PLAZA = { x: 2570, y: 800 };
const DAY_TICKET = 'You need a ticket to go in. You can get a Day Ticket right here.';

async function flip(request: APIRequestContext, mode: 'open' | 'ticket' | 'deployed'): Promise<Record<string, unknown>> {
  const r = await request.post('/api/admin/gate', { headers: ADMIN, data: { mode } });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as Record<string, unknown>;
}

/** Passes are dated to the second: wait until one made now is dated after the gate closed (as gate.spec.ts does). */
async function pastTheClose(closedAt: number): Promise<void> {
  await expect.poll(() => Date.now(), { intervals: [50] }).toBeGreaterThanOrEqual(Math.floor(closedAt / 1000) * 1000 + 1000);
}

/** A visitor arriving in the lobby (with a ticket link's hash, when given), past the home screen. */
async function arrive(browser: Browser, hash = ''): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto(`/?transport=edge&home=0${hash}`);
  await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
  expect((await state(page)).room).toBe('lobby');
  return page;
}

const ticketCard = (page: Page) => page.locator('[data-ticket-card]');
/** A ticket card raised: none at all counts as down (the HUD makes the card on first use, and a new room's HUD has none). */
const raisedCard = (page: Page) => page.locator('[data-ticket-card].up');

/** Nothing of a ticket comes up for a while (give a card time to be wrong): no ticket card raised, no card before the store. */
async function staysHidden(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await expect(page.locator('[data-ticket-status]')).toHaveCount(0);
    await expect(raisedCard(page)).toHaveCount(0);
    await expect(page.locator(STORE_CARD)).toBeHidden();
    await page.waitForTimeout(250);
  }
}

test.describe('ticket status only at the turnstiles (OP-180)', () => {
  test.afterEach(async ({ request }) => {
    await flip(request, 'deployed');
  });

  test('with the gate taking tickets and no ticket: nothing on the plaza, and the turnstiles offer a Day Ticket', async ({ browser, request }) => {
    await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
    const a = await arrive(browser);
    await staysHidden(a);
    await walkAndStop(a, PLAZA.x, PLAZA.y);
    await staysHidden(a);
    await a.screenshot({ path: 'e2e-screenshots/turnstiles-plaza-no-ticket.png' });

    // Into the turnstiles: they say why, with the Day Ticket on the card before the store.
    await walkToDoor(a, 'gate');
    await expect(a.locator(STORE_CARD)).toBeVisible({ timeout: 15_000 });
    await expect(a.locator(`${STORE_CARD} [data-store="say"]`)).toContainText(DAY_TICKET);
    await a.locator(`${STORE_CARD} [data-store="not-now"]`).click();
    await expect(a.locator(STORE_CARD)).toBeHidden();
    await expect.poll(async () => (await state(a)).walking, { timeout: 15_000 }).toBe(false);
    expect((await state(a)).room).toBe('lobby');
    // Back on the plaza, nothing of the ticket stays up.
    await staysHidden(a);

    // The Menu's Settings say where a ticket is had.
    await a.locator('[data-menu-btn]').click();
    const menu = a.getByRole('dialog', { name: 'Menu' });
    await menu.locator('[data-tab="settings"]').click();
    const row = menu.locator('details[data-tickets]');
    await row.locator('summary').click();
    await expect(row.locator('.mnote')).toHaveText('No ticket yet. You can get one at the turnstiles.');
    await a.context().close();
  });

  test('with a ticket: nothing on the plaza, the scan card at the turnstiles, and the ticket in Settings', async ({ browser, request }) => {
    await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
    const issued = await request.post('/api/admin/tickets', { headers: ADMIN, data: { kind: 'day' } });
    expect(issued.status()).toBe(200);
    const { link } = (await issued.json()) as { link: string };
    const a = await arrive(browser, new URL(link).hash);
    await expect(a.getByText('Your ticket is in your wallet')).toBeVisible({ timeout: 10_000 });

    await walkAndStop(a, PLAZA.x, PLAZA.y);
    await staysHidden(a);

    // Through the turnstiles: the scan card says the visit starts, and no card before the store asks.
    await walkToDoor(a, 'gate');
    await expect(ticketCard(a)).toContainText('Your visit starts now', { timeout: 15_000 });
    await a.screenshot({ path: 'e2e-screenshots/turnstiles-scan.png' });
    await expect(a.locator(STORE_CARD)).toBeHidden();
    await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toBe('hub');

    // Out of the park the way owls come in: onto the plaza, where nothing comes up.
    await walkToDoor(a, 'to-lobby');
    await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toBe('lobby');
    await expect.poll(async () => (await state(a)).walking, { timeout: 15_000 }).toBe(false);
    await expect(raisedCard(a)).toHaveCount(0, { timeout: 10_000 });
    await staysHidden(a);

    // The Menu's Settings keep the ticket with its ID in a closed row, just above Leaving.
    await a.locator('[data-menu-btn]').click();
    const menu = a.getByRole('dialog', { name: 'Menu' });
    await menu.locator('[data-tab="settings"]').click();
    const row = menu.locator('details[data-tickets]');
    await expect(row.locator('summary')).toHaveText('Tickets');
    expect(await row.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);
    expect(await row.evaluate((d) => d.nextElementSibling?.querySelector('h3')?.textContent ?? null)).toBe('Leaving');
    await row.locator('summary').click();
    await expect(row.locator('.mnote')).toContainText(/^Day ticket [A-Z0-9-]+: Running: /);
    await a.context().close();
  });

  test('with the gate open: nothing shows at the turnstiles, ticket or none', async ({ browser, request }) => {
    await flip(request, 'open');
    const a = await arrive(browser);
    await walkAndStop(a, PLAZA.x, PLAZA.y);
    await staysHidden(a);
    await walkToDoor(a, 'gate');
    await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toBe('hub');
    await expect(a.locator(STORE_CARD)).toBeHidden();
    await a.context().close();

    const issued = await request.post('/api/admin/tickets', { headers: ADMIN, data: { kind: 'day' } });
    expect(issued.status()).toBe(200);
    const { link } = (await issued.json()) as { link: string };
    const b = await arrive(browser, new URL(link).hash);
    await expect(b.getByText('Your ticket is in your wallet')).toBeVisible({ timeout: 10_000 });
    await walkAndStop(b, PLAZA.x, PLAZA.y);
    await staysHidden(b);
    // The owl walks on in as ever.
    await walkToDoor(b, 'gate');
    await expect.poll(async () => (await state(b)).room, { timeout: 20_000 }).toBe('hub');
    await b.context().close();
  });
});
