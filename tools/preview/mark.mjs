// Marks a built park as a preview (.github/workflows/preview.yml): search engines are told to leave it
// alone, and the page may only talk to its own address, so a preview reaches no live server, store or
// analytics host whatever the build holds. Writes into the folder it is given (the built dist).
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const PREVIEW_HEADERS = [
  '',
  '# Preview build (tools/preview/mark.mjs): not for search engines, and no calls beyond its own address.',
  '/*',
  '  X-Robots-Tag: noindex, nofollow',
  "  Content-Security-Policy: connect-src 'self'",
  '',
].join('\n');

export const PREVIEW_ROBOTS = 'User-agent: *\nDisallow: /\n';

export function markPreview(dir) {
  if (!existsSync(join(dir, 'index.html'))) throw new Error(`${dir} holds no built park (no index.html)`);
  appendFileSync(join(dir, '_headers'), PREVIEW_HEADERS);
  writeFileSync(join(dir, 'robots.txt'), PREVIEW_ROBOTS);
  // The sitemap lists the live park's pages, not the preview's.
  for (const name of ['sitemap.xml']) if (existsSync(join(dir, name))) writeFileSync(join(dir, name), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node tools/preview/mark.mjs <built dist folder>');
    process.exit(2);
  }
  markPreview(dir);
  console.log(`Marked ${dir} as a preview.`);
}
