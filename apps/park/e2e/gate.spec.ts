import { devices, expect, test, type APIRequestContext, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { E2E_ADMIN_KEY, state, walkToDoor } from './helpers';

/**
 * The opening switch (OP-067) through the room server: the keepers flip the front gate with the
 * admin key and no deploy, and the turnstiles and the booth follow it. Every test hands the gate
 * back to the deployed setting (open) when it ends, so the other suites find it as before.
 */
const ADMIN = { 'X-Admin-Key': E2E_ADMIN_KEY };
const COMPUTER: BrowserContextOptions = { viewport: { width: 1280, height: 800 } };
const PHONE: BrowserContextOptions = { ...devices['Pixel 7'] };
const TURNED_BACK = 'The park is open to ticket-holders. The ticket booth is along the plaza.';

async function flip(request: APIRequestContext, mode: 'open' | 'ticket' | 'deployed'): Promise<Record<string, unknown>> {
  const r = await request.post('/api/admin/gate', { headers: ADMIN, data: { mode } });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as Record<string, unknown>;
}

/** A visitor arriving in the lobby (with a ticket link's hash, when given). */
async function arrive(browser: Browser, device: BrowserContextOptions, hash = ''): Promise<Page> {
  const page = await (await browser.newContext(device)).newPage();
  await page.goto(`/?transport=edge${hash}`);
  await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
  return page;
}

test.describe('the opening switch (OP-067)', () => {
  test.afterEach(async ({ request }) => {
    await flip(request, 'deployed');
  });

  test('only the keepers flip it, on their page or with the admin key, and a new pass finds the gate closed', async ({ browser, request }) => {
    expect((await request.get('/api/admin/gate')).status()).toBe(403);
    expect((await request.post('/api/admin/gate', { data: { mode: 'ticket' } })).status()).toBe(403);
    expect(await (await request.get('/api/admin/gate', { headers: ADMIN })).json()).toEqual({ mode: 'open', closedAt: null, set: null, deployed: 'open' });
    expect((await request.post('/api/admin/gate', { headers: ADMIN, data: { mode: 'shut' } })).status()).toBe(400);

    // The keepers' page: open it with the key, and take tickets after the confirm.
    const keeper = await (await browser.newContext(COMPUTER)).newPage();
    keeper.on('dialog', (d) => void d.accept());
    await keeper.goto('/admin/gate');
    await keeper.getByLabel('Admin key').fill(E2E_ADMIN_KEY);
    await keeper.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(keeper.locator('#mode')).toHaveText('The gate is open to everyone');
    await expect(keeper.locator('#since')).toHaveText('As deployed (GATE in wrangler.jsonc: open).');
    await keeper.getByRole('button', { name: 'Take tickets now' }).click();
    await expect(keeper.locator('#mode')).toHaveText('The gate takes tickets');
    await expect(keeper.locator('#since')).toContainText('Set by this switch on');
    await expect(keeper.getByRole('button', { name: 'Take tickets now' })).toBeDisabled();
    await keeper.screenshot({ path: 'e2e-screenshots/gate-switch.png', fullPage: true });
    await keeper.context().close();

    const now = (await (await request.get('/api/admin/gate', { headers: ADMIN })).json()) as { mode: string; closedAt: number; set: { mode: string; at: number } };
    expect(now).toMatchObject({ mode: 'ticket', set: { mode: 'ticket' } });
    expect(now.closedAt).toBe(now.set.at);

    // A pass made now: the gate says closed, and the shop inside is shut to it.
    await new Promise((r) => setTimeout(r, 1_100));
    const { pass, gate } = (await (await request.get('/api/pass')).json()) as { pass: string; gate: string };
    expect(gate).toBe('ticket');
    const auth = { Authorization: `Bearer ${pass}` };
    expect(await (await request.get('/api/entry', { headers: auth })).json()).toEqual({ gate: 'ticket', admitted: false });
    expect((await request.get('/api/shop', { headers: auth })).status()).toBe(403);
    // Handed back, the deployed setting decides again.
    expect(await flip(request, 'deployed')).toMatchObject({ mode: 'open', set: null });
    expect(await (await request.get('/api/entry', { headers: auth })).json()).toEqual({ gate: 'open', admitted: false });
  });

  test("anyone may ask the park's health, and the keepers' gate page shows it first", async ({ browser, request }) => {
    const h = await request.get('/api/health');
    expect(h.status()).toBe(200);
    const body = (await h.json()) as { ok: boolean; parts: Record<string, boolean>; ms: number };
    expect(body).toMatchObject({ ok: true, parts: { rooms: true, tickets: true, collections: true } });
    expect(JSON.stringify(body)).not.toMatch(/key|secret|shop/i);
    const keeper = await (await browser.newContext(COMPUTER)).newPage();
    await keeper.goto('/admin/gate');
    await keeper.getByLabel('Admin key').fill(E2E_ADMIN_KEY);
    await keeper.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(keeper.locator('#health')).toContainText('The park is up: every part answered in');
    await keeper.context().close();
  });

  for (const [name, device] of [
    ['a computer', COMPUTER],
    ['a phone', PHONE],
  ] as const) {
    test(`on ${name}: with the gate taking tickets, the booth sells and the turnstiles turn an owl without a ticket back`, async ({ browser, request }) => {
      await flip(request, 'ticket');
      await new Promise((r) => setTimeout(r, 1_100));
      const a = await arrive(browser, device);
      const shot = device === PHONE ? 'phone' : 'desktop';
      await walkToDoor(a, 'booth');
      await a.locator('[data-action="booth"]').click({ timeout: 15_000 });
      await expect(a.locator('[data-booth="say"]')).toHaveText('The park is open to ticket-holders. Get your ticket here, then walk through the turnstiles.');
      await expect(a.locator('[data-booth="buy"]')).toHaveText('Get a ticket');
      await a.screenshot({ path: `e2e-screenshots/gate-closed-booth-${shot}.png` });
      await a.keyboard.press('Escape');

      await walkToDoor(a, 'gate');
      await expect(a.getByText(TURNED_BACK)).toBeVisible({ timeout: 15_000 });
      await a.screenshot({ path: `e2e-screenshots/gate-closed-turnstiles-${shot}.png` });
      // Turned back, it is still in the lobby a moment later.
      await new Promise((r) => setTimeout(r, 2_500));
      expect((await state(a)).room).toBe('lobby');
      await a.context().close();
    });
  }

  test('an owl already inside stays in when the gate closes, an owl arriving after stops at the turnstiles, and a ticket goes through', async ({ browser, request }) => {
    // Open: the booth does not sell yet, though the store's ticket page is set, and the owl walks on in.
    const inside = await arrive(browser, COMPUTER);
    await walkToDoor(inside, 'booth');
    await inside.locator('[data-action="booth"]').click({ timeout: 15_000 });
    await expect(inside.locator('[data-booth="say"]')).toHaveText('Tickets and passes are coming soon. Until then the turnstiles let everyone through, so go on in and explore.');
    await expect(inside.locator('[data-booth="buy"]')).toHaveCount(0);
    await inside.keyboard.press('Escape');
    await walkToDoor(inside, 'gate');
    await expect.poll(async () => (await state(inside)).room, { timeout: 20_000 }).toBe('hub');

    // The keepers close the gate: the owl inside goes on from room to room.
    await flip(request, 'ticket');
    await walkToDoor(inside, 'to-market');
    await expect.poll(async () => (await state(inside)).room, { timeout: 20_000 }).toBe('market');
    await expect.poll(async () => (await state(inside)).connected, { timeout: 20_000 }).toBe(true);

    // An owl arriving now stops at the turnstiles.
    await new Promise((r) => setTimeout(r, 1_100));
    const late = await arrive(browser, COMPUTER);
    await walkToDoor(late, 'gate');
    await expect(late.getByText(TURNED_BACK)).toBeVisible({ timeout: 15_000 });
    // Three parks drawing at once starve a test machine's browser to a few frames a second, which
    // stretches the game's timers (the pause before the hub ran twenty seconds): the holder comes alone.
    for (const p of [inside, late]) await p.context().close();

    // With a ticket, it goes through.
    const issued = await request.post('/api/admin/tickets', { headers: ADMIN, data: { kind: 'day' } });
    expect(issued.status()).toBe(200);
    const { link } = (await issued.json()) as { link: string };
    const holder = await arrive(browser, COMPUTER, new URL(link).hash);
    await expect(holder.getByText('Your ticket is in your wallet')).toBeVisible({ timeout: 10_000 });
    await walkToDoor(holder, 'gate');
    await expect(holder.locator('[data-ticket-card]')).toContainText('Your visit starts now', { timeout: 15_000 });
    await expect.poll(async () => (await state(holder)).room, { timeout: 20_000 }).toBe('hub');
    await holder.context().close();
  });
});
