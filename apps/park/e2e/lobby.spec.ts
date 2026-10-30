import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { state } from './helpers';

test.describe('the lobby (this device)', () => {
  test('straight into the park with no room asked for, the lobby: the booth window, then the turnstiles into the hub', { tag: '@smoke' }, async ({ page }) => {
    // Past the home screen (home=0) with no room asked for: the park's front entrance.
    await page.goto('/?transport=local&home=0');
    await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
    const s = await state(page);
    expect(s.room).toBe('lobby');
    expect(s.doors.map((d) => d.id).sort()).toEqual(['booth', 'gate', 'to-homes']);
    expect(s.doors.find((d) => d.id === 'to-homes')?.to).toBe('homes');
    await expect(page.getByText('Walk through the turnstiles')).toBeVisible();

    // The booth: tickets are not on sale yet, so it says they are coming and the gate is open.
    const booth = s.doors.find((d) => d.id === 'booth')!;
    await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), { x: booth.x, y: booth.y });
    const boothButton = page.locator('[data-action="booth"]');
    await expect(boothButton).toBeVisible({ timeout: 15_000 });
    await boothButton.click();
    await expect(page.locator('[data-booth="say"]')).toContainText('coming soon');
    await expect(page.locator('[data-booth="buy"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-booth="say"]')).toBeHidden();

    // The turnstiles: walking into them welcomes the owl and takes it into the hub.
    const gate = s.doors.find((d) => d.id === 'gate')!;
    expect(gate.to).toBe('hub');
    await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), { x: gate.x, y: gate.y });
    await expect(page.getByText('Welcome to Owl Park!')).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('hub');
  });

  /** Into the lobby, standing in front of the turnstiles' left end. */
  const beforeTheGate = async (page: Page) => {
    await page.goto('/?transport=local&home=0');
    await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
    await page.evaluate(() => window.owlPark.walkTo(2250, 760));
    await expect.poll(async () => Math.hypot((await state(page)).pos.x - 2250, (await state(page)).pos.y - 760), { timeout: 20_000 }).toBeLessThan(15);
  };
  /** Through the gate: the owl's place on the hub's path, where owls come in from the turnstiles. */
  const inTheHub = async (page: Page) => {
    await expect.poll(async () => (await state(page)).room, { timeout: 30_000 }).toBe('hub');
    return (await state(page)).pos;
  };

  test("a tap on the gate's left turnstile takes the owl through, onto the hub's path at its left (OP-124)", async ({ page }) => {
    test.slow(); // two rooms drawn with software WebGL on CI runners
    await beforeTheGate(page);
    // The first turnstile, between the left owl's plinth and the first post.
    await page.evaluate(() => window.owlPark.walkTo(2370, 670));
    const pos = await inTheHub(page);
    expect(pos.x).toBeLessThan(2350);
    expect(pos.y).toBe(730);
  });

  test('keys held into the turnstiles do not slide the owl along them: it comes out where it went in (OP-124)', async ({ page }) => {
    test.slow(); // two rooms drawn with software WebGL on CI runners
    await beforeTheGate(page);
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('ArrowUp');
    // The turnstiles have it: the keys are still down while they welcome the owl, and it stands where it went in.
    await expect(page.getByText('Welcome to Owl Park!')).toBeVisible({ timeout: 20_000 });
    expect((await state(page)).pos.x).toBeLessThan(2420);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.up('ArrowRight');
    // Slid along to the far end it would come out at the path's right (2490); it went in at the left end.
    expect((await inTheHub(page)).x).toBeLessThan(2350);
  });
});
