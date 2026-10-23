import { expect, type Page } from '@playwright/test';
import { doAction, walkAndStop } from './helpers';

/**
 * Playing the arcade's games in a browser test. A run's game is the page's own (window.owlPark.arcade),
 * so a test plays it by its rules: it looks ahead on a copy of the game, then taps or pulls on the
 * screen as a player would.
 */

/** Where each cabinet's spot is in the arcade (room pixels). */
export const CABINET_X = { crossing: 527, flight: 803, sling: 1086 } as const;
export type Game = keyof typeof CABINET_X;

/** Onto the open floor, along to a cabinet, and Play. */
export async function playAt(page: Page, game: Game): Promise<void> {
  await walkAndStop(page, 300, 850);
  await walkAndStop(page, CABINET_X[game], 780);
  await doAction(page, `cabinet-${game}`);
  await expect.poll(() => page.evaluate(() => window.owlPark.arcade()?.game ?? null), { timeout: 10_000 }).toBe(game);
}

/** The run as it stands: its score, whether it is over, and for Nest Knockdown its stack and phase. */
export async function run(page: Page): Promise<{ score: number; over: boolean; level: number | null; phase: string | null } | null> {
  return page.evaluate(() => {
    const r = window.owlPark.arcade();
    if (!r) return null;
    const sim = r.sim as unknown as { score: number; over: boolean; level?: number; phase?: string };
    return { score: sim.score, over: sim.over, level: sim.level ?? null, phase: sim.phase ?? null };
  });
}

/**
 * Hoot & Hop: one crossing. At every chance to hop, look ahead on a copy of the game: hop when a dash
 * from here gets all the way across, even with the page several frames slow at each landing;
 * otherwise stay put while staying is safe. Says how it went: 'across', or how it ended.
 */
export async function crossOnce(page: Page): Promise<string> {
  const outcome = await page.evaluate(async () => {
    interface Hop {
      score: number;
      over: boolean;
      hop: unknown;
      tap(): void;
      advance(ms: number): void;
      clone(): Hop;
    }
    const g = window.owlPark.arcade()?.sim as unknown as Hop | undefined;
    if (!g) return 'no run';
    const stage = document.querySelector('.arcade [data-stage]') as HTMLElement;
    const tap = () => stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
    const FRAME = 1000 / 60;
    const banked = g.score + 1;
    /** A dash from now: a hop at once, then another `lag` frames after each landing. */
    const dashes = (lag: number) => {
      const c = g.clone();
      c.tap();
      for (let i = 0; i < 3000 && !c.over && c.score < banked; i++) {
        c.advance(FRAME);
        if (c.hop) continue;
        for (let k = 0; k < lag && !c.over; k++) c.advance(FRAME);
        c.tap();
      }
      return !c.over;
    };
    const stays = (ms: number) => {
      const c = g.clone();
      for (let t = 0; t < ms; t += FRAME) c.advance(FRAME);
      return !c.over;
    };
    const t0 = performance.now();
    await new Promise<void>((done) => {
      const tick = () => {
        if (g.over || g.score >= banked || performance.now() - t0 > 60_000) return done();
        if (!g.hop && ((dashes(0) && dashes(3) && dashes(6) && dashes(9)) || (!stays(200) && dashes(0)))) tap();
        requestAnimationFrame(tick);
      };
      tick();
    });
    return g.over ? `bumped at ${g.score}` : g.score >= banked ? 'across' : 'no chance to cross';
  });
  return outcome;
}

/** Hoot & Hop: hop into the next lane as a vehicle comes, until the owl is bumped. */
export async function getBumped(page: Page): Promise<void> {
  const over = await page.evaluate(async () => {
    interface Hop {
      over: boolean;
      row: number;
      heading: number;
      hop: unknown;
      clearFor(lane: number, ms: number): boolean;
    }
    const g = window.owlPark.arcade()?.sim as unknown as Hop | undefined;
    if (!g) return false;
    const stage = document.querySelector('.arcade [data-stage]') as HTMLElement;
    const tap = () => stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
    const t0 = performance.now();
    await new Promise<void>((done) => {
      const tick = () => {
        if (g.over || performance.now() - t0 > 40_000) return done();
        if (!g.hop && !g.clearFor(g.row + g.heading, 260)) tap();
        requestAnimationFrame(tick);
      };
      tick();
    });
    return g.over;
  });
  expect(over).toBe(true);
}

