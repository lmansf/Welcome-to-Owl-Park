import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkChange, FLAGS_FILE, onByDefault, parseFlags } from './flag-check.mjs';

const MAIN = readFileSync(new URL('../../apps/park/src/flags.ts', import.meta.url), 'utf8');
const withFlags = (entries) => MAIN.replace('export const FLAGS = {}', `export const FLAGS = {\n${entries}\n}`);
const ROPES = "  ropeSwings: { param: 'ropes', note: 'Rope swings between the canopy nests' },";
const reserved = new Set(['room', 'sizes', 'newmap']);

function change(over = {}) {
  return {
    changes: [
      { status: 'M', path: FLAGS_FILE },
      { status: 'A', path: 'apps/park/src/game/ropes.ts' },
      { status: 'M', path: 'apps/park/src/game/scene.ts' },
    ],
    added: { 'apps/park/src/game/scene.ts': ["  if (flagOn('ropeSwings')) addRopes(this);"] },
    flagsBase: MAIN,
    flagsHead: withFlags(ROPES),
    reserved,
    ...over,
  };
}

test('main’s flags.ts reads as an empty table', () => {
  assert.deepEqual([...parseFlags(MAIN)], []);
});

test('a new flag, used, touching only the park’s game code, passes', () => {
  const r = checkChange(change());
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.newFlags, ['ropeSwings']);
});

test('a change that adds no flag is not flag-hidden', () => {
  const r = checkChange(change({ flagsHead: MAIN }));
  assert.match(r.problems.join('\n'), /adds none/);
});

test('a flag nothing calls is refused', () => {
  const r = checkChange(change({ added: {} }));
  assert.match(r.problems.join('\n'), /no added line in the park's code calls flagOn\('ropeSwings'\)/);
});

test('removing a flag (on for everyone) waits on the owner', () => {
  const r = checkChange(change({ flagsBase: withFlags(ROPES), flagsHead: MAIN }));
  assert.match(r.problems.join('\n'), /ropeSwings was removed/);
});

test('changing flagOn is refused', () => {
  const head = withFlags(ROPES).replace("=== '1'", "!== '0'");
  const r = checkChange(change({ flagsHead: head }));
  assert.match(r.problems.join('\n'), /flagOn changed/);
});

test('payments, accounts, the server, data, workflows and dependencies are off limits', () => {
  for (const path of [
    'apps/edge/src/routes/shop.ts',
    'apps/park/src/ui/checkout.ts',
    'apps/park/src/ui/account.ts',
    'apps/park/src/net/ticketLinks.ts',
    'apps/park-log/sql/feedback.sql',
    '.github/workflows/ci.yml',
    'pnpm-lock.yaml',
    'apps/park/package.json',
    'apps/park/public/about/index.html',
    'apps/park/src/config.ts',
    'tools/flags/flag-check.mjs',
  ]) {
    const r = checkChange(change({ changes: [...change().changes, { status: 'M', path }] }));
    assert.match(r.problems.join('\n'), new RegExp(`${path.replace(/[.]/g, '\\.')}: off limits`), path);
  }
});

test('packages/shared may only gain files', () => {
  const ok = checkChange(change({ changes: [...change().changes, { status: 'A', path: 'packages/shared/rooms/ropes.ts' }] }));
  assert.deepEqual(ok.problems, []);
  const edit = checkChange(change({ changes: [...change().changes, { status: 'M', path: 'packages/shared/rooms/index.ts' }] }));
  assert.match(edit.problems.join('\n'), /may only add files/);
});

test('a param the park already reads, or a badly formed one, is refused', () => {
  const r = checkChange(change({ flagsHead: withFlags("  ropeSwings: { param: 'sizes', note: 'x' },") }));
  assert.match(r.problems.join('\n'), /already reads/);
  const bad = checkChange(change({ flagsHead: withFlags("  ropeSwings: { param: 'Ropes!', note: 'x' },") }));
  assert.match(bad.problems.join('\n'), /lower case/);
});

test('loaded on its own, a flag is off without =1 and on with it', async () => {
  assert.deepEqual(await onByDefault(withFlags(ROPES)), []);
});

test('a flags.ts whose flagOn would be on by default is caught when loaded', async () => {
  const broken = withFlags(ROPES).replace("=== '1'", "!== '0'");
  const on = await onByDefault(broken);
  assert.ok(on.some((f) => f.includes('plain address')), on.join(', '));
});
