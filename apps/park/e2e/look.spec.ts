import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openPark } from './helpers';

/** The whole look around as drawn, frame by frame (headTurn.ts LOOK_AROUND, the front at both ends). */
const LOOK_ROUND = ['front', '3q', 'side', 'back', 'side', '3q', 'front'];

/**
 * The head frames this page's owl shows, each change once, from now until the head has turned and come
 * back to the front (at most `ms`), and whether its body (the pose the other emotes move) stayed at rest
 * the whole time. Sampled in the page, so no frame is missed between round trips, and timed by the
 * turn itself, not the clock: on a slow runner the click that starts it can take a second or more.
 */
function watchHead(page: Page, ms: number): Promise<{ frames: string[]; bodyStill: boolean }> {
  return page.evaluate(
    (span) =>
      new Promise<{ frames: string[]; bodyStill: boolean }>((done) => {
        const frames: string[] = [];
        let bodyStill = true;
        const end = performance.now() + span;
        const look = () => {
          const s = window.owlPark.state();
          if (s) {
            if (frames[frames.length - 1] !== s.head.frame) frames.push(s.head.frame);
            bodyStill &&= s.head.bodyAtRest;
          }
          const back = frames.length > 1 && frames[frames.length - 1] === 'front';
          if (!back && performance.now() < end) setTimeout(look, 10);
          else done({ frames, bodyStill });
        };
        look();
      }),
    ms,
  );
}

/** Whether `seen` is `all` with some frames left out (a slow runner may step past a short one), in order. */
function inOrder(seen: string[], all: string[]): boolean {
  let i = 0;
  for (const f of seen) {
    while (i < all.length && all[i] !== f) i++;
    if (i === all.length) return false;
    i++;
  }
  return true;
}

test.describe('the look around (OP-289, behind ?look=1)', () => {
  test('is first on the emote wheel, a phone’s through Say, and turns the head round while the body stays still', async ({ page, isMobile }) => {
    await openPark(page, { collector: 'e2e-look', tz: 'UTC', look: '1' });
    const wheel = page.getByRole('dialog', { name: 'Emotes' });
    // A phone has one button for Say and the emotes (OP-242).
    if (isMobile) {
      const say = page.getByRole('dialog', { name: 'Say' });
      await page.locator('[data-say-btn]').click();
      await say.locator('[data-swap="emotes"]').click();
    } else await page.locator('[data-emotes-btn]').click();
    await expect(wheel).toBeVisible();
    const look = wheel.locator('[data-emote="look"]');
    await expect(wheel.locator('[data-emote]').first()).toHaveAttribute('data-emote', 'look');
    await expect(look).toHaveAttribute('aria-label', 'Look around');
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-look-wheel.png` });
    const watched = watchHead(page, 8_000);
    await look.click();
    await expect(wheel).toBeHidden();
    const { frames, bodyStill } = await watched;
    expect(frames, frames.join(' ')).toContain('back');
    expect(frames[0]).toBe('front');
    expect(frames[frames.length - 1]).toBe('front');
    expect(inOrder(frames, LOOK_ROUND), frames.join(' ')).toBe(true);
    expect(bodyStill).toBe(true);
  });

  test('plays nothing on a page without the flag', async ({ page }) => {
    await openPark(page, { collector: 'e2e-look-off', tz: 'UTC' });
    expect(await page.evaluate(() => window.owlPark.emote('look'))).toBe(false);
    expect((await page.evaluate(() => window.owlPark.state()))?.head.frame).toBe('front');
  });
});
