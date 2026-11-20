import { type Browser, devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { FROM_STUMP_AT, STUMP_ROOM } from '../../../packages/shared/src/party/ids';
import { PARTY_WORDS } from '../../../packages/shared/src/party/words';
import { TAG_RING, TAG_ROOM } from '../../../packages/shared/src/party/tag';
import { doAction, openPark, state, walkAndStop } from './helpers';

/**
 * Feather tag in the Great Hollow (OP-403, D5; the Party Grove's until Nov 19), on for every visitor since Nov 20, on the room server: a
 * computer and a phone walk into the tag ring and are in the game; after the countdown one holds the
 * feather, and walking into the other passes it, both pages seeing it; walking out of the ring is out of
 * the game. Its rules are packages/shared/src/party/tag.test.ts; the room's side is
 * apps/edge/test/featherTag.test.ts.
 */
const HOLLOW = { transport: 'edge', room: TAG_ROOM, spawn: 'default' };
/** Two spots in the ring, further apart than a touch. */
const SPOT_A = { x: TAG_RING.x - 80, y: TAG_RING.y - 5 };
const SPOT_B = { x: TAG_RING.x + 80, y: TAG_RING.y + 5 };
/** Out on the floor west of the ring, between it and where owls land. */
const OUTSIDE = { x: TAG_RING.x - TAG_RING.rx - 200, y: TAG_RING.y };

async function hollowPage(browser: Browser, phone: boolean): Promise<Page> {
  const ctx = await browser.newContext(phone ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await openPark(page, HOLLOW);
  return page;
}

const tagOf = async (page: Page) => (await state(page)).tag;

/**
 * A spot kept well inside the ring: running at where Pip is going can aim past the ring's top or bottom
 * (Pip's path comes within 35 px of them), and an owl that walks out of the ring is out of the game, and
 * Pip, with nobody left, goes home (failing on main from Nov 20).
 */
function inside(p: { x: number; y: number }): { x: number; y: number } {
  const dx = (p.x - TAG_RING.x) / TAG_RING.rx;
  const dy = (p.y - TAG_RING.y) / TAG_RING.ry;
  const k = Math.hypot(dx, dy) / 0.8;
  return k <= 1 ? p : { x: TAG_RING.x + (p.x - TAG_RING.x) / k, y: TAG_RING.y + (p.y - TAG_RING.y) / k };
}

/** This page's own owl's id: the one in the game that is not one of the others it sees. */
async function selfIn(page: Page): Promise<string> {
  const s = await state(page);
  const others = new Set(s.peers.map((p) => p.id));
  const mine = s.tag?.players.filter((id) => !others.has(id)) ?? [];
  expect(mine).toHaveLength(1);
  return mine[0]!;
}

test.describe('feather tag in the Great Hollow (OP-403)', () => {
  test('a plain address has the game, on for every visitor', async ({ page }) => {
    await openPark(page, HOLLOW);
    await expect.poll(async () => (await state(page)).tag).not.toBeNull();
  });

  test('two owls walk into the ring, and a touch passes the feather on a computer and a phone', async ({ browser }) => {
    test.slow(); // two parks open, two walks across the hollow and a countdown
    const computer = await hollowPage(browser, false);
    const phone = await hollowPage(browser, true);
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
    await walkAndStop(it, OUTSIDE.x, OUTSIDE.y);
    for (const page of [computer, phone]) await expect.poll(async () => (await tagOf(page))?.players, { timeout: 10_000 }).toEqual([otherId]);
    await expect.poll(async () => (await tagOf(other))?.phase).toBe('waiting');
    await expect.poll(async () => (await tagOf(other))?.line).toMatch(/Waiting for one more owl/);
    await computer.context().close();
    await phone.context().close();
  });
});

test.describe('never a one-owl game: Pip stands in (OP-426)', () => {
  test('alone in the ring, Pip joins within a few seconds; a ten year old’s owl catches Pip, gets the feather back, and a second owl sends Pip home after the round', async ({ browser }) => {
    test.slow(); // a wait alone, a chase round the ring, a round played out and the next begun
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await openPark(page, HOLLOW);
    await expect.poll(async () => (await tagOf(page))?.server).toBe(true);
    // East of the middle: Pip's round starts at the ring's east end and, by the end of the countdown, is
    // round at the west end, within a touch of SPOT_A (a pass to Pip before the test can see who holds it).
    await walkAndStop(page, SPOT_B.x, SPOT_B.y);
    await expect.poll(async () => (await tagOf(page))?.players.length, { timeout: 10_000 }).toBe(1);
    const me = (await tagOf(page))!.players[0]!;
    // Pip steps in after about five seconds alone, and a round starts with this owl holding the feather.
    await expect.poll(async () => (await tagOf(page))?.players, { timeout: 12_000 }).toEqual([me, 'npc:pip']);
    // Who starts with the feather, read as soon as Pip is in: once the round is live, Pip coming back round
    // the ring past this owl can take it (a touch passes it either way), and a slow page, reading it only
    // after it saw the round go live, saw Pip holding it (twice running on Nov 20).
    expect((await tagOf(page))?.holder).toBe(me);
    await expect(page.getByText('Pip the lantern keeper is joining you!')).toBeVisible();
    expect((await tagOf(page))?.standIn).not.toBeNull();
    await expect.poll(async () => (await tagOf(page))?.phase, { timeout: 10_000 }).toBe('live');
    await page.screenshot({ path: 'e2e-screenshots/tag-standin.png' });

    // The chase, as a child plays it: run at where Pip is going, a few times at most, until the feather is Pip's.
    let tries = 0;
    for (; tries < 8 && (await tagOf(page))?.holder !== 'npc:pip'; tries++) {
      const a = (await tagOf(page))!.standIn!;
      await page.waitForTimeout(200);
      const b = (await tagOf(page))!.standIn!;
      const lead = 3; // a little over half a second ahead
      await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), inside({ x: b.x + (b.x - a.x) * lead, y: b.y + (b.y - a.y) * lead }));
      await page.waitForTimeout(700);
    }
    await expect.poll(async () => (await tagOf(page))?.holder, { timeout: 5_000 }).toBe('npc:pip');
    expect(tries).toBeLessThanOrEqual(6);
    await expect.poll(async () => (await tagOf(page))?.line).toMatch(/Pip has it/);
    // Pip gives it back by itself after a short wait.
    await expect.poll(async () => (await tagOf(page))?.holder, { timeout: 8_000 }).toBe(me);

    // A second owl steps in: Pip plays out the round, then goes home.
    const phone = await hollowPage(browser, true);
    await expect.poll(async () => (await tagOf(phone))?.server).toBe(true);
    await walkAndStop(phone, SPOT_A.x, SPOT_A.y);
    await expect.poll(async () => (await tagOf(page))?.players.length, { timeout: 10_000 }).toBe(3);
    await expect.poll(async () => (await tagOf(page))?.players.includes('npc:pip'), { timeout: 60_000 }).toBe(false);
    expect((await tagOf(page))?.players).toHaveLength(2);
    expect((await tagOf(page))?.standIn).toBeNull();
    await ctx.close();
    await phone.context().close();
  });

  test('alone at the Old Stump, Pip offers to play after a few seconds, and Start takes this owl into a game with Pip', async ({ page }) => {
    await openPark(page, { transport: 'edge', room: STUMP_ROOM, spawn: 'default' });
    await walkAndStop(page, FROM_STUMP_AT.x, FROM_STUMP_AT.y);
    await expect.poll(async () => (await state(page)).actions, { timeout: 10_000 }).toContain('party:sit');
    await doAction(page, 'party:sit');
    const card = page.locator('#hud .stump-card');
    await expect(card.locator('[data-line]')).toHaveText(PARTY_WORDS.waitMore);
    await expect(card.locator('[data-start]')).toBeDisabled();
    // No friend came: Pip offers to play, and one press starts the game.
    await expect(card.locator('[data-line]')).toHaveText(PARTY_WORDS.standIn, { timeout: 10_000 });
    await page.screenshot({ path: 'e2e-screenshots/stump-standin.png' });
    await card.locator('[data-start]').click();
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toMatch(/^party-/);
  });

  test('alone at the Old Stump, Fill seats with park owls waits for Pip, then fills every seat', async ({ page }) => {
    await openPark(page, { transport: 'edge', room: STUMP_ROOM, spawn: 'default' });
    await walkAndStop(page, FROM_STUMP_AT.x, FROM_STUMP_AT.y);
    await expect.poll(async () => (await state(page)).actions, { timeout: 10_000 }).toContain('party:sit');
    await doAction(page, 'party:sit');
    const card = page.locator('#hud .stump-card');
    await expect(card.locator('[data-fill]')).toBeDisabled();
    await expect(card.locator('[data-line]')).toHaveText(PARTY_WORDS.standIn, { timeout: 10_000 });
    await card.locator('[data-fill]').click();
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toMatch(/^party-/);
  });
});
