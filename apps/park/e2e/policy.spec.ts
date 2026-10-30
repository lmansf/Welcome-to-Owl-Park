import { devices, type APIRequestContext, type BrowserContextOptions } from '@playwright/test';
import { expect, test } from './fixtures';
import { flyThrough, playAt, run, untilOver } from './arcadePlay';
import { openClimb, startClimb, toPortal } from './climbPlay';
import { E2E_ADMIN_KEY, openPark, state, travelTo } from './helpers';

/**
 * The park under its page policy (OP-140), through the room server: the page's headers, then the park,
 * the arcade, an owl's own nest and the climb on a computer and on a phone. The fixtures fail any test
 * whose page the policy blocked something on (fixtures.ts); this one makes sure each place is visited.
 */
const ADMIN = { 'X-Admin-Key': E2E_ADMIN_KEY };

async function realms(request: APIRequestContext, body: { open: string[]; portal: boolean; night: string | null }): Promise<void> {
  const r = await request.post('/api/admin/capacity', { headers: ADMIN, data: { realms: body } });
  expect(r.status(), await r.text()).toBe(200);
}

test.describe('the page policy (OP-140)', () => {
  test.afterEach(async ({ request }) => realms(request, { open: [], portal: false, night: null }));

  test('the page goes out with its policy, a nonce fresh each load, and every answer with nosniff; no HSTS over this machine’s http', async ({ request }) => {
    const first = await request.get('/');
    const policy = first.headers()['content-security-policy'] ?? '';
    const nonce = /'nonce-([0-9a-f]{32})'/.exec(policy)?.[1];
    expect(nonce).toBeDefined();
    expect(policy).toContain("connect-src 'self' ws://localhost:8787");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(first.headers()['x-frame-options']).toBe('DENY');
    expect(first.headers()['x-content-type-options']).toBe('nosniff');
    expect(first.headers()['strict-transport-security']).toBeUndefined();
    const html = await first.text();
    expect((html.match(/<script\b/g) ?? []).length).toBe((html.match(new RegExp(`<script nonce="${nonce}"`, 'g')) ?? []).length);
    expect((await request.get('/')).headers()['content-security-policy']).not.toContain(nonce!);
    // The script bundle and the art, served without the Worker, say what they are too.
    const bundle = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
    expect((await request.get(bundle!)).headers()['x-content-type-options']).toBe('nosniff');
    expect((await request.get('/api/notice')).headers()['x-content-type-options']).toBe('nosniff');
  });

  for (const [name, device] of [
    ['a computer', { viewport: { width: 1280, height: 800 } }],
    ['a phone', { ...devices['Pixel 7'] }],
  ] as Array<[string, BrowserContextOptions]>) {
    test(`on ${name}: the park, the arcade, the owl's own nest and the climb play with nothing blocked`, async ({ browser, request }) => {
      test.slow(); // four places, a run and a climb's start, through the room server
      const page = await (await browser.newContext(device)).newPage();
      await openPark(page, { transport: 'edge' });
      expect((await state(page)).room).toBe('hub');

      // A run of Moon Flap, paid by the room server.
      await openPark(page, { transport: 'edge', room: 'arcade' });
      await playAt(page, 'flight');
      await flyThrough(page, 1);
      await untilOver(page);
      expect((await run(page))?.over).toBe(true);

      // Home, by the map from the hub: the owl's own nest.
      await openPark(page, { transport: 'edge' });
      await travelTo(page, 'nest');
      await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toMatch(/^nest-[a-z0-9]{8}$/);
      await expect.poll(async () => (await state(page)).nest?.mine, { timeout: 10_000 }).toBe(true);

      // The climb, with its realm and portal opened by the keepers.
      await realms(request, { open: ['glass'], portal: true, night: 'easy' });
      await openPark(page, { transport: 'edge', room: 'glass', spawn: 'from-hub' });
      await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('glass');
      await toPortal(page);
      await openClimb(page);
      await startClimb(page);
      await page.context().close();
    });
  }
});
