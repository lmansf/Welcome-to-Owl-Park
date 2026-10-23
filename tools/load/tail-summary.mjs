#!/usr/bin/env node
/**
 * tail-summary.mjs: what the copy's own logs said during the load test (`wrangler tail --format
 * json`, one event per line): the invocations by outcome (ok, exceeded CPU, an exception, ...), the
 * exceptions and the error and warning lines, each with how often it came. Appended to
 * $GITHUB_STEP_SUMMARY too, when it is set.
 *
 *   node tools/load/tail-summary.mjs tail.jsonl
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.log('No log events were captured.');
  process.exit(0);
}
const tally = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const outcomes = new Map();
const kinds = new Map();
const exceptions = new Map();
const lines = new Map();
let events = 0;
for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim().startsWith('{')) continue;
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    continue;
  }
  events++;
  tally(outcomes, e.outcome ?? 'unknown');
  tally(kinds, Object.keys(e.event ?? {}).join('+') || 'none');
  for (const x of e.exceptions ?? []) tally(exceptions, `${x.name ?? 'Error'}: ${String(x.message ?? '').slice(0, 160)}`);
  for (const l of e.logs ?? []) {
    if (l.level === 'error' || l.level === 'warn') tally(lines, `${l.level}: ${[].concat(l.message).join(' ').slice(0, 160)}`);
  }
}
const top = (map, n = 10) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `- ${v} × ${k}`);
const text = [
  `The copy's logs during the test: ${events} events.`,
  '',
  `Outcomes: ${[...outcomes].map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`,
  `Kinds: ${[...kinds].map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`,
  '',
  'Exceptions:',
  ...(exceptions.size ? top(exceptions) : ['- none']),
  '',
  'Errors and warnings logged:',
  ...(lines.size ? top(lines) : ['- none']),
  '',
].join('\n');
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${text}`);
