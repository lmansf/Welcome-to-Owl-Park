import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { E2E_STORE, openPark, state } from './helpers';

/**
 * Accounts without passwords (OP-139), against the room server with ACCOUNTS on: the park's mail
 * goes to the stand-in on this machine, which keeps it for the test to open. Each screen is its own
 * browser context, as a phone and a tablet would be.
 */

type Mail = { subject: string; text: string; html: string };

/** A fresh address each run, so the hour's three links to one email never run out across runs. */
const freshEmail = (tag: string) => `${tag}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@family.test`;

async function screen(browser: Browser, params: Record<string, string> = {}): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await openPark(page, { transport: 'edge', ...params });
  return page;
}

async function openMenu(page: Page, tab: 'nest' | 'settings'): Promise<Locator> {
  await page.locator('[data-menu-btn]').click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await menu.locator(`[data-tab="${tab}"]`).click();
  return menu;
}

/** The last mail the park sent to this address (the stand-in keeps it), once it has come. */
async function mailTo(page: Page, email: string): Promise<Mail> {
  let mail: Mail | null = null;
  await expect
    .poll(
      async () => {
        const r = await page.request.get(`${E2E_STORE.origin}/test/mail?to=${encodeURIComponent(email)}`);
        mail = ((await r.json()) as { mail: Mail | null }).mail;
        return mail !== null;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return mail!;
}

/** The link in a mail, opened on this page with the room server's transport (the live park's build uses it by default). */
async function openLink(page: Page, mail: Mail, kind: 'protect' | 'restore'): Promise<void> {
  const token = new RegExp(`#${kind}=([A-Za-z0-9_.-]+)`).exec(mail.text)?.[1];
  expect(token, mail.text).toBeTruthy();
  await page.goto(`/?transport=edge&room=hub#${kind}=${token}`);
}

/** A grown-up types an email in the open account box and sends the link. */
async function sendLink(page: Page, email: string): Promise<void> {
  const box = page.locator('.modal.account');
  await box.locator('[data-account-email]').fill(email);
  await box.locator('[data-account-send]').click();
  await expect(box.locator('[data-account-done]')).toBeVisible({ timeout: 15_000 });
}

const friendCodeOf = async (page: Page) => (await openMenu(page, 'nest')).locator('[data-friend-code]').getAttribute('data-friend-code');

test.describe('accounts without passwords (OP-139)', () => {
  test('a free owl has a friend code and lives on its screen until a grown-up protects it by an emailed link', async ({ browser }) => {
    const a = await screen(browser);
    const menu = await openMenu(a, 'nest');
    const code = await menu.locator('[data-friend-code]').getAttribute('data-friend-code');
    expect(code).toMatch(/^[A-HJ-NP-Z]{4}$/);
    await expect(menu.locator('[data-account]')).toContainText('This owl lives only on this screen.');
    await menu.locator('[data-protect]').click();
    const email = freshEmail('grown.up');
    await sendLink(a, email);
    await expect(a.locator('.modal.account')).toContainText('Check your email');
    const mail = await mailTo(a, email);
    expect(mail.subject).toBe('Protect your owl in Owl Park');
    // Opened on the owl's own screen: protected, and the Menu says so.
    await openLink(a, mail, 'protect');
    await expect(a.getByText('This owl is protected now.')).toBeVisible({ timeout: 15_000 });
    const after = await openMenu(a, 'nest');
    await expect(after.locator('[data-protected]')).toHaveAttribute('data-protected', 'true');
    await expect(after.locator('[data-friend-code]')).toHaveAttribute('data-friend-code', code!);
    // The link worked once.
    await openLink(a, mail, 'protect');
    await expect(a.getByText('That link has run out or was used already.')).toBeVisible({ timeout: 15_000 });
    await a.context().close();
  });

  test('another screen brings the owl over by a link and a tap; the first screen is told it moved, and can take it back', async ({ browser }) => {
    // Phone A: an owl, protected by the family's email.
    const phone = await screen(browser, { look: '#2F3E5C,#E0D4F0,#FF2AA1' });
    const code = await friendCodeOf(phone);
    await phone.getByRole('dialog', { name: 'Menu' }).locator('[data-protect]').click();
    const email = freshEmail('family');
    await sendLink(phone, email);
    await openLink(phone, await mailTo(phone, email), 'protect');
    await expect(phone.getByText('This owl is protected now.')).toBeVisible({ timeout: 15_000 });
    await openPark(phone, { transport: 'edge' });

    // Tablet B, from its home screen: I already have an owl, the family's email, the link, the owl's picture.
    const tabletCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const tablet = await tabletCtx.newPage();
    await tablet.goto('/?transport=edge');
    await tablet.locator('[data-home-btn="restore"]').click();
    await sendLink(tablet, email);
    await expect(tablet.locator('.modal.account')).toContainText('If that email protects an owl');
    const mail = await mailTo(tablet, email);
    expect(mail.subject).toBe('Bring your owl to this screen');
    await openLink(tablet, mail, 'restore');
    const owl = tablet.locator(`.modal.account [data-owl="${code}"]`);
    await expect(owl).toBeVisible({ timeout: 15_000 });
    await owl.click();
    // The tablet starts again holding the owl: the same friend code, the same colours.
    await tablet.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 30_000 });
    expect(await friendCodeOf(tablet)).toBe(code);
    expect((await state(tablet)).look.body).toBe('#2F3E5C');

    // The phone is shown the moved card at once, and its owl is gone from the room.
    await expect(phone.locator('[data-moved]')).toBeVisible({ timeout: 15_000 });
    await expect(phone.locator('[data-moved]')).toContainText('Your owl moved to another screen');

    // Taken back on the phone the same way: the tablet is the one moved now.
    await phone.locator('[data-moved-back]').click();
    await sendLink(phone, email);
    await openLink(phone, await mailTo(phone, email), 'restore');
    await phone.locator(`.modal.account [data-owl="${code}"]`).click();
    await phone.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 30_000 });
    expect(await friendCodeOf(phone)).toBe(code);
    await expect(tablet.locator('[data-moved]')).toBeVisible({ timeout: 15_000 });
    await phone.context().close();
    await tabletCtx.close();
  });

  test('an email that protects no owl gets the same answer, and a mail that offers to protect the owl on the screen that opens it', async ({ browser }) => {
    const a = await screen(browser);
    const before = await friendCodeOf(a);
    await a.keyboard.press('Escape');
    await a.goto('/?transport=edge');
    await a.locator('[data-home-btn="restore"]').click();
    const email = freshEmail('nobody');
    await sendLink(a, email);
    await expect(a.locator('.modal.account')).toContainText('If that email protects an owl');
    const mail = await mailTo(a, email);
    expect(mail.subject).toBe('No owl is protected by this email yet');
    await openLink(a, mail, 'protect');
    await expect(a.getByText('This owl is protected now.')).toBeVisible({ timeout: 15_000 });
    const menu = await openMenu(a, 'nest');
    await expect(menu.locator('[data-friend-code]')).toHaveAttribute('data-friend-code', before!);
    await expect(menu.locator('[data-protected]')).toHaveAttribute('data-protected', 'true');
    await a.context().close();
  });
});
