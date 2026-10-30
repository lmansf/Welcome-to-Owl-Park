#!/usr/bin/env node
/**
 * The chaos harness (OP-132): one experiment against a throwaway park on this machine
 * (lib/park.mjs). Nothing is deployed.
 *
 *   node tools/chaos/run.mjs <experiment>   an experiment's id or number (room-server-killed, or 1)
 *   node tools/chaos/run.mjs --list          the eight, and which can run yet
 *
 * Options: --port <n> (the park's; its inspector takes n + 1000; 8797), --store-port <n> (8791),
 * --no-build (apps/park/dist is current), --no-journey (no browser page in the steady state).
 *
 * A run: build the client; start the park and the stand-in store; put the fleet (10 scripted
 * visitors) in the hub; check the steady state and refuse to start when it does not hold; run the
 * experiment while the steady state is sampled every 5 s (the checkout and the journey every 30 s);
 * abort when any check has failed for more than 30 s; always roll back; confirm the steady state is
 * back; then write the run's folder (lib/runlog.mjs) and its proposed tickets (lib/propose.mjs).
 * Exit 0 when the hypothesis held and the park came back, 1 when not, 2 when the run could not start.
 * In GitHub Actions: .github/workflows/chaos.yml, started by hand, keeps the run's folder 90 days.
 *
 * TODO-DOCS (OP-132): docs/TESTING.md: a chaos section (the steady state, the eight experiments and
 * which are built, how to run one here and in Actions, the run's folder, the proposer and QA's
 * filing); docs/PLAYBOOK.md: the runbook lines; results/INDEX.md is the doc agent's to keep.
 */
import { execFileSync } from 'node:child_process';
import { setTimeout as sleepFor } from 'node:timers/promises';
import { EXPERIMENTS, experimentFor } from './experiments/index.mjs';
import { CHAOS_ADMIN_KEY, ROOT, startPark } from './lib/park.mjs';
import { propose } from './lib/propose.mjs';
import { closeRun, openRun } from './lib/runlog.mjs';
import { checkCheckout, checkHealth, checkJourney, Fleet, fleetChecks } from './lib/steady.mjs';
import { Visitor } from './lib/visitor.mjs';

const SAMPLE_MS = 5_000;
const HEAVY_MS = 30_000;
const ABORT_AFTER_MS = 30_000;
const BACK_WITHIN_MS = 90_000;
const USAGE = 'usage: node tools/chaos/run.mjs <experiment> [--port 8797] [--store-port 8791] [--no-build] [--no-journey] | --list';

function parseArgs(argv) {
  const o = { experiment: null, port: 8797, storePort: 8791, build: true, journey: true, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') o.list = true;
    else if (a === '--port') o.port = Number(argv[++i]);
    else if (a === '--store-port') o.storePort = Number(argv[++i]);
    else if (a === '--no-build') o.build = false;
    else if (a === '--no-journey') o.journey = false;
    else if (!a.startsWith('--') && !o.experiment) o.experiment = a;
    else throw new Error(`unknown argument ${a}\n${USAGE}`);
  }
  return o;
}

