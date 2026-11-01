import type { APIRequestContext, Browser, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { E2E_ADMIN_KEY, state, walkAndStop, walkToDoor } from './helpers';

/**
 * The ticket status before the turnstiles (OP-172), through the room server: walking onto the plaza in
 * front of the gate fades in a card with the best ticket on this device (or where the booth is) while
 * the gate takes tickets, walking off fades it, going through hands its place to the scan card, and an
 * owl that comes out of the park sees it only after a walk off the plaza and back. With the gate open
 * it never shows. Every test hands the gate back to the deployed setting (open) when it ends.
 */
const ADMIN = { 'X-Admin-Key': E2E_ADMIN_KEY };
/** On the plaza before the middle turnstile, and well off it toward the booth (the lobby's zone `gate-approach`). */
const PLAZA = { x: 2570, y: 800 };
const OFF_PLAZA = { x: 1700, y: 800 };
const NO_TICKET = 'No ticket yet: the ticket booth is along the plaza';
const TURNED_BACK = 'The park is open to ticket-holders. The ticket booth is along the plaza.';

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

const status = (page: Page) => page.locator('[data-ticket-status]');

/** Nothing shows for a while (the card asks the gate and the wallet first, so give it time to be wrong). */
async function staysHidden(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await expect(status(page)).toHaveCount(0);
    await page.waitForTimeout(250);
  }
}

test.describe('the ticket status before the turnstiles (OP-172)', () => {
  test.afterEach(async ({ request }) => {
    await flip(request, 'deployed');
  });

  test('with the gate taking tickets and no ticket: where the booth is, gone off the plaza and at the turnstiles', async ({ browser, request }) => {
    await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
    const a = await arrive(browser);
    // Arriving from the street, the owl is not on the plaza yet.
    await staysHidden(a);

    await walkAndStop(a, PLAZA.x, PLAZA.y);
    await expect(status(a)).toHaveText(NO_TICKET, { timeout: 10_000 });
    await expect(a.locator('[data-ticket-card]')).toHaveClass(/\bup\b/);
    await a.screenshot({ path: 'e2e-screenshots/turnstiles-status-no-ticket.png' });

    // Off the plaza it fades.
    await walkAndStop(a, OFF_PLAZA.x, OFF_PLAZA.y);
    await expect(status(a)).toHaveCount(0);
    await expect(a.locator('[data-ticket-card]')).not.toHaveClass(/\bup\b/);

    // Back on, and into the turnstiles: the refusal says why, and the card does not stand beside it.
    await walkAndStop(a, PLAZA.x, PLAZA.y);
    await expect(status(a)).toHaveText(NO_TICKET, { timeout: 10_000 });
    await walkToDoor(a, 'gate');
    await expect(a.getByText(TURNED_BACK)).toBeVisible({ timeout: 15_000 });
    await expect(status(a)).toHaveCount(0);
    // Turned back onto the plaza, it stays away until the owl walks off and back.
    await expect.poll(async () => (await state(a)).walking, { timeout: 15_000 }).toBe(false);
    expect((await state(a)).room).toBe('lobby');
    await staysHidden(a);
    await walkAndStop(a, OFF_PLAZA.x, OFF_PLAZA.y);
    await walkAndStop(a, PLAZA.x, PLAZA.y);
    await expect(status(a)).toHaveText(NO_TICKET, { timeout: 10_000 });
    await a.context().close();
  });

  test('with a ticket: ready before the turnstiles, the scan card in its place, and running for an owl that comes back out', async ({ browser, request }) => {
    await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
    const issued = await request.post('/api/admin/tickets', { headers: ADMIN, data: { kind: 'day' } });
    expect(issued.status()).toBe(200);
    const { link } = (await issued.json()) as { link: string };
    const a = await arrive(browser, new URL(link).hash);
    await expect(a.getByText('Your ticket is in your wallet')).toBeVisible({ timeout: 10_000 });

    await walkAndStop(a, PLAZA.x, PLAZA.y);
    await expect(status(a)).toHaveText('Day ticket: Ready, its time starts when the turnstiles scan it', { timeout: 10_000 });
    await a.screenshot({ path: 'e2e-screenshots/turnstiles-status-ready.png' });

    // Through the turnstiles: the scan card takes the status card's place.
    await walkToDoor(a, 'gate');
    await expect(a.locator('[data-ticket-card]')).toContainText('Your visit starts now', { timeout: 15_000 });
    await expect(status(a)).toHaveCount(0);
    await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toBe('hub');
    // Nothing of the ticket stays up in the park.
    await expect(status(a)).toHaveCount(0);

    // Out of the park the way owls come in: onto the plaza, where the card waits for a walk off and back.
    await walkToDoor(a, 'to-lobby');
    await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toBe('lobby');
    await expect.poll(async () => (await state(a)).walking, { timeout: 15_000 }).toBe(false);
    const out = (await state(a)).pos;
    expect(out.x).toBeGreaterThan(2300);
    expect(out.x).toBeLessThan(2840);
    await staysHidden(a);
    await walkAndStop(a, OFF_PLAZA.x, OFF_PLAZA.y);
    await walkAndStop(a, PLAZA.x, PLAZA.y);
    await expect(status(a)).toHaveText(/^Day ticket: Running, \d+ h \d+ m left$/, { timeout: 10_000 });

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

  test('with the gate open: nothing shows before the turnstiles, ticket or none', async ({ browser, request }) => {
    await flip(request, 'open');
    const a = await arrive(browser);
    await walkAndStop(a, PLAZA.x, PLAZA.y);
    await staysHidden(a);
    await walkAndStop(a, OFF_PLAZA.x, OFF_PLAZA.y);
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
