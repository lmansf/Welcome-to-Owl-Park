import { expect, type Page } from '@playwright/test';

export interface ParkState {
  room: string;
  pos: { x: number; y: number };
  walking: boolean;
  peers: Array<{ id: string; pos: { x: number; y: number }; walking: boolean; look: { body: string; belly: string; accent: string } }>;
  connected: boolean;
  doors: Array<{ id: string; x: number; y: number; to: string | undefined }>;
}

/** Walk the local owl into the middle of a doorway by id (from the live room definition). */
export async function walkToDoor(page: Page, doorId: string): Promise<void> {
  const s = await state(page);
  const door = s.doors.find((d) => d.id === doorId);
  if (!door) throw new Error(`no door ${doorId} in ${s.room}`);
  await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), { x: door.x, y: door.y });
}

/** Open the park (zero-backend local transport unless overridden) and wait for the room to be live. */
export async function openPark(page: Page, params: Record<string, string> = {}): Promise<void> {
  const q = new URLSearchParams({ transport: 'local', ...params });
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

export type CameraView = { viewX: number; viewY: number; viewW: number; viewH: number; zoom: number; dpr: number };

export async function cameraView(page: Page): Promise<CameraView> {
  const cam = await page.evaluate(() => window.owlPark.camera());
  if (!cam) throw new Error('no camera');
  return cam;
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

export async function waitForArrival(page: Page, x: number, y: number, tolerance = 6): Promise<void> {
  await expect
    .poll(async () => {
      const s = await state(page);
      return Math.hypot(s.pos.x - x, s.pos.y - y);
    }, { timeout: 15_000 })
    .toBeLessThan(tolerance);
}

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
