#!/usr/bin/env node
/**
 * capacity-dry-run.mjs: the busy-night rehearsal (OP-075) against a throwaway copy of the park's
 * Worker run with one object per room (the Load test workflow's capacity mode). With the keepers'
 * admin key it opens a second copy of the hub, fills both with bots and watches where newcomers go,
 * drains the copy and closes it once empty, then puts a line in front of the park and times owls
 * through it. It writes what it saw, with timings, as a Markdown table (to $GITHUB_STEP_SUMMARY too).
 *
 *   LOAD_ADMIN_KEY=... node tools/load/capacity-dry-run.mjs --url https://<the throwaway copy> [--cap 30]
 *
 * The hub's cap on the copy is --cap (30 by default, set by tools/load/throwaway-config.mjs), small
 * enough that a few dozen bots fill a copy.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import WebSocket from 'ws';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = (arg('--url') ?? '').replace(/\/$/, '');
const CAP = Number(arg('--cap', '30'));
const KEY = process.env.LOAD_ADMIN_KEY ?? '';
if (!BASE || !KEY || !(CAP > 0)) {
  console.error('usage: LOAD_ADMIN_KEY=... capacity-dry-run.mjs --url <address> [--cap 30]');
  process.exit(2);
}
const WS_BASE = BASE.replace(/^http/, 'ws');
const EDGE = readFileSync(new URL('../../packages/shared/src/edge.ts', import.meta.url), 'utf8');
const VERSION = Number(/EDGE_PROTOCOL_VERSION = (\d+)/.exec(EDGE)?.[1]);
const HELLO = { t: 'hello', v: VERSION, look: { body: '#8B5A2B', belly: '#F6F1E3', accent: '#C9A227' } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const secs = (ms) => (ms / 1000).toFixed(1);
const rows = [];
const note = (step, what, result) => {
  rows.push({ step, what, result });
  console.log(`[${secs(Date.now() - t0)} s] ${step}: ${what}: ${result}`);
};

let botN = 0;

async function admin(method, body) {
  const r = await fetch(`${BASE}/api/admin/capacity`, { method, headers: { 'X-Admin-Key': KEY, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`capacity ${method} answered ${r.status}: ${JSON.stringify(out)}`);
  return out;
}

/** The hub's owls, copy by copy, as the keepers' page shows them. */
async function hubCounts() {
  const s = await admin('GET');
  const hub = s.rooms.find((r) => r.room === 'hub');
  return Object.fromEntries(hub.copies.map((c) => [c.n, c.count]));
}

async function passFor(n) {
  const r = await fetch(`${BASE}/api/pass`, { headers: { 'X-Forwarded-For': ipOf(n) } });
  if (!r.ok) throw new Error(`pass: ${r.status}`);
  return (await r.json()).pass;
}

const ipOf = (n) => `10.1.${(n >> 8) & 255}.${n & 255}`;

/** One bot into a room: resolves once welcomed (with the copy it was put in) or refused. An entry goes with the pass it was made for. */
async function bot(room, { entry, pass: given, n: givenN } = {}) {
  const n = givenN ?? ++botN;
  const pass = given ?? (await passFor(n));
  const q = `pass=${encodeURIComponent(pass)}${entry ? `&entry=${encodeURIComponent(entry)}` : ''}`;
  const ws = new WebSocket(`${WS_BASE}/ws/${room}?${q}`, { headers: { 'X-Forwarded-For': ipOf(n) } });
  const b = { n, ws, copy: null, closed: null, hb: null };
  return new Promise((resolve) => {
    const done = () => resolve(b);
    ws.on('open', () => ws.send(JSON.stringify(HELLO)));
    ws.on('message', (data) => {
      const text = data.toString();
      if (text === 'hb') return;
      const f = JSON.parse(text);
      if (f.t === 'welcome') {
        b.copy = f.copy ?? 1;
        b.hb = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('hb'), 25_000);
        done();
      }
    });
    ws.on('close', (code) => {
      b.closed = code;
      clearInterval(b.hb);
      done();
    });
    ws.on('error', () => done());
  });
}

function leave(bots) {
  for (const b of bots) {
    clearInterval(b.hb);
    if (b.ws.readyState === WebSocket.OPEN) {
      b.ws.send(JSON.stringify({ t: 'bye' }));
      b.ws.close(1000, 'bye');
    }
  }
}

const split = (bots) => {
  const by = {};
  for (const b of bots) {
    const k = b.copy ? `copy ${b.copy}` : `refused (${b.closed})`;
    by[k] = (by[k] ?? 0) + 1;
  }
  return Object.entries(by)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ');
};

async function until(what, test, timeoutMs = 120_000, everyMs = 1_000) {
  const start = Date.now();
  for (;;) {
    if (await test()) return Date.now() - start;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await sleep(everyMs);
  }
}

