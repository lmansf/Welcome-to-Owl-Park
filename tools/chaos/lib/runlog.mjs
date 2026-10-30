/**
 * Every chaos run is recorded, pass or fail, so the record is the evidence (Logan, 2026-10-27). A
 * run's folder, tools/chaos/results/<date>-<experiment>/, holds:
 *
 *   run.json             the experiment, the git commits of the park and the harness, where it ran,
 *                        start and end, the hypothesis, the verdict, whether the abort fired and the
 *                        rollback was confirmed, and which proposed tickets QA has filed
 *   timeline.jsonl       every harness action and every steady-state sample, timed, to replay a failure
 *   logs/park.jsonl      the Worker's and the room server's lines for the run's window (each carries
 *                        run_id when it is about one of the run's requests or sockets)
 *   logs/raw.log         what else the park's processes printed (wrangler's own lines, errors), as printed
 *   logs/visitors.jsonl  what the scripted visitors saw (welcomes, drops, comebacks, errors)
 *   result.md            one page: hypothesis, verdict, the steady state through the run, the graph
 *   graph.svg            the move echo times (p95) and the failing checks over the run
 *   proposed-tickets.json  the harness's proposed tickets (lib/propose.mjs), for QA to review and file
 *
 * and results/INDEX.md gets a line for the run.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RESULTS = fileURLToPath(new URL('../results/', import.meta.url));
const REPO = fileURLToPath(new URL('../../../', import.meta.url));

const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
};

/** A new run of `experiment`: its folder under `root` (a second run that day gets -2, and so on) and its id. */
export function openRun(experiment, environment, root = RESULTS) {
  const date = new Date().toISOString().slice(0, 10);
  let name = `${date}-${experiment.id}`;
  for (let n = 2; existsSync(`${root}${name}`); n++) name = `${date}-${experiment.id}-${n}`;
  const dir = `${root}${name}/`;
  mkdirSync(`${dir}logs`, { recursive: true });
  // The id the park stamps on every line about the run (X-Chaos-Run takes letters, digits and dashes, 64 at most).
  const id = name.slice(0, 64);
  const run = {
    experiment: experiment.id,
    n: experiment.n,
    name: experiment.name,
    run_id: id,
    git: { park: git('rev-parse', 'HEAD'), harness: git('log', '-1', '--format=%H', '--', 'tools/chaos') || 'uncommitted' },
    // Changes to the park's tracked files not committed yet (the run is then of more than the commit);
    // the runs' own folders and INDEX.md are not the park.
    dirty: git('diff', '--name-only', 'HEAD', '--', '.', ':(exclude)tools/chaos/results').length > 0,
    environment,
    hypothesis: experiment.hypothesis,
    blast_radius: experiment.blastRadius,
    abort_rule: ABORT_RULE,
    rollback: experiment.rollback,
    start: new Date().toISOString(),
    end: null,
    verdict: null,
    abort_fired: false,
    rollback_confirmed: false,
    observations: [],
    filed: [],
  };
  const samples = [];
  return {
    root,
    dir,
    name,
    id,
    run,
    samples,
    /** One timed line on the timeline: a harness action, a sample, a note. */
    note(kind, fields = {}) {
      const line = { at: new Date().toISOString(), kind, ...fields };
      if (kind === 'sample') samples.push(line);
      appendFileSync(`${dir}timeline.jsonl`, `${JSON.stringify(line)}\n`);
    },
    write(file, text) {
      writeFileSync(`${dir}${file}`, text);
    },
  };
}

export const ABORT_RULE = 'Any steady-state check failing for more than 30 s during the experiment ends it and runs the rollback; the harness never leaves a fault injected.';

/** The run's last files and its line in INDEX.md. */
export function closeRun(log, { park, visitorEvents, proposed, startedAt }) {
  const { run, dir } = log;
  run.end = new Date().toISOString();
  run.proposed = proposed.length;
  log.write('run.json', `${JSON.stringify(run, null, 2)}\n`);
  log.write('proposed-tickets.json', `${JSON.stringify(proposed, null, 2)}\n`);
  if (park) {
    // The park's own log lines are in park.jsonl; raw.log keeps the rest, as printed.
    const raw = park.lines.filter((l) => l.at >= startedAt && !l.logged);
    log.write('logs/raw.log', raw.map((l) => `${new Date(l.at).toISOString()} ${l.source} ${l.line}`).join('\n') + '\n');
    log.write('logs/park.jsonl', park.logs.filter((l) => l.at >= startedAt).map((l) => JSON.stringify(l)).join('\n') + '\n');
  }
  log.write('logs/visitors.jsonl', visitorEvents.map((e) => JSON.stringify(e)).join('\n') + '\n');
  log.write('graph.svg', graph(log.samples));
  log.write('result.md', resultPage(log, proposed));
  const index = `${log.root}INDEX.md`;
  if (!existsSync(index)) writeFileSync(index, INDEX_HEAD);
  const row = `| ${run.start.slice(0, 16).replace('T', ' ')} | ${run.n}. ${run.name} | ${run.verdict} | ${run.abort_fired ? 'yes' : 'no'} | ${run.rollback_confirmed ? 'yes' : 'no'} | ${proposed.length} | [${log.name}](${log.name}/result.md) |\n`;
  if (!readFileSync(index, 'utf8').includes(`(${log.name}/`)) appendFileSync(index, row);
  return dir;
}

