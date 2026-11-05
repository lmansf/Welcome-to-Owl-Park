import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { E2E_ADMIN_KEY, openPark } from './helpers';

/**
 * Feedback first in Settings (OP-167): wherever Settings open (the Menu's Settings tab in each realm,
 * the home screen's Settings), their first row is Send feedback, it opens the one Feedback form, and
 * a note sent from it goes where the Menu's always went: kept on this device without a room server
 * (the desktop and phone projects), to the keepers' page through the room server (the edge project).
 */
const isEdge = () => test.info().project.name === 'edge';

/** Notes a park without a server keeps in this browser (net/feedback.ts KEPT_FEEDBACK_KEY). */
const KEPT_FEEDBACK_KEY = 'owl-park:feedback';

/** The first row Settings show, heading or setting: Send feedback's row, by its hook. */
async function expectFeedbackFirst(settings: Locator): Promise<Locator> {
  await expect(settings.locator('h3, .opt').first()).toHaveAttribute('data-feedback-row', '');
  const send = settings.locator('[data-screen="feedback"]');
  await expect(send).toHaveCount(1);
  await expect(send).toHaveText('Send feedback');
  // At the top as Settings open: no scrolling to find it, on a phone too.
  await expect(send).toBeInViewport();
  return send;
}

async function openMenuSettings(page: Page): Promise<Locator> {
  await page.locator('[data-menu-btn]').click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await menu.locator('[data-tab="settings"]').click();
  await expect(menu.locator('[data-tab="settings"]')).toHaveAttribute('aria-selected', 'true');
  return menu;
}

async function openHomeSettings(page: Page, transport: 'local' | 'edge'): Promise<Locator> {
  await page.goto(`/?transport=${transport}`);
  await page.waitForFunction(() => window.owlPark?.home?.().shown === true, null, { timeout: 20_000 });
  await page.locator('[data-home-btn="settings"]').click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  return settings;
}

test.describe('Send feedback is the first row of Settings (OP-167)', () => {
  test("in the park's Menu, in each realm: first, and it opens the Feedback form with its way back to Settings", async ({ page }) => {
    test.skip(isEdge(), 'the room server suite sends from the home screen below');
    test.slow(); // three realms, the Menu opened in each
    for (const room of ['hub', 'grove', 'market']) {
      await openPark(page, { room });
      const menu = await openMenuSettings(page);
      const send = await expectFeedbackFirst(menu.locator('[data-panel="settings"]'));
      if (room === 'hub') {
        await send.click();
        const feedback = page.getByRole('dialog', { name: 'Feedback' });
        await expect(feedback).toBeVisible();
        await expect(menu).toBeHidden();
        await expect(feedback.getByRole('textbox', { name: 'Your note' })).toBeVisible();
        await feedback.getByRole('button', { name: 'Back to the menu' }).click();
        await expect(feedback).toBeHidden();
        await expect(menu).toBeVisible();
        await expect(menu.locator('[data-tab="settings"]')).toHaveAttribute('aria-selected', 'true');
      }
      await menu.getByRole('button', { name: 'Close the menu' }).click();
      await expect(menu).toBeHidden();
    }
  });

  test("on the home screen: first, and a note sent from it is kept as the Menu's are", async ({ page }) => {
    test.skip(isEdge(), 'through the room server below');
    const settings = await openHomeSettings(page, 'local');
    await (await expectFeedbackFirst(settings)).click();
    const feedback = page.getByRole('dialog', { name: 'Feedback' });
    await expect(feedback).toBeVisible();
    await expect(settings).toBeHidden();
    // Before the park there is no Menu to go back to.
    await expect(feedback.getByRole('button', { name: /Back/ })).toHaveCount(0);
    const words = `A lantern by the home screen, please (${Date.now().toString(36)})`;
    await feedback.getByRole('button', { name: 'Idea' }).click();
    await feedback.getByRole('textbox', { name: 'Your note' }).fill(words);
    await feedback.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('your note is saved on this device')).toBeVisible();
    await expect(feedback).toBeHidden();
    const kept = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ kind: string; text: string }>, KEPT_FEEDBACK_KEY);
    expect(kept.at(-1)).toMatchObject({ kind: 'idea', text: words });
    // The form closed gives the focus back to the home screen's Settings button.
    await expect(page.locator('[data-home-btn="settings"]')).toBeFocused();
  });

  test("on the home screen, through the room server: the note reaches the keepers' page", async ({ page, request }) => {
    test.skip(!isEdge(), 'needs the room server');
    const settings = await openHomeSettings(page, 'edge');
    await (await expectFeedbackFirst(settings)).click();
    const feedback = page.getByRole('dialog', { name: 'Feedback' });
    await expect(feedback).toBeVisible();
    // A marker in letters as well as digits: the Worker takes a run of ten digits or more out of a note as a phone number (OP-236).
    const words = `Send feedback from the home screen (${Date.now().toString(36)})`;
    await feedback.getByRole('button', { name: 'Praise' }).click();
    await feedback.getByRole('textbox', { name: 'Your note' }).fill(words);
    await feedback.getByRole('button', { name: 'Send' }).click();
    // A fresh owl's first note that counts also brings the grey mouse (OP-272), so either thanks may come.
    await expect(page.getByText(/Your note is with the park's keepers|A grey mouse is waiting in your collection/)).toBeVisible();
    const open = await request.get('/api/admin/feedback?status=open', { headers: { 'X-Admin-Key': E2E_ADMIN_KEY } });
    const notes = ((await open.json()) as { feedback: Array<{ kind: string; text: string }> }).feedback;
    expect(notes.find((n) => n.text === words)).toMatchObject({ kind: 'praise' });
  });
});

