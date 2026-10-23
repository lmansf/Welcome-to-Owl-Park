#!/usr/bin/env node
/**
 * run-steps.mjs: the load test's steps (OP-068) against one copy of the park, one after another, with
 * a Markdown table of what each found (appended to $GITHUB_STEP_SUMMARY too, when it is set). A step
 * splits its bots over several swarm processes (swarm.mjs), so the bots' own work spreads over the
 * machine's cores, and adds their measurements together. Between steps it waits for the copy to see
 * the last step's owls leave.
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
/** The pause between steps, for the last step's owls to be gone. */
const PAUSE_MS = 15_000;

// The server takes room caps up to 120 (apps/edge/src/rooms.ts); the copy sets all four to that.
const STEPS = [
  { name: 'hub at its cap, calm', rooms: { hub: 80 }, tap: CALM },
  { name: 'hub, busy', rooms: { hub: 40 }, tap: BUSY },
  { name: 'hub at its cap, busy', rooms: { hub: 80 }, tap: BUSY },
  { name: 'hub at the most a room can take, busy', rooms: { hub: 120 }, tap: BUSY },
  { name: 'four rooms at their caps, busy', rooms: { lobby: 80, hub: 80, grove: 40, market: 40 }, tap: BUSY },
  { name: 'four rooms at the most each can take, busy', rooms: { lobby: 120, hub: 120, grove: 120, market: 120 }, tap: BUSY },
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scaled = (n) => (quick ? Math.max(1, Math.round(n / 10)) : n);

/** One swarm process; resolves with what it measured (null if it wrote nothing). */
function swarm(room, bots, tap, file) {
  return new Promise((resolve) => {
    const args = [SWARM, '--url', url, '--room', room, '--bots', String(bots), '--tap-every', String(tap), '--seconds', String(seconds), '--ip-header', '--json', file];
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
    child.on('exit', () => {
      try {
        resolve({ room, ...JSON.parse(readFileSync(file, 'utf8')) });
      } catch {
        resolve(null);
      }
    });
  });
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : NaN);
const ms = (v) => (Number.isFinite(v) ? Math.round(v).toString() : 'n/a');
const merge = (maps) => {
  const out = new Map();
  for (const m of maps) for (const [k, v] of Object.entries(m ?? {})) out.set(k, (out.get(k) ?? 0) + v);
  return out;
};
const show = (map) => (map.size ? [...map].map(([k, v]) => `${v} × ${k}`).join(', ') : 'none');

async function step(s, n) {
  const runs = [];
  for (const [room, total] of Object.entries(s.rooms)) {
    const owls = scaled(total);
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
  // What each room already held when this step's first owl came in (the joining owl itself aside).
  const before = Object.keys(s.rooms)
    .map((room) => {
      const seen = ok.filter((r) => r.room === room && r.countsAtFirstWelcome).map((r) => (r.countsAtFirstWelcome[room] ?? 1) - 1);
      return seen.length ? `${room} ${Math.min(...seen)}` : null;
    })
    .filter(Boolean)
    .join(', ');
  const during = merge(ok.map((r) => r.closedDuring));
  const firstClose = ok.map((r) => r.firstCloseAtS).filter((v) => v !== null);
  const full = ok.reduce((a, r) => a + (r.byType.full ?? 0), 0);
  const refused = ok.reduce((a, r) => a + Object.values(r.http).reduce((x, v) => x + v, 0), 0);
  const errors = ok.reduce((a, r) => a + r.errors.length, 0);
  const owls = Object.values(s.rooms).reduce((a, v) => a + scaled(v), 0);
  return {
    name: s.name,
    rooms: Object.entries(s.rooms).map(([room, v]) => `${room} ${scaled(v)}`).join(', '),
    owls,
    pace: s.tap === CALM ? 'every 4 s' : 'every 1 s',
    welcomed: `${sum('welcomes')}/${owls}`,
    before: before || 'n/a',
    p50: ms(pct(lat, 0.5)),
    p95: ms(pct(lat, 0.95)),
    p99: ms(pct(lat, 0.99)),
    max: ms(lat.at(-1)),
    unanswered: `${sum('movesSent') - sum('echoes')} of ${sum('movesSent')}`,
    framesPerOwl: perBot.length ? (perBot.reduce((a, v) => a + v, 0) / perBot.length).toFixed(1) : 'n/a',
    during: during.size ? `${show(during)}, the first after ${Math.min(...firstClose)} s` : 'none',
    runner: `${ms(Math.max(...ok.map((r) => r.loopDelayP99Ms)))} ms, ${Math.round(100 * Math.max(...ok.map((r) => r.cpuShare)))}% of a core`,
    other: [full && `${full} turned away (room full)`, refused && `${refused} refused`, results.length - ok.length && `${results.length - ok.length} swarms wrote nothing`, errors && `${errors} errors: ${ok.flatMap((r) => r.errors).slice(0, 2).join('; ')}`].filter(Boolean).join(', ') || 'none',
  };
}

const rows = [];
for (const [n, s] of STEPS.entries()) {
  if (n > 0) await sleep(quick ? 2_000 : PAUSE_MS);
  const r = await step(s, n);
  rows.push(r);
  console.log(
    `${r.name} (${r.rooms}, a move ${r.pace}): welcomed ${r.welcomed}, already there ${r.before}; echo ms p50 ${r.p50} p95 ${r.p95} p99 ${r.p99} max ${r.max}; ${r.unanswered} moves unanswered; ${r.framesPerOwl} frames per owl a second; closed during the run: ${r.during}; runner lag p99 ${r.runner}; other: ${r.other}`,
  );
}

const table = [
  `Load test (${quick ? 'quick check' : `${seconds} s a step`}). Echo: the time from a bot's move to the server's answer, in ms. Already there: owls the server still counted in the room when the step began. Runner lag: how late the bots' own timers ran (the runner's load, not the server's).`,
  '',
  '| Step | Owls | A move | Welcomed | Already there | Echo p50 | p95 | p99 | max | Unanswered moves | Frames per owl a second | Closed during the run | Runner lag p99 | Other |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${r.rooms} | ${r.pace} | ${r.welcomed} | ${r.before} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.max} | ${r.unanswered} | ${r.framesPerOwl} | ${r.during} | ${r.runner} | ${r.other} |`),
  '',
].join('\n');
console.log(`\n${table}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table);
