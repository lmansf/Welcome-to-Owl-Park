// node --test "tools/art/**/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as V from '../preview.mjs';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'owl-preview-test-'));
test.after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

test('scanFinals keeps only loader files for known keys', () => {
  const dir = path.join(tmpRoot, 'finals');
  fs.mkdirSync(dir);
  for (const f of ['hub.png', 'hub@2x.png', 'hub.post.json', 'guardian.png', 'owl-body.png', 'bogus.png', 'hub-copy.png', 'grove.PNG', 'market.webp', 'market@2x.webp', 'market.jpg']) fs.writeFileSync(path.join(dir, f), 'x');
  const { files, keys } = V.scanFinals(dir, V.loadKeys());
  assert.deepEqual(files.map((f) => f.name), ['guardian.png', 'hub.png', 'hub@2x.png', 'market.webp', 'market@2x.webp', 'owl-body.png']);
  assert.deepEqual([...keys].sort(), ['guardian', 'hub', 'market', 'owl-body']);
  assert.deepEqual(V.scanFinals(path.join(tmpRoot, 'nope'), V.loadKeys()).files, []);
});

test('roomsTouched maps keys to rooms in park order; owls and signs alone mean the hub', () => {
  assert.deepEqual(V.roomsTouched(['robot-owl', 'hub-fg']), ['hub', 'market']);
  assert.deepEqual(V.roomsTouched(['guardian']), ['grove']);
  assert.deepEqual(V.roomsTouched(['owl-body', 'owl-face']), ['hub']);
  assert.deepEqual(V.roomsTouched(['sign-hatching-soon', 'grove']), ['hub', 'grove']);
  // A screen of a wider room shows in its own room.
  assert.deepEqual(V.roomsTouched(['lobby-west', 'lobby']), ['lobby']);
  assert.deepEqual(V.roomsTouched(['market-east-fg', 'grove-west']), ['grove', 'market']);
  assert.deepEqual(V.roomsTouched(['homes-west', 'decor-rug']), ['homes', 'nest']);
  assert.deepEqual(V.roomsTouched(['nest', 'decor-wall-clock']), ['nest']);
});

test('overlayFinals copies the finals and hides the placeholder SVG the loader would prefer', () => {
  const site = path.join(tmpRoot, 'site');
  const finals = path.join(tmpRoot, 'finals2');
  fs.mkdirSync(path.join(site, 'art'), { recursive: true });
  fs.mkdirSync(finals);
  for (const f of ['hub.svg', 'grove.svg', 'owl-body.svg']) fs.writeFileSync(path.join(site, 'art', f), '<svg/>');
  for (const f of ['hub.png', 'hub@2x.png']) fs.writeFileSync(path.join(finals, f), 'png');
  const removed = V.overlayFinals(site, finals, V.scanFinals(finals, V.loadKeys()).files);
  assert.deepEqual(removed, ['hub.svg']);
  assert.deepEqual(fs.readdirSync(path.join(site, 'art')).sort(), ['grove.svg', 'hub.png', 'hub@2x.png', 'owl-body.svg']);
});

test('overlayFinals drops the published files a WebP final replaces', () => {
  const site = path.join(tmpRoot, 'site3');
  const finals = path.join(tmpRoot, 'finals3');
  fs.mkdirSync(path.join(site, 'art'), { recursive: true });
  fs.mkdirSync(finals);
  for (const f of ['hub.png', 'hub@2x.png', 'grove.png', 'owl-body.png']) fs.writeFileSync(path.join(site, 'art', f), 'png');
  fs.writeFileSync(path.join(finals, 'hub.webp'), 'webp');
  const removed = V.overlayFinals(site, finals, V.scanFinals(finals, V.loadKeys()).files);
  assert.deepEqual(removed, ['hub.png', 'hub@2x.png']);
  assert.deepEqual(fs.readdirSync(path.join(site, 'art')).sort(), ['grove.png', 'hub.webp', 'owl-body.png']);
});

test('serve answers files under its root and refuses paths outside it', async () => {
  const root = path.join(tmpRoot, 'www');
  fs.mkdirSync(path.join(root, 'art'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<p>hi</p>');
  fs.writeFileSync(path.join(root, 'art', 'hub.png'), 'png');
  fs.writeFileSync(path.join(root, 'art', 'grove.webp'), 'webp');
  fs.writeFileSync(path.join(tmpRoot, 'secret.txt'), 'no');
  const { server, base } = await V.serve(root);
  try {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    const png = await fetch(`${base}/art/hub.png`);
    assert.equal(png.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(`${base}/art/grove.webp`)).headers.get('content-type'), 'image/webp');
    assert.equal((await fetch(`${base}/art/hub.svg`)).status, 404);
    assert.notEqual((await fetch(`${base}/%2e%2e/secret.txt`)).status, 200);
  } finally {
    server.close();
  }
});

test('previewLooks: one owl per species the finals bring, after a great horned owl for scale; else the colour mix', () => {
  assert.deepEqual(V.previewLooks(new Set(['owl-barn-body', 'owl-barn-face', 'owl-snowy-body', 'hub']), 4), [
    '#8B5A2B,#F6F1E3,#C9A227', '#D9A066,#FFF8EC,#A67B5B,barn', '#EDEAE0,#FFFFFF,#2F3E5C,snowy',
  ]);
  const plain = V.previewLooks(new Set(['hub', 'owl-body']), 3);
  assert.equal(plain.length, 3);
  assert.ok(plain.every((l) => l.split(',').length === 3));
  // The natural colours mirror packages/shared/src/species.ts.
  const src = fs.readFileSync(path.join(V.REPO_ROOT, 'packages/shared/src/species.ts'), 'utf8');
  for (const [sp, look] of Object.entries(V.SPECIES_LOOKS)) {
    const m = new RegExp(`id: '${sp}'[^\\n]*natural: \\{ body: '(#[0-9A-F]{6})', belly: '(#[0-9A-F]{6})', accent: '(#[0-9A-F]{6})' \\}`).exec(src);
    assert.ok(m, `${sp} in species.ts`);
    assert.equal(look, m.slice(1).join(','), `${sp} natural colours`);
  }
});
