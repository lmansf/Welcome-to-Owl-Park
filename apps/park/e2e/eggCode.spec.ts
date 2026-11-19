import { webcrypto } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openPark } from './helpers';

/**
 * Egg codes (OP-260): a code earned on the portfolio site's SQL console, pasted into the Menu's
 * Redeem a code card (Settings, behind ?eggcode=1), puts the painted egg in the owl's collection.
 * The offline park checks codes with its test key, whose private half is here so this test can make
 * them (the same pair as packages/shared/src/eggCodeTestKey.ts); the room server never takes that key,
 * and with no key of its own set it takes no code at all.
 */
const isEdge = () => test.info().project.name === 'edge';
const EGG = 'painted-egg~0';
/** The offline park's test key (LOCAL_EGG_CODE_PUBLIC_KEY), private half included. */
const TEST_KEY = {
  kty: 'OKP',
  crv: 'Ed25519',
  d: 'P_UBhSRsu1n739-pJqBTR0YdnqeX03ZVzWvn6dmmHrE',
  x: '_ili8TFx3evauC6V4pG3LCCXi3wCHKHqte9N59mFP9I',
};

/** A code as the portfolio site writes one: EGG-, then base64url of [version 1, 12 random bytes] and its signature. */
async function eggCode(): Promise<string> {
  const key = await webcrypto.subtle.importKey('jwk', TEST_KEY, { name: 'Ed25519' }, false, ['sign']);
  const body = new Uint8Array(13);
  body[0] = 1;
  body.set(webcrypto.getRandomValues(new Uint8Array(12)), 1);
  const sig = new Uint8Array(await webcrypto.subtle.sign({ name: 'Ed25519' }, key, body));
  return 'EGG-' + Buffer.concat([body, sig]).toString('base64url');
}

async function redeemCard(page: Page) {
  await page.locator('[data-menu-btn]').click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await menu.locator('[data-tab="settings"]').click();
  const card = menu.locator('[data-egg-code]');
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { name: 'Redeem a code' })).toBeVisible();
  return card;
}

const owns = (page: Page) => page.evaluate((v) => window.owlPark.collection()?.owned.includes(v) ?? false, EGG);

test.describe('egg codes (OP-260)', () => {
  test('a pasted code puts the egg in the collection; the same code again does nothing', async ({ page }) => {
    test.skip(isEdge(), 'the room server takes no code without its key (below)');
    await openPark(page, { eggcode: '1', collector: `e2e-eggcode-${test.info().project.name}` });
    await page.waitForFunction(() => window.owlPark?.collection() !== null, null, { timeout: 20_000 });
    expect(await owns(page)).toBe(false);
    const card = await redeemCard(page);
    const code = await eggCode();
    // A paste may bring a space or a line break with it.
    await card.getByLabel('Code').fill(` ${code}\n`);
    await card.getByRole('button', { name: 'Redeem' }).click();
    await expect(card.locator('[data-egg-code-status]')).toHaveText('An egg! It is waiting in your collection.');
    await expect.poll(() => owns(page)).toBe(true);
    // Once is all a code works, and an owl holds one egg.
    await card.getByLabel('Code').fill(code);
    await card.getByRole('button', { name: 'Redeem' }).click();
    await expect(card.locator('[data-egg-code-status]')).toHaveText('You already have the egg.');
    await card.getByLabel('Code').fill('EGG-nope');
    await card.getByLabel('Code').press('Enter');
    await expect(card.locator('[data-egg-code-status]')).toHaveText('That code doesn’t work.');
  });

  test('without the flag there is no card, and a code in the address does nothing', async ({ page }) => {
    test.skip(isEdge(), 'the same in every suite');
    await openPark(page, { code: await eggCode(), collector: `e2e-eggcode-off-${test.info().project.name}` });
    await page.waitForFunction(() => window.owlPark?.collection() !== null, null, { timeout: 20_000 });
    await page.locator('[data-menu-btn]').click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await menu.locator('[data-tab="settings"]').click();
    await expect(menu.locator('[data-tab="settings"]')).toHaveAttribute('aria-selected', 'true');
    await expect(menu.locator('[data-egg-code]')).toHaveCount(0);
    expect(await owns(page)).toBe(false);
  });

  test('the room server takes no code until the portfolio site’s public key is set', async ({ page }) => {
    test.skip(!isEdge(), 'needs the room server');
    await openPark(page, { transport: 'edge', eggcode: '1' });
    const card = await redeemCard(page);
    await card.getByLabel('Code').fill(await eggCode());
    await card.getByRole('button', { name: 'Redeem' }).click();
    await expect(card.locator('[data-egg-code-status]')).toHaveText('Codes can’t be redeemed just yet.');
    expect(await owns(page)).toBe(false);
  });
});
