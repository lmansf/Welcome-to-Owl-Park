import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { piecesOf } from './stryker.mjs';

test('a file cut for shards: up to each marker, from it to the next, the last to the end; a marker missing after the last cut stops the run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mutation-pieces-'));
  writeFileSync(join(dir, 'a.ts'), ['one', '  // 2. two', 'three', '  // 4. four', 'five', ''].join('\n'));
  const root = pathToFileURL(`${dir}/`);
  assert.deepEqual(piecesOf(root, 'a.ts', ['// 2.', '// 4.']), ['a.ts:1-1', 'a.ts:2-3', 'a.ts:4-6']);
  assert.deepEqual(piecesOf(root, 'a.ts', []), ['a.ts:1-6']);
  assert.throws(() => piecesOf(root, 'a.ts', ['// 4.', '// 2.']), /no line \/\/ 2\. after line 4/);
  assert.throws(() => piecesOf(root, 'a.ts', ['// 6.']), /no line \/\/ 6\./);
});