/**
 * The feedback bug (OP-208): until the full opening on December 1, a small button on screen
 * everywhere opens the same Feedback form, clear of the movement controls, and over a covering
 * screen (the owl builder here, the arcade and the climb alike) leaves that screen as it was.
 */
const FULL_OPENING_MS = Date.parse('2026-12-01T00:00:00-05:00');

/** The bug covers none of what `selectors` find on screen. */
async function expectClear(bug: Locator, selectors: string[]): Promise<void> {
  const box = (await bug.boundingBox())!;
  for (const sel of selectors) {
    for (const el of await bug.page().locator(sel).all()) {
      if (!(await el.isVisible())) continue;
      const o = (await el.boundingBox())!;
      const overlaps = box.x < o.x + o.width && o.x < box.x + box.width && box.y < o.y + o.height && o.y < box.y + box.height;
      expect(overlaps, `the bug overlaps ${sel}`).toBe(false);
    }
  }
}

test.describe('The feedback bug, until the full opening (OP-208)', () => {
  test.skip(Date.now() >= FULL_OPENING_MS, 'the bug goes away at the full opening');

  test('on the home screen and in the park: on screen, clear of the controls, and it opens the Feedback form', async ({ page, isMobile }) => {
    test.skip(isEdge(), 'the room server suite sends from the home screen above');
    await page.goto('/?transport=local');
    await page.waitForFunction(() => window.owlPark?.home?.().shown === true, null, { timeout: 20_000 });
    const bug = page.locator('[data-feedback-bug]');
    await expect(bug).toBeVisible();
    await expect(bug).toBeInViewport();
    await expectClear(bug, ['[data-home-btn]']);

    await openPark(page);
    // On a phone's park view it gives way to the Menu's own Send feedback, by Close (OP-242).
    const opener = isMobile ? page.locator('[data-menu-btn]') : bug;
    if (isMobile) {
      await expect(bug).toBeHidden();
      await page.locator('[data-menu-btn]').click();
      const menu = page.getByRole('dialog', { name: 'Menu' });
      await expect(menu.locator('[data-menu-feedback]')).toBeVisible();
      await expect(menu.locator('[data-menu-feedback]')).toBeInViewport();
      await menu.locator('[data-menu-feedback]').click();
    } else {
      await expect(bug).toBeVisible();
      await expect(bug).toBeInViewport();
      // Clear of the movement controls along the bottom and the bar along the top.
      await expectClear(bug, ['[data-menu-btn]', '[data-emotes-btn]', '[data-say-btn]', '[data-pad-jump]', '[data-pad-interact]', '#hud .stick', '#hud .bar']);
      await bug.click();
    }
    const feedback = page.getByRole('dialog', { name: 'Feedback' });
    await expect(feedback).toBeVisible();
    await expect(feedback.getByRole('textbox', { name: 'Your note' })).toBeVisible();
    const words = `The bug button by the hub (${Date.now().toString(36)})`;
    await feedback.getByRole('button', { name: 'Bug' }).click();
    await feedback.getByRole('textbox', { name: 'Your note' }).fill(words);
    await feedback.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('your note is saved on this device')).toBeVisible();
    await expect(feedback).toBeHidden();
    const kept = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ kind: string; text: string; room: string | null }>, KEPT_FEEDBACK_KEY);
    expect(kept.at(-1)).toMatchObject({ kind: 'bug', text: words, room: 'hub' });
    // The form closed gives the focus back to the bug (on a phone, the form came from the Menu, which closed with it).
    if (!isMobile) await expect(bug).toBeFocused();
    else await expect(opener).toBeVisible();
  });

  test('over a covering screen: the form opens on top, and closing it leaves the screen as it was', async ({ page }) => {
    test.skip(isEdge(), 'the same in every suite');
    await openPark(page, { tz: 'UTC' });
    await page.evaluate(() => window.owlPark.openBuilder());
    const builder = page.getByRole('dialog', { name: 'Your owl' });
    await expect(builder).toBeVisible();
    const bug = page.locator('[data-feedback-bug]');
    await expect(bug).toBeVisible();
    await bug.click();
    const feedback = page.getByRole('dialog', { name: 'Feedback' });
    await expect(feedback).toBeVisible();
    await expect(builder).toBeVisible();
    await feedback.getByRole('button', { name: 'Close feedback' }).click();
    await expect(feedback).toBeHidden();
    await expect(builder).toBeVisible();
  });
});

