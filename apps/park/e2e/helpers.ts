import { expect, type Locator, type Page } from '@playwright/test';

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
    /** Its take-offs as this page stepped them from the states it was told, as `flown` is for this visitor's own owl. */
    flown: { n: number; peak: number; glided: boolean; ms: number };
    /** Asleep where it stands, its visitor idle a while (OP-126). */
    asleep: boolean;
    /** Its wings open, and the body layer drawn (its flight copy while they are, OP-136), as for this visitor's own owl. */
    wings: boolean;
    owlWorn: string;
  }>;
  /** How high this visitor's owl is drawn above the floor (OP-084), in room pixels; `pos` stays on the floor. */
  height: number;
  /** Its flight as it steps: height and speed up (room px, px/s), on the ground (0), in the air (1) or gliding (2), and flaps left. */
  air: { z: number; vz: number; s: 0 | 1 | 2; f: 0 | 1 };
  /** Its take-offs as the flight steps them: how many on this page, and the last one's top (room px), whether it glided and how long it was up (ms, once down). */
  flown: { n: number; peak: number; glided: boolean; ms: number };
  /** This visitor's owl is asleep: nothing done on the page for a while (OP-126). */
  asleep: boolean;
  /** The phrases in bubbles over the owls: whose (this visitor's own id included), and which. */
  bubbles: Array<{ id: string; n: number }>;
  connected: boolean;
  /** The room's paintings drawn at 1x still, their sharp copies on the way (OP-129). */
  soft: string[];
  /** The art tiles that scroll at rates of their own (the tree's sky and overlay, OP-156). */
  layers: Array<{ key: string; rate: number; x: number; y: number; w: number; h: number; fade: { left: number; right: number } }>;
  /** How big the own owl is drawn against today's park (the tree's owls: 1.25). */
  owlScale: number;
  /** Where the camera's view is, in room pixels (OP-156). */
  view: { x: number; y: number; w: number; h: number };
  doors: Array<{ id: string; x: number; y: number; to: string | undefined }>;
  /** Where the owl's eyes are, left (-) or right (+) of its feet. */
  eyes: number;
  owlArt: string;
  /** The body layer drawn right now: `owlArt`, or with the wings out its flight copy (`owl-flight-body`), the folded wings taken away (OP-136). */
  owlWorn: string;
  /** Whether the owl's wings are open (OP-084). */
  wings: boolean;
  /** NPC owls, the quest marker each shows, and whether its '!' says the visitor can talk to it now (OP-114). */
  npcs: Array<{ id: string; x: number; y: number; mark: string | null; approach: boolean }>;
  objects: Array<{ id: string; kind: string; x: number; y: number; top: number; here: boolean }>;
  items: Array<{ quest: string; n: number; kind: string; x: number; y: number; top: number }>;
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
  nest: { id: string; mine: boolean; open: boolean; layout: Record<string, string>; drawn: Record<string, string>; owned: string[]; gift: { taken: boolean } | null; decorating: boolean; spot: string } | null;
  /** In a nest, its mirror: where it stands, and while Your owl is open at it, the stage the room's camera draws in (CSS pixels). */
  mirror: { x: number; y: number; stage: { x: number; y: number; w: number; h: number } | null } | null;
  /** The map's places walked into, and whether the owl is through the front gate, as the page has them (OP-130). */
  travel: { places: string[]; gate: boolean };
  /** The ledge painter, when it is up (OP-156, `?paint=1` with a keeper's token): game/ledgePainter.ts's PaintDebug. */
  paint: {
    tool: string;
    state: 'loading' | 'saved' | 'unsaved' | 'saving' | 'error';
    status: string;
    readout: string;
    own: string[];
    drawn: { ledges: string[]; walls: string[]; hazards: string[]; fronts: string[] };
    labels: number;
    selected: ({ kind: string; id: string } & Record<string, unknown>) | null;
    suggestions: Array<{ x0: number; x1: number; top: number }>;
    pending: number;
    trying: boolean;
    unsaved: boolean;
    draft: {
      ledges: Array<{ id: string; x0: number; x1: number; top: number }>;
      walls: Array<{ id: string; x: number; y0: number; y1: number }>;
      hazards: Array<{ id: string; x0: number; x1: number; top: number }>;
      fronts: Array<{ id: string; points: Array<{ x: number; y: number }> }>;
    };
  } | null;
}

/** The Menu opened on its map (OP-130) and one place's card on it, open. */
export async function mapCard(page: Page, place: string): Promise<Locator> {
  const menu = page.getByRole('dialog', { name: 'Menu' });
  if (!(await menu.isVisible())) await page.locator('[data-menu-btn]').click();
  await menu.locator('[data-tab="map"]').click();
  await menu.locator(`button.pin[data-place="${place}"]`).click();
  const card = menu.locator(`[data-travel-card="${place}"]`);
  await expect(card).toBeVisible();
  return card;
}

/** Travel from the map (OP-130): the place's card, its travel button pressed with a key (a key acts at once; a pointer holds it, travel.spec.ts). */
export async function travelTo(page: Page, place: string): Promise<void> {
  await (await mapCard(page, place)).locator('[data-travel]').press('Enter');
}

