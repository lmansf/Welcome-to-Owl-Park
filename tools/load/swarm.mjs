#!/usr/bin/env node
/**
 * swarm.mjs: a small WebSocket load generator for the Owl Park room server (MIT, Node 22).
 *
 *   node tools/load/swarm.mjs --url http://localhost:8787 --bots 3 --seconds 30 --tap-every 4000 --room hub
 *
 * Each bot mints a guest pass, joins the room with a `hello`, taps a random walkable point
 * every --tap-every ms (jittered ±25%), heartbeats every 25 s, and times how long the server
 * takes to echo its own move back (the echo is the only frame carrying the bot's `seq`).
 * --ip-header adds a distinct X-Forwarded-For per bot; the server keys its per-IP cap on
 * CF-Connecting-IP, so locally this changes nothing. Exits 1 when < 90% of bots were welcomed.
 * --json writes everything measured to a file, for run-steps.mjs to add several swarms together.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import WebSocket from 'ws';

const USAGE = 'usage: swarm.mjs [--url http://localhost:8787] [--bots 3] [--seconds 30] [--tap-every 5000] [--room lobby|hub|grove|market] [--ip-header] [--json <file>]';
// The room server's protocol version, read from the shared source so the bots never fall behind it.
const EDGE = readFileSync(new URL('../../packages/shared/src/edge.ts', import.meta.url), 'utf8');
const VERSION = Number(/EDGE_PROTOCOL_VERSION = (\d+)/.exec(EDGE)?.[1]);
if (!Number.isInteger(VERSION)) throw new Error('could not read EDGE_PROTOCOL_VERSION from packages/shared/src/edge.ts');
const HELLO = { t: 'hello', v: VERSION, look: { body: '#8B5A2B', belly: '#F6F1E3', accent: '#C9A227' } };
const HEARTBEAT_MS = 25_000;
const CONNECT_STAGGER_MS = 60;
const CLOSE_GRACE_MS = 2_000;

// Boxes wholly on each room's walkable floor (packages/shared/rooms/index.ts), clear of the doors: a
// tap off the floor is pulled back to its edge, often to where the owl already stands, and goes unanswered.
const TARGETS = {
  lobby: { x: [400, 2300], y: [790, 870] },
  hub: { x: [200, 1800], y: [770, 870] },
  grove: { x: [500, 2100], y: [680, 760] },
  market: { x: [300, 1900], y: [730, 830] },
};

function parseArgs(argv) {
  const o = { url: 'http://localhost:8787', bots: 3, seconds: 30, tapEvery: 5000, room: 'hub', ipHeader: false, json: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--url') o.url = next();
    else if (a === '--bots') o.bots = Number(next());
    else if (a === '--seconds') o.seconds = Number(next());
    else if (a === '--tap-every') o.tapEvery = Number(next());
    else if (a === '--room') o.room = next();
    else if (a === '--ip-header') o.ipHeader = true;
    else if (a === '--json') o.json = next();
    else if (a === '--help' || a === '-h') return console.log(USAGE), process.exit(0);
    else return console.error(`unknown argument ${a}\n${USAGE}`), process.exit(2);
  }
  if (!TARGETS[o.room]) return console.error(`unknown room ${o.room}\n${USAGE}`), process.exit(2);
  if (!(o.bots > 0 && o.seconds > 0 && o.tapEvery > 0)) return console.error(USAGE), process.exit(2);
  return o;
}

const opts = parseArgs(process.argv.slice(2));
const BASE = opts.url.replace(/\/$/, '');
const WS_BASE = BASE.replace(/^http/, 'ws');

const stats = { connected: 0, welcomes: 0, movesSent: 0, echoes: 0, latencies: [], frames: 0, byType: new Map(), closeCodes: new Map(), http: new Map(), errors: [] };
/** Closes before the run ended (the server's doing), by code and reason; and what the room held at the first welcome. */
const during = { closes: new Map(), firstAt: null, counts: null };
let stopping = false;
const t0 = performance.now();
// How late this process's own timers ran: a busy runner shows here, not in the server's answers.
const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();
const tally = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const between = ([lo, hi]) => Math.round(lo + Math.random() * (hi - lo));
const jitter = (ms) => ms * (0.75 + Math.random() * 0.5);

async function startBot(n) {
  const bot = { n, id: null, ws: null, seq: 0, pending: new Map(), frames: 0, tapTimer: null, hbTimer: null };
  let pass;
  try {
    const r = await fetch(`${BASE}/api/pass`);
    if (!r.ok) throw new Error(`GET /api/pass -> HTTP ${r.status}`);
    ({ pass } = await r.json());
  } catch (e) {
    stats.errors.push(`bot ${n}: ${e.message}`);
    return bot;
  }
  const headers = opts.ipHeader ? { 'X-Forwarded-For': `10.0.${(n >> 8) & 255}.${n & 255}` } : {};
  const ws = new WebSocket(`${WS_BASE}/ws/${opts.room}?pass=${encodeURIComponent(pass)}`, { headers });
  bot.ws = ws;
  ws.on('open', () => {
    stats.connected++;
    ws.send(JSON.stringify(HELLO));
  });
  ws.on('message', (data) => onFrame(bot, data.toString()));
  ws.on('error', (e) => {
    const rejected = /Unexpected server response: (\d+)/.exec(e.message); // ws aborts the handshake on non-101
    if (rejected) tally(stats.http, `HTTP ${rejected[1]}`);
    else stats.errors.push(`bot ${n}: ${e.message}`);
  });
  ws.on('close', (code, reason) => {
    tally(stats.closeCodes, `${code}${reason.length ? ` (${reason})` : ''}`);
    if (!stopping) {
      tally(during.closes, `${code}${reason.length ? ` (${reason})` : ''}`);
      during.firstAt ??= Math.round((performance.now() - t0) / 1000);
    }
    clearTimeout(bot.tapTimer);
    clearInterval(bot.hbTimer);
  });
  return bot;
}

