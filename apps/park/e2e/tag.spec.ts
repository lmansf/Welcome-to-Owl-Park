import { type Browser, devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { FROM_STUMP_AT, STUMP_ROOM } from '../../../packages/shared/src/party/ids';
import { PARTY_WORDS } from '../../../packages/shared/src/party/words';
import { TAG_REACH, TAG_RING, TAG_ROOM, TAG_SLACK, TAG_STANDIN, TAG_STANDIN_HOLD_MS, TAG_WORDS } from '../../../packages/shared/src/party/tag';
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

/** This page's own owl's id in the game, as the page has it (the room's id for it), and in the game. */
async function selfIn(page: Page): Promise<string> {
  const t = await tagOf(page);
  expect(t?.self).toBeTruthy();
  expect(t?.players, `the page's own owl ${t?.self} in the game; heard ${JSON.stringify(t?.heard)}`).toContain(t!.self);
  expect(t!.self).not.toBe(TAG_STANDIN);
  return t!.self;
}

/**
 * Press Join on this page the moment its button offers it, in the page itself. The call lasts
 * TAG_CALL_MS (10 s); on a busy runner a round trip from the test can take seconds, so a press sent
 * from the test after it sees the call can land once the call has closed, with Pip in the seat.
 * Resolves with the game's phase as the page had it when Join was pressed, or 'missed'.
 */
function joinWhenCalled(page: Page): Promise<string> {
  return page.evaluate(
    ({ join, waitMs }) =>
      new Promise<string>((done) => {
        const until = Date.now() + waitMs;
        const look = () => {
          const b = document.querySelector<HTMLButtonElement>('#hud .tag-btn[data-tag="join"]');
          if (b && b.offsetParent !== null && (b.textContent ?? '').includes(join)) {
            const phase = window.owlPark.state()?.tag?.phase ?? 'none';
            b.click();
            return done(phase);
          }
          if (Date.now() > until) return done('missed');
          requestAnimationFrame(look);
        };
        look();
      }),
    { join: TAG_WORDS.join, waitMs: 30_000 },
  );
}

/** How a page's own play of the round's pass came out (playPass): its walks up to the other owl, and why it stopped. */
type PassPlayed = { walks: number; end: string };

/**
 * The round's pass, played by a page itself, frame by frame, the way joinWhenCalled presses Join. The
 * round lasts TAG_ROUND_MS (30 s) by the room's clock, and touching owls hand the feather straight back
 * once TAG_BACK_MS (2 s) is up. On a busy runner a round trip from the test takes seconds: a walk
 * steered from the test steps off too late, the feather goes back, and the round runs out over the retry.
 *  - 'give', on the page of the owl that starts with the feather: while its owl holds it, the owl walks
 *    up to the other, just within reach; the moment the feather is the other owl's, it walks back off,
 *    out of reach; and up again if the feather came back. Resolves 'over' once the round has ended.
 *  - 'keep', on the other owl's page: resolves 'apart' once its owl holds the feather and the page draws
 *    the giver out of reach, so nothing hands it back; 'over' if the round ended first.
 * 'timeout' if neither came; 'lost: …' if the page went.
 */
function playPass(page: Page, role: 'give' | 'keep'): Promise<PassPlayed> {
  return page
    .evaluate(
      ({ give, near, off, reach, waitMs }) =>
        new Promise<PassPlayed>((done) => {
          const until = Date.now() + waitMs;
          let walks = 0;
          let aim = 0;
          const look = () => {
            const s = window.owlPark.state();
            const t = s?.tag;
            if (s && t) {
              if (t.phase !== 'live') return done({ walks, end: 'over' });
              const peer = s.peers.find((o) => o.id !== t.self && t.players.includes(o.id));
              const mine = t.holder === t.self;
              if (peer && give) {
                // Just within reach while this owl holds the feather; out of reach once it is handed on.
                const want = mine ? near : off;
                if (aim !== want) {
                  aim = want;
                  if (mine) walks += 1;
                  window.owlPark.walkTo(peer.pos.x - want, peer.pos.y);
                }
              } else if (peer && mine && Math.hypot(peer.pos.x - s.pos.x, peer.pos.y - s.pos.y) > reach) return done({ walks, end: 'apart' });
            }
            if (Date.now() > until) return done({ walks, end: 'timeout' });
            requestAnimationFrame(look);
          };
          look();
        }),
      { give: role === 'give', near: TAG_REACH - 20, off: TAG_REACH + TAG_SLACK + 60, reach: TAG_REACH + TAG_SLACK, waitMs: 45_000 },
    )
    .catch((e: unknown) => ({ walks: 0, end: `lost: ${e instanceof Error ? e.message : String(e)}` }));
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

    // Start, from wherever the owl stands: the call goes out to the whole hollow, and the other owl's
    // button offers Join during it. Pressed there as soon as it does (joinWhenCalled).
    await expect(tagButton(phone)).toHaveText(TAG_WORDS.start);
    const joined = joinWhenCalled(phone);
    await tagButton(computer).click();
    expect(await joined).toBe('call');
    for (const page of [computer, phone]) {
      await expect
        .poll(async () => {
          const t = await tagOf(page);
          return { players: t?.players.length, pip: t?.players.includes(TAG_STANDIN) };
        }, { timeout: 20_000 })
        .toEqual({ players: 2, pip: false });
    }
    await expect(tagButton(phone)).toBeHidden();
    const cid = await selfIn(computer);
    const pid = await selfIn(phone);
    expect(cid).not.toBe(pid);

    // The pictures of the game on both screens, taken here in the call and not in the round: a slow
    // runner takes ten seconds and more over the two, and the round's thirty are for the play below.
    await Promise.all([computer.screenshot({ path: 'e2e-screenshots/tag-computer.png' }), phone.screenshot({ path: 'e2e-screenshots/tag-phone.png' })]);

    // The call closes, the countdown runs, and the owl that started it holds the feather: each page has
    // the round on and its line says so. Read together on a page, and the two pages at once.
    const roundOn = async (page: Page) => {
      const t = await tagOf(page);
      return { phase: t?.phase, holder: t?.holder, say: t?.line.split(' · ')[0] };
    };
    await Promise.all([
      expect.poll(() => roundOn(computer), { timeout: 20_000 }).toEqual({ phase: 'live', holder: cid, say: TAG_WORDS.youHave }),
      expect.poll(() => roundOn(phone), { timeout: 20_000 }).toEqual({ phase: 'live', holder: cid, say: TAG_WORDS.theyHave }),
    ]);

    // The holder walks up to the other owl, just within reach: the feather passes, and the score counts
    // it. Then it walks back off, out of reach, before the feather can be handed back. The two pages play
    // that themselves (playPass), and the owl with the feather leaves only once its own page has it and
    // sees the other owl out of reach.
    const giving = playPass(computer, 'give');
    const kept = await playPass(phone, 'keep');
    try {
      expect(kept.end, 'the other owl holds the feather, out of reach of the one that gave it').toBe('apart');
    } catch (e) {
      // Where each page saw the owls, and what the room sent each, to say why.
      for (const [name, page] of [['computer', computer], ['phone', phone]] as const) {
        const s = await state(page);
        console.log(`tag ${name}:`, JSON.stringify({ pos: s.pos, peers: s.peers.map((o) => ({ id: o.id, pos: o.pos })), heard: s.tag?.heard }));
      }
      throw e;
    }
    // The owl with the feather leaves while the round is still on: a round that ran out first ends by its
    // time, which is the other test's ending, not this one.
    expect((await tagOf(computer))?.phase, 'the round still on when the owl with the feather leaves').toBe('live');
    // It closes its tab the way a player does, so its page says goodbye and the room has it out at once
    // (a page that went without one is out only once TAG_GRACE_MS is up, by when the round may be over).
    await phone.close({ runBeforeUnload: true });
    expect((await tagOf(computer))!.passesAsked).toBeGreaterThanOrEqual(1);
    // The game ends, with no prizes.
    try {
      // Read together, and all of it, so a miss shows who the page still counts in the game.
      await expect
        .poll(
          async () => {
            const t = await tagOf(computer);
            return { phase: t?.phase, line: t?.line, players: t?.players, holder: t?.holder, self: t?.self };
          },
          // A goodbye ends it at once; a page that went without one is out once TAG_GRACE_MS is up.
          { timeout: 20_000 },
        )
        .toEqual({ phase: 'over', line: TAG_WORDS.holderLeft, players: [cid], holder: null, self: cid });
    } catch (e) {
      // What the room sent the page, to say why.
      console.log('tag heard:', JSON.stringify((await tagOf(computer))?.heard));
      throw e;
    }
    const end = (await tagOf(computer))!;
    // Two owls held it, so the score is the passes times two: one pass, or more if the feather went back
    // and forth before the owls were apart.
    expect(end.score).toBeGreaterThanOrEqual(2);
    expect(end.score % 2).toBe(0);
    expect(end.prize).toBeNull();
    // The giver's page played until the round was over, and walked up at least once.
    const gave = await giving;
    expect(gave.end).toBe('over');
    expect(gave.walks).toBeGreaterThanOrEqual(1);
    await phone.context().close();
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
    // Pip gives it back by itself after a short wait, unless the round runs out first (the line says the
    // seconds left): on a busy runner the chase can take most of the round.
    const left = Number(/· (\d+)s ·/.exec((await tagOf(page))!.line)?.[1] ?? 0);
    if (left * 1000 > TAG_STANDIN_HOLD_MS + 1500) await expect.poll(async () => (await tagOf(page))?.holder, { timeout: 8_000 }).toBe(me);

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
