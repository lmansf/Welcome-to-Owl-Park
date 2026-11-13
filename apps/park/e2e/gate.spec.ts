import { devices, type APIRequestContext, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { E2E_ADMIN_KEY, GATE_ASK, STORE_CARD, enterAsGuest, settleCamera, state, toScreen, walkAndStop, walkToDoor } from './helpers';

/**
 * The opening switch (OP-067) through the room server: the keepers flip the front gate with the
 * admin key and no deploy, and the turnstiles follow it. The room server here lets spectators in
 * (SPECTATORS on, OP-191): with the gate taking tickets, an owl without one walks on past the
 * turnstiles as a spectator once it chooses Enter as a guest (OP-198; spectator.spec.ts,
 * storecard.spec.ts and checkout.spec.ts go on from there). Every test hands the gate back to the
 * deployed setting (open) when it ends, so the other suites find it as before.
 */
const ADMIN = { 'X-Admin-Key': E2E_ADMIN_KEY };
const COMPUTER: BrowserContextOptions = { viewport: { width: 1280, height: 800 } };
const PHONE: BrowserContextOptions = { ...devices['Pixel 7'] };
/**
 * Through a turnstile without a ticket: the turnstiles ask first (OP-198), with no card before the
 * store, and Enter as a guest walks the owl on into the hub as a spectator (OP-191).
 */
async function inAsSpectator(page: Page): Promise<void> {
  await expect(page.locator(STORE_CARD)).toBeHidden();
  await enterAsGuest(page);
  await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('hub');
  await expect.poll(async () => (await state(page)).spectator, { timeout: 15_000 }).toBe(true);
}

/**
 * Passes are dated to the second, and one dated in the second the gate closed counts as made before
 * it: wait until a pass made now is dated after `closedAt` (ms).
 */
async function pastTheClose(closedAt: number): Promise<void> {
  await expect.poll(() => Date.now(), { intervals: [50] }).toBeGreaterThanOrEqual(Math.floor(closedAt / 1000) * 1000 + 1000);
}

async function flip(request: APIRequestContext, mode: 'open' | 'ticket' | 'deployed'): Promise<Record<string, unknown>> {
  const r = await request.post('/api/admin/gate', { headers: ADMIN, data: { mode } });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as Record<string, unknown>;
}

/** A visitor arriving in the lobby (with a ticket link's hash, when given), past the home screen. */
async function arrive(browser: Browser, device: BrowserContextOptions, hash = ''): Promise<Page> {
  const page = await (await browser.newContext(device)).newPage();
  await page.goto(`/?transport=edge&home=0${hash}`);
  await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
  return page;
}

test.describe('the opening switch (OP-067)', () => {
  test.afterEach(async ({ request }) => {
    await flip(request, 'deployed');
  });

  test('only the keepers flip it, on their page or with the admin key, and a new pass finds the gate closed', { tag: '@smoke' }, async ({ browser, request }) => {
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
    await pastTheClose(now.closedAt);
    const { pass, gate } = (await (await request.get('/api/pass')).json()) as { pass: string; gate: string };
    expect(gate).toBe('ticket');
    const auth = { Authorization: `Bearer ${pass}` };
    // `spectators` while SPECTATORS is on (OP-191), as it is for these tests.
    expect(await (await request.get('/api/entry', { headers: auth })).json()).toEqual({ gate: 'ticket', admitted: false, spectators: true });
    expect((await request.get('/api/shop', { headers: auth })).status()).toBe(403);
    // Handed back, the deployed setting decides again.
    expect(await flip(request, 'deployed')).toMatchObject({ mode: 'open', set: null });
    expect(await (await request.get('/api/entry', { headers: auth })).json()).toEqual({ gate: 'open', admitted: false, spectators: true });
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
    test(`on ${name}: with the gate taking tickets, an owl without a ticket walks on in as a spectator, offered a Day Ticket`, async ({ browser, request }) => {
      await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
      const a = await arrive(browser, device);
      const shot = device === PHONE ? 'phone' : 'desktop';
      await walkToDoor(a, 'gate');
      await inAsSpectator(a);
      await a.screenshot({ path: `e2e-screenshots/gate-closed-turnstiles-${shot}.png` });
      await a.context().close();
    });
  }

  for (const [name, device] of [
    ['a computer', COMPUTER],
    ['a phone', PHONE],
  ] as const) {
    test(`on ${name}: a tap on the turnstiles from in front of them, then one press of Enter as a guest, and the owl is in (OP-368)`, async ({ browser, request }) => {
      await pastTheClose((await flip(request, 'ticket'))['closedAt'] as number);
      const a = await arrive(browser, device);
      const gate = (await state(a)).doors.find((d) => d.id === 'gate')!;
      // Just in front of the middle turnstile, as a visitor who walked up to look stands, then a real tap on the turnstile.
      await walkAndStop(a, gate.x, 740);
      await settleCamera(a);
      const at = await toScreen(a, gate.x, 690);
      if (device === PHONE) await a.touchscreen.tap(at.x, at.y);
      else await a.mouse.click(at.x, at.y);
      const ask = a.locator(GATE_ASK);
      await expect(ask).toBeVisible({ timeout: 15_000 });
      // The card stays up for the choice: the tap that walked the owl in does not answer it as neither.
      await a.waitForTimeout(800);
      await expect(ask).toBeVisible();
      if (device === PHONE) await ask.locator('[data-gate-ask="guest"]').tap();
      else await ask.locator('[data-gate-ask="guest"]').click();
      await expect(ask).toBeHidden();
      await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toBe('hub');
      await expect.poll(async () => (await state(a)).spectator, { timeout: 15_000 }).toBe(true);
      await a.context().close();
    });
  }

  test('an owl already inside stays in when the gate closes, an owl arriving after walks in as a spectator, and a ticket goes through as a visitor', async ({ browser, request }) => {
    // Open: the turnstiles sell nothing and ask nothing, and the owl walks on in.
    const inside = await arrive(browser, COMPUTER);
    await walkToDoor(inside, 'gate');
    await expect.poll(async () => (await state(inside)).room, { timeout: 20_000 }).toBe('hub');
    await expect(inside.locator(STORE_CARD)).toBeHidden();

    // The keepers close the gate: the owl inside goes on from room to room.
    const closed = await flip(request, 'ticket');
    await walkToDoor(inside, 'to-market');
    await expect.poll(async () => (await state(inside)).room, { timeout: 20_000 }).toBe('market');
    await expect.poll(async () => (await state(inside)).connected, { timeout: 20_000 }).toBe(true);

    // The owl inside is no spectator: it came in while the gate was open.
    expect((await state(inside)).spectator).toBe(false);
    // Parks drawing at once starve a test machine's browser to a few frames a second, which stretches
    // the game's timers (the pause before the hub ran past twenty seconds with two parks up): the owl
    // inside has shown what it came to show, so the late owl and then the holder each come alone.
    await inside.context().close();
    // An owl arriving now walks in as a spectator (OP-191).
    await pastTheClose(closed['closedAt'] as number);
    const late = await arrive(browser, COMPUTER);
    await walkToDoor(late, 'gate');
    await inAsSpectator(late);
    await late.context().close();

    // With a ticket, it goes through.
    const issued = await request.post('/api/admin/tickets', { headers: ADMIN, data: { kind: 'day' } });
    expect(issued.status()).toBe(200);
    const { link } = (await issued.json()) as { link: string };
    const holder = await arrive(browser, COMPUTER, new URL(link).hash);
    await expect(holder.getByText('Your ticket is in your wallet')).toBeVisible({ timeout: 10_000 });
    await walkToDoor(holder, 'gate');
    await expect(holder.locator('[data-ticket-card]')).toContainText('Your visit starts now', { timeout: 15_000 });
    await expect.poll(async () => (await state(holder)).room, { timeout: 20_000 }).toBe('hub');
    await expect.poll(async () => (await state(holder)).connected, { timeout: 20_000 }).toBe(true);
    expect((await state(holder)).spectator).toBe(false);
    await expect(holder.locator('[data-spectator].show')).toHaveCount(0);
    await holder.context().close();
  });
});
