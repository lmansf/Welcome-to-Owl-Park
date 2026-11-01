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
    const words = `A lantern by the home screen, please (${Date.now()})`;
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
    const words = `Send feedback from the home screen (${Date.now()})`;
    await feedback.getByRole('button', { name: 'Praise' }).click();
    await feedback.getByRole('textbox', { name: 'Your note' }).fill(words);
    await feedback.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText("Your note is with the park's keepers")).toBeVisible();
    const open = await request.get('/api/admin/feedback?status=open', { headers: { 'X-Admin-Key': E2E_ADMIN_KEY } });
    const notes = ((await open.json()) as { feedback: Array<{ kind: string; text: string }> }).feedback;
    expect(notes.find((n) => n.text === words)).toMatchObject({ kind: 'praise' });
  });
});
