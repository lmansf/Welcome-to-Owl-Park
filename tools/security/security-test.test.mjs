/**
 * The security script's own tests (OP-151): tools/security/security-test.sh run against a stand-in
 * park on this machine. The stand-in's front door, page policy, nonce, CORS and policy-report reading
 * are the Worker's own (apps/edge/src/guard.ts and page.ts, loaded as they are); its few routes copy
 * what apps/edge/src/index.ts answers. The script's real target is the park (or `pnpm dev:edge`);
 * these tests only keep the script honest: it passes a park that behaves, fails one that does not,
 * and always finishes with its count, however the park answers.
 *
 * Needs bash and curl; skipped where either is missing (a Windows shell without them).
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CSP_REPORT_PATH, REPORT_BODY_MAX, finished, frontDoor, guardedPage, violationOf } from '../../apps/edge/src/guard.ts';
import { uncachedPage } from '../../apps/edge/src/page.ts';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'security-test.sh');

function has(cmd) {
  try {
    execFileSync(cmd, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
const skip = has('bash') && has('curl') ? false : 'bash and curl are needed';

// As index.ts answers (its `CORS`, `json`, FEEDBACK_BODY_MAX).
const CORS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key, X-Collector, X-Keeper-Token',
  'Cache-Control': 'no-store',
};
const FEEDBACK_BODY_MAX = 16_384;
const PASS = 'stand-in-pass';
const PAGE = '<!doctype html><html><head><script>/* loader */</script></head><body><script>/* boot */</script><script type="module" crossorigin src="/assets/index-test.js"></script></body></html>';
const quiet = { debug() {}, info() {}, warn() {}, error() {} };

/** The stand-in park; `broken` names what it gets wrong. */
function standIn(broken = new Set()) {
  const json = (body, status = 200) => Response.json(body, { status, headers: broken.has('cache') ? { ...CORS, 'Cache-Control': 'max-age=60' } : CORS });
  const readJson = async (r) => {
    try {
      const v = await r.json();
      return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  };
  const park = async (request) => {
    const url = new URL(request.url);
    if (!broken.has('origin')) {
      const door = frontDoor(request, url, undefined, quiet);
      if (door) return door;
    }
    const passOk = request.headers.get('Authorization') === `Bearer ${PASS}`;
    if (url.pathname === CSP_REPORT_PATH) {
      if (request.method !== 'POST') return json({ error: 'not found' }, 404);
      if (Number(request.headers.get('Content-Length') ?? 0) > REPORT_BODY_MAX) return json({ error: 'too large' }, 413);
      return violationOf(await readJson(request)) ? new Response(null, { status: 204 }) : json({ error: 'bad request' }, 400);
    }
    if (url.pathname === '/api/pass') return request.method === 'OPTIONS' ? new Response(null, { headers: CORS }) : json({ pass: PASS, exp: 0, collector: 'c' });
    if (url.pathname === '/api/feedback') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (!passOk) return json({ error: 'bad-pass' }, 401);
      if (broken.has('limits')) throw new Error('at readJson (/worker/src/index.ts:120:5)');
      if (Number(request.headers.get('Content-Length') ?? 0) > FEEDBACK_BODY_MAX) return json({ error: 'too large' }, 413);
      await request.arrayBuffer();
      return json({ error: 'bad request' }, 400);
    }
    if (url.pathname === '/api/tickets/scan' || url.pathname === '/api/vote') {
      if (broken.has('auth') && request.headers.has('X-Admin-Key')) return json({ ok: true });
      return passOk ? json({ ok: true }) : json({ error: 'bad-pass' }, 401);
    }
    if (url.pathname.startsWith('/api/')) return new Response(null, { status: 404 });
    if (url.pathname === '/') {
      const page = await guardedPage(uncachedPage(new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })), url);
      if (broken.has('referrer')) page.headers.delete('Referrer-Policy');
      if (broken.has('nonce')) return new Response(PAGE, { headers: { ...Object.fromEntries(page.headers), 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'nonce-00000000000000000000000000000000'" } });
      return page;
    }
    if (url.pathname === '/assets/index-test.js') return new Response('console.log("owls")', { headers: { 'Content-Type': 'text/javascript', 'X-Content-Type-Options': 'nosniff' } });
    return new Response('not found', { status: 404 });
  };
  return createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, body });
    let out;
    try {
      out = finished(request, new URL(request.url), await park(request), undefined);
    } catch (e) {
      out = new Response(String(e?.message ?? e), { status: 500 });
    }
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  });
}

/** Runs the script against `url`; its exit code and what it printed. Asynchronous: the stand-in answers from this process. */
function run(url, extra = {}) {
  const env = { ...process.env, no_proxy: '127.0.0.1,localhost', NO_PROXY: '127.0.0.1,localhost', ...extra };
  if (url === null) delete env.PARK_URL;
  else env.PARK_URL = url;
  return new Promise((done, failed) => {
    const child = spawn('bash', [SCRIPT], { env });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', failed);
    child.on('close', (status) => done({ status, out }));
  });
}

async function withPark(broken, fn) {
  const server = standIn(new Set(broken));
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((done) => server.close(done));
  }
}

const fails = (out) => out.split('\n').filter((l) => l.startsWith('FAIL'));

test('passes a park that behaves, every check but the opt-in burst, in well under 50 requests', { skip }, async () => {
  const { status, out } = await withPark([], async (url) => run(url));
  assert.deepEqual(fails(out), []);
  assert.equal(status, 0, out);
  assert.match(out, /SKIP {2}rate limit burst/);
  const requests = Number(/; (\d+) requests\./.exec(out)?.[1]);
  assert.ok(requests > 0 && requests < 50, out);
});

test('fails a park that gets things wrong, naming each check, and still finishes with its count', { skip }, async () => {
  const { status, out } = await withPark(['referrer', 'nonce', 'origin', 'cache', 'auth', 'limits'], async (url) => run(url));
  assert.equal(status, 1, out);
  const failed = fails(out).join('\n');
  for (const check of ['Referrer-Policy', 'nonce changes', 'another site', 'no-store', 'X-Admin-Key', '2 MB feedback', 'short code']) assert.match(failed, new RegExp(check), out);
  assert.match(out, /\d+ passed, \d+ failed, \d+ skipped; \d+ requests\./);
});

test('reports a park that does not answer as failures, never stopping half-way', { skip }, async () => {
  const server = createServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  const { status, out } = await run(`http://127.0.0.1:${port}`);
  assert.equal(status, 1, out);
  assert.match(out, /0 passed|\d+ passed, \d+ failed/);
  assert.match(out, /requests\.$/m);
});

test('will not start without PARK_URL, or at an address that is neither https nor this machine', { skip }, async () => {
  assert.equal((await run(null)).status, 2);
  assert.equal((await run('http://example.invalid')).status, 2);
  assert.equal((await run('ftp://example.invalid')).status, 2);
});
