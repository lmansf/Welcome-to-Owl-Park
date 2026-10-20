import { describe, expect, it } from 'vitest';
import { isPage, uncachedPage } from '../src/page';

describe('the page is never cached', () => {
  it('knows the page from the bundles and the art', () => {
    expect(isPage('/')).toBe(true);
    expect(isPage('/index.html')).toBe(true);
    expect(isPage('/assets/index-Cyo9j9vS.js')).toBe(false);
    expect(isPage('/art/hub.webp')).toBe(false);
  });

  it('keeps the response and marks it no-store for browsers and the edge', async () => {
    const res = uncachedPage(new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/html');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('CDN-Cache-Control')).toBe('no-store');
    expect(await res.text()).toBe('<!doctype html>');
  });

  it('routes the page through the Worker', async () => {
    // The Worker's types have no Node.js; the test runs in Node with this package as its directory.
    const { readFileSync } = (await import('node:fs' as string)) as { readFileSync: (path: string, encoding: string) => string };
    const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, '')) as { assets: { run_worker_first: string[] } };
    expect(config.assets.run_worker_first).toEqual(expect.arrayContaining(['/', '/index.html']));
  });
});
