import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { state } from './helpers';

/**
 * Which owl are you (OP-076), on this device (local mode), on a phone and a computer: Make your owl
 * opens the quiz, the Keeper's three lines, eight picture cards, the colour card, and the reveal with
 * the owl drawn big; Keep it goes into the owl's own nest, Make it yours opens the builder, Not me?
 * Try again draws a fresh set. Retake the quiz (the Menu's Settings tab) changes the kind and
 * colours of the owl that already is, and nothing changes unless Keep it takes it on.
 */
const quiz = (page: Page) => page.getByRole('dialog', { name: 'Which owl are you?' });
const tap = async (page: Page, selector: string, isMobile: boolean) => {
  const el = page.locator(selector);
  if (isMobile) await el.tap();
  else await el.click();
};
const storedLook = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('owl-park:look') ?? 'null') as { body: string; species?: string } | null);

async function openHome(page: Page): Promise<void> {
  await page.goto('/?transport=local');
  await page.waitForFunction(() => window.owlPark?.home?.().shown === true, null, { timeout: 20_000 });
}

/** Eight cards, each answered with the picture at `pick`; returns the cards' ids in the order shown. */
async function answerCards(page: Page, pick: number, isMobile: boolean): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= 8; i++) {
    await expect(page.locator('.which-owl .wo-count')).toHaveText(`${i} of 8`);
    const card = page.locator('[data-wo-card]');
    ids.push((await card.getAttribute('data-wo-card'))!);
    if (i === 1) {
      // Three pictures, each a big enough target for a thumb (every card is built the same way).
      await expect(card.locator('[data-wo-answer]')).toHaveCount(3);
      const box = (await card.locator('[data-wo-answer="0"]').boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    }
    await tap(page, `[data-wo-answer="${pick}"]`, isMobile);
  }
  return ids;
}

/** Make your owl, the Keeper's three lines, and the eight cards. */
async function startQuiz(page: Page, isMobile: boolean, pick = 0): Promise<string[]> {
  await tap(page, '[data-home-btn="login"]', isMobile);
  await expect(quiz(page)).toBeVisible();
  await expect(page.locator('[data-wo-skip]')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await expect(page.locator(`[data-wo-intro="${i}"]`)).toBeVisible();
    await tap(page, '[data-wo-next]', isMobile);
  }
  return answerCards(page, pick, isMobile);
}

test.describe('which owl are you (OP-076)', () => {
  // Each run is about a dozen screens of taps over the running park: about 45 s on a CI runner.
  test.beforeEach(() => test.slow());
  test('a first run: the Keeper asks, the owl is revealed in its colours, and Keep it goes into its nest', async ({ page, isMobile }) => {
    await openHome(page);
    const ids = await startQuiz(page, isMobile);
    expect(new Set(ids).size).toBe(8);
    // Nothing is made before the reveal.
    expect(await page.evaluate(() => window.owlPark.home().loggedIn)).toBe(false);

    // The colour card: four feathers; it never changes the nature.
    await expect(page.locator('[data-wo-colours]')).toHaveCount(4);
    await tap(page, '[data-wo-colours="moss"]', isMobile);

    // The reveal: the owl is made here, drawn big in its kind and the colours picked.
    const result = page.locator('[data-wo-result]');
    await expect(result).toBeVisible();
    const species = (await result.getAttribute('data-wo-result'))!;
    expect(await page.evaluate(() => window.owlPark.home().loggedIn)).toBe(true);
    expect(await storedLook(page)).toMatchObject({ body: '#3E6B48', species });
    expect(await page.evaluate(() => window.owlPark.game.scene.isActive('builder'))).toBe(true);
    await expect(page.locator('[data-wo-keep]')).toBeFocused();
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-which-owl-reveal.png` });

    // Keep it: into the owl's own nest, as the owl the quiz found.
    await tap(page, '[data-wo-keep]', isMobile);
    await expect(quiz(page)).toBeHidden();
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toMatch(/^nest-/);
    const s = await state(page);
    expect(s.look.species).toBe(species);
    expect(s.look.body).toBe('#3E6B48');
  });

  test('Not me? Try again draws a fresh set, and Make it yours opens the builder on the result', async ({ page, isMobile }) => {
    await openHome(page);
    const first = await startQuiz(page, isMobile, 2);
    await tap(page, '[data-wo-colours="natural"]', isMobile);
    await expect(page.locator('[data-wo-result]')).toBeVisible();

    await tap(page, '[data-wo-again]', isMobile);
    const second = await answerCards(page, 1, isMobile);
    expect(second.join()).not.toBe(first.join());
    await tap(page, '[data-wo-colours="plum"]', isMobile);
    const species = (await page.locator('[data-wo-result]').getAttribute('data-wo-result'))!;

    await tap(page, '[data-wo-make]', isMobile);
    await expect(quiz(page)).toBeHidden();
    const builder = page.getByRole('dialog', { name: 'Your owl' });
    await expect(builder).toBeVisible();
    expect(await storedLook(page)).toMatchObject({ body: '#7A5C99', species });
    await page.keyboard.press('Escape');
    await expect(builder).toBeHidden();
    await expect(page.locator('[data-home-btn="play"]')).toBeVisible();
  });

  test('Retake the quiz in Settings: a new kind and colours on the same owl, and a close leaves it as it was', async ({ page, isMobile }) => {
    await openHome(page);
    await tap(page, '[data-home-btn="login"]', isMobile);
    await tap(page, '[data-wo-skip]', isMobile);
    await expect(page.getByRole('dialog', { name: 'Your owl' })).toBeVisible();
    await page.keyboard.press('Escape');
    await tap(page, '[data-home-btn="play"]', isMobile);
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toMatch(/^nest-/);
    // The owl's own token on this device: a retake never makes a new owl.
    const owl = () => page.evaluate(() => localStorage.getItem('owl-park:local-collector') ?? localStorage.getItem('owl-park:collector'));
    const id = await owl();
    expect(id).not.toBeNull();

    const retake = async () => {
      await tap(page, '[data-menu-btn]', isMobile);
      const menu = page.getByRole('dialog', { name: 'Menu' });
      await menu.locator('[data-tab="settings"]').click();
      await menu.locator('[data-screen="retake"]').click();
      await expect(quiz(page)).toBeVisible();
      // A retake has no Skip: Close is in the corner.
      await expect(page.locator('[data-wo-skip]')).toHaveCount(0);
      for (let i = 0; i < 3; i++) await tap(page, '[data-wo-next]', isMobile);
      await answerCards(page, 0, isMobile);
    };

    await retake();
    await tap(page, '[data-wo-colours="dusk"]', isMobile);
    const species = (await page.locator('[data-wo-result]').getAttribute('data-wo-result'))!;
    await tap(page, '[data-wo-keep]', isMobile);
    await expect(quiz(page)).toBeHidden();
    await expect.poll(async () => (await state(page)).look.body).toBe('#2F3E5C');
    expect((await state(page)).look.species).toBe(species);
    expect(await owl()).toBe(id);

    // Revealed, then closed without Keep it: the owl goes back as it was.
    await retake();
    await tap(page, '[data-wo-colours="plum"]', isMobile);
    await expect.poll(async () => (await state(page)).look.body).toBe('#7A5C99');
    await page.locator('.which-owl [data-close]').click();
    await expect(quiz(page)).toBeHidden();
    await expect.poll(async () => (await state(page)).look.body).toBe('#2F3E5C');
    expect((await state(page)).look.species).toBe(species);
  });
});
