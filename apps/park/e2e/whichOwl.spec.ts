import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { state } from './helpers';

/**
 * Which owl are you (OP-076, OP-325 to OP-331), on this device (local mode), on a phone and a computer:
 * Make your owl opens the quiz, three lines of welcome, eight cards about owl life (a quick either/or,
 * six cards, a quick either/or), the color card, a short pause, and the reveal with the owl drawn big; Keep it goes into the owl's own nest, Make it yours opens the builder, Not me?
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

/**
 * OP-325: at the reveal the owl is drawn on the game canvas, under the HUD, in the stage's frame. Nothing
 * the HUD lays over that frame may be solid (the quiz's own background hid the owl), and the canvas
 * there must hold the owl: enough of its pixels differ from the builder scene's plain dusk backdrop.
 */
async function expectOwlShown(page: Page): Promise<void> {
  const stage = page.locator('[data-wo-stage]');
  await expect(stage).toBeVisible();
  const solid = await stage.evaluate((el) => {
    const alpha = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return 0;
      const parts = m[1]!.split(/[\s,/]+/).filter(Boolean);
      return parts.length > 3 ? Number(parts[3]) : 1;
    };
    const r = el.getBoundingClientRect();
    const over: string[] = [];
    for (const e of document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)) {
      if (e instanceof HTMLCanvasElement) break;
      const cs = getComputedStyle(e);
      const colours = [cs.backgroundColor, ...(cs.backgroundImage.match(/rgba?\([^)]+\)/g) ?? [])];
      if (colours.some((c) => alpha(c) >= 0.6)) over.push(`${e.tagName.toLowerCase()}.${(e as HTMLElement).className}`);
    }
    return over;
  });
  expect(solid).toEqual([]);
  const box = (await stage.boundingBox())!;
  await expect
    .poll(
      () =>
        page.evaluate(
          (r) =>
            new Promise<number>((done) => {
              const game = window.owlPark.game;
              const k = game.canvas.width / game.canvas.clientWidth;
              game.renderer.snapshotArea(Math.round(r.x * k), Math.round(r.y * k), Math.max(1, Math.round(r.width * k)), Math.max(1, Math.round(r.height * k)), (shot) => {
                const img = shot as HTMLImageElement;
                const c = document.createElement('canvas');
                c.width = img.width;
                c.height = img.height;
                const g = c.getContext('2d');
                if (!g || !c.width || !c.height) return done(0);
                g.drawImage(img, 0, 0);
                const d = g.getImageData(0, 0, c.width, c.height).data;
                // The backdrop is #0C1E36; its glow and floor ellipse stay close to it.
                let owl = 0;
                let all = 0;
                for (let i = 0; i < d.length; i += 16) {
                  all++;
                  if (Math.abs(d[i]! - 12) + Math.abs(d[i + 1]! - 30) + Math.abs(d[i + 2]! - 54) > 90) owl++;
                }
                done(all ? owl / all : 0);
              });
            }),
          box,
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0.04);
}

/**
 * Eight cards, each answered with the answer at `pick` (or the card's last, when it has fewer); returns
 * the cards' ids in the order shown.
 */
async function answerCards(page: Page, pick: number, isMobile: boolean): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= 8; i++) {
    await expect(page.locator('.which-owl .wo-count')).toHaveText(`${i} of 8`);
    // One look at the card (its id, each answer's size and picture box, its words): one round trip, so
    // the runs that ask two whole quizzes stay well inside their time on a slow machine.
    const seen = await page.locator('[data-wo-card]').evaluate((el) => {
      const answers = [...el.querySelectorAll('[data-wo-answer]')];
      return {
        id: el.getAttribute('data-wo-card') ?? '',
        sizes: answers.map((a) => {
          const r = a.getBoundingClientRect();
          return Math.min(r.width, r.height);
        }),
        art: answers.map((a) => a.querySelector('[data-wo-art]')?.textContent ?? ''),
        text: (el as HTMLElement).innerText,
      };
    });
    const { id } = seen;
    ids.push(id);
    const count = seen.sizes.length;
    // A quick either/or opens and closes the run; the middle cards have two to four answers (OP-330).
    if (i === 1 || i === 8) {
      expect(count).toBe(2);
      expect(id).toMatch(i === 1 ? /^o/ : /^c/);
    } else {
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(4);
    }
    // Every answer is a big enough target for a thumb, its picture a box with its size until it is painted (OP-326).
    for (const size of seen.sizes) expect(size).toBeGreaterThanOrEqual(44);
    expect(seen.art).toEqual(Array<string>(count).fill('96 × 96'));
    // No emoji anywhere on the card.
    expect(seen.text).not.toMatch(/\p{Extended_Pictographic}/u);
    await tap(page, `[data-wo-answer="${Math.min(pick, count - 1)}"]`, isMobile);
  }
  return ids;
}

/** Make your owl, the three lines of welcome, and the eight cards. */
async function startQuiz(page: Page, isMobile: boolean, pick = 0): Promise<string[]> {
  await tap(page, '[data-home-btn="login"]', isMobile);
  await expect(quiz(page)).toBeVisible();
  await expect(page.locator('[data-wo-skip]')).toBeVisible();
  // A plain, friendly welcome (OP-327).
  await expect(page.locator('[data-wo-intro="0"]')).toHaveText('Welcome to Owl Park!');
  for (let i = 0; i < 3; i++) {
    await expect(page.locator(`[data-wo-intro="${i}"]`)).toBeVisible();
    await expect(page.locator(`[data-wo-intro="${i}"]`)).not.toContainText('little one');
    await tap(page, '[data-wo-next]', isMobile);
  }
  return answerCards(page, pick, isMobile);
}

test.describe('which owl are you (OP-076)', () => {
  // Each run is about a dozen screens of taps over the running park: about 45 s on a CI runner.
  test.beforeEach(() => test.slow());
  test('a first run: the quiz asks, the owl is revealed in its colors, and Keep it goes into its nest', async ({ page, isMobile }) => {
    await openHome(page);
    const ids = await startQuiz(page, isMobile);
    expect(new Set(ids).size).toBe(8);
    // Nothing is made before the reveal.
    expect(await page.evaluate(() => window.owlPark.home().loggedIn)).toBe(false);

    // The colour card: four feathers; it never changes the nature.
    await expect(page.locator('[data-wo-colours]')).toHaveCount(4);
    await tap(page, '[data-wo-colours="moss"]', isMobile);

    // A short pause, then the reveal: the owl is made here, drawn big in its kind and the colors picked.
    await expect(page.locator('[data-wo-thinking]')).toBeVisible();
    const result = page.locator('[data-wo-result]');
    await expect(result).toBeVisible();
    // What the player shares with that owl, a true fact about it, and something to try in the park (OP-328, OP-330).
    for (const sel of ['[data-wo-about]', '[data-wo-fact]', '[data-wo-enjoy]']) await expect(page.locator(sel)).not.toBeEmpty();
    const species = (await result.getAttribute('data-wo-result'))!;
    expect(await page.evaluate(() => window.owlPark.home().loggedIn)).toBe(true);
    expect(await storedLook(page)).toMatchObject({ body: '#3E6B48', species });
    expect(await page.evaluate(() => window.owlPark.game.scene.isActive('builder'))).toBe(true);
    await expectOwlShown(page);
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
    // Two whole quizzes in one test: the slow allowance, as the park's other long walks have.
    test.slow();
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
    // Two whole quizzes in one test: the slow allowance, as the park's other long walks have.
    test.slow();
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
    await expectOwlShown(page);
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
