import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { autoClimbTo, climbRun, climbState, openClimb, startClimb, tapKey, toPortal } from './climbPlay';
import { E2E_ADMIN_KEY, openPark, state } from './helpers';

/**
 * The stained-glass climb (designs/the-stained-glass-climb.md). On this device (the local mode, the
 * night pinned to the gentle one): the card, two storeys banked and paid, Stop, the climb carried on
 * from where it was, the clouds with the Glass Circlet and the run reference. Through the room
 * server: the keepers open the realm and the portal, a storey pays, the socket drops and the climb
 * carries on, and a portal switched off shows its phrase.
 */
const ADMIN = { 'X-Admin-Key': E2E_ADMIN_KEY };
const isEdge = () => test.info().project.name === 'edge';

async function feathers(page: Page): Promise<number> {
  await expect.poll(() => page.evaluate(() => window.owlPark.collection() !== null), { timeout: 10_000 }).toBe(true);
  return page.evaluate(() => window.owlPark.collection()?.feathers ?? 0);
}

async function realms(request: APIRequestContext, body: { open: string[]; portal: boolean; night: string | null }): Promise<void> {
  const r = await request.post('/api/admin/capacity', { headers: ADMIN, data: { realms: body } });
  expect(r.status(), await r.text()).toBe(200);
}

/** Into the glass realm, at the portal, with the feathers before. */
async function atThePortal(page: Page, collector: string): Promise<number> {
  if (isEdge()) await openPark(page, { transport: 'edge', room: 'glass', spawn: 'from-hub' });
  else await openPark(page, { room: 'glass', spawn: 'from-hub', collector, tz: 'UTC', night: 'easy' });
  await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('glass');
  const before = await feathers(page);
  await toPortal(page);
  return before;
}

const bandLine = (page: Page) => page.locator('.climb [data-band]');
const card = (page: Page) => page.locator('.climb [data-result]');

// A climb to the clouds takes most of a minute at full speed, and longer on a slow runner.
test.describe.configure({ timeout: 300_000 });

