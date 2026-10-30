import { devices, type Browser, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { flyThrough, playAt, run, untilOver } from './arcadePlay';
import { dist, doAction, E2E_ADMIN_KEY, jumpFlapGlide, openPark, settleCamera, state, steppedFlight, steppedPeerFlight, tapRoomPoint, travelTo, waitForArrival, walkAndStop, walkToDoor, walkToJetty } from './helpers';

/**
 * These tests run against the room server (wrangler dev on :8787). Each visitor gets its own
 * browser context, so nothing is shared between them except the server.
 */
async function visitor(browser: Browser, params: Record<string, string> = {}, viewport = { width: 1280, height: 800 }): Promise<Page> {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await openPark(page, { transport: 'edge', ...params });
  return page;
}

/** An owl's walking pace (room px a second, shared/walk.ts WALK_SPEED). */
const WALK_PX_S = 260;

/**
 * From now on, the fastest the page's own owl moves between two frames it draws (room px a second):
 * a walk keeps to its pace, a jump across the room is many times faster (OP-138). Read it with `fastest`.
 */
async function watchForJumps(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { fastest: number };
    w.fastest = 0;
    let last: { x: number; y: number; t: number } | null = null;
    const look = () => {
      const pos = window.owlPark.state()?.pos;
      const t = performance.now();
      if (pos && last && t > last.t) w.fastest = Math.max(w.fastest, (Math.hypot(pos.x - last.x, pos.y - last.y) * 1000) / (t - last.t));
      if (pos) last = { ...pos, t };
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
}

const fastest = (page: Page) => page.evaluate(() => (window as unknown as { fastest: number }).fastest);

test.describe('room server', () => {
  test('the page is never cached, so a deploy cannot leave it pointing at a bundle that is gone', async ({ request }) => {
    for (const path of ['/', '/index.html']) {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      expect(res.headers()['cache-control']).toBe('no-store');
      expect(res.headers()['cdn-cache-control']).toBe('no-store');
    }
    const html = await (await request.get('/')).text();
    const bundle = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
    expect(bundle).toBeTruthy();
    const js = await request.get(bundle!);
    expect(js.status()).toBe(200);
    expect(js.headers()['cache-control'] ?? '').not.toBe('no-store');
  });

  test('the server places the owl and the HUD shows the park count', { tag: '@smoke' }, async ({ browser }) => {
    const a = await visitor(browser);
    const s = await state(a);
    expect(s.room).toBe('hub');
    expect(s.pos.y).toBeGreaterThan(560); // scattered onto the walkable floor
    await expect(a.getByText('1 owl here')).toBeVisible();
    await a.context().close();
  });

  test('an owl that walks off before its page has joined the room is not pulled back as it joins (OP-138)', async ({ browser }) => {
    test.slow(); // two parks, one of them on a slow network
    const b = await visitor(browser);
    const a = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    // A slow network: the pass the room's socket waits on comes only once the owl has crossed the
    // hub, so it joins further from where it came in (the hub's middle) than the room lets a
    // newcomer start.
    let passCame!: () => void;
    const passHeld = new Promise<void>((r) => (passCame = r));
    await a.route('**/api/pass**', async (route) => {
      await passHeld;
      await route.continue();
    });
    await a.goto('/?transport=edge&room=hub');
    await a.waitForFunction(() => window.owlPark?.state() != null, null, { timeout: 30_000 });
    expect((await state(a)).connected).toBe(false);
    await watchForJumps(a);
    const there = await walkAndStop(a, 3400, 780);
    passCame();
    await a.waitForFunction(() => window.owlPark.state()?.connected === true, null, { timeout: 30_000 });
    // Where its visitor took it, never back at the door, and the other owl sees it there.
    await expect.poll(async () => dist((await state(b)).peers[0]?.pos ?? { x: 0, y: 0 }, there), { timeout: 15_000 }).toBeLessThan(6);
    expect(dist((await state(a)).pos, there)).toBeLessThan(3);
    expect(await fastest(a)).toBeLessThan(WALK_PX_S * 1.5);
    await a.context().close();
    await b.context().close();
  });

  test('a room is joined while its art loads: the owl already there sees the newcomer before its page has the painting, and the room opens with that owl in it (OP-129)', async ({ browser }) => {
    test.slow(); // two parks, one of them waiting on its room's paintings
    const b = await visitor(browser);
    const a = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    // The hub's paintings come only when the test says: the room cannot open before.
    let paintingsCame!: () => void;
    const paintingsHeld = new Promise<void>((r) => (paintingsCame = r));
    await a.route(/\/art\/hub[-.%@]/, async (route) => {
      await paintingsHeld;
      await route.continue().catch(() => undefined);
    });
    // The page's own log (?log=1) says when the room lets the owl in, as it happens.
    const joined = a.waitForEvent('console', { predicate: (m) => m.text().includes('"event":"room_join_ok"'), timeout: 30_000 });
    await a.goto('/?transport=edge&room=hub&log=1');
    await joined;
    await expect.poll(async () => (await state(b)).peers.length, { timeout: 15_000 }).toBe(1);
    expect(await a.evaluate(() => window.owlPark?.state() ?? null)).toBeNull();
    paintingsCame();
    // The first frame the room draws: the page holds the room's connection and the other owl is in it.
    const first = await a.waitForFunction(
      () => {
        const s = window.owlPark?.state();
        return s ? { connected: s.connected, peers: s.peers.length } : null;
      },
      null,
      { timeout: 30_000 },
    );
    expect(await first.jsonValue()).toEqual({ connected: true, peers: 1 });
    await expect(a.getByText('2 owls here')).toBeVisible();
    await a.context().close();
    await b.context().close();
  });

  test('a page whose connection drops keeps its owl where it walks: back online it never jumps, and the other owl sees it there (OP-138)', async ({ browser }) => {
    test.slow(); // two parks, and a reconnect
    const a = await visitor(browser);
    const b = await visitor(browser);
    await expect.poll(async () => (await state(b)).peers.length, { timeout: 15_000 }).toBe(1);
    // Off to the east wing, far from where owls come into the hub, and seen there.
    const left = await walkAndStop(a, 3800, 780);
    await expect.poll(async () => dist((await state(b)).peers[0]!.pos, left), { timeout: 15_000 }).toBeLessThan(6);
    await watchForJumps(a);
    // The network goes and the owl walks on, further from where it left than the room lets a stranger come back.
    await a.context().setOffline(true);
    expect(await a.evaluate(() => window.owlPark.drop())).toBe(true);
    const there = await walkAndStop(a, 3200, 780);
    expect(dist(there, left)).toBeGreaterThan(400);
    await a.context().setOffline(false);
    await a.waitForFunction(() => document.querySelector('[data-dot]')?.getAttribute('data-status') === 'online', null, { timeout: 30_000 });
    await expect.poll(async () => dist((await state(b)).peers[0]?.pos ?? { x: 0, y: 0 }, there), { timeout: 30_000 }).toBeLessThan(6);
    expect(dist((await state(a)).pos, there)).toBeLessThan(3);
    expect(await fastest(a)).toBeLessThan(WALK_PX_S * 1.5);
    await a.context().close();
    await b.context().close();
  });

  test('the position overlay shows for the keepers’ key only, with the room’s echoes and no jump on a walk (OP-138)', async ({ browser, request }) => {
    expect((await request.get('/api/admin/ping')).status()).toBe(403);
    expect((await request.get('/api/admin/ping', { headers: { 'X-Admin-Key': E2E_ADMIN_KEY } })).status()).toBe(200);
    const stranger = await (await browser.newContext()).newPage();
    stranger.on('dialog', (d) => void d.accept('not-the-keepers-key'));
    await openPark(stranger, { transport: 'edge', pos: '1' });
    await stranger.waitForTimeout(1_000);
    await expect(stranger.locator('[data-pos-overlay]')).toHaveCount(0);
    await stranger.context().close();
    const keeper = await (await browser.newContext()).newPage();
    keeper.on('dialog', (d) => void d.accept(E2E_ADMIN_KEY));
    await openPark(keeper, { transport: 'edge', pos: '1' });
    const overlay = keeper.locator('[data-pos-overlay]');
    await expect(overlay).toContainText('jumps 0');
    await walkAndStop(keeper, 3000, 780);
    await expect(overlay).toContainText(/walk \d+,\d+ > \d+,\d+/);
    await expect(overlay).toContainText('jumps 0');
    await keeper.context().close();
  });

  test('two visitors in separate contexts see each other appear, walk, and leave', { tag: '@smoke' }, async ({ browser }) => {
    const a = await visitor(browser, { look: '#8B5A2B,#F6F1E3,#C9A227' });
    const b = await visitor(browser, { look: '#2F3E5C,#E0D4F0,#00E5FF' });
    await expect.poll(async () => (await state(a)).peers.length, { timeout: 15_000 }).toBe(1);
    await expect.poll(async () => (await state(b)).peers.length, { timeout: 15_000 }).toBe(1);
    expect((await state(b)).peers[0]!.look.body).toBe('#8B5A2B');
    await expect(a.getByText('2 owls here')).toBeVisible();

    const target = { x: 2200, y: 760 };
    await a.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), target);
    await waitForArrival(a, target.x, target.y);
    await expect.poll(async () => dist((await state(b)).peers[0]!.pos, target), { timeout: 15_000 }).toBeLessThan(6);
    await a.screenshot({ path: 'e2e-screenshots/edge-two-owls.png' });

    await walkToDoor(a, 'to-grove');
    await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toBe('grove');
    await expect.poll(async () => (await state(b)).peers.length, { timeout: 15_000 }).toBe(0);
    await a.context().close();
    await b.context().close();
  });

  test('an owl walked with the keys stops in the same place for everyone', async ({ browser }) => {
    const a = await visitor(browser);
    const b = await visitor(browser);
    await expect.poll(async () => (await state(b)).peers.length, { timeout: 15_000 }).toBe(1);
    const start = (await state(a)).pos;
    const key = start.x < 2400 ? 'KeyD' : 'KeyA'; // toward the middle, so there is floor to walk on
    await a.keyboard.down(key);
    await expect.poll(async () => Math.abs((await state(a)).pos.x - start.x), { timeout: 10_000 }).toBeGreaterThan(80);
    await a.keyboard.up(key);
    await expect.poll(async () => (await state(a)).walking).toBe(false);
    const stopped = (await state(a)).pos;
    // B sees A stop there too, rather than walk on to the edge of the floor.
    await expect.poll(async () => dist((await state(b)).peers[0]!.pos, stopped), { timeout: 10_000 }).toBeLessThan(8);
    await b.waitForTimeout(1500);
    expect(dist((await state(b)).peers[0]!.pos, stopped)).toBeLessThan(8);
    expect(dist((await state(a)).pos, stopped)).toBeLessThan(8);
    await a.context().close();
    await b.context().close();
  });

  test('a late joiner sees an owl that is already mid-walk in the right place', async ({ browser }) => {
    const a = await visitor(browser);
    const start = (await state(a)).pos;
    const target = { x: start.x < 2400 ? 3000 : 1800, y: 800 }; // a long walk, several seconds
    await a.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), target);
    // Under way before B comes in.
    await expect.poll(async () => dist((await state(a)).pos, start), { intervals: [50] }).toBeGreaterThan(30);
    const b = await visitor(browser);
    await expect.poll(async () => (await state(b)).peers.length, { timeout: 10_000 }).toBe(1);
    const [mine, other] = await Promise.all([state(a), state(b)]);
    const theirs = other.peers[0]!;
    // B's copy is at (nearly) the same point on the same walk, whether or not it has finished yet.
    expect(dist(mine.pos, theirs.pos)).toBeLessThan(120); // the render delay plus one hop of latency
    if (mine.walking) expect(theirs.walking).toBe(true);
    await waitForArrival(a, target.x, target.y);
    await expect.poll(async () => dist((await state(b)).peers[0]!.pos, target), { timeout: 15_000 }).toBeLessThan(6);
    await a.context().close();
    await b.context().close();
  });

  test('an idle owl sleeps for everyone in the room: a late joiner sees it asleep, and the others see it wake and doze off again', async ({ browser }) => {
    const a = await visitor(browser, { sleep: '3' });
    await expect.poll(async () => (await state(a)).asleep, { timeout: 15_000 }).toBe(true);
    const b = await visitor(browser);
    await expect.poll(async () => (await state(b)).peers[0]?.asleep, { timeout: 15_000 }).toBe(true);
    await a.keyboard.press('Shift');
    await expect.poll(async () => (await state(a)).asleep, { timeout: 5_000 }).toBe(false);
    await expect.poll(async () => (await state(b)).peers[0]?.asleep, { timeout: 5_000, intervals: [50] }).toBe(false);
    await expect.poll(async () => (await state(b)).peers[0]?.asleep, { timeout: 15_000 }).toBe(true);
    expect((await state(a)).asleep).toBe(true);
    await a.context().close();
    await b.context().close();
  });

  test('the server clamps a walk that leaves the walkable area', async ({ browser }) => {
    const a = await visitor(browser);
    await a.evaluate(() => window.owlPark.walkTo(2400, 50));
    await expect.poll(async () => (await state(a)).walking, { timeout: 15_000 }).toBe(false);
    expect((await state(a)).pos.y).toBeGreaterThanOrEqual(600);
    await a.context().close();
  });

  test('the Realm Vote refuses guests until tickets exist, and keeps standings private', async ({ browser, request }) => {
    const a = await visitor(browser, { room: 'market' });
    await walkToDoor(a, 'idol');
    await expect(a.getByRole('button', { name: 'Vote for this realm', exact: true })).toBeVisible({ timeout: 15_000 });
    await settleCamera(a);
    await tapRoomPoint(a, 1240, 270); // tap the robot owl itself
    await expect(a.getByText(/Voting opens with tickets/).first()).toBeVisible({ timeout: 10_000 });
    await a.context().close();

    // The API itself: no pass, a guest pass, and the private tally.
    const noPass = await request.post('/api/vote', { data: { realm: 'market' } });
    expect(noPass.status()).toBe(401);
    const pass = (await (await request.get('/api/pass')).json()) as { pass: string };
    const guest = await request.post('/api/vote', { data: { realm: 'market' }, headers: { Authorization: `Bearer ${pass.pass}` } });
    expect(guest.status()).toBe(403);
    expect(await guest.json()).toEqual({ error: 'tickets-required' });
    const me = await request.get('/api/vote/me', { headers: { Authorization: `Bearer ${pass.pass}` } });
    expect(me.status()).toBe(403);
    const tally = await request.get('/api/vote/tally');
    expect(tally.status()).toBe(403);
    const close = await request.post('/api/vote/close');
    expect(close.status()).toBe(403);
  });

  test('a ticket: its link puts it in the wallet, the turnstiles scan it, and it votes once a day', async ({ browser, request }) => {
    // Two day tickets the park gives away (no store order behind them).
    const issued = await request.post('/api/admin/tickets', { headers: { 'X-Admin-Key': E2E_ADMIN_KEY }, data: { kind: 'day', quantity: 2 } });
    expect(issued.status(), 'the room server runs with the test admin key (playwright.config.ts)').toBe(200);
    const { tickets, link } = (await issued.json()) as { tickets: string[]; link: string };
    const secret = link.split('#claim=')[1] ?? '';
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // The emailed link opens the park; its secret leaves the address bar at once.
    const a = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await a.goto(`/?transport=edge&home=0#claim=${secret}`);
    await a.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
    expect(a.url()).not.toContain('claim=');
    await expect(a.getByText('Your tickets are in your wallet')).toBeVisible({ timeout: 10_000 });
    expect((await a.evaluate(() => window.owlPark.wallet())).map((t) => t.id).sort()).toEqual([...tickets].sort());
    expect((await state(a)).room).toBe('lobby');

    // The booth shows both, and passes one on with a share link.
    await walkToDoor(a, 'booth');
    await a.locator('[data-action="booth"]').click({ timeout: 15_000 });
    await expect(a.locator('[data-booth="wallet"] li')).toHaveCount(2);
    await expect(a.locator('[data-booth="say"]')).toContainText('Your ticket is ready');
    await a.screenshot({ path: 'e2e-screenshots/ticket-booth-wallet.png' });
    await a.locator('[data-booth="share"]').first().click();
    const shared = a.locator('[data-booth="wallet"] .shared');
    await expect(shared).toBeVisible();
    const shareUrl = (await shared.getAttribute('data-link')) ?? '';
    expect(shareUrl).toMatch(/\/#take=[A-Za-z0-9_-]{43}$/);
    await a.keyboard.press('Escape');

    // A friend opens it: the ticket moves to their device, and works once.
    const b = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await b.goto(`/?transport=edge&room=hub${new URL(shareUrl).hash}`);
    await expect(b.getByText('A ticket was passed on to you')).toBeVisible({ timeout: 20_000 });
    expect(await b.evaluate(() => window.owlPark.wallet())).toHaveLength(1);
    await expect.poll(async () => (await a.evaluate(() => window.owlPark.wallet())).length).toBe(1);
    await b.context().close();

    // The turnstiles scan the buyer's ticket: the card flips up, its time starts, and the owl goes on into the hub.
    await walkToDoor(a, 'gate');
    await expect(a.locator('[data-ticket-card]')).toContainText('Your visit starts now', { timeout: 15_000 });
    await a.screenshot({ path: 'e2e-screenshots/ticket-gate-card.png' });
    await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toBe('hub');
    expect((await a.evaluate(() => window.owlPark.wallet()))[0]).toMatchObject({ status: 'active', voteToday: 'ready' });

    // Admitted by the ticket, the owl votes at a realm's idol: once a day.
    await walkToDoor(a, 'to-market');
    await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toBe('market');
    await walkToDoor(a, 'idol');
    const vote = a.getByRole('button', { name: 'Vote for this realm', exact: true });
    await vote.click({ timeout: 15_000 });
    await expect(a.getByText('Your vote for this realm is in')).toBeVisible({ timeout: 10_000 });
    await vote.click();
    await expect(a.getByText('You already voted for this realm today.')).toBeVisible({ timeout: 10_000 });
    expect((await a.evaluate(() => window.owlPark.wallet()))[0]).toMatchObject({ voteToday: 'used' });
    await a.context().close();
  });

  test('leaving the park keeps a ticket running, the turnstiles let the owl back in, and travel home finds its nest', async ({ browser, request }) => {
    const issued = await request.post('/api/admin/tickets', { headers: { 'X-Admin-Key': E2E_ADMIN_KEY }, data: { kind: 'day', quantity: 1 } });
    expect(issued.status()).toBe(200);
    const { link } = (await issued.json()) as { link: string };
    const a = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await a.goto(`/?transport=edge&home=0#claim=${link.split('#claim=')[1] ?? ''}`);
    await a.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
    await expect(a.getByText('Your ticket is in your wallet')).toBeVisible({ timeout: 10_000 });
    await walkToDoor(a, 'gate');
    await expect(a.locator('[data-ticket-card]')).toContainText('Your visit starts now', { timeout: 15_000 });
    await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toBe('hub');
    const started = (await a.evaluate(() => window.owlPark.wallet()))[0]!;
    expect(started.status).toBe('active');

    // Out of the park from the Menu's Settings: the card asks, and the owl stands outside the gate.
    await a.locator('[data-menu-btn]').click();
    await a.getByRole('dialog', { name: 'Menu' }).locator('[data-tab="settings"]').click();
    await a.getByRole('dialog', { name: 'Menu' }).locator('[data-screen="leave"]').click();
    await a.getByRole('dialog', { name: 'Leave the park' }).locator('[data-leave="leave"]').click();
    await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toBe('lobby');
    // Leaving changed nothing on the ticket: its time runs from the same first scan.
    expect((await a.evaluate(() => window.owlPark.wallet()))[0]).toMatchObject({ id: started.id, status: 'active', firstScan: started.firstScan });

    // Back in through the turnstiles: the quick scan.
    await walkToDoor(a, 'gate');
    await expect(a.locator('[data-ticket-card]')).toContainText('Welcome back', { timeout: 15_000 });
    await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toBe('hub');
    expect((await a.evaluate(() => window.owlPark.wallet()))[0]).toMatchObject({ status: 'active', firstScan: started.firstScan });

    // Travel home (the Menu's map): straight to the owl's own nest, which the room server makes on first sight.
    await travelTo(a, 'nest');
    await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toMatch(/^nest-[a-z0-9]{8}$/);
    await expect.poll(async () => (await state(a)).nest?.mine, { timeout: 10_000 }).toBe(true);
    await a.context().close();
  });

  for (const [name, device] of [
    ['a computer', { viewport: { width: 1280, height: 800 } }],
    ['a phone', { ...devices['Pixel 7'] }],
  ] as const) {
    test(`on ${name}: a ticket link lands on the home screen logged in, with the ticket; Play puts the owl in its own nest, and the room server counts it there`, async ({ browser, request }) => {
      const issued = await request.post('/api/admin/tickets', { headers: { 'X-Admin-Key': E2E_ADMIN_KEY }, data: { kind: 'day', quantity: 1 } });
      expect(issued.status()).toBe(200);
      const { link } = (await issued.json()) as { link: string };
      // Owls in the nests as the room server counts them now (all nests under one key, so no count names a nest).
      const inNests = async () => ((await (await request.get('/api/counts')).json()) as Record<string, number>)['nests'] ?? 0;
      const before = await inNests();

      // A new device opens the link from the store's email: the owl is made here, and the ticket is in its wallet.
      const a = await (await browser.newContext(device)).newPage();
      await a.goto(`/?transport=edge${new URL(link).hash}`);
      await expect(a.locator('[data-home-btn="play"]')).toBeVisible({ timeout: 20_000 });
      expect(await a.evaluate(() => window.owlPark.home())).toEqual({ shown: true, loggedIn: true });
      await expect(a.locator('[data-home-note]')).toHaveText('Ticket added');
      await expect(a.locator('[data-home-wallet]')).toHaveText('Day ticket: ready at the turnstiles');
      await a.screenshot({ path: `e2e-screenshots/edge-home-ticket-link-${name === 'a phone' ? 'phone' : 'desktop'}.png` });

      // Play (OP-105): the owl's own nest, which the room server makes on first sight.
      await a.locator('[data-home-btn="play"]').click();
      await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toMatch(/^nest-[a-z0-9]{8}$/);
      await expect.poll(async () => (await state(a)).nest?.mine, { timeout: 10_000 }).toBe(true);
      await expect.poll(inNests, { timeout: 15_000 }).toBe(before + 1);
      // The Menu's Home screen (in its Settings) frees the owl's place in the room at once.
      await a.locator('[data-menu-btn]').click();
      await a.getByRole('dialog', { name: 'Menu' }).locator('[data-tab="settings"]').click();
      await a.getByRole('dialog', { name: 'Menu' }).locator('[data-screen="title"]').click();
      await expect(a.locator('[data-home-btn="play"]')).toBeVisible({ timeout: 20_000 });
      await expect.poll(inNests, { timeout: 15_000 }).toBe(before);
      await a.context().close();
    });
  }

  test('quests live on the server: talk, take on and progress are checked there', async ({ browser }) => {
    const a = await visitor(browser);
    await expect.poll(async () => (await state(a)).npcs.find((n) => n.id === 'bramble')?.mark, { timeout: 15_000 }).toBe('offer');
    // Too far away: the server refuses the talk (the page would walk up first; the API does not).
    expect(await a.evaluate(() => window.owlPark.accept('story-welcome'))).toBe(false);
    expect(await a.evaluate(() => window.owlPark.talk('bramble'))).toBe(true);
    await expect(a.locator('.dialogue[data-npc="bramble"]')).toBeVisible({ timeout: 20_000 });
    expect(await a.evaluate(() => window.owlPark.accept('story-welcome'))).toBe(true);
    await expect.poll(async () => (await a.evaluate(() => window.owlPark.quests()?.active.map((q) => q.id))) ?? []).toEqual(['story-welcome']);
    expect(await a.evaluate(() => window.owlPark.talk('pip'))).toBe(true);
    await expect.poll(async () => (await a.evaluate(() => window.owlPark.quests()?.active[0]?.step)) ?? -1, { timeout: 20_000 }).toBe(1);
    await a.context().close();
  });

  test('a leaf pile is shared: one owl flops in and it is gone for everyone', async ({ browser }) => {
    test.slow(); // three live parks on the room server, drawn with software WebGL on CI runners
    const a = await visitor(browser, { room: 'grove' });
    const b = await visitor(browser, { room: 'grove' });
    await expect.poll(async () => (await state(b)).peers.length, { timeout: 15_000 }).toBe(1);
    const pile = (await state(a)).objects.find((o) => o.kind === 'leaf-pile' && o.here)!;
    expect(await a.evaluate((id) => window.owlPark.use(id), pile.id)).toBe(true);
    await expect.poll(async () => (await state(a)).objects.find((o) => o.id === pile.id)?.here, { timeout: 20_000 }).toBe(false);
    await expect.poll(async () => (await state(b)).objects.find((o) => o.id === pile.id)?.here, { timeout: 10_000 }).toBe(false);
    await a.screenshot({ path: 'e2e-screenshots/edge-leaves.png' });
    // A newcomer hears about it too.
    const c = await visitor(browser, { room: 'grove' });
    await expect.poll(async () => (await state(c)).objects.find((o) => o.id === pile.id)?.here, { timeout: 10_000 }).toBe(false);
    for (const p of [a, b, c]) await p.context().close();
  });

  test('a phrase through the room server: only its number travels, and the other owls in the room see it over the owl', async ({ browser }) => {
    const a = await visitor(browser);
    // The other owl on a phone-sized screen, where the words must still be readable.
    const b = await (await browser.newContext({ viewport: { width: 412, height: 839 } })).newPage();
    const heard: unknown[] = [];
    b.on('websocket', (ws) =>
      ws.on('framereceived', (f) => {
        if (typeof f.payload !== 'string' || !f.payload.startsWith('{')) return;
        const frame = JSON.parse(f.payload) as { t?: string };
        if (frame.t === 'say') heard.push(frame);
      }),
    );
    await openPark(b, { transport: 'edge' });
    await expect.poll(async () => (await state(b)).peers.length, { timeout: 15_000 }).toBe(1);
    await expect.poll(async () => (await state(a)).peers.length, { timeout: 15_000 }).toBe(1);
    const aId = (await state(b)).peers[0]!.id;
    const bId = (await state(a)).peers[0]!.id;

    expect(await a.evaluate(() => window.owlPark.say(13))).toBe(true);
    expect((await state(a)).bubbles.map((s) => s.n)).toEqual([13]);
    // One phrase every 3 s.
    expect(await a.evaluate(() => window.owlPark.say(14))).toBe(false);
    await expect.poll(async () => (await state(b)).bubbles, { timeout: 10_000 }).toEqual([{ id: aId, n: 13 }]);
    // On the wire, the owl's id and the phrase's number: never words.
    await expect.poll(() => heard).toEqual([{ t: 'say', id: aId, n: 13 }]);

    // The other owl answers, and its bubble shows over it on its own screen too.
    expect(await b.evaluate(() => window.owlPark.say(9))).toBe(true);
    await expect.poll(async () => (await state(a)).bubbles, { timeout: 10_000 }).toContainEqual({ id: bId, n: 9 });
    await b.screenshot({ path: 'e2e-screenshots/edge-say-phone.png' });

    // The first owl's turn comes again.
    await expect.poll(() => a.evaluate(() => window.owlPark.say(14)), { timeout: 5_000 }).toBe(true);
    await expect.poll(async () => (await state(b)).bubbles, { timeout: 10_000 }).toContainEqual({ id: aId, n: 14 });
    await expect.poll(() => heard).toEqual([
      { t: 'say', id: aId, n: 13 },
      { t: 'say', id: aId, n: 14 },
    ]);
    await a.context().close();
    await b.context().close();
  });

  test('a jump, a flap and a glide go through the room server: the other owl sees each, and its owl stays where it stood (OP-084)', async ({ browser }) => {
    test.slow(); // two live parks drawn with software WebGL on CI runners
    const a = await visitor(browser);
    const b = await visitor(browser);
    await expect.poll(async () => (await state(a)).peers.length, { timeout: 15_000 }).toBe(1);
    await expect.poll(async () => (await state(b)).peers.length, { timeout: 15_000 }).toBe(1);
    const stood = (await state(b)).pos;
    // A jump held to its top, the flap at the top, and the flap held on the way down: a glide.
    const before = (await state(a)).peers[0]!.flown.n;
    const here = await steppedFlight(b, () => jumpFlapGlide(b, 1_200));
    const there = await steppedPeerFlight(a, before);
    // The other page steps it from the same states: one take-off, as high, gliding, and as long in
    // the air, give or take the network.
    expect(here.peak).toBeGreaterThan(200);
    expect(there.takeoffs).toBe(1);
    expect(there.peak).toBeGreaterThan(here.peak - 25);
    expect(there.peak).toBeLessThan(here.peak + 25);
    expect(there.glided).toBe(true);
    expect(Math.abs(there.airMs - here.airMs)).toBeLessThan(900);
    // Flight is a height over the floor: on both pages the owl comes down where it stood.
    expect((await state(b)).pos).toEqual(stood);
    expect((await state(a)).peers[0]?.pos).toEqual(stood);
    expect((await state(a)).peers[0]?.height).toBe(0);
    await a.context().close();
    await b.context().close();
  });

  test('an owl standing on a perch is up there for the room server: the other owl sees it there, and so does one that comes in later (OP-084)', async ({ browser }) => {
    test.slow(); // live parks drawn with software WebGL on CI runners, and the walk across the hub
    const a = await visitor(browser);
    const b = await visitor(browser);
    await expect.poll(async () => (await state(a)).peers.length, { timeout: 15_000 }).toBe(1);
    // The other owl's id, as the first page knows it.
    const id = (await state(a)).peers[0]!.id;
    // Up on the hub's root bench: walked to its face, then a jump, the walk carrying on over its top.
    await walkAndStop(b, 900, 760);
    await b.evaluate(() => window.owlPark.walkTo(900, 696));
    await expect.poll(async () => (await state(b)).walking, { intervals: [50] }).toBe(false);
    await b.keyboard.down('Space');
    await b.waitForTimeout(320);
    await b.keyboard.up('Space');
    await expect.poll(async () => { const s = await state(b); return [s.air.s, s.air.z, s.height]; }, { timeout: 5_000, intervals: [50] }).toEqual([0, 80, 80]);
    const seen = async (page: Page) => (await state(page)).peers.find((p) => p.id === id) ?? null;
    await expect.poll(async () => (await seen(a))?.height ?? -1, { timeout: 5_000 }).toBe(80);
    expect(dist((await seen(a))!.pos, { x: 900, y: 696 })).toBeLessThan(4);
    // A newcomer is told by the room the owl stands up there.
    const c = await visitor(browser);
    await expect.poll(async () => (await seen(c))?.height ?? -1, { timeout: 15_000 }).toBe(80);
    // Off the front of the seat: down on the floor for everyone.
    await b.evaluate(() => window.owlPark.walkTo(900, 800));
    for (const page of [a, c]) await expect.poll(async () => (await seen(page))?.height ?? -1, { timeout: 5_000 }).toBe(0);
    for (const page of [a, b, c]) await page.context().close();
  });

  test('a leaf pile up on the lantern beam is flopped into from the beam through the room server, and stays gone for a newcomer (OP-084)', async ({ browser }) => {
    test.slow(); // a live park drawn with software WebGL on CI runners, and the walk across the hub
    const a = await visitor(browser);
    await walkAndStop(a, 900, 760);
    await a.evaluate(() => window.owlPark.walkTo(900, 696));
    await expect.poll(async () => (await state(a)).walking, { intervals: [50] }).toBe(false);
    await a.keyboard.down('Space');
    await a.waitForTimeout(320);
    await a.keyboard.up('Space');
    await expect.poll(async () => { const s = await state(a); return [s.air.s, s.air.z]; }, { timeout: 5_000, intervals: [50] }).toEqual([0, 80]);
    // On the bench below it, the pile is not on offer; a jump and the flap put the owl up on the beam by it.
    expect((await state(a)).actions).not.toContain('use:hub-leaves-beam');
    await jumpFlapGlide(a, 250);
    await expect.poll(async () => { const s = await state(a); return [s.air.s, s.air.z]; }, { timeout: 5_000, intervals: [50] }).toEqual([0, 264]);
    // The room server checks the owl stands up there, and takes the flop.
    await doAction(a, 'use:hub-leaves-beam');
    await expect.poll(async () => (await state(a)).objects.find((o) => o.id === 'hub-leaves-beam')?.here, { timeout: 15_000 }).toBe(false);
    const b = await visitor(browser);
    await expect.poll(async () => (await state(b)).objects.find((o) => o.id === 'hub-leaves-beam')?.here, { timeout: 15_000 }).toBe(false);
    for (const page of [a, b]) await page.context().close();
  });

  test('the shop and the collection live on the server, for this collector only', async ({ browser, request }) => {
    const a = await visitor(browser);
    const out = await a.evaluate(async () => {
      const token = localStorage.getItem('owl-park:collector') ?? '';
      const { pass } = (await (await fetch('/api/pass', { headers: { 'X-Collector': token } })).json()) as { pass: string };
      const auth = { Authorization: `Bearer ${pass}` };
      const post = (path: string, body: unknown) => fetch(path, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const inventory = (await (await fetch('/api/collection', { headers: auth })).json()) as { owned: string[]; feathers: number };
      const shop = (await (await fetch('/api/shop', { headers: auth })).json()) as { rotation: { weekly: Array<{ variant: string }>; daily: Array<{ variant: string }>; gift: { variant: string } | null }; feathers: number };
      const buy = (await (await post('/api/shop/buy', { variant: shop.rotation.weekly[0]!.variant })).json()) as { ok: boolean; reason?: string };
      const gift = (await (await post('/api/shop/gift', {})).json()) as { ok: boolean; variant?: string };
      const again = (await (await post('/api/shop/gift', {})).json()) as { ok: boolean; reason?: string };
      const after = (await (await fetch('/api/collection', { headers: auth })).json()) as { owned: string[] };
      const craft = (await post('/api/collection/craft', { variant: 'crown~0' })).status;
      return { inventory, weekly: shop.rotation.weekly.length, daily: shop.rotation.daily.length, giftVariant: shop.rotation.gift?.variant, gift, again, owned: after.owned, buy, craft };
    });
    expect(out.inventory.owned.length).toBeGreaterThanOrEqual(3);
    expect(out.inventory.owned).toContain('bat~0'); // the Halloween present, for every owl
    expect(out.weekly).toBe(8);
    expect(out.daily).toBe(3);
    expect(out.buy).toMatchObject({ ok: false, reason: 'feathers' });
    expect(out.gift).toMatchObject({ ok: true, variant: out.giftVariant });
    expect(out.again).toMatchObject({ ok: false, reason: 'taken' });
    expect(out.owned).toContain(out.giftVariant);
    expect(out.craft).toBe(404); // crafting is retired
    expect((await request.get('/api/collection')).status()).toBe(401);
    expect((await request.get('/api/shop')).status()).toBe(401);
    expect((await request.post('/api/admin/grant', { data: { cid: 'c_abcdefgh12', variant: 'crown~0' } })).status()).toBe(403);
    await a.context().close();
  });

  test('two owls light the lantern beam together, and the room server pays them both', async ({ browser }) => {
    test.slow(); // two live parks, seven lanterns
    const a = await visitor(browser);
    const b = await visitor(browser);
    await expect.poll(async () => (await state(b)).peers.length, { timeout: 15_000 }).toBe(1);
    // A beam still glowing from an earlier run goes dark first.
    await expect.poll(async () => (await state(a)).play?.glowing, { timeout: 50_000 }).toBe(false);
    // The second owl in is placed around the first, perhaps up in the bay between the two blockades,
    // where a straight walk west meets the bay's wall: both step down onto the open floor first.
    await Promise.all([walkAndStop(a, 2330, 760), walkAndStop(b, 2470, 760)]);
    // A from the west end of the beam, B from the east: four rounds, a lantern each.
    const plan: Array<[number, number | null]> = [
      [800, 1125],
      [800, 1125],
      [970, 1235],
      [970, null],
    ];
    const at: Record<'a' | 'b', number> = { a: -1, b: -1 };
    let litAt = 0;
    for (const [xa, xb] of plan) {
      await Promise.all([xa !== at.a ? walkAndStop(a, xa, 760) : null, xb !== null && xb !== at.b ? walkAndStop(b, xb, 760) : null]);
      at.a = xa;
      if (xb !== null) at.b = xb;
      const wait = litAt + 2_550 - Date.now();
      if (wait > 0) await a.waitForTimeout(wait);
      await expect.poll(async () => (await state(a)).actions[0], { intervals: [50] }).toBe('act:light');
      await a.keyboard.press('e');
      if (xb !== null) {
        await expect.poll(async () => (await state(b)).actions[0], { intervals: [50] }).toBe('act:light');
        await b.keyboard.press('e');
      }
      litAt = Date.now();
    }
    await expect.poll(async () => (await state(a)).play?.glowing, { timeout: 10_000 }).toBe(true);
    await expect.poll(async () => (await state(b)).play?.glowing, { timeout: 10_000 }).toBe(true);
    // Four feathers each, and one more for the other owl who helped.
    await expect(a.getByText(/^You helped light the whole beam! \+5 feathers/)).toBeVisible();
    await expect(b.getByText(/^You helped light the whole beam! \+5 feathers/)).toBeVisible();
    await a.screenshot({ path: 'e2e-screenshots/edge-beam.png' });
    // A newcomer sees the beam glowing.
    const c = await visitor(browser);
    await expect.poll(async () => (await state(c)).play?.glowing, { timeout: 10_000 }).toBe(true);
    for (const p of [a, b, c]) await p.context().close();
  });

  test('fishing through the room server: the bite comes when it says, and the catch pays', async ({ browser }) => {
    const a = await visitor(browser, { room: 'grove' });
    await walkToJetty(a);
    await doAction(a, 'act:cast');
    await expect.poll(async () => (await state(a)).play?.line, { timeout: 12_000, intervals: [50] }).toBe('bite');
    await a.keyboard.press('e');
    await expect(a.getByText(/^(You caught .+!|You fished out an old boot!)/)).toBeVisible();
    await a.context().close();
  });

  test("the robot owl's tune through the room server, danced for everyone in the street", async ({ browser }) => {
    const a = await visitor(browser, { room: 'market' });
    // B only watches: a small window costs little to draw, so A's notes keep to the tune's timing on a slow machine.
    const b = await visitor(browser, { room: 'market' }, { width: 320, height: 200 });
    await expect.poll(async () => (await state(b)).peers.length, { timeout: 15_000 }).toBe(1);
    await walkAndStop(a, 1480, 755);
    await doAction(a, 'act:copy');
    const card = a.locator('.play-card.copy');
    await expect(card).toHaveAttribute('data-phase', 'play', { timeout: 8_000 });
    const tune = (await state(a)).play!.copy!.tune;
    for (const [i, note] of tune.entries()) {
      // Each note has a few seconds: press it at once rather than wait for the card to sit still.
      await card.locator(`[data-note="${note}"]`).dispatchEvent('click');
      if (i < tune.length - 1) await expect.poll(async () => (await state(a)).play?.copy?.got).toBe(i + 1);
    }
    await expect(a.getByText(/^Tune copied! \+1 feather/)).toBeVisible();
    // B saw A play the notes.
    await expect.poll(async () => (await state(b)).peers[0]?.emote, { timeout: 5_000 }).toBe(tune[tune.length - 1]);
    for (const p of [a, b]) await p.context().close();
  });

  test('a run in the arcade, checked and paid by the room server, goes up on the wall for the other owl there', async ({ browser }) => {
    const a = await visitor(browser, { room: 'arcade' });
    // B only watches the wall.
    const b = await visitor(browser, { room: 'arcade' }, { width: 640, height: 400 });
    await playAt(a, 'flight');
    await flyThrough(a, 2);
    await untilOver(a);
    const score = (await run(a))!.score;
    await expect(a.locator('.arcade [data-result] [data-paid]')).toHaveText(/^\+\d+ feathers?$/);
    await expect(a.locator('.arcade [data-result] [data-new]')).toHaveText('New best!');
    await expect.poll(async () => (await state(b)).wall?.walls.find((w) => w.game === 'flight')?.top.some((e) => e.score === score), { timeout: 10_000 }).toBe(true);
    for (const p of [a, b]) await p.context().close();
  });

  test('a run’s best goes up on the wall as the run goes, and is still there when the page dies before the run ends (OP-137)', async ({ browser }) => {
    test.slow(); // two parks, a run, and a reload
    const a = await visitor(browser, { room: 'arcade' });
    const b = await visitor(browser, { room: 'arcade' }, { width: 640, height: 400 });
    await playAt(a, 'flight');
    // The run is held where it is, never to end, and the page dies (a reload): no score is ever sent.
    await flyThrough(a, 3, { hold: true });
    await expect.poll(async () => (await state(a)).wall?.mine.flight ?? 0, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
    const kept = (await state(a)).wall!.mine.flight!;
    expect((await run(a))!.over).toBe(false);
    await a.reload();
    await a.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 30_000 });
    // Back as the same collector: its best as the run reached it, and the other owl saw it go up.
    await expect.poll(async () => (await state(a)).wall?.mine.flight ?? null, { timeout: 15_000 }).toBe(kept);
    await expect.poll(async () => (await state(b)).wall?.walls.find((w) => w.game === 'flight')?.top[0]?.score ?? 0, { timeout: 10_000 }).toBe(kept);
    for (const p of [a, b]) await p.context().close();
  });

  test('a run outlives a dropped connection: back online, its end is paid and is a new best (OP-137)', async ({ browser }) => {
    test.slow(); // a run, and a reconnect in the middle of it
    const a = await visitor(browser, { room: 'arcade' });
    await playAt(a, 'flight');
    // The network goes mid-run; the run plays on in the page.
    await a.context().setOffline(true);
    expect(await a.evaluate(() => window.owlPark.drop())).toBe(true);
    // One flight with no pause in it (an owl left alone between two flights falls): two gaps offline,
    // then the network comes back while it flies, and it flies on until the page has found the room
    // again (its dot gone and back) and a gap further on.
    await Promise.all([
      flyThrough(a, 3, { untilOnline: true }),
      (async () => {
        await expect.poll(() => a.evaluate(() => (window.owlPark.arcade()?.sim as unknown as { score: number } | undefined)?.score ?? -1), { timeout: 30_000, intervals: [100] }).toBeGreaterThanOrEqual(2);
        await a.context().setOffline(false);
      })(),
    ]);
    expect(await a.evaluate(() => document.querySelector('[data-dot]')?.getAttribute('data-status'))).toBe('online');
    await untilOver(a);
    await expect(a.locator('.arcade [data-result] [data-paid]')).toHaveText(/^\+\d+ feathers?$/);
    await expect(a.locator('.arcade [data-result] [data-new]')).toHaveText('New best!');
    await expect(a.locator('.arcade [data-result] [data-note]')).toHaveText('');
    await a.context().close();
  });

  test('nests through the room server: an owner decorating, a visitor watching, and a nest that closes on it', async ({ browser }) => {
    // The host comes onto the street: the server makes its nest, behind door 0.
    const host = await visitor(browser, { room: 'homes', look: '#2F3E5C,#E0D4F0,#00E5FF' });
    await expect.poll(async () => {
      const own = (await state(host)).street?.[0];
      return own?.kind === 'own' ? own.nestId : null;
    }, { timeout: 20_000 }).not.toBeNull();
    const own = (await state(host)).street![0]!;
    const nestId = own.kind === 'own' ? own.nestId! : '';
    await walkToDoor(host, 'nest-door-0');
    await expect.poll(async () => (await state(host)).room, { timeout: 20_000 }).toBe(`nest-${nestId}`);
    await expect.poll(async () => (await state(host)).nest?.mine, { timeout: 15_000 }).toBe(true);
    expect(Object.values((await state(host)).nest!.layout).sort()).toEqual(['lamp', 'potted-fern', 'rug', 'stump-table']);

    // A visitor comes to the open nest: it sees the furniture and the host, and cannot decorate.
    const guest = await visitor(browser, { room: `nest-${nestId}`, look: '#8B5A2B,#F6F1E3,#C9A227' });
    await expect.poll(async () => (await state(guest)).nest?.mine, { timeout: 15_000 }).toBe(false);
    expect((await state(guest)).nest?.owned).toEqual([]);
    await expect.poll(async () => (await state(host)).peers.length, { timeout: 15_000 }).toBe(1);
    expect((await state(guest)).actions).not.toContain('decorate');

    // The host moves the lamp and takes today's furniture gift; the guest sees the lamp move.
    const sheet = host.locator('section.decorate');
    await host.locator('[data-action="decorate"]').click();
    await sheet.getByRole('button', { name: 'Next spot' }).click();
    await sheet.locator('[data-piece="lamp"]').click();
    await expect.poll(async () => (await state(guest)).nest?.layout['f2'], { timeout: 10_000 }).toBe('lamp');
    await sheet.locator('[data-gift]').click();
    await expect(host.locator('.toast').filter({ hasText: 'New for your nest:' })).toBeVisible();
    await expect(sheet.locator('[data-gift]')).toBeDisabled();
    expect((await state(host)).nest?.owned).toHaveLength(5);

    // The host closes the nest: the server sends the guest out to the street, and keeps newcomers out.
    await sheet.locator('[data-open]').click();
    await expect(guest.locator('.toast').filter({ hasText: 'Closed for now' })).toBeVisible({ timeout: 10_000 });
    await expect.poll(async () => (await state(guest)).room, { timeout: 20_000 }).toBe('homes');
    // (Its socket closes before any welcome, so it is opened by hand rather than waiting to be online.)
    const lateCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const late = await lateCtx.newPage();
    await late.goto(`/?${new URLSearchParams({ transport: 'edge', room: `nest-${nestId}` })}`);
    await expect.poll(async () => late.evaluate(() => window.owlPark?.state()?.room ?? null), { timeout: 30_000 }).toBe('homes');
    await lateCtx.close();
    // The owner is still at home.
    expect((await state(host)).room).toBe(`nest-${nestId}`);
    await expect.poll(async () => (await state(host)).peers.length, { timeout: 15_000 }).toBe(0);
    for (const p of [host, guest]) await p.context().close();
  });

  test("feedback from the Menu reaches the keepers' page, which needs the admin key and marks notes done", async ({ browser, request }) => {
    const a = await visitor(browser);
    const words = `More lanterns by the pond, please (${Date.now()})`;
    const sheet = a.getByRole('dialog', { name: 'Feedback' });
    const openFeedback = async () => {
      await a.locator('[data-menu-btn]').click();
      await a.getByRole('dialog', { name: 'Menu' }).locator('[data-tab="settings"]').click();
      await a.locator('[data-screen="feedback"]').click();
    };
    await openFeedback();
    await sheet.getByRole('button', { name: 'Idea' }).click();
    await sheet.getByRole('textbox', { name: 'Your note' }).fill(words);
    await sheet.getByRole('button', { name: 'Send' }).click();
    await expect(a.getByText("Your note is with the park's keepers")).toBeVisible();
    // A second note straight away waits its turn.
    await openFeedback();
    await sheet.getByRole('textbox', { name: 'Your note' }).fill('And a second thought');
    await sheet.getByRole('button', { name: 'Send' }).click();
    await expect(sheet.getByText('One note at a time')).toBeVisible();

    // Reading it takes the admin key; sending it takes a pass.
    expect((await request.get('/api/admin/feedback')).status()).toBe(403);
    expect((await request.post('/api/feedback', { data: { kind: 'bug', text: 'no pass' } })).status()).toBe(401);
    const open = await request.get('/api/admin/feedback?status=open', { headers: { 'X-Admin-Key': E2E_ADMIN_KEY } });
    const notes = ((await open.json()) as { feedback: Array<{ id: number; kind: string; text: string; room: string | null; screen: string | null; ua: string | null }> }).feedback;
    expect(notes.find((n) => n.text === words)).toMatchObject({ kind: 'idea', room: 'hub', screen: '1280x800' });
    expect(notes.find((n) => n.text === words)?.ua).toContain('Chrome');

    const keeper = await browser.newPage();
    const page = await keeper.goto('/admin/feedback');
    expect(page?.headers()['cache-control']).toBe('no-store');
    expect(page?.headers()['x-robots-tag']).toContain('noindex');
    await keeper.getByRole('textbox', { name: 'Admin key' }).fill('not the key');
    await keeper.getByRole('button', { name: 'Open' }).click();
    await expect(keeper.getByText('That key did not open it.')).toBeVisible();
    await keeper.getByRole('textbox', { name: 'Admin key' }).fill(E2E_ADMIN_KEY);
    await keeper.getByRole('button', { name: 'Open' }).click();
    const note = keeper.getByRole('listitem').filter({ hasText: words });
    await expect(note).toBeVisible();
    await keeper.screenshot({ path: 'e2e-screenshots/edge-feedback-admin.png' });
    await note.getByRole('button', { name: 'Done' }).click();
    await expect(note).toBeHidden();
    await keeper.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'Done' }).click();
    await expect(keeper.getByRole('listitem').filter({ hasText: words })).toBeVisible();
    await keeper.close();
    await a.context().close();
  });

  test("a hostile note reaches the keepers' page as plain words: no markup, no script (OP-143)", async ({ browser }) => {
    const a = await visitor(browser);
    const words = `<img src=x onerror=alert(1)> ' OR '1'='1 ../../../etc/passwd %00 (${Date.now()})`;
    await a.locator('[data-menu-btn]').click();
    await a.getByRole('dialog', { name: 'Menu' }).locator('[data-tab="settings"]').click();
    await a.locator('[data-screen="feedback"]').click();
    const sheet = a.getByRole('dialog', { name: 'Feedback' });
    await sheet.getByRole('button', { name: 'Bug' }).click();
    await sheet.getByRole('textbox', { name: 'Your note' }).fill(words);
    await sheet.getByRole('button', { name: 'Send' }).click();
    await expect(a.getByText("Your note is with the park's keepers")).toBeVisible();

    const keeper = await browser.newPage();
    const alerts: string[] = [];
    keeper.on('dialog', (d) => {
      alerts.push(d.message());
      void d.dismiss();
    });
    await keeper.goto('/admin/feedback');
    await keeper.getByRole('textbox', { name: 'Admin key' }).fill(E2E_ADMIN_KEY);
    await keeper.getByRole('button', { name: 'Open' }).click();
    const note = keeper.getByRole('listitem').filter({ hasText: words });
    await expect(note).toBeVisible();
    await expect(note.locator('.text')).toHaveText(words);
    await expect(keeper.locator('#list img')).toHaveCount(0);
    expect(alerts).toEqual([]);
    await keeper.close();
    await a.context().close();
  });

  test('closing the tab removes the owl for everyone else', async ({ browser }) => {
    const a = await visitor(browser);
    const b = await visitor(browser);
    await expect.poll(async () => (await state(b)).peers.length, { timeout: 15_000 }).toBe(1);
    await a.context().close();
    await expect.poll(async () => (await state(b)).peers.length, { timeout: 15_000 }).toBe(0);
    await b.context().close();
  });
});