function onFrame(bot, text) {
  const now = performance.now();
  bot.frames++;
  stats.frames++;
  if (text === 'hb') return tally(stats.byType, 'hb');
  let f;
  try {
    f = JSON.parse(text);
  } catch {
    return tally(stats.byType, 'unparseable');
  }
  tally(stats.byType, f.t);
  if (f.t === 'welcome') {
    during.counts ??= f.counts ?? null;
    bot.id = f.id;
    stats.welcomes++;
    startTapping(bot);
  } else if (f.t === 'move' && f.id === bot.id && f.seq !== undefined) {
    const sentAt = bot.pending.get(f.seq);
    if (sentAt === undefined) return;
    bot.pending.delete(f.seq);
    stats.echoes++;
    stats.latencies.push(now - sentAt);
  }
}

function startTapping(bot) {
  const box = TARGETS[opts.room];
  const tap = () => {
    if (bot.ws.readyState !== WebSocket.OPEN) return;
    const seq = bot.seq++;
    bot.pending.set(seq, performance.now());
    bot.ws.send(JSON.stringify({ t: 'move', to: { x: between(box.x), y: between(box.y) }, seq }));
    stats.movesSent++;
    bot.tapTimer = setTimeout(tap, jitter(opts.tapEvery));
  };
  bot.tapTimer = setTimeout(tap, Math.random() * opts.tapEvery); // spread the first taps out
  bot.hbTimer = setInterval(() => bot.ws.readyState === WebSocket.OPEN && bot.ws.send('hb'), HEARTBEAT_MS);
}

function stopBot(bot) {
  clearTimeout(bot.tapTimer);
  clearInterval(bot.hbTimer);
  const ws = bot.ws;
  if (!ws) return Promise.resolve();
  if (ws.readyState !== WebSocket.OPEN) return ws.terminate(), Promise.resolve();
  return new Promise((resolve) => {
    ws.once('close', resolve);
    ws.send(JSON.stringify({ t: 'bye' })); // the server answers with close 1000 "bye"
    setTimeout(() => (ws.terminate(), resolve()), CLOSE_GRACE_MS).unref();
  });
}

function report(bots) {
  const lat = [...stats.latencies].sort((a, b) => a - b);
  const pct = (p) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))].toFixed(1) : 'n/a');
  const rates = bots.filter((b) => b.id).map((b) => b.frames / opts.seconds);
  const mean = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  const fmt = (map) => (map.size ? [...map].map(([k, v]) => `${k} x${v}`).join(', ') : 'none');
  console.log(`
bots connected      ${stats.connected}/${opts.bots}
welcomes received   ${stats.welcomes}
moves sent          ${stats.movesSent}
echoes received     ${stats.echoes} (${stats.movesSent - stats.echoes} unanswered)
echo latency ms     p50 ${pct(0.5)}  p95 ${pct(0.95)}  max ${pct(1)}  (n=${lat.length})
frames/bot/s        mean ${mean.toFixed(2)}  max ${(rates.length ? Math.max(...rates) : 0).toFixed(2)}  (${stats.frames} frames total: ${fmt(stats.byType)})
close codes         ${fmt(stats.closeCodes)}
http rejections     ${fmt(stats.http)}
errors              ${stats.errors.length ? `\n  ${stats.errors.join('\n  ')}` : 'none'}`);
}

async function main() {
  console.log(`swarm -> ${BASE}  room=${opts.room}  bots=${opts.bots}  seconds=${opts.seconds}  tap-every=${opts.tapEvery}ms${opts.ipHeader ? '  ip-header=X-Forwarded-For' : ''}`);
  const bots = [];
  for (let n = 0; n < opts.bots; n++) {
    bots.push(await startBot(n));
    await sleep(CONNECT_STAGGER_MS);
  }
  await sleep(opts.seconds * 1000);
  stopping = true;
  await Promise.all(bots.map(stopBot));
  loopDelay.disable();
  report(bots);
  // Everything measured, for a run that adds several swarms together (run-steps.mjs).
  if (opts.json) {
    const frames = bots.filter((b) => b.id).map((b) => b.frames);
    const cpu = process.cpuUsage();
    const out = {
      bots: opts.bots,
      seconds: opts.seconds,
      ...stats,
      byType: Object.fromEntries(stats.byType),
      closeCodes: Object.fromEntries(stats.closeCodes),
      http: Object.fromEntries(stats.http),
      framesPerBot: frames,
      closedDuring: Object.fromEntries(during.closes),
      firstCloseAtS: during.firstAt,
      countsAtFirstWelcome: during.counts,
      loopDelayP99Ms: loopDelay.percentile(99) / 1e6,
      cpuShare: (cpu.user + cpu.system) / 1000 / (performance.now() - t0),
    };
    writeFileSync(opts.json, JSON.stringify(out));
  }
  process.exitCode = stats.welcomes < 0.9 * opts.bots ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