test.describe('the stained-glass climb', () => {
  test('the card, two storeys paid, Stop, and the climb carried on from where it was', async ({ page }) => {
    test.skip(isEdge(), 'through the room server below');
    const before = await atThePortal(page, `e2e-climb-${test.info().project.name}`);
    await openClimb(page);
    await expect(page.locator('.climb [data-start-line]')).toHaveText('A gentle night');
    await expect(page.locator('.climb [data-sub]')).toHaveText('At the foot · 25 of 25 feathers left from games today');
    await startClimb(page);
    await expect(page.locator('.climb [data-hint]')).not.toHaveText('');
    // The keys reach the climb: a jump leaves the ground, a dash in the air moves the owl sideways.
    const foot = (await climbState(page))!;
    await page.keyboard.down('Space');
    await expect.poll(async () => (await climbState(page))?.jumpsUsed ?? 0, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    await page.keyboard.up('Space');
    await page.keyboard.down('ArrowRight');
    await tapKey(page, 'ShiftLeft', 60);
    await page.keyboard.up('ArrowRight');
    await expect.poll(async () => (await climbState(page))?.x ?? 0, { timeout: 5_000 }).toBeGreaterThan(foot.x + 40);
    await expect.poll(async () => (await climbState(page))?.grounded ?? false, { timeout: 5_000 }).toBe(true);
    expect(await autoClimbTo(page, 2)).toBe('reached');
    await expect(bandLine(page)).toHaveText('Second storey: +1 feather', { timeout: 15_000 });
    await expect.poll(() => feathers(page)).toBe(before + 2);
    await expect(page.locator('.climb [data-sub]')).toHaveText('Second storey banked · 23 of 25 feathers left from games today');
    const seed = (await climbRun(page))!.seed;
    // Stop: the screen closes, nothing is lost.
    await page.locator('.climb [data-stop]').click();
    await expect(page.locator('.climb-layer')).toBeHidden();
    expect(await climbRun(page)).toBeNull();
    // Climb again: the same run, carried on from the second storey.
    await openClimb(page);
    await expect(page.locator('.climb [data-start-line]')).toHaveText('Your climb is where you left it.');
    await expect(page.locator('.climb [data-go]')).toHaveText('Carry on');
    await startClimb(page);
    const run = (await climbRun(page))!;
    expect(run.seed).toBe(seed);
    expect(run.banked).toBe(2);
    expect(run.state!.band).toBe(2);
    await page.locator('.climb [data-stop]').click();
  });

  test('the clouds: ten feathers over six storeys, the Glass Circlet once, and the run reference', async ({ page }) => {
    test.skip(isEdge(), 'through the room server below');
    const before = await atThePortal(page, `e2e-clouds-${test.info().project.name}`);
    await openClimb(page);
    await startClimb(page);
    expect(await autoClimbTo(page, 6)).toBe('reached');
    await expect(card(page)).toBeVisible({ timeout: 15_000 });
    await expect(card(page).locator('[data-line]')).toHaveText('You reached the clouds!');
    await expect(card(page).locator('[data-paid]')).toHaveText('+10 feathers this climb');
    await expect(card(page).locator('[data-item]')).toHaveText('The Glass Circlet is yours.');
    await expect(card(page).locator('[data-ref]')).toHaveText(/^Climb [0-9a-f]{8}$/);
    await expect.poll(() => feathers(page)).toBe(before + 10);
    await expect.poll(() => page.evaluate(() => window.owlPark.collection()?.owned.includes('glass-circlet~0') ?? false)).toBe(true);
    await card(page).locator('[data-done]').click();
    await expect(page.locator('.climb-layer')).toBeHidden();
  });
});

test.describe('the stained-glass climb through the room server', () => {
  // As deployed before and after: the realm closed, the portal off, the moon's night.
  const asDeployed = async ({ request }: { request: APIRequestContext }) => {
    if (isEdge()) await realms(request, { open: [], portal: false, night: null });
  };
  test.afterEach(asDeployed);

  test('a storey pays, the climb survives a dropped socket, and a portal switched off shows its phrase', async ({ page, request }) => {
    test.skip(!isEdge(), 'the room server only');
    await realms(request, { open: ['glass'], portal: true, night: 'easy' });
    const before = await atThePortal(page, 'edge');
    await openClimb(page);
    await expect(page.locator('.climb [data-start-line]')).toHaveText('A gentle night');
    await startClimb(page);
    expect(await autoClimbTo(page, 1)).toBe('reached');
    await expect(bandLine(page)).toHaveText('First storey: +1 feather', { timeout: 15_000 });
    await expect.poll(() => feathers(page)).toBe(before + 1);
    const seed = (await climbRun(page))!.seed;
    // The socket drops and comes back: the run is the same one, and the next storey pays.
    // The reconnect is quick: the status dot's changes are collected as they happen rather than polled for.
    await page.evaluate(() => {
      const dot = document.querySelector('[data-dot]')!;
      const seen: string[] = [];
      new MutationObserver(() => seen.push(dot.getAttribute('data-status') ?? '')).observe(dot, { attributes: true, attributeFilter: ['data-status'] });
      (window as unknown as { statusSeen: string[] }).statusSeen = seen;
    });
    expect(await page.evaluate(() => window.owlPark.drop())).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as unknown as { statusSeen: string[] }).statusSeen), { timeout: 30_000 }).toEqual(expect.arrayContaining(['offline', 'online']));
    await expect.poll(() => page.evaluate(() => document.querySelector('[data-dot]')?.getAttribute('data-status')), { timeout: 30_000 }).toBe('online');
    expect(await autoClimbTo(page, 2)).toBe('reached');
    await expect(bandLine(page)).toHaveText('Second storey: +1 feather', { timeout: 15_000 });
    expect((await climbRun(page))!.seed).toBe(seed);
    await expect.poll(() => feathers(page)).toBe(before + 2);
    const ref = (await climbRun(page))!.ref!;
    expect(ref).toMatch(/^[0-9a-f]{8}$/);
    // The keepers can look the run up by its reference, and see no collector.
    const found = await request.get(`/api/admin/climb?ref=${ref}`, { headers: ADMIN });
    expect(found.status()).toBe(200);
    const body = (await found.json()) as { night: string; bands: Array<{ band: number; added: number }> };
    expect(body.night).toBe('easy');
    expect(body.bands.map((b) => [b.band, b.added])).toEqual([
      [1, 1],
      [2, 1],
    ]);
    expect(JSON.stringify(body)).not.toMatch(/"cid"/);
    await page.locator('.climb [data-stop]').click();
    await expect(page.locator('.climb-layer')).toBeHidden();
    // The portal switched off: Climb shows the approved phrase and opens nothing. (The room server may
    // have placed the owl afresh when the socket came back, so it walks to the portal again first.)
    await realms(request, { open: ['glass'], portal: false, night: 'easy' });
    await toPortal(page);
    await expect.poll(async () => (await state(page)).actions, { timeout: 10_000 }).toContain('portal');
    // The room server's word that the portal is off has reached the page.
    await expect
      .poll(() => page.evaluate(() => (window.owlPark.game.scene.getScene('room') as unknown as { realms: { portal: boolean } }).realms.portal), { timeout: 10_000 })
      .toBe(false);
    await page.locator('[data-action="portal"]').click();
    await expect(page.locator('[data-toasts]')).toContainText('Pardon Our Feathers');
    await expect(page.locator('.climb-layer')).toBeHidden();
  });
});
