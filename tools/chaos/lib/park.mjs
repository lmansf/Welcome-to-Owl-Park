/**
 * A throwaway park on this machine for a chaos run (OP-132): the Worker and the room server under
 * wrangler dev on ports of their own, their storage in a folder made for the run and deleted after
 * it, and the browser tests' stand-in store (apps/park/e2e/standInStore.mjs) beside them. Nothing is
 * deployed and the free plan's requests are never spent. Every line the park writes is kept, with
 * the time it came, for the run's folder.
 */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The stand-in store's settings, as the room server is given them: test values, never a secret. */
export const STORE = {
  shop: 'owl-chaos.myshopify.com',
  token: 'chaos-only-store-token-not-a-secret',
  webhookKey: 'chaos-only-webhook-key-not-a-secret',
};
/** The keepers' key the chaos park runs with: a test value, never a secret. */
export const CHAOS_ADMIN_KEY = 'chaos-only-admin-key-not-a-secret';

/**
 * The settings a chaos park runs with. Every scripted visitor comes from this one machine, so each
 * says its own address (X-Forwarded-For, trusted here only) and the Worker's own limits are off, as
 * on the load test's throwaway copy; the room server's limits per socket stay on.
 */
function vars(storeOrigin, extra) {
  return {
    ADMIN_KEY: CHAOS_ADMIN_KEY,
    SHOPIFY_SHOP: STORE.shop,
    SHOPIFY_ADMIN_TOKEN: STORE.token,
    SHOPIFY_WEBHOOK_SECRET: STORE.webhookKey,
    SHOPIFY_TEST_ORIGIN: storeOrigin,
    TRUST_FORWARDED_FOR: 'true',
    MAX_SOCKETS_PER_IP: '64',
    RATE_LIMITS: 'off',
    LOG_LEVEL: 'info',
    ...extra,
  };
}

const ANSI = /\u001b\[[0-9;]*m/g;

/** One process in a session of its own, so the whole of it (pnpm, wrangler, workerd) stops together. */
function launch(cmd, args, onLine) {
  const child = spawn(cmd, args, { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } });
  for (const stream of [child.stdout, child.stderr]) {
    let rest = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      const parts = (rest + chunk).split('\n');
      rest = parts.pop() ?? '';
      for (const p of parts) onLine(p.replace(ANSI, ''));
    });
  }
  return child;
}

/** Signal a launched process's whole session; true when it was still there. */
function signal(child, sig) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return false;
  try {
    process.kill(-child.pid, sig);
    return true;
  } catch {
    return false; // already gone
  }
}

async function waitFor(url, ms) {
  const until = Date.now() + ms;
  for (;;) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2_000) })).ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > until) throw new Error(`${url} did not come up in ${ms / 1000} s`);
    await sleep(250);
  }
}

/**
 * Start a chaos park for run `runId`: the stand-in store on `storePort`, the Worker and the room
 * server on `port`. The client must be built already (run.mjs builds it once).
 */
export async function startPark({ runId, port = 8797, storePort = 8791, extraVars = {} }) {
  const base = `http://localhost:${port}`;
  const storeOrigin = `http://localhost:${storePort}`;
  const persist = `.wrangler/chaos/${runId}`;
  /** Every line either process wrote: when, which, and the line; and the park's own log lines, parsed. */
  const lines = [];
  const logs = [];
  const keep = (source) => (line) => {
    if (!line.trim()) return;
    const at = Date.now();
    lines.push({ at, source, line });
    const json = line.indexOf('{"ts":');
    if (json >= 0) {
      try {
        logs.push({ at, ...JSON.parse(line.slice(json)) });
      } catch {
        /* a line that only looks like one of the park's */
      }
    }
  };
  const store = launch('node', ['apps/park/e2e/standInStore.mjs', String(storePort)], keep('store'));
  await waitFor(`${storeOrigin}/health`, 10_000);
  const settings = vars(storeOrigin, extraVars);
  const serverArgs = ['--filter', '@owl-park/edge', 'exec', 'wrangler', 'dev', '--port', String(port), '--inspector-port', String(port + 1000), '--persist-to', persist, ...Object.entries(settings).flatMap(([k, v]) => ['--var', `${k}:${v}`])];
  let server = null;
  const up = async () => {
    server = launch('pnpm', serverArgs, keep('park'));
    await waitFor(`${base}/api/counts`, 180_000);
  };
  await up();
  return {
    base,
    storeOrigin,
    lines,
    logs,
    /** The room server killed at once, mid-whatever it was doing (experiment 1): its storage stays. */
    kill() {
      return signal(server, 'SIGKILL');
    },
    /** The room server started again on the same storage. */
    async restart() {
      signal(server, 'SIGKILL');
      await up();
    },
    /** Everything stopped and the run's storage thrown away. */
    async stop() {
      for (const child of [server, store]) signal(child, 'SIGTERM');
      await sleep(1_500);
      for (const child of [server, store]) signal(child, 'SIGKILL');
      rmSync(new URL(`../../../apps/edge/${persist}`, import.meta.url), { recursive: true, force: true });
    },
  };
}
