import { type Browser, devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { FROM_STUMP_AT, STUMP_ROOM } from '../../../packages/shared/src/party/ids';
import { PARTY_WORDS } from '../../../packages/shared/src/party/words';
import { TAG_RING, TAG_ROOM, TAG_WORDS } from '../../../packages/shared/src/party/tag';
import { doAction, openPark, state, walkAndStop } from './helpers';

/**
 * Feather tag across the Great Hollow (OP-434), on the room server: an owl anywhere in the hollow presses
 * Start feather tag, another presses Join during the call, the starter holds the feather once the
 * countdown is over, and walking into the other owl passes it, both pages seeing it. The owl holding the
 * feather leaving ends the game with no prizes. Alone, Pip joins and the round pays the low tier. Its
 * rules are packages/shared/src/party/tag.test.ts; the room's side is apps/edge/test/featherTag.test.ts;
 * the prizes, packages/shared/src/tagPrize.test.ts.
 */
const HOLLOW = { transport: 'edge', room: TAG_ROOM, spawn: 'default' };
/** Two spots near the feather station, further apart than a touch. */
const SPOT_A = { x: TAG_RING.x - 80, y: TAG_RING.y - 5 };
const SPOT_B = { x: TAG_RING.x + 80, y: TAG_RING.y + 5 };

async function hollowPage(browser: Browser, phone: boolean): Promise<Page> {
  const ctx = await browser.newContext(phone ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await openPark(page, HOLLOW);
  return page;
}

const tagOf = async (page: Page) => (await state(page)).tag;
const tagButton = (page: Page) => page.locator('#hud .tag-btn[data-tag="join"]');

/** A spot kept well inside Pip's run round the station, so a run at where Pip is going stays near it. */
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

test.describe('feather tag across the Great Hollow (OP-434)', () => {
  test('a plain address has the game and its Start button, on for every visitor', async ({ page }) => {
    await openPark(page, HOLLOW);
    await expect.poll(async () => (await tagOf(page))?.server).toBe(true);
    await expect(tagButton(page)).toHaveText(TAG_WORDS.start);
  });

  test('one owl starts from the button, another joins the call, a touch passes the feather, and the holder leaving ends it with no prizes', async ({ browser }) => {
    test.slow(); // two parks open, a call, a countdown and a walk across the floor
    const computer = await hollowPage(browser, false);
    const phone = await hollowPage(browser, true);
    for (const page of [computer, phone]) await expect.poll(async () => (await tagOf(page))?.server).toBe(true);
    await Promise.all([walkAndStop(computer, SPOT_A.x, SPOT_A.y), walkAndStop(phone, SPOT_B.x, SPOT_B.y)]);

    // Start, from wherever the owl stands: the call goes out to the whole hollow.
    await tagButton(computer).click();
    await expect.poll(async () => (await tagOf(phone))?.phase).toBe('call');
    await expect(tagButton(phone)).toContainText(TAG_WORDS.join);
    await tagButton(phone).click();
    for (const page of [computer, phone]) await expect.poll(async () => (await tagOf(page))?.players.length).toBe(2);
    await expect(tagButton(phone)).toBeHidden();
    const cid = await selfIn(computer);
    const pid = await selfIn(phone);
    expect(cid).not.toBe(pid);

    // The call closes, the countdown runs, and the owl that started it holds the feather.
    await expect.poll(async () => (await tagOf(computer))?.phase, { timeout: 20_000 }).toBe('live');
    expect((await tagOf(computer))!.holder).toBe(cid);
    await expect.poll(async () => (await tagOf(phone))?.holder).toBe(cid);
    await expect.poll(async () => (await tagOf(computer))?.line).toMatch(/You have the feather/);
    await expect.poll(async () => (await tagOf(phone))?.line).toMatch(/Run!/);
    await computer.screenshot({ path: 'e2e-screenshots/tag-computer.png' });
    await phone.screenshot({ path: 'e2e-screenshots/tag-phone.png' });

    // The holder walks into the other owl: the feather passes, and the score counts it.
    const there = (await state(phone)).pos;
    await computer.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), there);
    await expect.poll(async () => (await tagOf(computer))?.holder, { timeout: 10_000 }).toBe(pid);
    // The owl with the feather leaves the hollow at once: still touching, it would hand the feather
    // straight back once TAG_BACK_MS is up, and then it would not be the holder leaving.
    await phone.context().close();
    expect((await tagOf(computer))!.passesAsked).toBeGreaterThanOrEqual(1);
    // The game ends at once, with no prizes.
    await expect.poll(async () => (await tagOf(computer))?.phase, { timeout: 10_000 }).toBe('over');
    await expect.poll(async () => (await tagOf(computer))?.line).toBe(TAG_WORDS.holderLeft);
    const end = (await tagOf(computer))!;
    expect(end.score).toBe(2);
    expect(end.prize).toBeNull();
    await computer.context().close();
  });
});

test.describe('never a one-owl game: Pip stands in (OP-426, OP-434)', () => {
  test('a lone owl starts a game, Pip joins when the call closes, a ten year old’s owl catches Pip, and the round pays', async ({ browser }) => {
    test.slow(); // a call, a chase round the station and a 30 second round played out
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await openPark(page, HOLLOW);
    await expect.poll(async () => (await tagOf(page))?.server).toBe(true);
    // East of the middle: Pip's run starts at the east end and, by the end of the countdown, is round at the west end.
    await walkAndStop(page, SPOT_B.x, SPOT_B.y);
    await tagButton(page).click();
    await expect.poll(async () => (await tagOf(page))?.players.length).toBe(1);
    const me = (await tagOf(page))!.players[0]!;
    await expect.poll(async () => (await tagOf(page))?.players, { timeout: 15_000 }).toEqual([me, 'npc:pip']);
    expect((await tagOf(page))?.holder).toBe(me);
    await expect(page.getByText(TAG_WORDS.standIn)).toBeVisible();
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

    // Time: a pass to Pip scored, so the room pays this owl's tier (the low tier, feathers).
    await expect.poll(async () => (await tagOf(page))?.phase, { timeout: 40_000 }).toBe('over');
    await expect.poll(async () => (await tagOf(page))?.prize?.tier, { timeout: 10_000 }).toBe('low');
    await ctx.close();
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