/**
 * Thanks for feedback (OP-272): a grey mouse's card beside the feedback bug until the owl wins the
 * mouse or closes the card (the park keeps the close for the owl); the form says what the note will
 * bring, and the first note that counts brings the mouse.
 */
test.describe('Thanks for feedback, through the room server (OP-272)', () => {
  test.skip(Date.now() >= FULL_OPENING_MS, 'the card goes with the bug at the full opening');

  async function home(page: Page): Promise<{ card: Locator; bug: Locator }> {
    await page.goto('/?transport=edge');
    await page.waitForFunction(() => window.owlPark?.home?.().shown === true, null, { timeout: 20_000 });
    return { card: page.locator('[data-feedback-card]'), bug: page.locator('[data-feedback-bug]') };
  }

  test('the card sits beside the bug, opens the form, and the first note brings the grey mouse', async ({ page, request }) => {
    test.skip(!isEdge(), 'needs the room server');
    // The gate as deployed (open): this owl is past the turnstiles.
    expect((await request.post('/api/admin/gate', { headers: { 'X-Admin-Key': E2E_ADMIN_KEY }, data: { mode: 'open' } })).ok()).toBe(true);
    const { card, bug } = await home(page);
    await expect(card).toBeVisible();
    await expect(card).toContainText('Your first note wins a grey mouse!');
    // Beside the bug (on the home screen the bug keeps to the right edge, so the card is to its left), never over it.
    const c = (await card.boundingBox())!;
    const b = (await bug.boundingBox())!;
    expect(c.x + c.width).toBeLessThanOrEqual(b.x + 1);
    expect(Math.abs(c.y + c.height / 2 - (b.y + b.height / 2))).toBeLessThan(8);
    await card.getByRole('button', { name: 'Send feedback and win a grey mouse' }).click();
    const feedback = page.getByRole('dialog', { name: 'Feedback' });
    await expect(feedback).toBeVisible();
    await expect(feedback.getByText('Your first note wins a grey mouse.')).toBeVisible();
    await feedback.getByRole('button', { name: 'Idea' }).click();
    await feedback.getByRole('textbox', { name: 'Your note' }).fill(`A pond by the gift shop, please (${Date.now().toString(36)})`);
    await feedback.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Thank you! A grey mouse is waiting in your collection.')).toBeVisible();
    await expect(card).toBeHidden();
    await bug.click();
    await expect(feedback.getByText('Your next note earns 10 feathers.')).toBeVisible();
    // A page opened again stays without the card: the mouse is won.
    await home(page);
    await expect(page.locator('[data-feedback-bug]')).toBeVisible();
    await expect(page.locator('[data-feedback-card]')).toBeHidden();
  });

  test('closing the card keeps it closed for the owl, and the form still says what the first note brings', async ({ page }) => {
    test.skip(!isEdge(), 'needs the room server');
    const { card, bug } = await home(page);
    await expect(card).toBeVisible();
    const closed = page.waitForResponse((r) => r.url().endsWith('/api/feedback/close') && r.ok());
    await card.getByRole('button', { name: 'Hide this' }).click();
    await expect(card).toBeHidden();
    await closed;
    await home(page);
    await expect(page.locator('[data-feedback-bug]')).toBeVisible();
    await expect(page.locator('[data-feedback-card]')).toBeHidden();
    await page.locator('[data-feedback-bug]').click();
    await expect(page.getByRole('dialog', { name: 'Feedback' }).getByText('Your first note wins a grey mouse.')).toBeVisible();
  });
});
