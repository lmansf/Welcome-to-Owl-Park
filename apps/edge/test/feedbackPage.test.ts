import { describe, expect, it } from 'vitest';
import { feedbackPage } from '../src/feedbackPage';

describe("the keepers' feedback page", () => {
  it('is never cached or indexed, and runs only its own script and style', async () => {
    const res = feedbackPage();
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('CDN-Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    const csp = res.headers.get('Content-Security-Policy') ?? '';
    const nonce = /script-src 'nonce-([0-9a-f]{32})'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    const html = await res.text();
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html).toContain(`<style nonce="${nonce}">`);
    // Visitors' words are set as text, never as markup.
    expect(html).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/);
  });

  it('has a fresh nonce on every load', () => {
    const nonceOf = (r: Response) => /'nonce-([0-9a-f]+)'/.exec(r.headers.get('Content-Security-Policy') ?? '')?.[1];
    expect(nonceOf(feedbackPage())).not.toBe(nonceOf(feedbackPage()));
  });

  it('reaches the Worker before the static assets', async () => {
    // The Worker's types have no Node.js; the test runs in Node with this package as its directory.
    const { readFileSync } = (await import('node:fs' as string)) as { readFileSync: (path: string, encoding: string) => string };
    const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, '')) as { assets: { run_worker_first: string[] } };
    expect(config.assets.run_worker_first).toContain('/admin/*');
  });
});
