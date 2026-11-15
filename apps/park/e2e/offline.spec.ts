import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { alongTheHall, CABINET } from './arcadePlay';
import { doAction, state, walkToJetty } from './helpers';

/** The one line the park says (src/game/roomDown.ts), as a visitor reads it. */
const ROOM_DOWN = 'That needs the park, and it could not connect just now. Try again in a moment.';

const isEdge = () => test.info().project.name === 'edge';

/**
 * The park as a page sees it when the room server's socket closes as it opens (OP-406, OP-407): a press of
 * something that needs the room server says why nothing happened, at once, instead of nothing at all.
 */
async function offlineIn(page: Page, room: string): Promise<void> {
  await page.routeWebSocket(/\/ws\//, (ws) => ws.close());
  const q = new URLSearchParams({ transport: 'edge', room, kit: '0', art: 'old' });
  await page.goto(`/?${q.toString()}`);
  await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
  await expect(page.locator('[data-dot][data-status]')).toHaveAttribute('data-status', 'offline', { timeout: 20_000 });
}

test.describe('when the park cannot connect (OP-406, OP-407)', () => {
  test.beforeEach(() => {
    test.skip(!isEdge(), 'a room server whose socket closes as it opens');
  });

  test('Cast a line at the jetty says the park could not connect', async ({ page }) => {
    await offlineIn(page, 'grove');
    await walkToJetty(page);
    await doAction(page, 'act:cast');
    // Well inside the six seconds a reply is waited for while the room is up.
    await expect(page.getByText(ROOM_DOWN)).toBeVisible({ timeout: 3_000 });
    expect((await state(page)).play?.line ?? null).toBeNull();
  });

  test("a cabinet's Play says the park could not connect", async ({ page }) => {
    await offlineIn(page, 'arcade');
    await alongTheHall(page, CABINET.flight.x, CABINET.flight.y);
    await doAction(page, 'cabinet-flight');
    await expect(page.getByText(ROOM_DOWN)).toBeVisible({ timeout: 3_000 });
    await expect(page.locator('.arcade [data-howto]')).toHaveCount(0);
  });

  test('Talk to a quest owl says the park could not connect', async ({ page }) => {
    await offlineIn(page, 'hub');
    const bramble = (await state(page)).npcs.find((n) => n.id === 'bramble')!;
    await page.evaluate(({ x, y }) => window.owlPark.walkTo(x + 70, y + 40), bramble);
    await doAction(page, 'npc:bramble');
    await expect(page.getByText(ROOM_DOWN)).toBeVisible({ timeout: 3_000 });
  });
});
