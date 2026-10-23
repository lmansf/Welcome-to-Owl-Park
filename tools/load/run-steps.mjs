#!/usr/bin/env node
/**
 * run-steps.mjs: the load test's steps (OP-068) against one copy of the park, one after another, with
 * a Markdown table of what each found (appended to $GITHUB_STEP_SUMMARY too, when it is set). A step
 * splits its bots over several swarm processes (swarm.mjs), so the bots' own work spreads over the
 * machine's cores, and adds their measurements together.
 *
 *   node tools/load/run-steps.mjs --url http://localhost:8787 [--seconds 60] [--quick]
 *
 * --quick runs every step with a tenth of the owls for 10 seconds: a check that the steps work.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SWARM = fileURLToPath(new URL('./swarm.mjs', import.meta.url));
/** An owl that stops to look about (a tap every 4 s), and one that walks all the time (one a second; the server allows 2). */
const CALM = 4000;
const BUSY = 1000;
/** Bots per swarm process. */
const PER_PROCESS = 40;

const STEPS = [
  { name: 'hub at its cap, calm', rooms: { hub: 80 }, tap: CALM },
  { name: 'hub, busy', rooms: { hub: 40 }, tap: BUSY },
  { name: 'hub at its cap, busy', rooms: { hub: 80 }, tap: BUSY },
  { name: 'hub, busy', rooms: { hub: 120 }, tap: BUSY },
  { name: 'hub, busy', rooms: { hub: 160 }, tap: BUSY },
  { name: 'hub, busy', rooms: { hub: 240 }, tap: BUSY },
  { name: 'four rooms at their caps, busy', rooms: { lobby: 80, hub: 80, grove: 40, market: 40 }, tap: BUSY },
  { name: 'four rooms at twice their caps, busy', rooms: { lobby: 160, hub: 160, grove: 80, market: 80 }, tap: BUSY },
];

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const url = arg('--url');
const quick = process.argv.includes('--quick');
const seconds = quick ? 10 : Number(arg('--seconds') ?? 60);
if (!url || !(seconds > 0)) {
  console.error('usage: run-steps.mjs --url <address> [--seconds 60] [--quick]');
  process.exit(2);
}
const dir = mkdtempSync(join(tmpdir(), 'owl-load-'));

/** One swarm process; resolves with what it measured. */
function swarm(room, bots, tap, file) {
  return new Promise((resolve) => {
    const args = [SWARM, '--url', url, '--room', room, '--bots', String(bots), '--tap-every', String(tap), '--seconds', String(seconds), '--ip-header', '--json', file];
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
    child.on('exit', () => {
      try {
        resolve(JSON.parse(readFileSync(file, 'utf8')));
      } catch {
        resolve(null);
      }
    });
  });
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : NaN);
const ms = (v) => (Number.isFinite(v) ? Math.round(v).toString() : 'n/a');

async function step(s, n) {
  const runs = [];
  for (const [room, total] of Object.entries(s.rooms)) {
    const owls = quick ? Math.max(1, Math.round(total / 10)) : total;
    const processes = Math.ceil(owls / PER_PROCESS);
    for (let p = 0; p < processes; p++) {
      const bots = Math.floor(owls / processes) + (p < owls % processes ? 1 : 0);
      runs.push(swarm(room, bots, s.tap, join(dir, `step${n}-${room}-${p}.json`)));
    }
  }
  const results = await Promise.all(runs);
  const ok = results.filter(Boolean);
  const sum = (key) => ok.reduce((a, r) => a + r[key], 0);
  const lat = ok.flatMap((r) => r.latencies).sort((a, b) => a - b);
  const perBot = ok.flatMap((r) => r.framesPerBot.map((f) => f / r.seconds));
  const early = ok.flatMap((r) => Object.entries(r.closeCodes).filter(([code]) => !code.startsWith('1000'))).reduce((a, [, v]) => a + v, 0);
  const refused = ok.flatMap((r) => Object.values(r.http)).reduce((a, v) => a + v, 0);
  const owls = Object.values(s.rooms).reduce((a, v) => a + (quick ? Math.max(1, Math.round(v / 10)) : v), 0);
  return {
    name: s.name,
    owls,
    rooms: Object.entries(s.rooms).map(([room, v]) => `${room} ${quick ? Math.max(1, Math.round(v / 10)) : v}`).join(', '),
    pace: s.tap === CALM ? 'every 4 s' : 'every 1 s',
    welcomed: `${sum('welcomes')}/${owls}`,
    p50: ms(pct(lat, 0.5)),
    p95: ms(pct(lat, 0.95)),
    p99: ms(pct(lat, 0.99)),
    max: ms(lat.at(-1)),
    unanswered: sum('movesSent') - sum('echoes'),
    moves: sum('movesSent'),
    framesPerOwl: perBot.length ? (perBot.reduce((a, v) => a + v, 0) / perBot.length).toFixed(1) : 'n/a',
    trouble: [early && `${early} closed early`, refused && `${refused} refused`, results.length - ok.length && `${results.length - ok.length} swarms failed`, ok.reduce((a, r) => a + r.errors.length, 0) && `${ok.reduce((a, r) => a + r.errors.length, 0)} errors`].filter(Boolean).join(', ') || 'none',
  };
}

const rows = [];
for (const [n, s] of STEPS.entries()) {
  const r = await step(s, n);
  rows.push(r);
  console.log(`${r.name} (${r.rooms}, a move ${r.pace}): welcomed ${r.welcomed}, echo ms p50 ${r.p50} p95 ${r.p95} p99 ${r.p99} max ${r.max}, ${r.unanswered} of ${r.moves} moves unanswered, ${r.framesPerOwl} frames per owl a second, trouble: ${r.trouble}`);
}

const table = [
  `Load test (${quick ? 'quick check' : `${seconds} s a step`}): echo is the time from a bot's move to the server's answer, in ms.`,
  '',
  '| Step | Owls | A move | Welcomed | Echo p50 | p95 | p99 | max | Unanswered moves | Frames per owl a second | Trouble |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${r.rooms} | ${r.pace} | ${r.welcomed} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.max} | ${r.unanswered} of ${r.moves} | ${r.framesPerOwl} | ${r.trouble} |`),
  '',
].join('\n');
console.log(`\n${table}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table);
