// The flag-hidden check (merge gate class 3, .github/workflows/flag-check.yml). A pull request labelled
// `flag-hidden` says its feature is off for every visitor and shows only with `?<param>=1`. This
// checks what can be checked from the change itself:
//   1. it touches nothing that pays, signs in, keeps or deletes data, runs on the room server, or is
//      a public page, a dependency, a workflow or this check (PROTECTED below);
//   2. in packages/shared (which the room server runs too) it only adds files;
//   3. it adds at least one flag to apps/park/src/flags.ts, changes or removes none, and leaves
//      `flagOn` as it is on main, so no flag can be on by default or turned on for everyone here;
//   4. each new flag is used (`flagOn('<name>')` in the park's code) and its param is not one the
//      park already reads from its address;
//   5. the new flags.ts, loaded on its own, says every flag is off without its `=1`.
// What it cannot prove is that every new line is behind the flag: that stays the opener's to check
// (the merge gate's checklist), and the browser suite on plain addresses has to stay green.
//
// Usage: node tools/flags/flag-check.mjs [base ref, default origin/main]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FLAGS_FILE = 'apps/park/src/flags.ts';
export const FLAGON_MARKER = '// flagOn: keep below this line unchanged';

/** Paths a flag-hidden change may not touch, each with the reason a person reads when it does. */
export const PROTECTED = [
  [/^apps\/edge\//, 'the Worker and room server run for every visitor (passes, tickets, accounts, stores, data)'],
  [/^apps\/park-log\//, 'the collection log keeps and deletes data'],
  [/^apps\/ig-connector\//, 'the Instagram connector posts in the park’s name'],
  [/\.sql$/, 'database changes'],
  [/^\.github\//, 'workflows, including the merge rules themselves'],
  [/^tools\/(flags|security|preview)\//, 'the checks themselves'],
  [/^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc)$|^patches\/|\/package\.json$/, 'dependencies'],
  [/^apps\/park\/(public\/|index\.html$|vite\.config\.ts$)/, 'public pages and the page itself, seen without any flag'],
  [/^apps\/park\/src\/config\.ts$/, 'the park’s address switches (a flag-hidden feature uses flags.ts instead)'],
  [/^apps\/park\/src\/main\.ts$/, 'the page’s start-up, analytics and wiring for every visitor'],
  [
    /^apps\/park\/src\/.*(shop|ticket|account|pass|checkout|gate|sale|store|cart|price|wallet|admin|keeper|feedback|pageLog|privacy|terms|heycatch|edge)[^/]*$/i,
    'payments, tickets, accounts, keepers, feedback or the room connection',
  ],
];

/** Parses `name: { param: '…', note: '…' }` entries out of flags.ts's FLAGS block. */
export function parseFlags(text) {
  const start = text.indexOf('export const FLAGS = {');
  const end = text.indexOf('} as const', start);
  if (start < 0 || end < 0) return null;
  const block = text.slice(start + 'export const FLAGS = {'.length, end);
  const entries = new Map();
  const re = /([A-Za-z_$][\w$]*)\s*:\s*\{\s*param\s*:\s*'([^']*)'\s*,\s*note\s*:\s*'([^']*)'\s*,?\s*\}/g;
  for (const m of block.replace(/\/\/[^\n]*/g, '').matchAll(re)) entries.set(m[1], { param: m[2], note: m[3] });
  return entries;
}

/** The part of flags.ts below the marker (flagOn), which a flag-hidden change leaves as it is. */
export function flagOnPart(text) {
  const i = text.indexOf(FLAGON_MARKER);
  return i < 0 ? null : text.slice(i).trim();
}

/**
 * The whole check on a described change. `changes`: [{ status: 'A'|'M'|'D'|'R…', path, from? }];
 * `added`: { [path]: string[] } added lines; `flagsBase`/`flagsHead`: flags.ts text (null if missing);
 * `reserved`: params the park already reads. Returns { problems: string[], newFlags: string[] }.
 */
export function checkChange({ changes, added, flagsBase, flagsHead, reserved }) {
  const problems = [];
  for (const c of changes) {
    for (const p of [c.path, c.from].filter(Boolean)) {
      const hit = PROTECTED.find(([re]) => re.test(p));
      if (hit) problems.push(`${p}: off limits for a flag-hidden change (${hit[1]}).`);
    }
    if (c.path.startsWith('packages/shared/') && c.status !== 'A') {
      problems.push(`${c.path}: packages/shared runs on the room server too, so a flag-hidden change may only add files there.`);
    }
  }
  const newFlags = [];
  if (flagsHead === null) {
    problems.push(`${FLAGS_FILE} is missing.`);
    return { problems, newFlags };
  }
  const base = flagsBase === null ? new Map() : parseFlags(flagsBase);
  const head = parseFlags(flagsHead);
  if (head === null || base === null) {
    problems.push(`${FLAGS_FILE}: the FLAGS table could not be read.`);
    return { problems, newFlags };
  }
  if (flagsBase !== null && flagOnPart(flagsBase) !== flagOnPart(flagsHead)) {
    problems.push(`${FLAGS_FILE}: flagOn changed; only new FLAGS entries may change in a flag-hidden change.`);
  }
  for (const [name, spec] of base) {
    const now = head.get(name);
    if (!now) problems.push(`${FLAGS_FILE}: the flag ${name} was removed. Turning a feature on for everyone needs the owner's merge word.`);
    else if (now.param !== spec.param) problems.push(`${FLAGS_FILE}: the flag ${name} changed its param. That needs the owner's merge word.`);
  }
  const parkLines = Object.entries(added)
    .filter(([p]) => p.startsWith('apps/park/src/') && !/\.test\.ts$/.test(p) && p !== FLAGS_FILE)
    .flatMap(([, lines]) => lines)
    .join('\n');
  const params = new Set();
  for (const [name, spec] of head) {
    if (params.has(spec.param)) problems.push(`${FLAGS_FILE}: two flags share the param ${spec.param}.`);
    params.add(spec.param);
    if (base.has(name)) continue;
    newFlags.push(name);
    if (!/^[a-z0-9-]{2,32}$/.test(spec.param)) problems.push(`${FLAGS_FILE}: ${name}'s param "${spec.param}" must be 2 to 32 lower case letters, digits or dashes.`);
    if (reserved.has(spec.param)) problems.push(`${FLAGS_FILE}: ${name}'s param "${spec.param}" is one the park already reads from its address.`);
    if (!new RegExp(`flagOn\\(\\s*['"]${name}['"]`).test(parkLines)) problems.push(`${name}: no added line in the park's code calls flagOn('${name}'), so nothing is behind it.`);
  }
  if (newFlags.length === 0) problems.push(`${FLAGS_FILE}: a flag-hidden change adds its feature's flag to FLAGS; this one adds none.`);
  return { problems, newFlags };
}

/** Loads a flags.ts text on its own and returns the flags that are on without their `=1`. */
export async function onByDefault(flagsText) {
  const dir = mkdtempSync(join(tmpdir(), 'flags-'));
  const file = join(dir, 'flags.ts');
  writeFileSync(file, flagsText);
  const mod = await import(pathToFileURL(file).href);
  const on = [];
  for (const [name, spec] of Object.entries(mod.FLAGS)) {
    for (const search of ['', '?room=hub', `?${spec.param}=0`, `?${spec.param}=true`]) if (mod.flagOn(name, search)) on.push(`${name} (${search || 'plain address'})`);
    if (!mod.flagOn(name, `?${spec.param}=1`)) on.push(`${name} does not turn on with ?${spec.param}=1`);
  }
  return on;
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

function show(ref, path) {
  try {
    return git('show', `${ref}:${path}`);
  } catch {
    return null;
  }
}

/** Params the park reads from its address on the base: `.get('x')` in files that read the query string. */
function reservedParams(ref) {
  const out = new Set();
  const files = git('ls-tree', '-r', '--name-only', ref, 'apps/park/src').split('\n').filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f));
  for (const f of files) {
    const text = show(ref, f) ?? '';
    if (!/URLSearchParams|location\.search/.test(text)) continue;
    for (const m of text.matchAll(/\.get\('([a-z0-9_-]+)'\)/g)) out.add(m[1]);
  }
  return out;
}

async function main() {
  const base = git('merge-base', process.argv[2] ?? 'origin/main', 'HEAD').trim();
  const changes = git('diff', '--name-status', '-M', base, 'HEAD')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, a, b] = line.split('\t');
      return status.startsWith('R') || status.startsWith('C') ? { status, from: a, path: b } : { status, path: a };
    });
  const added = {};
  let current = null;
  for (const line of git('diff', '-U0', '--no-color', base, 'HEAD').split('\n')) {
    if (line.startsWith('+++ ')) current = line.startsWith('+++ b/') ? line.slice(6) : null;
    else if (current && line.startsWith('+') && !line.startsWith('+++')) {
      if (!added[current]) added[current] = [];
      added[current].push(line.slice(1));
    }
  }
  const flagsBase = show(base, FLAGS_FILE);
  const flagsHead = show('HEAD', FLAGS_FILE);
  const { problems, newFlags } = checkChange({ changes, added, flagsBase, flagsHead, reserved: reservedParams(base) });
  if (flagsHead !== null) {
    try {
      for (const f of await onByDefault(flagsHead)) problems.push(`${FLAGS_FILE}: ${f} is on without being asked for.`);
    } catch (err) {
      problems.push(`${FLAGS_FILE} could not be loaded on its own (no imports, plain types only): ${err.message}`);
    }
  }
  if (problems.length) {
    console.log('Not a flag-hidden change (it can still merge as an ordinary one under the merge gate):');
    for (const p of problems) console.log(`- ${p}`);
    process.exit(1);
  }
  console.log(`Flag-hidden: ${newFlags.map((n) => `${n} (?${parseFlags(flagsHead).get(n).param}=1)`).join(', ')}. Off for every visitor; nothing protected touched.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