/** A promise that settles when `signal` aborts. */
const whenAborted = (signal) => new Promise((resolve) => (signal.aborted ? resolve() : signal.addEventListener('abort', () => resolve(), { once: true })));
/** A pause that `signal` cuts short, leaving no listener on it. */
const pause = (ms, signal) => sleepFor(ms, undefined, { signal }).catch(() => undefined);

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.list) {
    for (const e of EXPERIMENTS) console.log(`${e.n}. ${e.id}: ${e.name}${e.notRunnable ? `\n   not runnable: ${e.notRunnable}` : ''}`);
    return 0;
  }
  const experiment = experimentFor(o.experiment);
  if (!experiment) {
    console.error(USAGE);
    return 2;
  }
  const log = openRun(experiment, `this machine: the park under wrangler dev on port ${o.port}, the stand-in store on port ${o.storePort}`);
  const { run } = log;
  console.log(`chaos run ${log.id}: ${experiment.n}. ${experiment.name}`);
  const events = [];
  const listeners = new Set();
  const onEvent = (e) => {
    events.push(e);
    for (const l of listeners) l(e);
  };
  const startedAt = Date.now();
  let park = null;
  let fleet = null;
  let browser = null;
  let code = 2;
  try {
    if (experiment.notRunnable) {
      run.verdict = 'not runnable';
      log.note('note', { what: experiment.notRunnable });
      return code;
    }
    if (o.build) {
      log.note('action', { what: 'build the client' });
      execFileSync('pnpm', ['build'], { cwd: ROOT, stdio: 'ignore' });
    }
    log.note('action', { what: 'start the park and the stand-in store' });
    // An experiment may run the park with settings of its own (experiment 8: the collection log on).
    const extraVars = experiment.parkVars?.({ storeOrigin: `http://localhost:${o.storePort}` }) ?? {};
    if (Object.keys(extraVars).length) run.park_settings = Object.keys(extraVars);
    park = await startPark({ runId: log.id, port: o.port, storePort: o.storePort, extraVars });
    fleet = new Fleet({ base: park.base, run: log.id, events: onEvent });
    await fleet.start();
    // The browser the journey's page runs in (and an experiment's own pages), the browser tests' own.
    if (o.journey || experiment.needsBrowser) browser = await (await import('@playwright/test')).chromium.launch();
    await sleepFor(10_000); // the fleet's first moves

    // Checks an experiment pauses while it runs, and why (the journey's page would be one owl too many
    // in a room the experiment fills to its cap); they are taken before and after it as always.
    const paused = new Set(experiment.pauseChecks?.names ?? []);
    if (paused.size) log.note('note', { what: `paused during the experiment: ${[...paused].join(', ')}`, why: experiment.pauseChecks.why });
    /** One sample of the steady state: always health and the fleet; the checkout and the journey when `heavy`. */
    const sample = async (phase, { light = true, heavy = false, windowMs = 10_000 } = {}) => {
      const on = (name) => phase !== 'experiment' || !paused.has(name);
      const checks = light ? [await checkHealth(park.base, log.id), ...fleetChecks(fleet, windowMs)] : [];
      if (heavy) {
        if (on('checkout')) checks.push(await checkCheckout(park, log.id));
        if (o.journey && on('journey')) checks.push(await checkJourney(browser, park.base, log.id, `${log.dir}logs`));
      }
      const ok = checks.every((c) => c.ok);
      log.note('sample', { phase, ok, checks });
      return { ok, checks };
    };

    const before = await sample('before', { heavy: true });
    if (!before.ok) {
      run.verdict = 'not started';
      log.note('note', { what: 'the steady state did not hold before the experiment', failing: before.checks.filter((c) => !c.ok).map((c) => c.name) });
      return code;
    }

    // The experiment, with the steady state sampled beside it and the abort rule watching.
    const abort = new AbortController();
    const failingSince = new Map();
    // A check is failing from its first failed sample until it passes again; it counts against the rule
    // only as its own samples come in (the checkout and the journey are sampled every 30 s).
    const judge = (checks) => {
      for (const c of checks) {
        if (c.ok) failingSince.delete(c.name);
        else if (!failingSince.has(c.name)) failingSince.set(c.name, Date.now());
      }
      const over = checks.filter((c) => !c.ok).map((c) => [c.name, failingSince.get(c.name)]).find(([, since]) => Date.now() - since > ABORT_AFTER_MS);
      if (over && !abort.signal.aborted) {
        run.abort_fired = true;
        log.note('action', { what: `abort: ${over[0]} failing for more than ${ABORT_AFTER_MS / 1000} s` });
        abort.abort();
      }
    };
    // Sampling stops with the experiment, or with the abort, mid-pause (the heavy checks pause 30 s).
    const sampling = new AbortController();
    const until = AbortSignal.any([sampling.signal, abort.signal]);
    const loop = async (every, opts) => {
      while (!until.aborted) {
        await pause(every, until);
        if (until.aborted) return;
        judge((await sample('experiment', opts)).checks);
      }
    };
    const samplers = [loop(SAMPLE_MS, { windowMs: SAMPLE_MS }), loop(HEAVY_MS, { light: false, heavy: true })];
    const ctx = {
      park,
      base: park.base,
      run: log.id,
      fleet,
      browser,
      state: {},
      signal: abort.signal,
      note: (kind, fields) => log.note(kind, fields),
      observe(obs) {
        const at = new Date().toISOString();
        run.observations.push({ ...obs, at });
        log.note('observation', { ...obs });
      },
      /** A pause the abort cuts short: the experiment unwinds from it. */
      async sleep(ms) {
        await pause(ms, abort.signal);
        if (abort.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      },
      visitor: (n, opts = {}) => new Visitor({ base: park.base, run: log.id, n, events: onEvent, ...opts }),
      onVisitorEvent(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      async admin(path, body) {
        const r = await fetch(`${park.base}/api/admin/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Key': CHAOS_ADMIN_KEY, 'X-Chaos-Run': log.id }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error(`POST /api/admin/${path}: HTTP ${r.status} ${await r.text()}`);
        return r.json();
      },
    };
    log.note('action', { what: `experiment ${experiment.n} starts` });
    let harnessError = null;
    const running = Promise.resolve()
      .then(() => experiment.run(ctx))
      .catch((e) => {
        if (e.name !== 'AbortError') harnessError = e;
      });
    await Promise.race([running, whenAborted(abort.signal)]);
    if (abort.signal.aborted) await Promise.race([running, sleepFor(15_000)]);
    sampling.abort();
    if (harnessError) log.note('note', { what: 'the experiment stopped on an error in the harness', error: harnessError.message });

    // Always roll back, at once (a sample still under way finishes beside it), then wait for the
    // steady state to come back.
    log.note('action', { what: 'roll back' });
    try {
      await experiment.rollback(ctx);
    } catch (e) {
      log.note('note', { what: 'the rollback failed', error: e.message });
    }
    await Promise.all(samplers);
    const backBy = Date.now() + BACK_WITHIN_MS;
    for (;;) {
      if ((await sample('after', { heavy: true })).ok) {
        run.rollback_confirmed = true;
        break;
      }
      if (Date.now() > backBy) break;
      await sleepFor(SAMPLE_MS);
    }
    run.verdict = harnessError ? 'harness error' : run.abort_fired ? 'aborted' : run.observations.every((x) => x.ok) ? 'held' : 'failed';
    code = run.verdict === 'held' && run.rollback_confirmed ? 0 : 1;
    return code;
  } finally {
    await fleet?.stop().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    // A run that stopped before it had a verdict stopped on the harness, not the park.
    run.verdict ??= 'harness error';
    // An experiment that never ran proposes nothing.
    const proposed = run.verdict === 'not runnable' || run.verdict === 'not started' || run.verdict === null ? [] : propose(log, experiment, park, startedAt);
    const dir = closeRun(log, { park, visitorEvents: events, proposed, startedAt });
    await park?.stop();
    console.log(`verdict: ${run.verdict}; abort fired: ${run.abort_fired ? 'yes' : 'no'}; rollback confirmed: ${run.rollback_confirmed ? 'yes' : 'no'}; proposed tickets: ${proposed.length}`);
    for (const x of run.observations) console.log(`  ${x.ok ? 'ok  ' : 'NOT '} ${x.what}: ${x.value}${x.unit ? ` ${x.unit}` : ''}`);
    console.log(`run folder: ${dir}`);
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(2);
  },
);
