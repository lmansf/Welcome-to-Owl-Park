import { describe, expect, it } from 'vitest';
import { ACTIVITY_SHARE_WORDS, SHARE_ACTIVITIES, activitySharePath } from '@owl-park/shared';
import { activityPage, activityPageHtml } from '../src/activityPage';
import { ROUTES } from '../src/routes/table';

const ORIGIN = 'https://exploreowlpark.com';

describe('the shared activity page (OP-392)', () => {
  it('has a page for every activity, with its name, its line and the park’s front door', async () => {
    for (const a of SHARE_ACTIVITIES) {
      const res = await activityPage(new URL(`${ORIGIN}${activitySharePath(a.id)}`));
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/html');
      expect(res.headers.get('Content-Security-Policy')).toBeTruthy();
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      const html = await res.text();
      expect(html).toContain(`data-activity="${a.id}"`);
      expect(html).toContain(`<a class="play" href="/?go=${a.id}">`);
      expect(html).toContain(ACTIVITY_SHARE_WORDS.way);
      expect(html).not.toMatch(/<script/i);
      // Never a room past the turnstiles: the link only ever opens the front door.
      expect(html).not.toMatch(/[?&]room=/);
    }
  });

  it('keeps the park’s golink flag on its Play button only when the page was opened with it', async () => {
    const on = await (await activityPage(new URL(`${ORIGIN}/play/arcade?golink=1`))).text();
    expect(on).toContain('<a class="play" href="/?go=arcade&#38;golink=1">');
    const off = await (await activityPage(new URL(`${ORIGIN}/play/arcade?golink=yes`))).text();
    expect(off).toContain('<a class="play" href="/?go=arcade">');
  });

  it('carries the share picture and its own address for link previews', () => {
    const a = SHARE_ACTIVITIES[0]!;
    const html = activityPageHtml(a, ORIGIN);
    expect(html).toContain(`<meta property="og:image" content="${ORIGIN}/og-image.jpg">`);
    expect(html).toContain(`<meta property="og:url" content="${ORIGIN}${activitySharePath(a.id)}">`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  it('takes a trailing slash and sends any other activity to the front page', async () => {
    expect((await activityPage(new URL(`${ORIGIN}/play/arcade/`))).status).toBe(200);
    for (const path of ['/play/', '/play/dragon', '/play/arcade/extra', '/play/%3Cscript%3E']) {
      const res = await activityPage(new URL(`${ORIGIN}${path}`));
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/');
    }
  });

  it('is in the Worker route table and reaches the Worker before the static files', async () => {
    expect(ROUTES.some((r) => 'prefix' in r && r.prefix === '/play/')).toBe(true);
    const { readFileSync } = (await import('node:fs' as string)) as { readFileSync: (path: string, encoding: string) => string };
    const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, '')) as { assets: { run_worker_first: string[] } };
    expect(config.assets.run_worker_first).toContain('/play/*');
  });
});
