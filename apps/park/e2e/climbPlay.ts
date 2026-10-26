import { expect, type Page } from '@playwright/test';
import { doAction, state, walkAndStop } from './helpers';

/**
 * Playing the stained-glass climb in a browser test. The climb is the page's own (window.owlPark.climb),
 * so a test plays it by its rules from what the page shows of it: it holds the keys toward the next
 * ledge, jumps at the ledge's end, jumps again at the top of the first jump where a storey needs it,
 * and holds the jump to glide across the open field higher up, as a player at a keyboard would.
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
 * Climb until the owl's band is at least `band`, or `timeout` ms pass. Says how it went: 'reached',
 * or where it got to. Each frame it reads the owl and the tower from the page and presses the keys.
 */
export async function climbTo(page: Page, band: number, timeout = 200_000): Promise<string> {
  return page.evaluate(
    ({ target, timeout }) => {
      interface P {
        x: number;
        y: number;
        w: number;
        road?: string;
      }
      const first = window.owlPark.climb();
      if (!first) return Promise.resolve('no run');
      const layout = first.layout as { start: P; ledges: readonly P[]; bandLines: readonly number[] };
      const W = 480;
      const OWL_W = 36;
      // The driver takes the stairs: the high road is the player's gamble, not the test's.
      const plats: P[] = [layout.start, ...layout.ledges.filter((l) => l.road !== 'high'), ...layout.bandLines.map((y) => ({ x: 0, y, w: W }))].sort((a, b) => a.y - b.y || a.x - b.x);
      const key = (type: 'keydown' | 'keyup', code: string) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true }));
      let holding: string | null = null;
      const hold = (code: string | null) => {
        if (holding === code) return;
        if (holding) key('keyup', holding);
        holding = code;
        if (code) key('keydown', code);
      };
      let jumpHeld = false;
      const jumpDown = () => {
        if (jumpHeld) return;
        key('keydown', 'Space');
        jumpHeld = true;
      };
      const jumpUp = () => {
        if (!jumpHeld) return;
        key('keyup', 'Space');
        jumpHeld = false;
      };
      const overlaps = (x: number, p: P) => x - OWL_W / 2 < p.x + p.w && x + OWL_W / 2 > p.x;
      // The jump planned at the last press, whether the owl has been seen in the air since, and how many frames it has waited to leave the ground.
      let plan: { kind: 'single' | 'double' | 'glide'; airborne: boolean; waited: number } | null = null;
      // On each balcony the driver takes a breath, as a visitor on the stairs would: the brisk feather is the high road's.
      let balconyAt: number | null = null;
      const begun = performance.now();
      // On a slow runner a frame is long and the owl moves far between two looks: the press comes one frame early.
      let lastTick = begun;
      const letGo = () => {
        hold(null);
        jumpUp();
      };
      return new Promise<string>((resolve) => {
        const tick = () => {
          const now = performance.now();
          const dt = Math.min(0.2, Math.max(0.016, (now - lastTick) / 1000));
          lastTick = now;
          const r = window.owlPark.climb();
          const s = r?.state;
          if (!r || !s) {
            letGo();
            return resolve('no run');
          }
          if (s.band >= target) {
            letGo();
            return resolve('reached');
          }
          if (performance.now() - begun > timeout) {
            letGo();
            return resolve(`timed out at band ${s.band}, ${Math.round(s.y)} px up`);
          }
          if (s.grounded) {
            // A press takes a frame or two to lift the owl: hold on until it has, or give up on the press.
            if (plan && !plan.airborne && plan.waited++ < 20) return requestAnimationFrame(tick);
            if (plan && jumpHeld) jumpUp();
            plan = null;
            const cur = plats.find((p) => Math.abs(p.y - s.y) < 1 && overlaps(s.x, p)) ?? layout.start;
            const next = plats.find((p) => p.y > s.y + 1);
            if (!next) {
              letGo();
              return resolve('nothing above');
            }
            const dy = next.y - cur.y;
            const kind = dy <= 140 ? 'single' : dy <= 190 ? 'double' : 'glide';
            const nextCx = next.x + next.w / 2;
            const overlapping = next.x < cur.x + cur.w && next.x + next.w > cur.x;
            if (cur.w >= W) {
              balconyAt ??= performance.now();
              if (performance.now() - balconyAt < 1500) {
                hold(null);
                return requestAnimationFrame(tick);
              }
            } else balconyAt = null;
            if (cur.w >= W || overlapping) {
              // A balcony spans the field, or the next ledge sits over this one: get under it (as near its
              // middle as this ledge allows), let the run die down a little and jump straight up.
              const aim = Math.max(cur.x + OWL_W / 2 + 6, Math.min(cur.x + cur.w - OWL_W / 2 - 6, nextCx));
              const under = Math.abs(s.x - aim) <= (cur.w >= W ? next.w / 2 - 30 : 8);
              if (!under) hold(aim > s.x ? 'ArrowRight' : 'ArrowLeft');
              else {
                hold(null);
                if (Math.abs(s.vx) < 160) {
                  plan = { kind, airborne: false, waited: 0 };
                  jumpDown();
                }
              }
            } else {
              // A ledge: run toward the next one and jump at this one's end (a frame early, so a long frame cannot run the owl off it).
              const toward = nextCx > cur.x + cur.w / 2 ? 1 : -1;
              const end = toward > 0 ? cur.x + cur.w : cur.x;
              const edge = toward > 0 ? s.x + OWL_W / 2 : s.x - OWL_W / 2;
              hold(toward > 0 ? 'ArrowRight' : 'ArrowLeft');
              const left = toward > 0 ? end - edge : edge - end;
              if (left <= 10 + Math.abs(s.vx) * dt && Math.sign(s.vx) === toward) {
                plan = { kind, airborne: false, waited: 0 };
                jumpDown();
              }
            }
          } else if (plan) {
            plan.airborne = true;
            if (plan.kind === 'single') {
              if (s.vy <= 0) jumpUp();
            } else if (s.jumpsUsed === 1) {
              // At the top of the first jump: the second press.
              if (s.vy <= 0) {
                jumpUp();
                jumpDown();
              }
            } else if (s.jumpsUsed === 2) {
              if (plan.kind === 'glide') jumpDown();
              else if (s.vy <= 0) jumpUp();
            }
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    },
    { target: band, timeout },
  );
}
