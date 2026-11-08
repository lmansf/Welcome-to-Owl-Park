/**
 * The browser walk: every room of the park opened in the page, from each of its spawns, at a desktop's
 * width and at a phone's (playwright.config.ts). For every room it records:
 *  - errors the page throws or logs;
 *  - whether the owl is on the screen when it comes in, and stands where the room has floor or a ledge;
 *  - every open doorway at floor height walked to from the nearest spawn, and the room it led to
 *    (a doorway up on a ledge is the sim's: the walk here only walks);
 *  - on a phone, the doorways on screen at entry that a button or panel covers;
 *  - a screenshot of each room as it opens.
 *
 * The rooms, spawns and doorways come from out/plan.json (pnpm plan), written from packages/shared, so a
 * new room is walked with nothing added here. What is recorded goes to out/browser for report.mjs, which
 * decides what fails.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type Page } from '@playwright/test';
import type { PlanRoom } from './plan';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'out');
const PLAN = (JSON.parse(readFileSync(join(OUT, 'plan.json'), 'utf8')) as { rooms: PlanRoom[] }).rooms;
/** A doorway is walked from the spawn nearest it; the walk gets this long to change the room (ms). */
const DOOR_MS = 45_000;
/** Two positions this close (room px) are the same place: a walk that has stopped. */
const STILL = 1;

type Pt = { x: number; y: number };
type ParkState = {
  room: string;
  pos: Pt;
  height: number;
  walking: boolean;
  connected: boolean;
  doors: Array<{ id: string; x: number; y: number; to: string | undefined }>;
};
type Cam = { viewX: number; viewY: number; viewW: number; viewH: number; zoom: number; dpr: number; port: { x: number; y: number; w: number; h: number } };
type Hook = { state(): ParkState | null; walkTo(x: number, y: number): void; camera(): Cam | null; game: { scale: { width: number; height: number }; canvas: HTMLCanvasElement } };

export interface EntryResult {
  kind: 'entry';
  project: string;
  room: string;
  spawn: string;
  opened: boolean;
  errors: string[];
  onScreen: boolean | null;
  onFloor: boolean | null;
  pos: Pt | null;
  covered: Array<{ door: string; by: string }>;
  shot: string | null;
}

export interface DoorResult {
  kind: 'door';
  project: string;
  room: string;
  door: string;
  spawn: string;
  /** Where the room's doorway leads on this map (null: shut here, not walked). */
  to: string | null;
  /** The room the owl was in when the walk ended. */
  wentTo: string | null;
  ms: number;
  errors: string[];
  /** Places on the walk where the owl stood on no floor or ledge. */
  offFloor: Pt[];
  /** Where the owl stopped, when it stopped short of the doorway. */
  stoppedAt: Pt | null;
}

function inPoly(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Whether an owl at `p` stands where the room has floor or a ledge (a point on a polygon's edge counts). */
function standsOn(room: PlanRoom, p: Pt): boolean {
  const near = [p, { x: p.x + 2, y: p.y }, { x: p.x - 2, y: p.y }, { x: p.x, y: p.y + 2 }, { x: p.x, y: p.y - 2 }];
  return near.some((q) => room.floor.some((f) => inPoly(q, f)) || room.ledges.some((l) => inPoly(q, l.area)));
}

function save(name: string, data: EntryResult | DoorResult): void {
  const dir = join(OUT, 'browser', data.project);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(data, null, 1));
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`thrown: ${e.message}`.slice(0, 300)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`logged: ${m.text()}`.slice(0, 300));
  });
  return errors;
}