/** Walk the local owl into the middle of a doorway by id (from the live room definition). */
/** The admin key the local room server runs with in these tests (playwright.config.ts): a test value, not a secret. */
export const E2E_ADMIN_KEY = 'e2e-only-admin-key-not-a-secret';

/**
 * The stand-in store the local room server reaches in these tests (e2e/standInStore.mjs), and the
 * store settings it runs with (playwright.config.ts): test values, not secrets.
 */
/** Accounts in the browser tests (OP-139): the key emails are kept under there, and who the mail is from. */
export const E2E_ACCOUNTS = {
  secret: 'e2e-only-account-secret-not-a-secret',
  from: 'owls@e2e.test',
};

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

/** An owl's flight as a page stepped it: how high it went (room px), how long it was off the floor, and whether it glided. */
export type FlightSeen = { peak: number; airMs: number; glided: boolean };

/**
 * Do `act`, then this visitor's owl's flight that follows as its page stepped it (OP-084), once the
 * owl is back on the floor: how many take-offs, how high it went (room px), whether it glided and how
 * long it was up. Exact however few frames a runner draws: a tap let go at once hops a few pixels for
 * a fraction of a second, which a slow runner can step through between two frames, so the drawn owl,
 * read each frame, may miss it or show a jump's top a frame early.
 */
export async function steppedFlight(page: Page, act: () => Promise<unknown>): Promise<FlightSeen & { takeoffs: number }> {
  const before = (await state(page)).flown.n;
  await act();
  await expect.poll(async () => { const s = await state(page); return s.flown.n > before && s.air.s === 0; }, { timeout: 15_000, intervals: [50] }).toBe(true);
  const { n, peak, glided, ms } = (await state(page)).flown;
  return { takeoffs: n - before, peak, airMs: ms, glided };
}

/**
 * The first other owl's flight after the `before` take-offs this page had seen it make, as this page
 * stepped it from the states it was told (OP-084), once that owl is down: the same record as
 * steppedFlight's, so two pages' flights compare exactly however few frames a runner draws.
 */
export async function steppedPeerFlight(page: Page, before: number): Promise<FlightSeen & { takeoffs: number }> {
  const peer = async () => (await state(page)).peers[0];
  await expect.poll(async () => { const p = await peer(); return !!p && p.flown.n > before && p.air === 0; }, { timeout: 15_000, intervals: [50] }).toBe(true);
  const { n, peak, glided, ms } = (await peer())!.flown;
  return { takeoffs: n - before, peak, airMs: ms, glided };
}

/** Hold the space bar down for `ms`, then let it go (OP-084: a jump held, a flap, a glide). */
export async function holdSpace(page: Page, ms: number): Promise<void> {
  await page.keyboard.down('Space');
  await page.waitForTimeout(ms);
  await page.keyboard.up('Space');
}

/** How fast an owl still rises once Jump is let go on the way up (JUMP_CUT_SPEED, packages/shared jump.ts). */
const CUT_SPEED = 180;

/**
 * A jump held `jumpMs` (by default to its top and a little past), then the flap, held `ms`: from the
 * flap's top on, a glide (OP-084). Pressed in the page with set holds (owlPark.jump), from wherever
 * the owl stands. The page keeps one press at a time: a flap asked for while the jump is held goes
 * down as the jump is let go, at that time to the step however few frames a runner draws, but from
 * the moment it is asked for the jump counts as let go, and a jump let go while it rises faster than
 * the cut's speed is cut short. So the flap is asked for in the first frame, read just after the
 * page's own step, in which letting go costs the flight no more than `spare` px by the time the flap
 * goes down: once the rise has slowed to the cut's speed, or earlier for a caller with height to
 * spare. A page's script runs only between its frames, a whole one apart on a slow runner, so the
 * spare is what lets the flap be asked for a frame sooner. Resolves once the flap is asked for, and
 * fails, rather than waits on, a jump the page never takes.
 */
export async function jumpFlapGlide(page: Page, ms: number, { jumpMs = 500, spare = 0 }: { jumpMs?: number; spare?: number } = {}): Promise<void> {
  await page.evaluate(
    ({ ms, jumpMs, spare, cut }) =>
      new Promise<void>((resolve, reject) => {
        const before = window.owlPark.state()?.flown.n ?? 0;
        const pressed = Date.now();
        if (!window.owlPark.jump(jumpMs)) return reject(new Error('the page would not jump'));
        let waiting = true;
        const giveUp = setTimeout(() => {
          waiting = false;
          reject(new Error('the page never took the jump off the ground'));
        }, 5_000);
        const ask = () => {
          if (!waiting) return;
          const s = window.owlPark.state();
          // Let go now, the owl rises at the cut's speed, not at vz, until the flap goes down.
          const cost = s ? ((s.air.vz - cut) * Math.max(0, pressed + jumpMs - Date.now())) / 1000 : Infinity;
          if (!s || s.flown.n <= before || cost > spare) return void requestAnimationFrame(ask);
          waiting = false;
          clearTimeout(giveUp);
          window.owlPark.jump(ms);
          resolve();
        };
        requestAnimationFrame(ask);
      }),
    { ms, jumpMs, spare, cut: CUT_SPEED },
  );
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
