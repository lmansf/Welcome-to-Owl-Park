#!/usr/bin/env node
/**
 * A scope's mutation score, as Markdown for the CI job's summary (OP-131): the score, then a row a
 * file, lowest score first, from Stryker's JSON reports (the mutation-testing-report-schema). A scope
 * run in shards gives one report a shard; they are read together. With `--json <file>` the numbers are
 * written too, so each run's score is kept and can be compared; with `--break <score>` it exits 1 when
 * the scope scores under it (the break threshold, which the shards themselves do not apply).
 *
 *   node tools/mutation/summary.mjs "the shared rules" reports/*.json --json score.json --break 50
 *
 * The score is Stryker's own: mutants caught (killed, or timed out) over the mutants a test ran on or no
 * test reached; a mutant that does not compile, or that is ignored, counts for nothing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** A mutant's counts: those caught, those missed, and the rest (not compiled, ignored) left out. */
export function tally(mutants) {
  const t = { mutants: 0, killed: 0, timeout: 0, survived: 0, noCoverage: 0 };
  for (const { status } of mutants) {
    if (status === 'Killed') t.killed++;
    else if (status === 'Timeout') t.timeout++;
    else if (status === 'Survived') t.survived++;
    else if (status === 'NoCoverage') t.noCoverage++;
    else continue;
    t.mutants++;
  }
  return t;
}

/** The share caught, as a percentage to one decimal; null when no mutant counts. */
export function scoreOf(t) {
  return t.mutants ? Math.round(((t.killed + t.timeout) / t.mutants) * 1000) / 10 : null;
}

const pct = (s) => (s === null ? 'n/a' : `${s.toFixed(1)}%`);
const n = (v) => v.toLocaleString('en-US');

/** The summary of a scope's reports (its shards'): Markdown for people, and the same numbers as JSON. */
export function summarize(name, reports) {
  const byFile = new Map();
  for (const report of reports) for (const [file, f] of Object.entries(report.files ?? {})) byFile.set(file, [...(byFile.get(file) ?? []), ...(f.mutants ?? [])]);
  const all = tally([...byFile.values()].flat());
  const files = [...byFile]
    .map(([file, mutants]) => {
      const t = tally(mutants);
      return { file, score: scoreOf(t), ...t };
    })
    .sort((a, b) => (a.score ?? 101) - (b.score ?? 101) || a.file.localeCompare(b.file));
  const score = scoreOf(all);
  const { high, low } = reports[0]?.thresholds ?? {};
  const lines = [
    `### Mutation testing: ${name}`,
    '',
    `**${pct(score)}**: ${n(all.killed + all.timeout)} of ${n(all.mutants)} mutants caught${high !== undefined ? ` (high from ${high}, low under ${low})` : ''}.`,
    '',
    '| File | Mutants | Caught | Survived | No test | Score |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...files.map((f) => `| ${f.file} | ${n(f.mutants)} | ${n(f.killed + f.timeout)} | ${n(f.survived)} | ${n(f.noCoverage)} | ${pct(f.score)} |`),
    '',
  ];
  return { markdown: lines.join('\n'), json: { scope: name, score, ...all, files } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [name, ...rest] = process.argv.slice(2);
  const paths = [];
  let out = null;
  let floor = null;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--json') out = rest[++i] ?? '';
    else if (rest[i] === '--break') floor = Number(rest[++i]);
    else paths.push(rest[i]);
  }
  if (!name || !paths.length || out === '' || (floor !== null && !Number.isFinite(floor))) {
    console.error('Usage: node tools/mutation/summary.mjs <scope name> <mutation.json>... [--json <out.json>] [--break <score>]');
    process.exit(2);
  }
  const { markdown, json } = summarize(name, paths.map((p) => JSON.parse(readFileSync(p, 'utf8'))));
  if (out) writeFileSync(out, `${JSON.stringify({ ...json, at: new Date().toISOString(), commit: process.env.GITHUB_SHA ?? null }, null, 2)}\n`);
  const broken = floor !== null && (json.score ?? 0) < floor;
  process.stdout.write(broken ? `${markdown}\nUnder the break threshold of ${floor}: the run fails.\n` : markdown);
  if (broken) process.exit(1);
}
