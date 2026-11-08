import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scoreOf, summarize, tally } from './summary.mjs';

const mutants = (...statuses) => statuses.map((status) => ({ status }));

test('the score is caught over the mutants a test ran on or none reached; what did not compile counts for nothing', () => {
  const t = tally(mutants('Killed', 'Timeout', 'Survived', 'NoCoverage', 'CompileError', 'RuntimeError', 'Ignored', 'Pending'));
  assert.deepEqual(t, { mutants: 4, killed: 1, timeout: 1, survived: 1, noCoverage: 1 });
  assert.equal(scoreOf(t), 50);
  assert.equal(scoreOf(tally(mutants('Killed', 'Killed', 'Survived'))), 66.7);
  assert.equal(scoreOf(tally(mutants('CompileError'))), null);
});

test('the summary gives the scope’s score, then a row a file, lowest score first', () => {
  const report = {
    thresholds: { high: 80, low: 60 },
    files: {
      'src/a.ts': { mutants: mutants('Killed', 'Killed') },
      'src/b.ts': { mutants: mutants('Survived', 'Timeout', 'NoCoverage', 'CompileError') },
      'src/c.ts': { mutants: [] },
    },
  };
  const { markdown, json } = summarize('the shared rules', [report]);
  assert.equal(json.score, 60);
  assert.deepEqual(
    json.files.map((f) => [f.file, f.score]),
    [
      ['src/b.ts', 33.3],
      ['src/a.ts', 100],
      ['src/c.ts', null],
    ],
  );
  assert.match(markdown, /^### Mutation testing: the shared rules$/m);
  assert.match(markdown, /^\*\*60\.0%\*\*: 3 of 5 mutants caught \(high from 80, low under 60\)\.$/m);
  assert.match(markdown, /^\| src\/b\.ts \| 3 \| 1 \| 1 \| 1 \| 33\.3% \|$/m);
  assert.match(markdown, /^\| src\/c\.ts \| 0 \| 0 \| 0 \| 0 \| n\/a \|$/m);
});

test('a scope run in shards is scored as one, a file split across shards as one file', () => {
  const one = { files: { 'src/a.ts': { mutants: mutants('Killed') }, 'src/b.ts': { mutants: mutants('Survived') } } };
  const two = { files: { 'src/a.ts': { mutants: mutants('Survived', 'Killed') }, 'src/c.ts': { mutants: mutants('Killed') } } };
  const { json } = summarize('the room server and the Worker', [one, two]);
  assert.deepEqual([json.mutants, json.killed, json.survived, json.score], [5, 3, 2, 60]);
  assert.deepEqual(json.files.find((f) => f.file === 'src/a.ts'), { file: 'src/a.ts', score: 66.7, mutants: 3, killed: 2, timeout: 0, survived: 1, noCoverage: 0 });
});

test('from the command line: the summary on stdout, the numbers to a file, and a failure under the break threshold', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mutation-summary-'));
  const report = join(dir, 'mutation.json');
  writeFileSync(report, JSON.stringify({ files: { 'src/a.ts': { mutants: mutants('Killed', 'Survived', 'Survived') } } }));
  const run = (...args) => spawnSync(process.execPath, [fileURLToPath(new URL('./summary.mjs', import.meta.url)), 'the shared rules', report, ...args], { encoding: 'utf8' });
  const kept = join(dir, 'score.json');
  const passed = run('--json', kept, '--break', '30');
  assert.equal(passed.status, 0);
  assert.match(passed.stdout, /^\*\*33\.3%\*\*: 1 of 3 mutants caught\.$/m);
  assert.equal(JSON.parse(readFileSync(kept, 'utf8')).score, 33.3);
  const failed = run('--break', '50');
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /Under the break threshold of 50: the run fails\./);
  assert.equal(run('--break').status, 2);
});
