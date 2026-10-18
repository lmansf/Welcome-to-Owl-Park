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
    await expect(a.getByRole('button', { name: 'Vote for this realm' })).toBeVisible({ timeout: 15_000 });
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

  test('collectibles live on the server: a find is checked, kept and listed', async ({ browser, request }) => {
    const a = await visitor(browser);
    await expect.poll(async () => (await a.evaluate(() => window.owlPark.drops())).length, { timeout: 15_000 }).toBeGreaterThan(0);
    const d = (await a.evaluate(() => window.owlPark.drops()))[0]!;
    if ((await state(a)).room !== d.room) {
      // Same browser, same collector token: the same window's drops wait in the other room.
      await openPark(a, { transport: 'edge', room: d.room });
      await expect.poll(async () => (await a.evaluate(() => window.owlPark.drops())).some((x) => x.n === d.n), { timeout: 15_000 }).toBe(true);
    }
    expect(await a.evaluate((n) => window.owlPark.pickup(n), d.n)).toBe(true);
    await expect(a.getByText(/^Found/)).toBeVisible({ timeout: 20_000 });

    // The API agrees, for this collector only.
    const inv = await a.evaluate(async () => {
      const token = localStorage.getItem('owl-park:collector') ?? '';
      const { pass } = (await (await fetch('/api/pass', { headers: { 'X-Collector': token } })).json()) as { pass: string };
      const auth = { Authorization: `Bearer ${pass}` };
      const inventory = (await (await fetch('/api/collection', { headers: auth })).json()) as { owned: string[]; feathers: number };
      const craft = (await (await fetch('/api/collection/craft', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ variant: 'crown~0' }) })).json()) as { ok: boolean; reason?: string };
      return { inventory, craft };
    });
    expect(inv.inventory.owned.length).toBeGreaterThanOrEqual(3);
    expect(inv.craft).toMatchObject({ ok: false, reason: 'feathers' });
    expect((await request.get('/api/collection')).status()).toBe(401);
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