async function line(pass, method, body, n) {
  const r = await fetch(`${BASE}/api/line${n ? `?n=${n}` : ''}`, { method, headers: { Authorization: `Bearer ${pass}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!r.ok) throw new Error(`line: ${r.status}`);
  return r.json();
}

async function main() {
  const start = await admin('GET');
  if (start.sharding !== 'room') throw new Error('the throwaway copy must run one object per room (LOAD_SHARDING=room)');
  note('0', 'the copy as deployed', `one object per room; hub cap ${start.rooms.find((r) => r.room === 'hub').cap}; no line, no copies`);

  // 1. The hub fills; a second copy opens; newcomers go where there is room.
  const first = [];
  for (let i = 0; i < 20; i++) first.push(await bot('hub'));
  note('1', '20 owls into the hub', split(first));
  const opened = Date.now();
  await admin('POST', { copy: { room: 'hub', n: 2, state: 'open' } });
  note('1', 'copy 2 of the hub opened', `the change took ${Date.now() - opened} ms`);
  const second = [];
  let firstInCopy2 = null;
  for (let i = 0; i < 24; i++) {
    const b = await bot('hub');
    second.push(b);
    if (b.copy === 2 && firstInCopy2 === null) firstInCopy2 = Date.now() - opened;
  }
  note('1', '24 more owls into the hub', `${split(second)}; the first in copy 2 ${firstInCopy2 === null ? 'never' : `${firstInCopy2} ms after it opened`}`);
  note('1', 'the hub, copy by copy', JSON.stringify(await hubCounts()));

  // 2. Drain copy 2: nobody new goes there; its owls leave; it closes empty.
  await admin('POST', { copy: { room: 'hub', n: 2, state: 'draining' } });
  const third = [];
  for (let i = 0; i < 6; i++) third.push(await bot('hub'));
  note('2', 'copy 2 draining; 6 more owls into the hub', split(third));
  const inCopy2 = [...first, ...second, ...third].filter((b) => b.copy === 2);
  const left = Date.now();
  leave(inCopy2);
  const emptied = await until('copy 2 to empty', async () => (await hubCounts())[2] === 0);
  note('2', `copy 2's ${inCopy2.length} owls leave`, `the keepers' page read 0 after ${secs(emptied)} s`);
  await admin('POST', { copy: { room: 'hub', n: 2, state: 'closed' } });
  const back = await bot('hub');
  note('2', 'copy 2 closed; one more owl into the hub', back.copy ? `copy ${back.copy}` : `refused (${back.closed})`);
  const inside = [...first, ...second, ...third, back].filter((b) => b.copy === 1);

  // 3. The line: the park holds its owls; newcomers wait; owls leave; turns come in order.
  const counts = await hubCounts();
  const held = counts[1] ?? 0;
  await admin('POST', { line: { mode: 'on', threshold: held, holdMin: 2 } });
  note('3', `the line on, at the ${held} owls inside`, 'new owls wait');
  const waiting = [];
  for (let i = 0; i < 8; i++) {
    const n = ++botN;
    const pass = await passFor(n);
    const s = await line(pass, 'POST', {});
    waiting.push({ n, pass, s, at: Date.now(), calledAfter: null, entry: null });
  }
  note('3', '8 owls arrive', waiting.map((w) => (w.s.state === 'waiting' ? `#${w.s.place}` : w.s.state)).join(' '));
  const turnedAway = await bot('lobby');
  note('3', 'an owl without its turn opens a room', turnedAway.closed === 4012 ? 'turned away to the line (4012)' : `not turned away (copy ${turnedAway.copy}, close ${turnedAway.closed})`);
  const gone = inside.slice(0, 4);
  const leftAt = Date.now();
  leave(gone);
  note('3', '4 owls inside leave the park', 'the line should call 4');
  // Each waiting owl looks every 2 s; a called one takes its turn and walks into the lobby with its entry.
  const lookUntil = Date.now() + 90_000;
  while (Date.now() < lookUntil && waiting.some((w) => !w.entry && w.s.state === 'waiting')) {
    await sleep(2_000);
    for (const w of waiting) {
      if (w.entry || w.s.state !== 'waiting') continue;
      w.s = await line(w.pass, 'GET', null, w.s.n);
      if (w.s.state === 'called' || w.s.state === 'go') {
        w.entry = w.s.entry;
        w.calledAfter = Date.now() - leftAt;
      }
    }
    if (waiting.filter((w) => w.entry).length >= gone.length) break;
  }
  const called = waiting.filter((w) => w.entry);
  note('3', 'turns that came', called.length ? called.map((w) => `#${waiting.indexOf(w) + 1} after ${secs(w.calledAfter)} s`).join(', ') : 'none');
  const walkedIn = [];
  for (const w of called) walkedIn.push(await bot('lobby', { entry: w.entry, pass: w.pass, n: w.n }));
  note('3', 'called owls open the lobby with their entry', split(walkedIn));
  note('3', 'still waiting', waiting.filter((w) => !w.entry).map((w) => `#${w.s.place ?? '?'}`).join(' ') || 'none');

  // Put everything back as deployed, and let every bot go.
  await admin('POST', { line: { mode: 'off', threshold: 80, holdMin: 3 } });
  leave([...first, ...second, ...third, back, ...walkedIn]);
  note('4', 'the line off; every bot leaves', `done after ${secs(Date.now() - t0)} s`);
}

try {
  await main();
} catch (e) {
  note('!', 'stopped', e.message);
  process.exitCode = 1;
}
const table = [
  `Capacity dry run (OP-075): a throwaway copy with one object per room, the hub's cap ${CAP}.`,
  '',
  '| Step | What | What happened |',
  '|---|---|---|',
  ...rows.map((r) => `| ${r.step} | ${r.what} | ${r.result} |`),
  '',
].join('\n');
console.log(`\n${table}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table);
setTimeout(() => process.exit(process.exitCode ?? 0), 2_000).unref();
