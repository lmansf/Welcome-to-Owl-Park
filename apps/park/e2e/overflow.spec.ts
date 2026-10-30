import { devices, type APIRequestContext, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { E2E_ADMIN_KEY, state, walkToDoor } from './helpers';

/**
 * Busy nights (OP-075) through the room server: the keepers' settings with the admin key and no
 * deploy, the busy ribbon, and the line in front of the park, on a phone and a computer. Every test
 * starts and ends with the settings as deployed (no line, no ribbon), so the other suites find the
 * park as before.
 */
const ADMIN = { 'X-Admin-Key': E2E_ADMIN_KEY };
const COMPUTER: BrowserContextOptions = { viewport: { width: 1280, height: 800 } };
const PHONE: BrowserContextOptions = { ...devices['Pixel 7'] };
const RIBBON = "It's busy tonight; things may be slow";
const LOOK = { body: '#3E6B48', belly: '#F6F1E3', accent: '#C9A227' };

async function capacity(request: APIRequestContext, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await request.post('/api/admin/capacity', { headers: ADMIN, data: body });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as Record<string, unknown>;
}

/** A visitor whose device holds an owl already, on the home screen with Play. */
async function visitor(browser: Browser, device: BrowserContextOptions): Promise<Page> {
  const context = await browser.newContext(device);
  await context.addInitScript((look) => localStorage.setItem('owl-park:look', JSON.stringify(look)), LOOK);
  const page = await context.newPage();
  await page.goto('/?transport=edge');
  await expect(page.locator('[data-home-btn="play"]')).toBeVisible({ timeout: 20_000 });
  return page;
}

/** A visitor opening the park straight into the lobby (past the home screen). */
async function straightIn(browser: Browser, device: BrowserContextOptions): Promise<Page> {
  const page = await (await browser.newContext(device)).newPage();
  await page.goto('/?transport=edge&home=0');
  return page;
}

/** In a room and welcomed by the room server: a socket the line turns away exists for a moment, but is never welcomed. */
const inPark = (page: Page, timeout = 30_000) =>
  page.waitForFunction(() => window.owlPark?.state()?.connected === true && document.querySelector('[data-dot]')?.getAttribute('data-status') === 'online', null, { timeout });
const ribbon = (page: Page) => page.locator('[data-ribbon]');
const line = (page: Page) => page.locator('[data-home-line]');

/** A 2 s line at the top, as the HUD shows one for a new quest (the same element in the same place). */
const showNotice = (page: Page) =>
  page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'notice';
    el.dataset['testNotice'] = '';
    el.textContent = 'New quest: Welcome to Owl Park';
    document.querySelector('[data-notices]')?.append(el);
  });
const dropNotice = (page: Page) => page.evaluate(() => document.querySelector('[data-test-notice]')?.remove());

/** The ribbon overlaps none of these (each on screen): the top notices, the buttons, the pad and the stick. */
async function ribbonClear(page: Page, others: string[]): Promise<void> {
  const r = await ribbon(page).boundingBox();
  expect(r, 'the ribbon is on screen').not.toBeNull();
  for (const sel of others) {
    const b = await page.locator(sel).first().boundingBox();
    expect(b, `${sel} is on screen`).not.toBeNull();
    const apart = r!.x + r!.width <= b!.x || b!.x + b!.width <= r!.x || r!.y + r!.height <= b!.y || b!.y + b!.height <= r!.y;
    expect(apart, `the ribbon is clear of ${sel}`).toBe(true);
  }
}

