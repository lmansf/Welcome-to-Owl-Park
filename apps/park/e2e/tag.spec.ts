import { type Browser, devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openPark, state, walkAndStop } from './helpers';

/**
 * Feather tag in the Party Grove (OP-403, D5), behind `?tag=1` (src/flags.ts), on the room server: a
 * computer and a phone walk into the tag ring and are in the game; after the countdown one holds the
 * feather, and walking into the other passes it, both pages seeing it; walking out of the ring is out of
 * the game. Its rules are packages/shared/src/party/tag.test.ts; the room's side is
 * apps/edge/test/featherTag.test.ts.
 */
const GROVE = { transport: 'edge', room: 'hub', spawn: 'default' };
/** Two spots in the ring, further apart than a touch. */
const SPOT_A = { x: 3870, y: 1080 };
const SPOT_B = { x: 4030, y: 1090 };

async function grovePage(browser: Browser, phone: boolean): Promise<Page> {
  const ctx = await browser.newContext(phone ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await openPark(page, { ...GROVE, tag: '1' });
  return page;
}

const tagOf = async (page: Page) => (await state(page)).tag;

/** This page's own owl's id: the one in the game that is not one of the others it sees. */
async function selfIn(page: Page): Promise<string> {
  const s = await state(page);
  const others = new Set(s.peers.map((p) => p.id));
  const mine = s.tag?.players.filter((id) => !others.has(id)) ?? [];
  expect(mine).toHaveLength(1);
  return mine[0]!;
}

test.describe('feather tag in the Party Grove (OP-403, behind ?tag=1)', () => {
  test('a plain address has no game, and its ring is not drawn', async ({ page }) => {
    await openPark(page, GROVE);
    expect((await state(page)).tag).toBeNull();
  });

  test('two owls walk into the ring, and a touch passes the feather on a computer and a phone', async ({ browser }) => {
    test.slow(); // two parks open, two walks across the grove and a countdown
    const computer = await grovePage(browser, false);
    const phone = await grovePage(browser, true);
    for (const page of [computer, phone]) await expect.poll(async () => (await tagOf(page))?.server).toBe(true);

    // Outside the ring: not in the game.
    expect((await tagOf(computer))?.inRing).toBe(false);
    await walkAndStop(computer, SPOT_A.x, SPOT_A.y);
    await walkAndStop(phone, SPOT_B.x, SPOT_B.y);
    for (const page of [computer, phone]) {
      await expect.poll(async () => (await tagOf(page))?.players.length, { timeout: 10_000 }).toBe(2);
      expect((await tagOf(page))?.inRing).toBe(true);
    }
    const cid = await selfIn(computer);
    const pid = await selfIn(phone);
    expect(cid).not.toBe(pid);

    // The countdown, then the round, the same holder on both pages.
    await expect.poll(async () => (await tagOf(computer))?.phase, { timeout: 10_000 }).toBe('live');
    const holder = (await tagOf(computer))!.holder!;
    expect([cid, pid]).toContain(holder);
    await expect.poll(async () => (await tagOf(phone))?.holder).toBe(holder);
    const [it, other] = holder === cid ? [computer, phone] : [phone, computer];
    const otherId = holder === cid ? pid : cid;
    await expect.poll(async () => (await tagOf(it))?.line).toMatch(/You have the feather/);
    await expect.poll(async () => (await tagOf(other))?.line).toMatch(/Run!/);
    await computer.screenshot({ path: 'e2e-screenshots/tag-computer.png' });
    await phone.screenshot({ path: 'e2e-screenshots/tag-phone.png' });

    // The holder walks into the other owl: the feather passes, on both pages.
    const there = (await state(other)).pos;
    await it.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), there);
    for (const page of [computer, phone]) await expect.poll(async () => (await tagOf(page))?.holder, { timeout: 10_000 }).toBe(otherId);
    expect((await tagOf(it))!.passesAsked).toBeGreaterThanOrEqual(1);
    await expect.poll(async () => (await tagOf(other))?.line).toMatch(/You have the feather/);

    // Walking out of the ring is out of the game: the round stops with one owl left in.
    await walkAndStop(it, 3400, 900);
    for (const page of [computer, phone]) await expect.poll(async () => (await tagOf(page))?.players, { timeout: 10_000 }).toEqual([otherId]);
    await expect.poll(async () => (await tagOf(other))?.phase).toBe('waiting');
    await expect.poll(async () => (await tagOf(other))?.line).toMatch(/Waiting for one more owl/);
    await computer.context().close();
    await phone.context().close();
  });
});
