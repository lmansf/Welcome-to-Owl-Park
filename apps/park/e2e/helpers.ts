import { expect, type Page } from '@playwright/test';

export interface ParkState {
  room: string;
  pos: { x: number; y: number };
  walking: boolean;
  look: { body: string; belly: string; accent: string; species?: string; wear?: { head?: string; face?: string; neck?: string; pet?: string; fx?: string } };
  peers: Array<{
    id: string;
    pos: { x: number; y: number };
    walking: boolean;
    look: { body: string; belly: string; accent: string; species?: string; wear?: { head?: string; face?: string; neck?: string; pet?: string; fx?: string } };
    emote: string | null;
    /** How high this owl is drawn above the floor (OP-084), in room pixels. */
    height: number;
    /** On the ground (0), in the air (1) or gliding (2), as drawn. */
    air: 0 | 1 | 2;
    /** Asleep where it stands, its visitor idle a while (OP-126). */
    asleep: boolean;
  }>;
  /** How high this visitor's owl is drawn above the floor (OP-084), in room pixels; `pos` stays on the floor. */
  height: number;
  /** Its flight as it steps: height and speed up (room px, px/s), on the ground (0), in the air (1) or gliding (2), and flaps left. */
  air: { z: number; vz: number; s: 0 | 1 | 2; f: 0 | 1 };
  /** This visitor's owl is asleep: nothing done on the page for a while (OP-126). */
  asleep: boolean;
  /** The phrases in bubbles over the owls: whose (this visitor's own id included), and which. */
  bubbles: Array<{ id: string; n: number }>;
  connected: boolean;
  doors: Array<{ id: string; x: number; y: number; to: string | undefined }>;
  /** Where the owl's eyes are, left (-) or right (+) of its feet. */
  eyes: number;
  owlArt: string;
  /** NPC owls, the quest marker each shows, and whether its '!' says the visitor can talk to it now (OP-114). */
  npcs: Array<{ id: string; x: number; y: number; mark: string | null; approach: boolean }>;
  objects: Array<{ id: string; kind: string; x: number; y: number; here: boolean }>;
  items: Array<{ quest: string; n: number; kind: string; x: number; y: number }>;
  actions: string[];
  talkingTo: string | null;
  play: {
    lanterns: string[];
    glowing: boolean;
    line: 'idle' | 'out' | 'bite' | 'gone';
    copy: { tune: string[]; got: number; level: number; listening: boolean } | null;
    quiz: { n: number; right: 'a' | 'b' | 'c'; revealAt: number } | null;
  } | null;
  /** In the arcade: the score wall as the page shows it. */
  wall: { walls: Array<{ game: string; top: Array<{ score: number; look: { body: string; belly: string; accent: string; species?: string } }> }>; mine: Record<string, number> } | null;
  street: Array<{ kind: 'own'; nestId: string | null } | { kind: 'nest'; nestId: string; look: { body: string; belly: string; accent: string } | null } | { kind: 'empty' }> | null;
  nest: { id: string; mine: boolean; open: boolean; layout: Record<string, string>; owned: string[]; gift: { taken: boolean } | null; decorating: boolean; spot: string } | null;
  /** In a nest, its mirror: where it stands, and while Your owl is open at it, the stage the room's camera draws in (CSS pixels). */
  mirror: { x: number; y: number; stage: { x: number; y: number; w: number; h: number } | null } | null;
}

/** Walk the local owl into the middle of a doorway by id (from the live room definition). */
/** The admin key the local room server runs with in these tests (playwright.config.ts): a test value, not a secret. */
export const E2E_ADMIN_KEY = 'e2e-only-admin-key-not-a-secret';

/**
 * The stand-in store the local room server reaches in these tests (e2e/standInStore.mjs), and the
 * store settings it runs with (playwright.config.ts): test values, not secrets.
 */
export const E2E_STORE = {
  port: 8790,
  origin: 'http://localhost:8790',
  shop: 'owl-e2e.myshopify.com',
  token: 'e2e-only-store-token-not-a-secret',
  webhookKey: 'e2e-only-webhook-key-not-a-secret',
  passCode: 'E2E-OPENING-NIGHT',
  /** The store's ticket page the room server's client is built with (the booth sells while the gate takes tickets). */
  ticketsUrl: 'https://owl-e2e.myshopify.com/collections/tickets',
} as const;

export async function walkToDoor(page: Page, doorId: string): Promise<void> {
  const s = await state(page);
  const door = s.doors.find((d) => d.id === doorId);
  if (!door) throw new Error(`no door ${doorId} in ${s.room}`);
  await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), { x: door.x, y: door.y });
}

/**
 * Open the park (zero-backend local transport unless overridden) and wait for the room to be live.
 * Visits start in the lobby; these tests start in the hub unless they name a room.
 */
export async function openPark(page: Page, params: Record<string, string> = {}): Promise<void> {
  const q = new URLSearchParams({ transport: 'local', room: 'hub', ...params });
  await page.goto(`/?${q.toString()}`);
  await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
  if (q.get('transport') === 'edge') {
    // Connected means the socket exists; wait for the server's welcome (status dot goes online).
    await page.waitForFunction(() => document.querySelector('[data-dot]')?.getAttribute('data-status') === 'online', null, { timeout: 20_000 });
  }
}

export async function state(page: Page): Promise<ParkState> {
  // During a room change the scene restarts and loads its art, reporting no state for a while.
  const deadline = Date.now() + 15_000;
  for (;;) {
    const s = await page.evaluate(() => window.owlPark?.state() ?? null);
    if (s) return s as ParkState;
    if (Date.now() > deadline) throw new Error('room scene not active');
    await page.waitForTimeout(100);
  }
}

