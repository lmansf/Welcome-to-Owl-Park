import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { markPreview } from './mark.mjs';

function dist() {
  const dir = mkdtempSync(join(tmpdir(), 'preview-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html>');
  writeFileSync(join(dir, '_headers'), '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n');
  writeFileSync(join(dir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  writeFileSync(join(dir, 'sitemap.xml'), '<urlset><url><loc>https://exploreowlpark.com/</loc></url></urlset>');
  return dir;
}

test('a preview keeps its headers, adds noindex and the own-address-only policy', () => {
  const dir = dist();
  markPreview(dir);
  const headers = readFileSync(join(dir, '_headers'), 'utf8');
  assert.match(headers, /Cache-Control: public, max-age=31536000, immutable/);
  assert.match(headers, /\/\*\n {2}X-Robots-Tag: noindex, nofollow\n {2}Content-Security-Policy: connect-src 'self'/);
});

test('a preview turns crawlers away and lists no live pages', () => {
  const dir = dist();
  markPreview(dir);
  assert.equal(readFileSync(join(dir, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n');
  assert.doesNotMatch(readFileSync(join(dir, 'sitemap.xml'), 'utf8'), /exploreowlpark/);
});

test('a folder without a built park is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'preview-empty-'));
  assert.throws(() => markPreview(dir), /no built park/);
});
