#!/usr/bin/env node
/**
 * Picks a CI shard's browser tests (OP-123). Every test the suite lists is shared out across the
 * shards by its measured time (durations.json: seconds per test on a CI runner), longest first onto
 * the shard that would finish soonest with it, so the shards take about as long as each other;
 * Playwright's own --shard splits by count, and the slow climb and arcade tests would pile onto two
 * shards. A test with no measured time counts as the median. The shard's tests print in the suite's
 * own order, in the form `playwright test --test-list` reads.
 *
 * A shard runs its tests on several workers at once (playwright.config.ts, PW_WORKERS in CI), but the
 * room server project's tests one at a time, since they share the shard's one room server (the gate,
 * the day's scores). So a shard takes about the longer of its room server tests end to end and all its
 * tests spread over the workers, and that is what the sharing evens out.
 *
 *   node e2e/shard.mjs <shard> <of> [workers]        this shard's test list, on stdout
 *   node e2e/shard.mjs plan <of> <workers> <dir>     every shard's list, as <dir>/shard-<n>.txt (CI's
 *                                                    build job, so every shard shares from one table)
 *   node e2e/shard.mjs durations <report.json>       refresh durations.json from a full run's JSON report
 *                                                    (playwright merge-reports --reporter json)
 *
 * Hosted runners differ in speed by up to two thirds, so one run's times are averaged with the
 * table's rather than replacing them; a test the suite no longer has drops out.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

/** Projects whose tests run one at a time on a shard (`workers: 1` in playwright.config.ts). */
const ONE_AT_A_TIME = new Set(['[edge]']);

/**
 * How long a shard takes: its one-at-a-time tests end to end, or all its tests spread over the
 * workers, whichever is longer.
 */
const takes = (bin, workers) => Math.max(bin.serial, bin.total / workers);

/**
 * Longest first onto the shard that would finish soonest with it (the least so far on a tie); each
 * shard's tests back in the suite's order. The tests of a serial file (in one project) go as one, so
 * they run together and in order.
 */
function balance(tests, shards, workers = 1) {
  const units = new Map();
  for (const t of tests) {
    const [project, file] = fileOf(t.line);
    const key = isSerial(file) ? `${project} › ${file}` : t.line;
    const unit = units.get(key) ?? { seconds: 0, index: t.index, oneAtATime: ONE_AT_A_TIME.has(project), tests: [] };
    unit.seconds += t.seconds;
    unit.tests.push(t);
    units.set(key, unit);
  }
  const bins = Array.from({ length: shards }, () => ({ total: 0, serial: 0, tests: [] }));
  for (const u of [...units.values()].sort((a, b) => b.seconds - a.seconds || a.index - b.index)) {
    const after = (b) => takes({ total: b.total + u.seconds, serial: b.serial + (u.oneAtATime ? u.seconds : 0) }, workers);
    const bin = bins.reduce((best, b) => (after(b) < after(best) || (after(b) === after(best) && b.total < best.total) ? b : best));
    bin.total += u.seconds;
    if (u.oneAtATime) bin.serial += u.seconds;
    bin.tests.push(...u.tests);
  }
  for (const b of bins) b.tests.sort((x, y) => x.index - y.index);
  return bins;
}

/** Every shard's tests, shared out by the measured times. */
function plan(of, workers) {
  const seconds = JSON.parse(readFileSync(DURATIONS, 'utf8'));
  const known = Object.values(seconds).filter((s) => s > 0).sort((a, b) => a - b);
  const median = known[Math.floor(known.length / 2)] ?? 20;
  const tests = listed().map((line, index) => ({ line, index, seconds: seconds[keyOf(line)] ?? median }));
  const unmeasured = tests.filter((t) => seconds[keyOf(t.line)] === undefined).length;
  const bins = balance(tests, of, workers);
  process.stderr.write(
    `${tests.length} tests (${unmeasured} with no measured time) over ${of} shards of ${workers} worker${workers === 1 ? '' : 's'}: ` +
      `about ${bins.map((b) => (takes(b, workers) / 60).toFixed(1)).join(', ')} min each\n`,
  );
  return { tests, bins };
}

function shardList(shard, of, workers) {
  const { tests, bins } = plan(of, workers);
  const mine = bins[shard - 1];
  process.stderr.write(`shard ${shard}/${of}: ${mine.tests.length} of ${tests.length} tests\n`);
  process.stdout.write(mine.tests.map((t) => t.line).join('\n') + '\n');
}

function planFiles(of, workers, dir) {
  const { bins } = plan(of, workers);
  mkdirSync(dir, { recursive: true });
  bins.forEach((b, i) => writeFileSync(join(dir, `shard-${i + 1}.txt`), b.tests.map((t) => t.line).join('\n') + '\n'));
}

/**
 * durations.json from a JSON report: each test's seconds on its last try, keyed as `--list` prints
 * it, averaged with the table's time for the test where it has one.
 */
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
  const before = existsSync(DURATIONS) ? JSON.parse(readFileSync(DURATIONS, 'utf8')) : {};
  for (const [k, s] of Object.entries(seconds)) {
    if (s > 0 && before[k] > 0) seconds[k] = Math.round(((s + before[k]) / 2) * 10) / 10;
  }
  const sorted = Object.fromEntries(Object.entries(seconds).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(DURATIONS, JSON.stringify(sorted, null, 1) + '\n');
  process.stderr.write(`${Object.keys(sorted).length} tests written to ${DURATIONS}\n`);
}

const [a, b, c, d] = process.argv.slice(2);
if (a === 'durations' && b) durationsFrom(b);
else if (a === 'plan' && Number(b) >= 1 && Number(c) >= 1 && d) planFiles(Number(b), Number(c), d);
else if (Number(a) >= 1 && Number(a) <= Number(b)) shardList(Number(a), Number(b), Number(c ?? 1) || 1);
else {
  process.stderr.write('usage: node e2e/shard.mjs <shard> <of> [workers] | node e2e/shard.mjs plan <of> <workers> <dir> | node e2e/shard.mjs durations <report.json>\n');
  process.exit(2);
}