export type CameraView = { viewX: number; viewY: number; viewW: number; viewH: number; zoom: number; dpr: number; port: { x: number; y: number; w: number; h: number } };

export async function cameraView(page: Page): Promise<CameraView> {
  const cam = await page.evaluate(() => window.owlPark.camera());
  if (!cam) throw new Error('no camera');
  return cam;
}

/**
 * Let the page draw `n` more frames. For a check that something does not happen while the game runs
 * (an owl let go stays put), counted in the game's own updates rather than in milliseconds, so a slow
 * runner gives it as many updates as a quick one (OP-123).
 */
export async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        let left = n;
        const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );
}

/** Wait until the camera stops panning (it follows the owl with a lerp). */
export async function settleCamera(page: Page): Promise<CameraView> {
  let last = await cameraView(page);
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(100);
    const now = await cameraView(page);
    if (Math.abs(now.viewX - last.viewX) < 0.5 && Math.abs(now.viewY - last.viewY) < 0.5) return now;
    last = now;
  }
  return last;
}

/** Convert a room point to a CSS-pixel screen point using the live camera's visible world rectangle. */
export async function toScreen(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const cam = await cameraView(page);
  // Phaser renders at game pixels (CSS px * dpr); the camera's worldView is in room space.
  const gx = (x - cam.viewX) * cam.zoom;
  const gy = (y - cam.viewY) * cam.zoom;
  return { x: gx / cam.dpr, y: gy / cam.dpr };
}

/** Tap a room point through real pointer input and wait for the owl to arrive near it. */
export async function tapRoomPoint(page: Page, x: number, y: number): Promise<void> {
  const p = await toScreen(page, x, y);
  await page.mouse.click(p.x, p.y);
}

/**
 * The first of these room points with nothing of the HUD over it on screen and nothing in the room
 * that takes a tap there, so a tap there walks the owl to it (on a touch screen the action buttons
 * stand above the thumbstick, beside the owl).
 */
export async function openGround(page: Page, points: Array<{ x: number; y: number }>): Promise<{ x: number; y: number }> {
  for (const p of points) {
    const s = await toScreen(page, p.x, p.y);
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.tagName ?? '', [s.x, s.y]);
    if (hit === 'CANVAS' && !(await takesTap(page, s))) return p;
  }
  throw new Error('every candidate point is under the HUD or on something in the room that takes taps');
}

/**
 * Whether something in the room takes a tap at this screen point (CSS pixels) rather than the ground:
 * an owl to talk to, whose tap area reaches past it (OP-127), an idol, a set piece.
 */
async function takesTap(page: Page, s: { x: number; y: number }): Promise<boolean> {
  return page.evaluate(([x, y]) => {
    const cam = window.owlPark.camera();
    const scene = window.owlPark.game.scene.getScene('room');
    if (!cam || !scene) return false;
    // Phaser's pointers are in game pixels: CSS pixels times the device ratio.
    return scene.input.hitTestPointer({ x: x! * cam.dpr, y: y! * cam.dpr } as never).length > 0;
  }, [s.x, s.y]);
}

export async function waitForArrival(page: Page, x: number, y: number, tolerance = 6): Promise<void> {
  await expect
    .poll(async () => {
      const s = await state(page);
      return Math.hypot(s.pos.x - x, s.pos.y - y);
    }, { timeout: 15_000 })
    .toBeLessThan(tolerance);
}

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Walk the owl to a room point (owls walk in straight lines) and wait until it stands still. */
export async function walkAndStop(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), { x, y });
  await expect.poll(async () => (await state(page)).walking, { timeout: 15_000, intervals: [50] }).toBe(false);
  return (await state(page)).pos;
}

/** An owl's flight as a page drew it: how high it went (room px), how long it was off the floor, and whether it glided. */
export type FlightSeen = { peak: number; airMs: number; glided: boolean };

/**
 * The next flight a page draws (OP-084: its own owl's, or the first other owl's), sampled every
 * frame, too quick for polling. Done once the owl is back on the floor after leaving it, or after
 * `ms` with no flight.
 */
export function flightOf(page: Page, whose: 'own' | 'peer', ms = 8000): Promise<FlightSeen> {
  return page.evaluate(
    ({ whose, ms }) =>
      new Promise<{ peak: number; airMs: number; glided: boolean }>((resolve) => {
        let peak = 0;
        let up = 0;
        let glided = false;
        const start = performance.now();
        const tick = () => {
          const s = window.owlPark.state();
          const now = performance.now();
          const h = (whose === 'own' ? s?.height : s?.peers[0]?.height) ?? 0;
          const mode = whose === 'own' ? s?.air.s : s?.peers[0]?.air;
          if (h > 0 && !up) up = now;
          if (mode === 2) glided = true;
          peak = Math.max(peak, h);
          if ((up && h === 0) || now - start >= ms) resolve({ peak, airMs: up ? now - up : 0, glided });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { whose, ms },
  );
}

/** Hold the space bar down for `ms`, then let it go (OP-084: a jump held, a flap, a glide). */
export async function holdSpace(page: Page, ms: number): Promise<void> {
  await page.keyboard.down('Space');
  await page.waitForTimeout(ms);
  await page.keyboard.up('Space');
}

/** Wait for an action button where the owl stands, then press it. */
export async function doAction(page: Page, id: string): Promise<void> {
  await expect.poll(async () => (await state(page)).actions, { timeout: 10_000, intervals: [50] }).toContain(id);
  await page.locator(`[data-action="${id}"]`).click();
}

/** From the grove's clearing along the lawn to the pond, and out to the end of the jetty (owls walk in straight lines). */
export async function walkToJetty(page: Page): Promise<void> {
  await walkAndStop(page, 1880, 740);
  await walkAndStop(page, 1000, 700);
  await walkAndStop(page, 965, 640);
}