const INDEX_HEAD = `# Chaos runs (OP-132)

Every run of the harness (tools/chaos/run.mjs), pass or fail, newest last. Verdicts: **held** (the
hypothesis held and the steady state came back), **failed** (it did not), **aborted** (a steady-state
check failed for more than 30 s and the rollback ran), **not started** (the steady state did not hold
before the experiment), **not runnable** (the experiment needs what this park does not have). Kept by
the doc agent; runs older than 90 days roll up to one line each.

| Started (UTC) | Experiment | Verdict | Abort | Rollback confirmed | Proposed tickets | Run |
| --- | --- | --- | --- | --- | --- | --- |
`;

/** The run on one page. */
function resultPage(log, proposed) {
  const { run, samples } = log;
  const fmt = (c) => (c ? `${c.ok ? 'ok' : '**failing**'} (${c.value ?? '-'}${c.name === 'latency' || c.name === 'checkout' || c.name === 'journey' ? ' ms' : c.name === 'errors' ? '%' : ''})` : '-');
  const pick = (s, name) => s.checks.find((c) => c.name === name);
  const rows = samples.map((s) => `| ${s.at.slice(11, 19)} | ${s.phase} | ${['health', 'latency', 'errors', 'checkout', 'journey'].map((n) => fmt(pick(s, n))).join(' | ')} |`);
  const obs = run.observations.map((o) => `- ${o.ok ? 'As expected' : '**Not as expected**'}: ${o.what}: ${o.value}${o.unit ? ` ${o.unit}` : ''}${o.at ? ` (${o.at.slice(11, 19)})` : ''}`);
  return `# ${run.n}. ${run.name}

Run \`${run.run_id}\`, ${run.environment}, ${run.start} to ${run.end}. Park ${run.git.park.slice(0, 7)}${run.dirty ? ' with uncommitted changes' : ''}, harness ${run.git.harness.slice(0, 7)}.

**Hypothesis.** ${run.hypothesis}

**Verdict: ${run.verdict}.** Abort fired: ${run.abort_fired ? 'yes' : 'no'}. Rollback confirmed: ${run.rollback_confirmed ? 'yes' : 'no'}.

**Blast radius.** ${run.blast_radius}

**Rollback.** ${run.rollback}

## What the harness saw

${obs.join('\n') || '- Nothing beyond the steady state.'}

## The steady state through the run

![The move echo times (p95) and the failing checks](graph.svg)

| Time | Phase | Health | Latency p95 | Errors | Checkout | Journey |
| --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

## Proposed tickets

${proposed.length ? proposed.map((p) => `- ${p.kind}: ${p.component}: ${p.kind === 'PATCH' ? p.observation.what : p.question}`).join('\n') : 'None.'} (proposed-tickets.json; the QA agent reviews and files them.)
`;
}

/** The p95 echo time over the run as a line, the failing samples marked below it. */
function graph(samples) {
  const W = 720;
  const H = 220;
  const pad = 36;
  if (!samples.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><text x="20" y="40">No samples.</text></svg>\n`;
  const t0 = Date.parse(samples[0].at);
  const t1 = Math.max(Date.parse(samples.at(-1).at), t0 + 1);
  const lat = samples.map((s) => s.checks.find((c) => c.name === 'latency')?.value ?? null);
  const top = Math.max(400, ...lat.filter((v) => v !== null));
  const x = (at) => pad + ((Date.parse(at) - t0) / (t1 - t0)) * (W - 2 * pad);
  const y = (v) => H - pad - (v / top) * (H - 2 * pad);
  const points = samples.map((s, i) => (lat[i] === null ? null : `${x(s.at).toFixed(1)},${y(lat[i]).toFixed(1)}`)).filter(Boolean);
  const failing = samples.filter((s) => !s.ok).map((s) => `<rect x="${(x(s.at) - 2).toFixed(1)}" y="${H - pad + 6}" width="4" height="8" fill="#c0392b"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="sans-serif" font-size="11">
<rect width="100%" height="100%" fill="#fff"/>
<line x1="${pad}" y1="${y(300)}" x2="${W - pad}" y2="${y(300)}" stroke="#e67e22" stroke-dasharray="4 3"/>
<text x="${W - pad - 70}" y="${y(300) - 4}" fill="#e67e22">300 ms limit</text>
<polyline fill="none" stroke="#2c3e50" stroke-width="2" points="${points.join(' ')}"/>
${failing.join('\n')}
<text x="${pad}" y="16">Move echo p95 (ms), 0 to ${top}; red marks: a failing steady-state check</text>
<text x="${pad}" y="${H - 6}">${samples[0].at.slice(11, 19)}</text>
<text x="${W - pad - 50}" y="${H - 6}">${samples.at(-1).at.slice(11, 19)}</text>
</svg>
`;
}