/**
 * Moon Flap: through `gaps` gaps, then let the owl fall. Each frame looks ahead on a copy of the
 * flight: flap when the owl has sunk below the next gap's middle and a flap is safe, or when not
 * flapping would end the run. A slow page cannot act between its frames, so a choice must hold
 * through a frame as slow as the slowest of late (a phone in a busy test run drops frames).
 */
export async function flyThrough(page: Page, gaps: number): Promise<void> {
  const { score, slowest } = await page.evaluate(async (gaps) => {
    interface Flap {
      score: number;
      over: boolean;
      y: number;
      vy: number;
      ahead(): { gapY: number } | undefined;
      tap(): void;
      advance(ms: number): void;
      clone(): Flap;
    }
    const g = window.owlPark.arcade()?.sim as unknown as Flap | undefined;
    if (!g) return { score: -1, slowest: 0 };
    const stage = document.querySelector('.arcade [data-stage]') as HTMLElement;
    const tap = () => stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
    const FRAME = 1000 / 60;
    const steady = (f: Flap) => f.y > (f.ahead()?.gapY ?? 320) + 18 && f.vy > 0;
    /** Whether the flight lasts the next second, flapping now or not, with no say for `blind` ms and steady flaps after. */
    const lasts = (flapNow: boolean, blind: number) => {
      const c = g.clone();
      if (flapNow) c.tap();
      for (let i = 0; i < 60 && !c.over; i++) {
        c.advance(FRAME);
        if ((i + 1) * FRAME >= blind && steady(c)) c.tap();
      }
      return !c.over;
    };
    tap();
    const t0 = performance.now();
    let last = t0;
    let slow = 50;
    let slowest = 0;
    await new Promise<void>((done) => {
      const tick = () => {
        const now = performance.now();
        slowest = Math.max(slowest, now - last);
        // The next frame may be as slow as the slowest of late (forgotten bit by bit).
        slow = Math.min(150, Math.max(34, slow * 0.98, (now - last) * 1.5));
        last = now;
        if (g.over || g.score >= gaps || now - t0 > 60_000) return done();
        // A choice that holds through a slow frame, or one that holds frame by frame when none does.
        for (const blind of [slow, 0]) {
          const flap = lasts(true, blind);
          const wait = lasts(false, blind);
          if (!flap && !wait) continue;
          if (flap && (steady(g) || !wait)) tap();
          break;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
    return { score: g.score, slowest: Math.round(slowest) };
  }, gaps);
  expect(score, `the slowest frame took ${slowest} ms`).toBeGreaterThanOrEqual(gaps);
}

export async function untilOver(page: Page): Promise<void> {
  await expect.poll(async () => (await run(page))?.over ?? null, { timeout: 30_000, intervals: [100] }).toBe(true);
}

/** Nest Knockdown, by the keys: the first stack in one shot, then the second missed three times. */
export async function knockByKeys(page: Page): Promise<void> {
  const press = async (key: string, n: number) => {
    for (let i = 0; i < n; i++) await page.keyboard.press(key);
  };
  // From the aim it starts with (25 degrees, 0.7 of a full pull): 19 degrees and 0.78 knock the first stack down.
  await press('ArrowDown', 3);
  await press('ArrowRight', 2);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await run(page))?.level, { timeout: 15_000 }).toBe(1);
  await missThrice(page);
}

/** Nest Knockdown, by a pull on the screen: back and a little down, and let go; then the second stack missed. */
export async function knockByPull(page: Page): Promise<void> {
  const box = await page.locator('.arcade [data-stage]').boundingBox();
  if (!box) throw new Error('no stage');
  // The field fills the stage as tall or as wide as it fits; a pull of 103 field pixels at 17 degrees.
  const k = Math.min(box.width / 480, box.height / 640);
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const len = 0.86 * 120 * k;
  const a = (17 * Math.PI) / 180;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - Math.cos(a) * len, from.y + Math.sin(a) * len, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await run(page))?.level, { timeout: 15_000 }).toBe(1);
  await missThrice(page);
}

/** Three shots into the ground: the second stack stands, and the run is over. */
async function missThrice(page: Page): Promise<void> {
  await expect.poll(async () => (await run(page))?.phase, { timeout: 15_000 }).toBe('aim');
  await page.locator('.arcade [data-stage]').focus();
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowDown');
  for (let shot = 0; shot < 3; shot++) {
    await expect.poll(async () => (await run(page))?.phase, { timeout: 15_000 }).toBe('aim');
    await page.keyboard.press('Space');
    await expect.poll(async () => (await run(page))?.phase, { timeout: 15_000 }).not.toBe('aim');
  }
  await untilOver(page);
}
