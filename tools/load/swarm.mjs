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
 */
import WebSocket from 'ws';

const USAGE = 'usage: swarm.mjs [--url http://localhost:8787] [--bots 3] [--seconds 30] [--tap-every 5000] [--room hub|grove|market] [--ip-header]';
const HELLO = { t: 'hello', v: 2, look: { body: '#8B5A2B', belly: '#F6F1E3', accent: '#C9A227' } };
const HEARTBEAT_MS = 25_000;
const CONNECT_STAGGER_MS = 60;
const CLOSE_GRACE_MS = 2_000;

// Boxes comfortably inside each room's walkable polygon (packages/shared/rooms/index.ts).
const TARGETS = {
  hub: { x: [40, 1560], y: [660, 870] },
  grove: { x: [400, 1200], y: [560, 850] },
  market: { x: [320, 1340], y: [620, 860] },
};

function parseArgs(argv) {
  const o = { url: 'http://localhost:8787', bots: 3, seconds: 30, tapEvery: 5000, room: 'hub', ipHeader: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--url') o.url = next();
    else if (a === '--bots') o.bots = Number(next());
    else if (a === '--seconds') o.seconds = Number(next());
    else if (a === '--tap-every') o.tapEvery = Number(next());
    else if (a === '--room') o.room = next();
    else if (a === '--ip-header') o.ipHeader = true;
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
  await Promise.all(bots.map(stopBot));
  report(bots);
  process.exitCode = stats.welcomes < 0.9 * opts.bots ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
