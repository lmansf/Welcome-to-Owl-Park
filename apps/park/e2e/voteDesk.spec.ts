import { type APIRequestContext, type Browser, devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { E2E_ADMIN_KEY, openPark, state } from './helpers';

/**
 * The vote desk in the Great Hollow (OP-288), behind `?desk=1` (src/flags.ts), on the room server:
 * it shows each realm's share of this month's Realm Vote in whole percents (never a count), as the
 * park's own /api/vote/shares says, and it moves on every page in the hall, on a computer and on a
 * phone, a moment after any owl votes. Its rules (where it stands, its words) are in
 * src/game/voteDesk.test.ts; the room server's side is apps/edge/test/voteDesk.test.ts.
 */

type Shares = { month: string; shares: Record<string, number> };

const HALL = { transport: 'edge', room: 'm3-hall', newmap: '1', spawn: 'default' };

async function hallPage(browser: Browser, phone: boolean): Promise<Page> {
  const ctx = await browser.newContext(phone ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await openPark(page, { ...HALL, desk: '1' });
  return page;
}

/** An owl let in by a Day Ticket the park gives away, voting for `realm` straight through the park's own routes. */
async function voteAsTicketHolder(request: APIRequestContext, realm: string): Promise<void> {
  const issued = await request.post('/api/admin/tickets', {
    headers: { 'X-Admin-Key': E2E_ADMIN_KEY },
    data: { kind: 'day', quantity: 1 },
  });
  expect(issued.status()).toBe(200);
  const secret = ((await issued.json()) as { link: string }).link.split('#claim=')[1] ?? '';
  const guest = ((await (await request.get('/api/pass')).json()) as { pass: string }).pass;
  expect((await request.post('/api/tickets/claim', { data: { secret }, headers: { Authorization: `Bearer ${guest}` } })).status()).toBe(
    200,
  );
  const scanned = await request.post('/api/tickets/scan', { data: {}, headers: { Authorization: `Bearer ${guest}` } });
  expect(scanned.status()).toBe(200);
  const admitted = ((await scanned.json()) as { pass: string }).pass;
  const vote = await request.post('/api/vote', { data: { realm }, headers: { Authorization: `Bearer ${admitted}` } });
  expect(vote.status()).toBe(200);
  expect(await vote.json()).toMatchObject({ ok: true });
}

const deskOf = async (page: Page) => (await state(page)).desk;

test.describe('the vote desk in the Great Hollow (OP-288, behind ?desk=1)', () => {
  test('a plain address has no desk', async ({ page }) => {
    await openPark(page, HALL);
    expect((await state(page)).desk).toBeNull();
  });

  test('it shows the park’s shares in percents, and moves on a computer and a phone a moment after an owl votes', async ({
    browser,
    request,
  }) => {
    test.slow(); // two parks open, a ticket issued, claimed and scanned, and a vote
    const computer = await hallPage(browser, false);
    const phone = await hallPage(browser, true);

    // First look: what the park says now, which may be nobody yet this month, or earlier tests' votes.
    const before = (await (await request.get('/api/vote/shares')).json()) as Shares;
    for (const page of [computer, phone]) {
      await expect
        .poll(async () => (await deskOf(page))?.lines, { timeout: 10_000 })
        .toEqual(expect.arrayContaining([expect.stringMatching(Object.keys(before.shares).length ? /%$/ : /^No votes yet/)]));
      expect((await deskOf(page))?.at).toEqual({ x: expect.any(Number), y: expect.any(Number) });
    }

    // An owl with a ticket votes for the glass street; both pages in the hall see the desk move.
    await voteAsTicketHolder(request, 'glass');
    const after = (await (await request.get('/api/vote/shares')).json()) as Shares;
    expect(Object.values(after.shares).reduce((a, b) => a + b, 0)).toBe(100);
    expect(after.shares.glass).toBeGreaterThan(0);
    for (const page of [computer, phone]) {
      await expect.poll(async () => (await deskOf(page))?.shares, { timeout: 3_000 }).toEqual(after.shares);
      const lines = (await deskOf(page))!.lines;
      expect(lines.filter((l) => l.endsWith('%'))).toHaveLength(3);
      // Percentages only: no line carries a bare number of votes.
      expect(lines.join(' ')).not.toMatch(/\d+\s*(votes?|owls?)\b/i);
    }
    await computer.screenshot({ path: 'e2e-screenshots/vote-desk-computer.png' });
    await phone.screenshot({ path: 'e2e-screenshots/vote-desk-phone.png' });
    await computer.context().close();
    await phone.context().close();
  });
});
