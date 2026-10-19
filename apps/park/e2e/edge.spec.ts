import { expect, test, type Browser, type Page } from '@playwright/test';
import { dist, openPark, settleCamera, state, tapRoomPoint, waitForArrival, walkToDoor } from './helpers';

/**
 * These tests run against the room server (wrangler dev on :8787). Each visitor gets its own
 * browser context, so nothing is shared between them except the server.
 */
async function visitor(browser: Browser, params: Record<string, string> = {}): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await openPark(page, { transport: 'edge', ...params });
  return page;
}

test.describe('room server', () => {
  test('the server places the owl and the HUD shows the park count', async ({ browser }) => {
    const a = await visitor(browser);
    const s = await state(a);
    expect(s.room).toBe('hub');
    expect(s.pos.y).toBeGreaterThan(560); // scattered onto the walkable floor
    await expect(a.getByText('1 owl here')).toBeVisible();
    await a.context().close();
  });

  test('two visitors in separate contexts see each other appear, walk, and leave', async ({ browser }) => {
    const a = await visitor(browser, { look: '#8B5A2B,#F6F1E3,#C9A227' });
    const b = await visitor(browser, { look: '#2F3E5C,#E0D4F0,#00E5FF' });
    await expect.poll(async () => (await state(a)).peers.length, { timeout: 15_000 }).toBe(1);
    await expect.poll(async () => (await state(b)).peers.length, { timeout: 15_000 }).toBe(1);
    expect((await state(b)).peers[0]!.look.body).toBe('#8B5A2B');
    await expect(a.getByText('2 owls here')).toBeVisible();

    const target = { x: 600, y: 760 };
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
    const key = start.x < 800 ? 'KeyD' : 'KeyA'; // toward the middle, so there is floor to walk on
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
    const target = { x: start.x < 800 ? 1400 : 200, y: 800 }; // a long walk, several seconds
    await a.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), target);
    await a.waitForTimeout(300);
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

  test('the server clamps a walk that leaves the walkable area', async ({ browser }) => {
    const a = await visitor(browser);
    await a.evaluate(() => window.owlPark.walkTo(800, 50));
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

  test('closing the tab removes the owl for everyone else', async ({ browser }) => {
    const a = await visitor(browser);
    const b = await visitor(browser);
    await expect.poll(async () => (await state(b)).peers.length, { timeout: 15_000 }).toBe(1);
    await a.context().close();
    await expect.poll(async () => (await state(b)).peers.length, { timeout: 15_000 }).toBe(0);
    await b.context().close();
  });
});
