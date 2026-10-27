import { expect, type Page } from '@playwright/test';
import { doAction, state, walkAndStop } from './helpers';

/**
 * Playing the stained-glass climb in a browser test. The climb is the page's own (window.owlPark.climb):
 * a test checks the keys reach it (a jump, a dash), then lets the page's scripted climber take the
 * controls for the storeys, which no slow runner can mistime.
 */

/** The portal's spot at the east end of the glass realm (room pixels). */
export const PORTAL = { x: 2885, y: 745 };

/** From the realm's doorway along the floor to the portal. */
export async function toPortal(page: Page): Promise<void> {
  await walkAndStop(page, 1200, 780);
  await walkAndStop(page, PORTAL.x, PORTAL.y);
}

/** Climb at the portal: the card opens. */
export async function openClimb(page: Page): Promise<void> {
  await doAction(page, 'portal');
  await expect(page.locator('.climb [data-start]')).toBeVisible({ timeout: 10_000 });
}

/** Start (or carry on) from the card; the owl stands on the field. */
export async function startClimb(page: Page): Promise<void> {
  await page.locator('.climb [data-go]').click();
  await expect.poll(() => page.evaluate(() => window.owlPark.climb()?.state ?? null), { timeout: 10_000 }).not.toBeNull();
}

/** The run as the page keeps it. */
export function climbRun(page: Page) {
  return page.evaluate(() => window.owlPark.climb());
}

/** The owl in the room, standing. */
export async function standing(page: Page): Promise<{ x: number; y: number }> {
  await expect.poll(async () => (await state(page)).walking).toBe(false);
  return (await state(page)).pos;
}

/**
 * Climb with the page's own scripted climber (window.owlPark.climbAuto) until the owl's band is at
 * least `band`, or `timeout` ms pass. The climber takes the stairs and waits out the lanterns and
 * the gusts as the floor test does, in the simulation's own steps, so a slow runner cannot mistime it.
 */
export async function autoClimbTo(page: Page, band: number, timeout = 240_000): Promise<string> {
  expect(await page.evaluate(() => window.owlPark.climbAuto(true))).toBe(true);
  try {
    await expect.poll(() => page.evaluate(() => window.owlPark.climb()?.state?.band ?? -1), { timeout, intervals: [250] }).toBeGreaterThanOrEqual(band);
    return 'reached';
  } catch {
    const s = await page.evaluate(() => window.owlPark.climb()?.state ?? null);
    return s ? `timed out at band ${s.band}, ${Math.round(s.y)} px up` : 'no run';
  } finally {
    await page.evaluate(() => window.owlPark.climbAuto(false)).catch(() => undefined);
  }
}

/** The owl in the climb, as the page keeps it. */
export const climbState = (page: Page) => page.evaluate(() => window.owlPark.climb()?.state ?? null);

/** Press a key on the climb screen: down, held a moment, up. */
export async function tapKey(page: Page, code: string, holdMs = 120): Promise<void> {
  await page.keyboard.down(code);
  await page.waitForTimeout(holdMs);
  await page.keyboard.up(code);
}