test.describe('busy nights (OP-075)', () => {
  // As deployed before and after each test: no line (which also takes down any line left over), no ribbon.
  const asDeployed = async ({ request }: { request: APIRequestContext }) => {
    await capacity(request, { line: { mode: 'off', threshold: 80, holdMin: 3 }, ribbon: { on: false, words: null } });
  };
  test.beforeEach(asDeployed);
  test.afterEach(asDeployed);

  test('only the keepers change them, on their page or with the admin key', async ({ browser, request }) => {
    expect((await request.get('/api/admin/capacity')).status()).toBe(403);
    expect((await request.post('/api/admin/capacity', { data: { line: { mode: 'on' } } })).status()).toBe(403);
    const now = (await (await request.get('/api/admin/capacity', { headers: ADMIN })).json()) as Record<string, unknown>;
    expect(now).toMatchObject({ line: { mode: 'off', threshold: 80, holdMin: 3 }, active: false, ribbon: { on: false, words: null }, copies: {}, sharding: 'single' });
    expect((now['rooms'] as Array<{ room: string }>).map((r) => r.room)).toContain('hub');
    expect((await request.post('/api/admin/capacity', { headers: ADMIN, data: { line: { threshold: -1 } } })).status()).toBe(400);
    // Copies of a room need one object per room; the test server runs the park in one.
    expect((await request.post('/api/admin/capacity', { headers: ADMIN, data: { copy: { room: 'hub', n: 2, state: 'open' } } })).status()).toBe(409);
    expect(await (await request.get('/api/notice')).json()).toEqual({ words: null });

    const keeper = await (await browser.newContext(COMPUTER)).newPage();
    keeper.on('dialog', (d) => void d.accept());
    await keeper.goto('/admin/capacity');
    await keeper.getByLabel('Admin key').fill(E2E_ADMIN_KEY);
    await keeper.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(keeper.locator('#line-state')).toContainText('No line: every owl walks in.');
    await keeper.getByRole('button', { name: 'On by itself' }).click();
    await expect(keeper.locator('#line-state')).toContainText('A line starts by itself once the park holds 80 owls.');
    await keeper.locator('[data-ribbon="on"]').click();
    await expect(keeper.locator('#ribbon-state')).toHaveText(`On for everyone: "${RIBBON}"`);
    await expect(keeper.locator('#copies-note')).toContainText('The whole park runs in one object');
    await keeper.screenshot({ path: 'e2e-screenshots/capacity-page.png', fullPage: true });
    expect(await (await request.get('/api/notice')).json()).toEqual({ words: RIBBON });
    await keeper.context().close();
  });

  test('the ribbon: on for everyone in a room and on the home screen, hidden for a visit, back with new words, then off', async ({ browser, request }) => {
    test.slow(); // two live parks in one browser, both drawn with software WebGL on CI runners: 78 s here, past 90 s on a slow runner
    const inside = await straightIn(browser, COMPUTER);
    await inPark(inside);
    const phone = await visitor(browser, PHONE);
    await capacity(request, { ribbon: { on: true } });
    // In a room the overflow object tells the room, which tells everyone inside at once.
    await expect(ribbon(inside)).toContainText(RIBBON);
    // The home screen asks when it comes up (and every minute after).
    await phone.reload();
    await expect(ribbon(phone)).toContainText(RIBBON);
    await phone.screenshot({ path: 'e2e-screenshots/ribbon-phone.png' });
    // In a room it stays clear of a line at the top (a new quest, say) and the buttons.
    await showNotice(inside);
    await ribbonClear(inside, ['[data-test-notice]', '[data-menu-btn]', '[data-emotes-btn]', '[data-say-btn]']);
    await inside.screenshot({ path: 'e2e-screenshots/ribbon-computer.png' });
    await dropNotice(inside);
    // Hidden for the visit: a reload keeps it hidden, until the words change.
    await phone.getByRole('button', { name: 'Hide this note' }).click();
    await expect(ribbon(phone)).toBeHidden();
    await phone.reload();
    await expect(phone.locator('[data-home-btn="play"]')).toBeVisible();
    await expect(ribbon(phone)).toBeHidden();
    await capacity(request, { ribbon: { words: 'The market is packed tonight' } });
    await expect(ribbon(inside)).toContainText('The market is packed tonight');
    await phone.reload();
    await expect(ribbon(phone)).toContainText('The market is packed tonight');
    // On a phone in a room, it keeps clear of the top line, the pad (Nest, Interact, the Menu, the Map, Emotes, Say) and the stick.
    await phone.locator('[data-home-btn="play"]').click();
    await inPark(phone);
    await expect(ribbon(phone)).toContainText('The market is packed tonight');
    await showNotice(phone);
    await ribbonClear(phone, ['[data-test-notice]', '[data-pad-interact]', '[data-menu-btn]', '[data-emotes-btn]', '[data-say-btn]', '#hud .stick']);
    await phone.screenshot({ path: 'e2e-screenshots/ribbon-phone-room.png' });
    await dropNotice(phone);
    // Off: gone for everyone inside.
    await capacity(request, { ribbon: { on: false } });
    await expect(ribbon(inside)).toBeHidden();
    await expect(ribbon(phone)).toBeHidden();
    await inside.context().close();
    await phone.context().close();
  });

  test('the line: newcomers wait their turn on a phone and a computer, owls inside walk on, and turns come in order', async ({ browser, request }) => {
    test.slow();
    await capacity(request, { line: { mode: 'on', threshold: 1, holdMin: 2 } });
    // A page that opens straight into a room is sent to the line first; the park is empty, so its turn
    // comes at once, and in it goes as Play takes it, to its own nest (OP-105).
    const first = await straightIn(browser, COMPUTER);
    await inPark(first);
    expect((await state(first)).room).toMatch(/^nest-[a-z0-9]{8}$/);
    // Sent to the line, it was never told the park could not connect.
    expect(await first.getByText('the park could not connect').count()).toBe(0);
    await expect(ribbon(first)).toContainText(RIBBON);
    // An owl inside walks on from room to room while there is a line.
    await walkToDoor(first, 'to-street');
    await first.waitForFunction(() => window.owlPark?.state()?.room === 'homes' && window.owlPark.state()?.connected === true, null, { timeout: 30_000 });

    // The park holds its one owl: a phone waits, first in line, with the ribbon on by itself.
    const phone = await visitor(browser, PHONE);
    await phone.locator('[data-home-btn="play"]').click();
    await expect(line(phone)).toContainText("You're in line");
    await expect(line(phone)).toContainText('Your place in line: 1');
    await expect(line(phone)).toContainText('This page updates on its own.');
    // Play gives way to its place while it waits.
    await expect(phone.locator('[data-home-btn="play"]')).toBeHidden();
    await expect(ribbon(phone)).toContainText(RIBBON);
    await phone.screenshot({ path: 'e2e-screenshots/line-phone.png' });
    // A computer behind it.
    const second = await visitor(browser, COMPUTER);
    await second.locator('[data-home-btn="play"]').click();
    await expect(line(second)).toContainText('Your place in line: 2');
    await second.screenshot({ path: 'e2e-screenshots/line-computer.png' });

    // The first owl leaves the park: the phone's turn comes, and it goes into its own nest by itself (OP-105).
    await first.context().close();
    await inPark(phone, 60_000);
    expect((await state(phone)).room).toMatch(/^nest-[a-z0-9]{8}$/);
    // The computer moves up to the front.
    await expect(line(second)).toContainText('Your place in line: 1', { timeout: 30_000 });
    await phone.context().close();
    await second.context().close();
  });
});
