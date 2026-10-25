import { expect, type Page } from '@playwright/test';
import { doAction, state, walkAndStop } from './helpers';

/**
 * Playing the arcade's games in a browser test. A run's game is the page's own (window.owlPark.arcade),
 * so a test plays it by its rules: it looks ahead on a copy of the game, then taps or pulls on the
 * screen as a player would.
 */

/** Where each cabinet's spot is in the arcade (room pixels): one in each of the hall's three bays. */
export const CABINET = { crossing: { x: 620, y: 842 }, flight: { x: 1900, y: 820 }, sling: { x: 3995, y: 810 } } as const;
export type Game = keyof typeof CABINET;

/** A walk along the hall's open floor, in legs short enough for walkAndStop's wait (about 9 s each at the owl's pace). */
export async function alongTheHall(page: Page, x: number, y: number): Promise<void> {
  const LEG = 2400;
  let at = await walkAndStop(page, (await state(page)).pos.x, 850);
  while (Math.abs(x - at.x) > LEG) at = await walkAndStop(page, at.x + Math.sign(x - at.x) * LEG, 850);
  await walkAndStop(page, x, y);
}

/** Each game's paintings (arcade/paint.ts): once all of them ship with the park, its runs are drawn from them. */
const GAME_ART: Readonly<Record<Game, readonly string[]>> = {
  crossing: ['arcade-hop-bg', 'arcade-hop-drone', 'arcade-hop-cart'],
  flight: ['arcade-flap-bg', 'arcade-flap-branch', 'arcade-flap-ground'],
  sling: ['arcade-knock-bg', 'arcade-knock-sling', 'arcade-knock-crate', 'arcade-knock-stand'],
};

/** Whether the park serves this piece of art (a WebP or a PNG; a missing file comes back as the page, or not at all). */
async function served(page: Page, key: string): Promise<boolean> {
  for (const ext of ['webp', 'png']) {
    const r = await page.request.get(`/art/${key}.${ext}`);
    if (r.ok() && (r.headers()['content-type'] ?? '').startsWith('image/')) return true;
  }
  return false;
}

/** The run under way is drawn from its game's paintings when they ship with the park, and in neon until then. */
export async function paintedAsShipped(page: Page, game: Game): Promise<void> {
  const shipped = (await Promise.all(GAME_ART[game].map((k) => served(page, k)))).every(Boolean);
  expect(await page.evaluate(() => window.owlPark.arcade()?.painted ?? null), `${game} painted`).toBe(shipped);
}

/** Onto the open floor, along the hall to a cabinet, and Play. */
export async function playAt(page: Page, game: Game): Promise<void> {
  await alongTheHall(page, CABINET[game].x, CABINET[game].y);
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
 * How late a test's tap can come, in frames: the page acts only between frames, and the game steps at
 * most 100 ms at once however slow a frame is (MAX_CATCH_UP_MS in arcade/field.ts).
 */
const LATE_FRAMES = [0, 3, 6];

/**
 * Hoot & Hop: one crossing. Looks ahead on a copy of the game for the first moment a dash all the way
 * across is sure: begun then or up to 100 ms after, with each hop after a landing coming up to 100 ms
 * late, it gets across. Waits at the kerb for that moment and dashes. Looks up to 20 s of play ahead;
 * a course with no such moment by then is 'no chance to cross'. Says how it went: 'across', or how it
 * ended.
 */
export async function crossOnce(page: Page): Promise<string> {
  const outcome = await page.evaluate(async (late) => {
    interface Hop {
      score: number;
      over: boolean;
      time: number;
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
    /** A dash from `from`: a hop at once, then another `lag` frames after each landing. */
    const dash = (from: Hop, lag: number) => {
      const c = from.clone();
      c.tap();
      for (let i = 0; i < 3000 && !c.over && c.score < banked; i++) {
        c.advance(FRAME);
        if (c.hop) continue;
        for (let k = 0; k < lag && !c.over; k++) c.advance(FRAME);
        c.tap();
      }
      return !c.over;
    };
    const later = (from: Hop, frames: number) => {
      const c = from.clone();
      for (let i = 0; i < frames; i++) c.advance(FRAME);
      return c;
    };
    const sure = (from: Hop) => late.every((s) => late.every((lag) => dash(later(from, s), lag)));
    /** The game time of the first sure moment from here, within 20 s of play, or null. */
    const find = (): number | null => {
      const probe = g.clone();
      for (let f = 0; f < 1200 && !probe.over; f++) {
        if (dash(probe, 0) && sure(probe)) return probe.time;
        probe.advance(FRAME);
      }
      return null;
    };
    let at = find();
    if (at === null) return 'no chance to cross';
    const latest = Math.max(...late) * FRAME;
    let started = false;
    const t0 = performance.now();
    await new Promise<void>((done) => {
      const tick = () => {
        if (g.over || g.score >= banked || at === null || performance.now() - t0 > 75_000) return done();
        if (!g.hop) {
          if (started) tap();
          else if (g.time >= at) {
            // Too late for that moment (the page stalled before it): look again from here.
            if (g.time > at + latest) at = find();
            else {
              started = true;
              tap();
            }
          }
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
    return g.over ? `bumped at ${g.score}` : g.score >= banked ? 'across' : 'no chance to cross';
  }, LATE_FRAMES);
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
 * flapping would end the run. A page cannot act between its frames, and the game steps up to 100 ms
 * at once (MAX_CATCH_UP_MS in arcade/field.ts), so a choice must hold through 100 ms with no say;
 * when none does, the one that holds frame by frame.
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
    /** The most the game steps at once, and a step more. */
    const BLIND = 100 + 1000 / 120;
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
    let slowest = 0;
    await new Promise<void>((done) => {
      const tick = () => {
        const now = performance.now();
        slowest = Math.max(slowest, now - last);
        last = now;
        if (g.over || g.score >= gaps || now - t0 > 60_000) return done();
        for (const blind of [BLIND, 0]) {
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
