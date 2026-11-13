import { expect, test, vi } from 'vitest';
import type { Env } from '../src/env';

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));
const worker = (await import('../src/index')).default;

test('client reports forward an empty count, reject payloads and stop a burst from one address', async () => {
  const count = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe('https://park/client-error');
    expect(init).toEqual({ method: 'POST' });
    return new Response(null, { status: 204 });
  });
  const env = { OVERFLOW: { idFromName: () => 'park', get: () => ({ fetch: count }) } } as unknown as Env;
  const ctx = {} as ExecutionContext;
  const send = (kind: string, body?: string) =>
    worker.fetch(new Request('https://park.example/api/client-error', {
      method: 'POST',
      headers: { 'X-Park-Error': kind, 'CF-Connecting-IP': '198.51.100.8' },
      body: body ?? null,
    }), env, ctx);

  expect((await send('other')).status).toBe(400);
  expect((await send('error', 'untrusted text')).status).toBe(400);
  for (let i = 0; i < 15; i++) expect((await send(i % 2 ? 'error' : 'rejection')).status).toBe(204);
  const limited = await send('error');
  expect(limited.status).toBe(429);
  expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
  expect(count).toHaveBeenCalledTimes(15);
});
