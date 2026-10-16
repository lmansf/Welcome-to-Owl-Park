import { expect, type Page } from '@playwright/test';

export interface ParkState {
  room: string;
  pos: { x: number; y: number };
  walking: boolean;
  peers: Array<{ id: string; pos: { x: number; y: number }; walking: boolean; look: { body: string; belly: string; accent: string } }>;
  connected: boolean;
}

/** Open the park with the zero-backend local transport and wait for the room to be live. */
export async function openPark(page: Page, params: Record<string, string> = {}): Promise<void> {
  const q = new URLSearchParams({ transport: 'local', ...params });
  await page.goto(`/?${q.toString()}`);
  await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
}

export async function state(page: Page): Promise<ParkState> {
  const s = await page.evaluate(() => window.owlPark.state());
  if (!s) throw new Error('room scene not active');
  return s as ParkState;
}

export type CameraView = { viewX: number; viewY: number; viewW: number; viewH: number; zoom: number; dpr: number };

export async function cameraView(page: Page): Promise<CameraView> {
  const cam = await page.evaluate(() => window.owlPark.camera());
  if (!cam) throw new Error('no camera');
  return cam;
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
