import { expect, test } from '@playwright/test';
import { state } from './helpers';

test.describe('the lobby (this device)', () => {
  test('every visit starts in the lobby: the booth window, then the turnstiles into the hub', async ({ page }) => {
    // No room asked for: the park's front entrance.
    await page.goto('/?transport=local');
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
});
