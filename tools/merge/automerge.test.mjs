import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, headState } from './automerge.mjs';
import { ownerYesReasons } from './owner-yes.mjs';

const REPO = 'lmansf/Welcome-to-Owl-Park';
const green = (name, id = 1) => ({ id, name, status: 'completed', conclusion: 'success' });
const CHECKS = [green('Build'), green('Browser suite report'), green('Typecheck'), { id: 2, name: 'Mutation testing (room)', status: 'completed', conclusion: 'skipped' }];
const RUNS = [{ id: 10, workflow_id: 1, name: 'CI', status: 'completed', conclusion: 'success' }];
const pr = (over = {}) => ({ state: 'open', draft: false, base: { ref: 'main' }, head: { repo: { full_name: REPO }, sha: 'abc' }, labels: [{ name: 'automerge' }], mergeable: true, ...over });
const files = [{ filename: 'apps/park/src/game/scene.ts', patch: '@@\n+  addRopes(this);', changes: 1 }];

test('green checks, the label and no owner-yes files: merge', () => {
  const head = headState({ runs: RUNS, checks: CHECKS, statuses: { total_count: 0 } });
  assert.equal(head.state, 'green');
  assert.equal(decide({ pr: pr(), repo: REPO, head, files }).action, 'merge');
});

test('no label: left alone', () => {
  const head = headState({ runs: RUNS, checks: CHECKS, statuses: { total_count: 0 } });
  assert.equal(decide({ pr: pr({ labels: [] }), repo: REPO, head, files }).action, 'skip');
});

test('drafts, forks and other bases are left alone', () => {
  const head = { state: 'green', why: '' };
  assert.equal(decide({ pr: pr({ draft: true }), repo: REPO, head, files }).action, 'skip');
  assert.equal(decide({ pr: pr({ head: { repo: { full_name: 'someone/fork' } } }), repo: REPO, head, files }).action, 'skip');
  assert.equal(decide({ pr: pr({ base: { ref: 'dev' } }), repo: REPO, head, files }).action, 'skip');
});

test('a run still going means wait; a red one means no', () => {
  const pending = headState({ runs: [{ ...RUNS[0], status: 'in_progress', conclusion: null }], checks: CHECKS, statuses: { total_count: 0 } });
  assert.equal(pending.state, 'pending');
  const red = headState({ runs: RUNS, checks: [...CHECKS, { id: 9, name: 'Browser suite 3/12', status: 'completed', conclusion: 'failure' }], statuses: { total_count: 0 } });
  assert.equal(red.state, 'red');
});

test('a rerun that passed replaces the failed run before it', () => {
  const checks = [...CHECKS, { id: 3, name: 'Unit tests', status: 'completed', conclusion: 'failure' }, { id: 4, name: 'Unit tests', status: 'completed', conclusion: 'success' }];
  assert.equal(headState({ runs: RUNS, checks, statuses: { total_count: 0 } }).state, 'green');
});

test('without the full browser suite there is no merge yet', () => {
  const head = headState({ runs: RUNS, checks: [green('Build')], statuses: { total_count: 0 } });
  assert.equal(head.state, 'pending');
});

test('a flag-hidden pull request needs the flag check too', () => {
  assert.equal(headState({ runs: RUNS, checks: CHECKS, statuses: { total_count: 0 }, flagHidden: true }).state, 'pending');
  assert.equal(headState({ runs: RUNS, checks: [...CHECKS, green('Flag-hidden feature check', 5)], statuses: { total_count: 0 }, flagHidden: true }).state, 'green');
});

test('payments, the store, accounts and data deletion are held for the owner', () => {
  const head = { state: 'green', why: '' };
  for (const f of [
    { filename: 'apps/edge/src/tickets.ts', patch: '+x', changes: 1 },
    { filename: 'apps/edge/src/shopify.ts', patch: '+x', changes: 1 },
    { filename: 'apps/edge/src/accounts.ts', patch: '+x', changes: 1 },
    { filename: 'apps/park/src/ui/checkout.ts', patch: '+x', changes: 1 },
    { filename: 'apps/park-log/sql/room_stays_retention.sql', patch: '+x', changes: 1 },
    { filename: 'apps/edge/src/sqlNestStore.ts', patch: '+  this.sql.exec("DELETE FROM nests WHERE id = ?", id);', changes: 1 },
    { filename: 'apps/edge/src/RoomObject.ts', patch: '+  await this.ctx.storage.deleteAll();', changes: 1 },
    { filename: '.github/workflows/automerge.yml', patch: '+x', changes: 1 },
    { filename: 'tools/merge/owner-yes.mjs', patch: '+x', changes: 1 },
  ]) {
    const d = decide({ pr: pr(), repo: REPO, head, files: [f] });
    assert.equal(d.action, 'hold', f.filename);
    assert.ok(d.reasons.length > 0);
  }
});

test('tests may mention the store or deletes without holding the merge', () => {
  assert.deepEqual(ownerYesReasons([{ filename: 'apps/edge/test/shop.test.ts', patch: '+ // Shopify DELETE FROM', changes: 1 }]), []);
});

test('a change too big for GitHub to show is held, art files aside', () => {
  assert.equal(ownerYesReasons([{ filename: 'apps/park/src/game/big.ts', changes: 9000 }]).length, 1);
  assert.deepEqual(ownerYesReasons([{ filename: 'apps/park/public/art/tree@2x.webp', changes: 1 }]), []);
});