async function open(page: Page, room: string, spawn: string): Promise<boolean> {
  const q = new URLSearchParams({ transport: 'local', room, spawn });
  await page.goto(`/?${q.toString()}`);
  try {
    await page.waitForFunction((r) => {
      const s = (window as unknown as { owlPark?: Hook }).owlPark?.state?.();
      return s?.connected === true && s.room === r;
    }, room, { timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

async function now(page: Page): Promise<ParkState | null> {
  return page.evaluate(() => (window as unknown as { owlPark?: Hook }).owlPark?.state?.() ?? null).catch(() => null);
}

function nearestSpawn(room: PlanRoom, x: number, y: number): string {
  let best = Object.keys(room.spawns)[0]!;
  let d = Infinity;
  for (const [id, p] of Object.entries(room.spawns)) {
    const e = Math.hypot(p.x - x, room.side ? 0 : p.y - y);
    if (e < d) {
      d = e;
      best = id;
    }
  }
  return best;
}

for (const room of PLAN) {
  test.describe(room.id, () => {
    for (const spawn of Object.keys(room.spawns)) {
      test(`comes in at ${spawn}`, async ({ page }, info) => {
        const errors = watchErrors(page);
        const opened = await open(page, room.id, spawn);
        const r: EntryResult = { kind: 'entry', project: info.project.name, room: room.id, spawn, opened, errors, onScreen: null, onFloor: null, pos: null, covered: [], shot: null };
        if (opened) {
          // Let the camera settle on the owl.
          await page.waitForTimeout(1200);
          const seen = await page.evaluate(() => {
            const h = (window as unknown as { owlPark: Hook }).owlPark;
            const s = h.state();
            const c = h.camera();
            if (!s || !c) return null;
            const rect = h.game.canvas.getBoundingClientRect();
            const toCss = (p: { x: number; y: number }) => ({
              x: rect.left + ((c.port.x + (p.x - c.viewX) * c.zoom) * rect.width) / h.game.scale.width,
              y: rect.top + ((c.port.y + (p.y - c.viewY) * c.zoom) * rect.height) / h.game.scale.height,
            });
            const owlY = s.pos.y - s.height;
            const onScreen = s.pos.x >= c.viewX && s.pos.x <= c.viewX + c.viewW && owlY >= c.viewY - 40 && owlY <= c.viewY + c.viewH;
            const covered: Array<{ door: string; by: string }> = [];
            for (const d of s.doors) {
              if (!d.to) continue;
              if (d.x < c.viewX || d.x > c.viewX + c.viewW || d.y < c.viewY || d.y > c.viewY + c.viewH) continue;
              const p = toCss(d);
              const el = document.elementFromPoint(p.x, p.y);
              if (el && el.tagName !== 'CANVAS') covered.push({ door: d.id, by: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className ? `.${el.className.split(' ')[0]}` : ''}` });
            }
            return { pos: s.pos, onScreen, covered };
          });
          if (seen) {
            r.pos = seen.pos;
            r.onScreen = seen.onScreen;
            r.onFloor = standsOn(room, seen.pos);
            r.covered = info.project.name === 'phone' ? seen.covered : [];
          }
          if (spawn === Object.keys(room.spawns)[0]) {
            const shot = join(OUT, 'shots', info.project.name, `${room.id}.png`);
            mkdirSync(dirname(shot), { recursive: true });
            await page.screenshot({ path: shot }).catch(() => undefined);
            r.shot = `${info.project.name}/${room.id}.png`;
          }
        }
        save(`${room.id}--in--${spawn}`, r);
      });
    }

    for (const door of room.doors) {
      // A doorway up on a ledge is reached by flying, which the sim plays; the walk takes those at floor height.
      if (!door.to || (room.side && door.top > 4)) continue;
      const cx = door.x + door.w / 2;
      const cy = door.y + door.h / 2;
      const spawn = nearestSpawn(room, cx, cy);
      test(`walks through ${door.id}`, async ({ page }, info) => {
        test.setTimeout(DOOR_MS + 60_000);
        const errors = watchErrors(page);
        const r: DoorResult = { kind: 'door', project: info.project.name, room: room.id, door: door.id, spawn, to: null, wentTo: null, ms: 0, errors, offFloor: [], stoppedAt: null };
        if (!(await open(page, room.id, spawn))) {
          save(`${room.id}--door--${door.id}`, r);
          return;
        }
        const s0 = await now(page);
        const live = s0?.doors.find((d) => d.id === door.id);
        r.to = live?.to ?? null;
        if (!live?.to) {
          save(`${room.id}--door--${door.id}`, r);
          return;
        }
        const t0 = Date.now();
        await page.evaluate(({ x, y }) => (window as unknown as { owlPark: Hook }).owlPark.walkTo(x, y), { x: live.x, y: live.y });
        let last: Pt | null = null;
        let still = 0;
        while (Date.now() - t0 < DOOR_MS) {
          await page.waitForTimeout(200);
          const s = await now(page);
          if (!s) continue; // the next room loading
          if (s.room !== room.id) {
            r.wentTo = s.room;
            break;
          }
          if (!standsOn(room, s.pos) && r.offFloor.length < 10) r.offFloor.push({ x: Math.round(s.pos.x), y: Math.round(s.pos.y) });
          // A walk that has stopped short of the doorway is asked for again once, then given up on.
          if (last && Math.hypot(s.pos.x - last.x, s.pos.y - last.y) < STILL && !s.walking) {
            still += 1;
            if (still === 5) await page.evaluate(({ x, y }) => (window as unknown as { owlPark: Hook }).owlPark.walkTo(x, y), { x: live.x, y: live.y });
            if (still >= 25) {
              r.stoppedAt = { x: Math.round(s.pos.x), y: Math.round(s.pos.y) };
              break;
            }
          } else still = 0;
          last = s.pos;
        }
        if (r.wentTo === null && r.stoppedAt === null) {
          const s = await now(page);
          if (s && s.room !== room.id) r.wentTo = s.room;
          else if (s) r.stoppedAt = { x: Math.round(s.pos.x), y: Math.round(s.pos.y) };
        }
        r.ms = Date.now() - t0;
        if (r.wentTo === null) {
          const shot = join(OUT, 'shots', info.project.name, `${room.id}--${door.id}--stuck.png`);
          mkdirSync(dirname(shot), { recursive: true });
          await page.screenshot({ path: shot }).catch(() => undefined);
        }
        save(`${room.id}--door--${door.id}`, r);
      });
    }
  });
}
