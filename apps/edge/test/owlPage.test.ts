import { describe, expect, it } from 'vitest';
import { NATURES, OWL_SHARE_WORDS, owlSharePath } from '@owl-park/shared';
import { owlPage, owlPageHtml } from '../src/owlPage';
import { ROUTES } from '../src/routes/table';

const ORIGIN = 'https://exploreowlpark.com';

describe('the shared quiz result page (OP-392)', () => {
  it('has a page for every owl the quiz gives, with its name, its fact and a way in', async () => {
    for (const def of NATURES) {
      const res = await owlPage(new URL(`${ORIGIN}${owlSharePath(def.id)}`));
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/html');
      expect(res.headers.get('Content-Security-Policy')).toBeTruthy();
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      const html = await res.text();
      expect(html).toContain(`data-owl="${def.id}"`);
      expect(html).toContain('<a class="play" href="/">');
      expect(html).toContain(OWL_SHARE_WORDS.play);
      expect(html).not.toMatch(/<script/i);
    }
  });

  it('carries the share picture and its own address for link previews', () => {
    const def = NATURES[0]!;
    const html = owlPageHtml(def, ORIGIN);
    expect(html).toContain(`<meta property="og:image" content="${ORIGIN}/og-image.jpg">`);
    expect(html).toContain(`<meta property="og:url" content="${ORIGIN}${owlSharePath(def.id)}">`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}${owlSharePath(def.id)}">`);
  });

  it('takes a trailing slash and sends any other owl to the front page', async () => {
    expect((await owlPage(new URL(`${ORIGIN}/owl/gentle/`))).status).toBe(200);
    for (const path of ['/owl/', '/owl/dragon', '/owl/gentle/extra', '/owl/%3Cscript%3E']) {
      const res = await owlPage(new URL(`${ORIGIN}${path}`));
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/');
    }
  });

  it('is in the Worker route table and reaches the Worker before the static files', async () => {
    expect(ROUTES.some((r) => 'prefix' in r && r.prefix === '/owl/')).toBe(true);
    const { readFileSync } = (await import('node:fs' as string)) as { readFileSync: (path: string, encoding: string) => string };
    const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, '')) as {
      assets: { run_worker_first: string[] };
    };
    expect(config.assets.run_worker_first).toContain('/owl/*');
  });
});
