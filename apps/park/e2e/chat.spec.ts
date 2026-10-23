import { expect, test, type Locator, type Page } from '@playwright/test';
import { openPark, state } from './helpers';

/**
 * Prewritten chat (C44): Say in the Menu (T on a keyboard), a wheel of six groups of four phrases;
 * the phrase shows in a bubble over the owl for everyone in the room. These run on the local
 * transport, tab to tab; the room server's side is in edge.spec.ts.
 */

/** The phrases in bubbles on this page right now: whose, and which. */
const bubbles = async (page: Page) => (await state(page)).bubbles;

/** Say from the Menu, as on a phone. */
async function openSay(page: Page): Promise<Locator> {
  await page.locator('[data-menu-btn]').click();
  await page.locator('[data-screen="say"]').click();
  const wheel = page.getByRole('dialog', { name: 'Say' });
  await expect(wheel).toBeVisible();
  return wheel;
}

test.describe('prewritten chat', () => {
  test('Say from the Menu: a phrase picked on the wheel shows over the owl, in the other tab too, and the next waits its turn', async ({ context }) => {
    test.slow(); // two live parks in one browser
    const a = await context.newPage();
    const b = await context.newPage();
    await openPark(a, { id: 'owl-a' });
    await openPark(b, { id: 'owl-b' });
    await expect.poll(async () => (await state(a)).peers.map((p) => p.id)).toEqual(['owl-b']);
    await expect.poll(async () => (await state(b)).peers.map((p) => p.id)).toEqual(['owl-a']);

    const wheel = await openSay(a);
    // The six groups round the ring, Hello first, and the four phrases of the group shown under it.
    await expect(wheel.locator('[data-group]')).toHaveText(['Hello', 'Thanks and cheers', 'Together', 'Things to do', 'Feelings', 'Help and goodbye']);
    await expect(wheel.locator('[data-phrase]')).toHaveText([/^Hi!/, /^Hoot hoot!/, /^Nice to meet you!/, /^Good night!/]);
    await wheel.locator('[data-group="cheers"]').click();
    await expect(wheel.locator('[data-group="cheers"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(wheel.locator('[data-phrase]')).toHaveText([/^Thank you!/, /^Great job!/, /^Nice owl!/, /^Well played!/]);
    await a.screenshot({ path: `e2e-screenshots/${test.info().project.name}-say-wheel.png` });
    // One phrase every 3 s. The phrase, another tried at once and the wheel opened again from the
    // Menu happen in one step in the page, so a slow machine cannot run past the wait between them:
    // the phrase closes the wheel, the second is not said, and the wheel opened again greys its phrases.
    const tooSoon = await a.evaluate(() => {
      const tap = (sel: string) => (document.querySelector(sel) as HTMLElement).click();
      const phrases = () => document.querySelectorAll<HTMLButtonElement>('[data-phrases] [data-phrase]');
      tap('[data-phrase="6"]');
      const closed = !phrases()[0]?.checkVisibility();
      const second = window.owlPark.say(7);
      tap('[data-menu-btn]');
      tap('[data-screen="say"]');
      return { closed, second, greyed: [...phrases()].map((b) => b.disabled) };
    });
    expect(tooSoon).toEqual({ closed: true, second: false, greyed: [true, true, true, true] });
    await expect(wheel).toBeVisible();
    // The bubble is over the owl here, and over the same owl in the other tab.
    await expect.poll(() => bubbles(a)).toEqual([{ id: 'owl-a', n: 6 }]);
    await expect.poll(() => bubbles(b), { timeout: 10_000 }).toEqual([{ id: 'owl-a', n: 6 }]);
    await b.screenshot({ path: `e2e-screenshots/${test.info().project.name}-say-bubble.png` });
    // When its turn comes the phrases wake, and a new one takes the place of the first: one bubble per owl.
    await expect(wheel.locator('[data-phrase]').first()).toBeEnabled({ timeout: 5_000 });
    await wheel.locator('[data-phrase="7"]').click();
    await expect(wheel).toBeHidden();
    await expect.poll(() => bubbles(b), { timeout: 10_000 }).toEqual([{ id: 'owl-a', n: 7 }]);
    // The other owl answers: its bubble shows over it in the first tab.
    expect(await b.evaluate(() => window.owlPark.say(5))).toBe(true);
    await expect.poll(() => bubbles(a), { timeout: 10_000 }).toContainEqual({ id: 'owl-b', n: 5 });
    // A bubble shows for 4 s, then goes.
    await expect.poll(() => bubbles(a), { timeout: 8_000 }).toEqual([]);
    await expect.poll(() => bubbles(b), { timeout: 8_000 }).toEqual([]);
  });

  test('on a keyboard T opens Say, the arrows turn round the groups and 1 to 4 say a phrase', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a phone has no keyboard');
    await openPark(page, { id: 'owl-a' });
    const before = (await state(page)).pos;
    const wheel = page.getByRole('dialog', { name: 'Say' });
    const showing = (group: string) => expect(wheel.locator(`[data-group="${group}"]`)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('KeyT');
    await expect(wheel).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await showing('together');
    // Round past the first group to the last.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await showing('help');
    await expect(wheel.locator('[data-phrase]')).toHaveText([/^Where to\?/, /^I'm lost!/, /^Help me\?/, /^Bye for now!/]);
    // 4 says the last phrase of the group. Too soon for another: T opens the wheel with its phrases
    // greyed, and a number says nothing. The keys go in one step in the page, so a slow machine
    // cannot run past the 3 s between them.
    const tooSoon = await page.evaluate(() => {
      const key = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      const phrases = () => document.querySelectorAll<HTMLButtonElement>('[data-phrases] [data-phrase]');
      key('Digit4');
      const said = window.owlPark.state()?.bubbles ?? [];
      const closed = !phrases()[0]?.checkVisibility();
      key('KeyT');
      const greyed = [...phrases()].map((b) => b.disabled);
      key('Digit1');
      return { said, closed, greyed, stillOpen: !!phrases()[0]?.checkVisibility(), after: window.owlPark.state()?.bubbles ?? [] };
    });
    expect(tooSoon).toEqual({
      said: [{ id: 'owl-a', n: 24 }],
      closed: true,
      greyed: [true, true, true, true],
      stillOpen: true,
      after: [{ id: 'owl-a', n: 24 }],
    });
    await expect(wheel).toBeVisible();
    // Its turn comes, in the group it was left on; T closes the wheel as it opens it.
    await expect(wheel.locator('[data-phrase]').first()).toBeEnabled({ timeout: 5_000 });
    await page.keyboard.press('Digit1');
    await expect(wheel).toBeHidden();
    await expect.poll(() => bubbles(page)).toEqual([{ id: 'owl-a', n: 21 }]);
    await page.keyboard.press('KeyT');
    await expect(wheel).toBeVisible();
    await page.keyboard.press('KeyT');
    await expect(wheel).toBeHidden();
    // The arrows turned the wheel, never the owl.
    expect((await state(page)).pos).toEqual(before);
  });

  test('"Show what owls say" off hides every bubble, its own included, and on shows them again', async ({ context }) => {
    test.slow(); // two live parks in one browser
    const a = await context.newPage();
    const b = await context.newPage();
    await openPark(a, { id: 'owl-a' });
    await openPark(b, { id: 'owl-b' });
    await expect.poll(async () => (await state(b)).peers.map((p) => p.id)).toEqual(['owl-a']);
    expect(await a.evaluate(() => window.owlPark.say(1))).toBe(true);
    await expect.poll(() => bubbles(b), { timeout: 10_000 }).toEqual([{ id: 'owl-a', n: 1 }]);

    await b.locator('[data-menu-btn]').click();
    await b.locator('[data-screen="settings"]').click();
    const setting = b.locator('[data-setting="bubbles"]');
    await expect(setting).toHaveAttribute('aria-checked', 'true');
    await setting.click();
    await expect(setting).toHaveAttribute('aria-checked', 'false');
    expect(await bubbles(b)).toEqual([]);
    expect(await b.evaluate(() => JSON.parse(localStorage.getItem('owl-park:settings') ?? '{}').bubbles)).toBe(false);
    // The next phrase shows where bubbles are on, and nowhere on this page, not even over its own owl.
    await expect.poll(() => a.evaluate(() => window.owlPark.say(2)), { timeout: 5_000 }).toBe(true);
    await expect.poll(() => bubbles(a)).toEqual([{ id: 'owl-a', n: 2 }]);
    expect(await b.evaluate(() => window.owlPark.say(3))).toBe(true);
    await expect.poll(() => bubbles(a), { timeout: 10_000 }).toContainEqual({ id: 'owl-b', n: 3 });
    expect(await bubbles(b)).toEqual([]);

    // On again: the next phrase shows.
    await setting.click();
    await expect(setting).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => a.evaluate(() => window.owlPark.say(4)), { timeout: 5_000 }).toBe(true);
    await expect.poll(() => bubbles(b), { timeout: 10_000 }).toEqual([{ id: 'owl-a', n: 4 }]);
  });
});
