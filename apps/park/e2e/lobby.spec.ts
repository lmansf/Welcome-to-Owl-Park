import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { state } from './helpers';

test.describe('the lobby (this device)', () => {
  test('straight into the park with no room asked for, the lobby: no ticket booth (OP-180), and the turnstiles into the hub', { tag: '@smoke' }, async ({ page }) => {
    // Past the home screen (home=0) with no room asked for: the park's front entrance.
    await page.goto('/?transport=local&home=0');
    await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
    const s = await state(page);
    expect(s.room).toBe('lobby');
    expect(s.doors.map((d) => d.id).sort()).toEqual(['gate', 'to-homes']);
    expect(s.doors.find((d) => d.id === 'to-homes')?.to).toBe('homes');
    await expect(page.getByText('Walk through the turnstiles')).toBeVisible();

    // No booth to walk to (OP-180): the turnstiles sell a ticket when the gate takes them.
    await expect(page.locator('[data-action="booth"]')).toHaveCount(0);

    // The turnstiles: walking into them welcomes the owl and takes it into the hub.
    const gate = s.doors.find((d) => d.id === 'gate')!;
    expect(gate.to).toBe('hub');
    await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), { x: gate.x, y: gate.y });
    await expect(page.getByText('Welcome to Owl Park!')).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('hub');
  });

  /** Into the lobby, standing in front of the turnstiles' left end (at `y`). */
  const beforeTheGate = async (page: Page, y = 760) => {
    await page.goto('/?transport=local&home=0');
    await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
    await page.evaluate((y) => window.owlPark.walkTo(2250, y), y);
    await expect.poll(async () => Math.hypot((await state(page)).pos.x - 2250, (await state(page)).pos.y - y), { timeout: 20_000 }).toBeLessThan(15);
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
    // Right under the turnstile line, so the owl goes in at the left turnstile whichever key the page
    // takes first (from further back, a right key taken a slow frame early starts it along the floor).
    await page.evaluate(() => window.owlPark.walkTo(2250, 712));
    await expect.poll(async () => Math.hypot((await state(page)).pos.x - 2250, (await state(page)).pos.y - 712), { timeout: 20_000 }).toBeLessThan(3);
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('ArrowUp');
    // The turnstiles have it: the keys are still down while they welcome the owl, and it stands in the
    // turnstile it went into, however far a slow frame carried it on (2350 is the gate's left end).
    await expect(page.getByText('Welcome to Owl Park!')).toBeVisible({ timeout: 20_000 });
    expect((await state(page)).pos.x).toBeLessThan(2360);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.up('ArrowRight');
    // Slid along to the far end it would come out at the path's right (2490); it went in at the left end.
    expect((await inTheHub(page)).x).toBeLessThan(2350);
  });

  test('held up against the turnstile line, then right as well, the owl slides along it into the left turnstile (OP-124)', async ({ page }) => {
    test.slow(); // two rooms drawn with software WebGL on CI runners
    await beforeTheGate(page);
    await page.keyboard.down('ArrowUp');
    // Up against the line, short of the gate, and standing.
    await expect.poll(async () => (await state(page)).walking === false && (await state(page)).pos.y < 714, { timeout: 20_000 }).toBe(true);
    expect((await state(page)).pos.x).toBeLessThan(2350);
    await page.keyboard.down('ArrowRight');
    await expect(page.getByText('Welcome to Owl Park!')).toBeVisible({ timeout: 20_000 });
    expect((await state(page)).pos.x).toBeLessThan(2360);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('ArrowUp');
    expect((await inTheHub(page)).x).toBeLessThan(2350);
  });

  test('one slow frame over the narrow end of the turnstiles: the owl still goes through the left one (OP-124)', async ({ page }) => {
    test.slow(); // two rooms drawn with software WebGL on CI runners
    // Held up from here, the owl stands 6 px under the turnstile line, and its slide along the line is
    // in the gate for only 40 px (from x 2350 to 2390): less than a slow frame's walk.
    await beforeTheGate(page, 759.1);
    await expect.poll(async () => Math.hypot((await state(page)).pos.x - 2250, (await state(page)).pos.y - 759.1), { timeout: 20_000 }).toBeLessThan(0.5);
    await page.keyboard.down('ArrowUp');
    await expect.poll(async () => (await state(page)).walking === false && (await state(page)).pos.y < 714, { timeout: 20_000 }).toBe(true);
    // A 350 ms frame as the owl nears the gate: it is found next 90 px on, past that stretch and outside the gate.
    await page.evaluate(() => {
      const stall = () => {
        if ((window.owlPark.state()?.pos.x ?? 0) <= 2330) return requestAnimationFrame(stall);
        const end = performance.now() + 350;
        while (performance.now() < end) {
          // the page is busy
        }
      };
      requestAnimationFrame(stall);
    });
    await page.keyboard.down('ArrowRight');
    await expect(page.getByText('Welcome to Owl Park!')).toBeVisible({ timeout: 20_000 });
    expect((await state(page)).pos.x).toBeLessThan(2360);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('ArrowUp');
    expect((await inTheHub(page)).x).toBeLessThan(2350);
  });
});
