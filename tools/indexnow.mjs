#!/usr/bin/env node
// Tells search engines which of the park's pages changed, after a deploy (the SEO audit: ping
// IndexNow on publish). One POST to IndexNow with every address in the sitemap; Bing, Yandex and
// the others that share IndexNow pick it up from there.
//
// The key is IndexNow's own proof that the site sent the ping: it is public by design, served at
// https://exploreowlpark.com/<key>.txt (apps/park/public). It unlocks nothing.
//
// Usage (the deploy workflow runs it after a deploy to main):  node tools/indexnow.mjs
// A failed ping never fails the deploy: the sitemap still lists every page.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const INDEXNOW_KEY = '9455878fee46a59e4a374af429bcc40b';
const HOST = 'exploreowlpark.com';
const here = dirname(fileURLToPath(import.meta.url));

/** Every address the sitemap lists. */
export function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

/** The body IndexNow takes: the host, the key and where it is served, and the addresses. */
export function indexNowBody(urls) {
  return { host: HOST, key: INDEXNOW_KEY, keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`, urlList: urls };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const urls = sitemapUrls(readFileSync(join(here, '../apps/park/public/sitemap.xml'), 'utf8'));
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(indexNowBody(urls)),
    });
    console.log(`IndexNow answered ${res.status} for ${urls.length} pages.`);
  } catch (err) {
    console.log(`IndexNow could not be reached: ${err instanceof Error ? err.message : String(err)}`);
  }
}
