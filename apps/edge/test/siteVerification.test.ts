import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import { GOOGLE_VERIFY_BODY, GOOGLE_VERIFY_PATH } from '../src/routes/siteVerification';

// ---- OP-393: Google Search Console's HTML-file check, answered by the whole Worker ----

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));
const worker = (await import('../src/index')).default;

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
// The static files would redirect /name.html to /name: the check must never reach them.
const env = { ASSETS: { fetch: async () => new Response(null, { status: 307, headers: { Location: '/elsewhere' } }) }, GATE: 'open' } as unknown as Env;
const call = (path: string, init: RequestInit = {}, base = 'https://exploreowlpark.com') => worker.fetch(new Request(`${base}${path}`, init), env, CTX);

describe("Google Search Console's verification file (OP-393)", () => {
  it('holds exactly the line Google wrote for the file it names', () => {
    expect(GOOGLE_VERIFY_BODY).toBe(`google-site-verification: ${GOOGLE_VERIFY_PATH.slice(1)}`);
  });

  it('answers a plain 200 with that line, byte for byte, on the domain and on www', async () => {
    for (const base of ['https://exploreowlpark.com', 'https://www.exploreowlpark.com']) {
      const res = await call(GOOGLE_VERIFY_PATH, {}, base);
      expect(res.status).toBe(200);
      expect(res.headers.get('Location')).toBeNull();
      expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
      expect(await res.text()).toBe('google-site-verification: google5a7a5bd196df69a0.html');
    }
  });

  it('answers HEAD with no body, and refuses other methods', async () => {
    const head = await call(GOOGLE_VERIFY_PATH, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect((await call(GOOGLE_VERIFY_PATH, { method: 'POST' })).status).toBe(405);
  });

  it('sends plain http on to https, as every page does', async () => {
    const res = await call(GOOGLE_VERIFY_PATH, {}, 'http://exploreowlpark.com');
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe(`https://exploreowlpark.com${GOOGLE_VERIFY_PATH}`);
  });
});
