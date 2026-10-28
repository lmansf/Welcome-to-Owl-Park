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
  crossing: ['arcade-hop-bg', 'arcade-hop-drone', 'arcade-hop-cart', 'arcade-hop-bat', 'arcade-hop-log', 'arcade-hop-river'],
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
  await pastHowTo(page);
}

/** A game's first run on a device opens on its how-to card (OP-137): Play puts it away. */
export async function pastHowTo(page: Page): Promise<void> {
  const go = page.locator('.arcade [data-howto-go]');
  if (await go.isVisible()) await go.click();
  await expect(page.locator('.arcade [data-howto]')).toBeHidden();
}

/** The run as it stands: its score, whether it is over, its level (Hoot & Hop, Talon Toss's stack) and Talon Toss's phase. */
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
 * Hoot & Hop: a level cleared, by the keys (OP-137). The owl dashes up from one safe row (the kerb, a
 * pavement) to the next, or to the top of the street: it looks ahead on a copy of the game for the
 * first moment a dash is sure, with each hop after a landing coming up to 100 ms late; waits on its
 * safe row for that moment, checks the dash again on the spot (the key itself can come a frame or two
 * after it), and dashes, or looks again. Looks up to 20 s of play ahead each time. Says how it went:
 * 'cleared', or how it ended.
 */
export async function clearLevel(page: Page): Promise<string> {
  return page.evaluate(async (late) => {
    interface Hop {
      score: number;
      over: boolean;
      time: number;
      row: number;
      lives: number;
      cleared: number;
      hop: unknown;
      waiting: string | null;
      laneAt(row: number): { kind: string } | null;
      hopTo(dir: string): void;
      advance(ms: number): void;
      clone(): Hop;
    }
    const g = window.owlPark.arcade()?.sim as unknown as Hop | undefined;
    if (!g) return 'no run';
    const stage = document.querySelector('.arcade [data-stage]') as HTMLElement;
    const up = () => stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    const FRAME = 1000 / 60;
    const TOP = 6;
    const safe = (c: Hop, row: number) => row === 0 || row >= TOP || c.laneAt(row)?.kind === 'safe';
    /** A dash from `from`: a hop up at once, then another `lag` frames after each landing, to the next safe row. */
    const dash = (from: Hop, lag: number) => {
      const c = from.clone();
      const { lives, cleared, row } = c;
      c.hopTo('up');
      for (let i = 0; i < 3000; i++) {
        c.advance(FRAME);
        if (c.lives < lives || c.over) return false;
        if (c.cleared > cleared) return true;
        if (c.hop) continue;
        if (c.row > row && safe(c, c.row)) return true;
        for (let k = 0; k < lag; k++) c.advance(FRAME);
        if (c.lives < lives) return false;
        c.hopTo('up');
      }
      return false;
    };
    /** A dash from `from` gets there however late each hop after a landing comes. */
    const sure = (from: Hop) => late.every((lag) => dash(from, lag));
    /** The game time of the first sure moment from here, within 20 s of play, or null. */
    const find = (): number | null => {
      const probe = g.clone();
      for (let f = 0; f < 1200 && !probe.over; f++) {
        if (!probe.hop && !probe.waiting && sure(probe)) return probe.time;
        probe.advance(FRAME);
      }
      return null;
    };
    const cleared = g.cleared;
    let lives = g.lives;
    let at: number | null = null;
    let from: number | null = null;
    let lost = false;
    const t0 = performance.now();
    await new Promise<void>((done) => {
      const tick = () => {
        if (g.over || g.cleared > cleared || lost || performance.now() - t0 > 90_000) return done();
        if (g.lives < lives) {
          // Bumped on the way: give this run up (the caller ends it and plays again).
          lives = g.lives;
          lost = true;
          return done();
        }
        if (!g.hop && !g.waiting) {
          if (from !== null) {
            if (g.row > from && safe(g, g.row)) from = at = null;
            else up();
          }
          if (from === null) {
            at ??= find();
            if (at !== null && g.time >= at) {
              // The moment has come, or a frame or two ago: dash if it is still sure from here, else look again.
              if (sure(g)) {
                from = g.row;
                up();
              } else at = null;
            }
          }
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
    return g.cleared > cleared ? 'cleared' : g.over || lost ? `bumped at ${g.score}` : 'no chance to cross';
  }, LATE_FRAMES);
}

/** Hoot & Hop: hop up into the lanes as a hazard comes, until the last life is lost. */
export async function loseLives(page: Page): Promise<void> {
  const over = await page.evaluate(async () => {
    interface Hop {
      over: boolean;
      lives: number;
      hop: unknown;
      waiting: string | null;
      hopTo(dir: string): void;
      advance(ms: number): void;
      clone(): Hop;
    }
    const g = window.owlPark.arcade()?.sim as unknown as Hop | undefined;
    if (!g) return false;
    const stage = document.querySelector('.arcade [data-stage]') as HTMLElement;
    const up = () => stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    /** A hop up now loses a life within the next half second, or leads nowhere it could be lost. */
    const worth = () => {
      const c = g.clone();
      const lives = c.lives;
      c.hopTo('up');
      if (!c.hop) return false;
      for (let i = 0; i < 30; i++) {
        c.advance(1000 / 60);
        if (c.lives < lives) return true;
      }
      return false;
    };
    const t0 = performance.now();
    let idleSince = performance.now();
    await new Promise<void>((done) => {
      const tick = () => {
        if (g.over || performance.now() - t0 > 60_000) return done();
        if (g.hop || g.waiting) idleSince = performance.now();
        // A hop into a hazard as it comes; or, standing safe too long, a hop on up the street.
        else if (worth() || performance.now() - idleSince > 1500) {
          up();
          idleSince = performance.now();
        }
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
 * when none does, the one that holds frame by frame. Each flap is a press on `target`: the field, or
 * on a phone the pad's Interact (OP-137).
 */
export async function flyThrough(page: Page, gaps: number, target = '.arcade [data-stage]'): Promise<void> {
  const { score, slowest } = await page.evaluate(async ([gaps, target]) => {
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
    const stage = document.querySelector(target) as HTMLElement;
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
  }, [gaps, target] as const);
  expect(score, `the slowest frame took ${slowest} ms`).toBeGreaterThanOrEqual(gaps);
}

export async function untilOver(page: Page): Promise<void> {
  await expect.poll(async () => (await run(page))?.over ?? null, { timeout: 30_000, intervals: [100] }).toBe(true);
}

/** Talon Toss, by the keys: the first stack in one shot, then the second missed three times. */
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

/** Talon Toss, by a pull on the screen: back and a little down, and let go; then the second stack missed. */
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
