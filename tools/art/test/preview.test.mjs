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
  for (const f of ['hub.png', 'hub@2x.png', 'hub.post.json', 'guardian.png', 'owl-body.png', 'bogus.png', 'hub-copy.png', 'grove.PNG']) fs.writeFileSync(path.join(dir, f), 'x');
  const { files, keys } = V.scanFinals(dir, V.loadKeys());
  assert.deepEqual(files.map((f) => f.name), ['guardian.png', 'hub.png', 'hub@2x.png', 'owl-body.png']);
  assert.deepEqual([...keys].sort(), ['guardian', 'hub', 'owl-body']);
  assert.deepEqual(V.scanFinals(path.join(tmpRoot, 'nope'), V.loadKeys()).files, []);
});

test('roomsTouched maps keys to rooms in park order; owls and signs alone mean the hub', () => {
  assert.deepEqual(V.roomsTouched(['robot-owl', 'hub-fg']), ['hub', 'market']);
  assert.deepEqual(V.roomsTouched(['guardian']), ['grove']);
  assert.deepEqual(V.roomsTouched(['owl-body', 'owl-face']), ['hub']);
  assert.deepEqual(V.roomsTouched(['sign-hatching-soon', 'grove']), ['hub', 'grove']);
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

test('serve answers files under its root and refuses paths outside it', async () => {
  const root = path.join(tmpRoot, 'www');
  fs.mkdirSync(path.join(root, 'art'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<p>hi</p>');
  fs.writeFileSync(path.join(root, 'art', 'hub.png'), 'png');
  fs.writeFileSync(path.join(tmpRoot, 'secret.txt'), 'no');
  const { server, base } = await V.serve(root);
  try {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    const png = await fetch(`${base}/art/hub.png`);
    assert.equal(png.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(`${base}/art/hub.svg`)).status, 404);
    assert.notEqual((await fetch(`${base}/%2e%2e/secret.txt`)).status, 200);
  } finally {
    server.close();
  }
});
