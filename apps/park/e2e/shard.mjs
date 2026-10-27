#!/usr/bin/env node
/**
 * Picks a CI shard's browser tests (OP-123). Every test the suite lists is shared out across the
 * shards by its measured time (durations.json: seconds per test on a CI runner), longest first onto
 * the shard with the least so far, so the shards take about as long as each other; Playwright's own
 * --shard splits by count, and the slow climb and arcade tests would pile onto two shards. A test
 * with no measured time counts as the median. The shard's tests print in the suite's own order, in
 * the form `playwright test --test-list` reads.
 *
 *   node e2e/shard.mjs <shard> <of>              this shard's test list, on stdout
 *   node e2e/shard.mjs durations <report.json>   rewrite durations.json from a full run's JSON report
 *                                                (playwright merge-reports --reporter json)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PARK = join(dirname(fileURLToPath(import.meta.url)), '..');
const DURATIONS = join(PARK, 'e2e', 'durations.json');

/** A listed test's key: its line from `--list` without the line and column. */
const keyOf = (line) => line.trim().replace(/^(\[[^\]]+\] › [^ ]+?):\d+:\d+ › /, '$1 › ');

/** The project and file a listed test is in. */
const fileOf = (line) => /^(\[[^\]]+\]) › ([^ ]+?):\d+:\d+ › /.exec(line.trim())?.slice(1, 3) ?? ['', ''];

/** A spec file whose tests run in order on one runner (`mode: 'serial'`): its tests stay together. */
const serial = new Map();
const isSerial = (file) => {
  if (!serial.has(file)) {
    const path = join(PARK, 'e2e', file);
    serial.set(file, existsSync(path) && /mode:\s*'serial'/.test(readFileSync(path, 'utf8')));
  }
  return serial.get(file);
};

/** Every test, as `playwright test --list` prints it. */
function listed() {
  const out = execFileSync(join(PARK, 'node_modules', '.bin', 'playwright'), ['test', '--list'], { cwd: PARK, encoding: 'utf8' });
  return out.split('\n').filter((l) => /^\s+\[\w+\] › /.test(l)).map((l) => l.trim());
}

/**
 * Longest first onto the shard with the least so far; each shard's tests back in the suite's order.
 * The tests of a serial file (in one project) go as one, so they run together and in order.
 */
function balance(tests, shards) {
  const units = new Map();
  for (const t of tests) {
    const [project, file] = fileOf(t.line);
    const key = isSerial(file) ? `${project} › ${file}` : t.line;
    const unit = units.get(key) ?? { seconds: 0, index: t.index, tests: [] };
    unit.seconds += t.seconds;
    unit.tests.push(t);
    units.set(key, unit);
  }
  const bins = Array.from({ length: shards }, () => ({ total: 0, tests: [] }));
  for (const u of [...units.values()].sort((a, b) => b.seconds - a.seconds || a.index - b.index)) {
    const bin = bins.reduce((least, b) => (b.total < least.total ? b : least));
    bin.total += u.seconds;
    bin.tests.push(...u.tests);
  }
  for (const b of bins) b.tests.sort((x, y) => x.index - y.index);
  return bins;
}

function shardList(shard, of) {
  const seconds = JSON.parse(readFileSync(DURATIONS, 'utf8'));
  const known = Object.values(seconds).filter((s) => s > 0).sort((a, b) => a - b);
  const median = known[Math.floor(known.length / 2)] ?? 20;
  const tests = listed().map((line, index) => ({ line, index, seconds: seconds[keyOf(line)] ?? median }));
  const bins = balance(tests, of);
  const mine = bins[shard - 1];
  process.stderr.write(`shard ${shard}/${of}: ${mine.tests.length} of ${tests.length} tests, about ${(mine.total / 60).toFixed(1)} min measured (shards ${bins.map((b) => (b.total / 60).toFixed(1)).join(', ')})\n`);
  process.stdout.write(mine.tests.map((t) => t.line).join('\n') + '\n');
}

/** durations.json from a JSON report: each test's seconds on its last try, keyed as `--list` prints it. */
function durationsFrom(reportPath) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const seconds = {};
  const walk = (suite, file, path) => {
    const here = suite.file && !file ? [] : suite.title ? [...path, suite.title] : path;
    const f = file ?? suite.file;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const last = test.results?.at(-1);
        const s = !last || last.status === 'skipped' ? 0 : Math.round(last.duration / 100) / 10;
        seconds[`[${test.projectName}] › ${f} › ${[...here, spec.title].join(' › ')}`] = s;
      }
    }
    for (const child of suite.suites ?? []) walk(child, f, here);
  };
  for (const suite of report.suites ?? []) walk(suite, undefined, []);
  const sorted = Object.fromEntries(Object.entries(seconds).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(DURATIONS, JSON.stringify(sorted, null, 1) + '\n');
  process.stderr.write(`${Object.keys(sorted).length} tests written to ${DURATIONS}\n`);
}

const [a, b] = process.argv.slice(2);
if (a === 'durations' && b) durationsFrom(b);
else if (Number(a) >= 1 && Number(a) <= Number(b)) shardList(Number(a), Number(b));
else {
  process.stderr.write('usage: node e2e/shard.mjs <shard> <of> | node e2e/shard.mjs durations <report.json>\n');
  process.exit(2);
}
