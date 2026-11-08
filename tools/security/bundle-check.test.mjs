import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { check } from './bundle-check.mjs';

/** A built page in a folder of its own, from file names and their text. */
function page(files) {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-check-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

// Made up here, so no string in this file looks like a key to a scanner.
const segment = (c) => c.repeat(16);
const jwtShaped = ['eyJ' + segment('a'), 'eyJ' + segment('b'), segment('c')].join('.');

test('a page with no database client or key passes, and says how many files it read', () => {
  const dir = page({ 'index.html': '<script src="assets/index.js"></script>', 'assets/index.js': 'console.log("owls")', 'art/owl.webp': 'not text' });
  try {
    assert.deepEqual(check(dir), { found: [], read: 2 });
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('a Supabase client, a JWT-shaped string or a Supabase key fails, named by its file and never by what it found', () => {
  const dir = page({
    'assets/a.js': 'import("@supa' + 'base/supabase-js")',
    'assets/b.js': `const key = "${jwtShaped}";`,
    'assets/c.json': '{"k": "sb_' + 'publishable_' + segment('d') + '"}',
    'assets/d.js': 'fine',
  });
  try {
    const { found, read } = check(dir);
    assert.equal(read, 4);
    assert.deepEqual(
      found.map((f) => f.file),
      ['assets/a.js', 'assets/b.js', 'assets/c.json'],
    );
    assert.ok(found.every((f) => !f.what.includes(jwtShaped) && !f.what.includes('sb_publishable')));
  } finally {
    rmSync(dir, { recursive: true });
  }
});
