/**
 * The chaos harness's own parts that need no park (OP-132): the proposer, the steady state's
 * arithmetic, the fleet's walks, the run's folder and INDEX.md, and the experiments' list.
 *
 *   node --test tools/chaos/chaos.test.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { EXPERIMENTS, experimentFor } from './experiments/index.mjs';
import { propose } from './lib/propose.mjs';
import { legsTo } from './lib/route.mjs';
import { closeRun, openRun } from './lib/runlog.mjs';
import { distance, isWalkable, resolveTarget, ROOMS } from './lib/shared.mjs';
import { Fleet, fleetChecks, STEADY } from './lib/steady.mjs';
import { hop } from './lib/visitor.mjs';

const experiment = {
  n: 9,
  id: 'test-experiment',
  name: 'A test experiment',
  hypothesis: 'Nothing breaks.',
  blastRadius: 'None.',
  rollback: 'Nothing to undo.',
  expectLogs: [
    { component: 'room server', event: 'room_join_ok', withRun: true, atLeast: 2, question: 'Were the owls let in?', add: 'room_join_ok with run_id' },
    { component: 'overflow', event: 'queue_enter', question: 'Did the line take anyone?', add: 'queue_enter' },
  ],
};

test('every experiment of the ticket is listed once, in order, with what a run needs to name', () => {
  assert.deepEqual(
    EXPERIMENTS.map((e) => e.n),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  for (const e of EXPERIMENTS) {
    for (const field of ['id', 'name', 'hypothesis', 'blastRadius', 'rollback']) assert.ok(e[field], `${e.n} names its ${field}`);
    assert.equal(typeof e.run, 'function');
    assert.equal(typeof e.rollback, 'function');
  }
  assert.equal(new Set(EXPERIMENTS.map((e) => e.id)).size, EXPERIMENTS.length);
  assert.equal(experimentFor('7')?.id, 'emote-flood');
  assert.equal(experimentFor('room-server-killed')?.n, 1);
  assert.equal(experimentFor('nope'), null);
});

test("the fleet's window: the p95 of the echoes answered, and the share lost", () => {
  const fleet = new Fleet({ base: 'http://localhost', run: 'r' });
  const now = Date.now();
  fleet.moves = [...Array.from({ length: 19 }, (_, i) => ({ at: now, ms: 10 + i })), { at: now, ms: 500 }, { at: now - 60_000, ms: 9_999 }];
  let w = fleet.window(10_000);
  assert.equal(w.moves, 20);
  assert.equal(w.p95, 500);
  assert.equal(w.rate, 0);
  fleet.moves.push({ at: now, ms: null });
  fleet.failures.push({ at: now, what: 'join' });
  w = fleet.window(10_000);
  assert.equal(w.failed, 2);
  assert.equal(w.rate, 2 / 22);
  const [latency, errors] = fleetChecks(fleet, 10_000);
  assert.equal(latency.ok, false); // 500 ms is past the 300 ms line
  assert.equal(errors.ok, false); // 9% lost is past 1%
  fleet.moves = [{ at: now, ms: STEADY.latencyP95Ms }];
  fleet.failures = [];
  assert.deepEqual(
    fleetChecks(fleet, 10_000).map((c) => c.ok),
    [true, true],
  );
  // No moves at all is not a steady state: the room said nothing.
  fleet.moves = [];
  assert.deepEqual(
    fleetChecks(fleet, 10_000).map((c) => c.ok),
    [false, false],
  );
});

test("the fleet's hops: each a walk the room makes in full, so a move never echoed is the room's doing", () => {
  for (const id of ['hub', 'lobby', 'grove', 'market']) {
    const room = ROOMS[id];
    let at = { ...room.spawns.default };
    for (let i = 0; i < 300; i++) {
      const to = hop(id, at);
      assert.ok(to, `${id}: somewhere to hop from ${at.x},${at.y}`);
      assert.ok(isWalkable(to, room.walkable), `${id}: ${to.x},${to.y} on the floor`);
      // The room server walks the whole way, so it echoes the move (it ignores only a walk under 4 px).
      assert.ok(distance(resolveTarget(at, to, room.walkable), to) <= 1, `${id}: ${at.x},${at.y} to ${to.x},${to.y} in full`);
      assert.ok(distance(at, to) >= 4);
      at = to;
    }
  }
});

test("the journey's way to the grove: from anywhere the hub puts an owl, legs the room walks in full, the last into the doorway", () => {
  const hub = ROOMS.hub;
  const door = hub.doors.find((d) => d.to?.room === 'grove').rect;
  const aim = { x: door.x + door.w / 2, y: door.y + door.h / 2 };
  const inDoor = (p) => p.x >= door.x && p.x <= door.x + door.w && p.y >= door.y && p.y <= door.y + door.h;
  const spawn = hub.spawns.default;
  let tried = 0;
  for (let i = 0; tried < 60; i++) {
    // Where the room server puts an arrival: up to 220 px from the spawn, half that up and down (Room.ts scatter).
    const from = { x: Math.round(spawn.x - 220 + ((i * 37) % 440)), y: Math.round(spawn.y - 110 + ((i * 53) % 220)) };
    if (!isWalkable(from, hub.walkable)) continue;
    tried += 1;
    const legs = legsTo('hub', from, door);
    assert.ok(legs, `a way from ${from.x},${from.y}`);
    let at = from;
    for (const leg of legs.slice(0, -1)) {
      assert.ok(distance(resolveTarget(at, leg, hub.walkable), leg) <= 1, `${at.x},${at.y} to ${leg.x},${leg.y} in full`);
      at = leg;
    }
    assert.deepEqual(legs.at(-1), aim);
    assert.ok(inDoor(resolveTarget(at, aim, hub.walkable)), `the last leg from ${at.x},${at.y} ends in the doorway`);
  }
});

test('the proposer: a PATCH per observation not as expected, a LOGGING GAP per line the park did not log', () => {
  const log = { run: { run_id: 'run-1', observations: [] } };
  log.run.observations.push({ what: 'visitors back in', value: '9 of 10', ok: false, component: 'room server', fix: 'let them all back in', at: '2026-10-30T06:00:00.000Z' });
  log.run.observations.push({ what: 'move echo p95', value: 120, unit: 'ms', ok: true, component: 'room server' });
  const park = {
    logs: [
      { at: 2, event: 'room_join_ok', run_id: 'run-1' },
      { at: 3, event: 'room_join_ok', run_id: 'another-run' },
      { at: 0, event: 'queue_enter' }, // before the run
    ],
  };
  const out = propose(log, experiment, park, 1);
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], {
    kind: 'PATCH',
    experiment: '9. A test experiment',
    run: 'run-1',
    component: 'room server',
    observation: { what: 'visitors back in', value: '9 of 10', at: '2026-10-30T06:00:00.000Z' },
    fix: 'let them all back in',
    type: 'Bug',
    assignee: 'Claude Code',
    filed: false,
  });
  assert.equal(out[1].kind, 'LOGGING GAP');
  assert.equal(out[1].seen, 1); // one line with this run's id, two wanted
  assert.equal(out[1].flags, 'Informational');
  assert.equal(out[2].question, 'Did the line take anyone?');
  park.logs.push({ at: 4, event: 'room_join_ok', run_id: 'run-1' }, { at: 5, event: 'queue_enter' });
  assert.deepEqual(
    propose(log, experiment, park, 1).map((p) => p.kind),
    ['PATCH'],
  );
});

test("a run's folder: run.json, the timeline, the page, the graph, the proposals, and a line in INDEX.md", () => {
  const root = `${mkdtempSync(join(tmpdir(), 'chaos-'))}/`;
  try {
    const log = openRun(experiment, 'a test', root);
    assert.match(log.id, /^\d{4}-\d{2}-\d{2}-test-experiment$/);
    log.note('action', { what: 'start' });
    log.note('sample', { phase: 'before', ok: true, checks: [{ name: 'latency', ok: true, value: 40 }] });
    log.note('sample', { phase: 'experiment', ok: false, checks: [{ name: 'latency', ok: false, value: 900 }] });
    log.run.verdict = 'failed';
    log.run.observations.push({ what: 'visitors back in', value: '9 of 10', ok: false, component: 'room server' });
    const proposed = propose(log, experiment, { logs: [] }, 0);
    closeRun(log, { park: { lines: [{ at: 1, source: 'park', line: 'hello' }], logs: [] }, visitorEvents: [{ at: 1, kind: 'welcome' }], proposed, startedAt: 0 });
    const run = JSON.parse(readFileSync(`${log.dir}run.json`, 'utf8'));
    assert.equal(run.verdict, 'failed');
    assert.equal(run.proposed, 3);
    assert.ok(run.end);
    assert.equal(readFileSync(`${log.dir}timeline.jsonl`, 'utf8').trim().split('\n').length, 3);
    assert.match(readFileSync(`${log.dir}result.md`, 'utf8'), /\*\*Verdict: failed\.\*\*/);
    assert.match(readFileSync(`${log.dir}graph.svg`, 'utf8'), /<polyline/);
    assert.equal(JSON.parse(readFileSync(`${log.dir}proposed-tickets.json`, 'utf8')).length, 3);
    // A second run that day gets a folder of its own, and INDEX.md a line each.
    const again = openRun(experiment, 'a test', root);
    assert.match(again.id, /-test-experiment-2$/);
    again.run.verdict = 'held';
    closeRun(again, { park: null, visitorEvents: [], proposed: [], startedAt: 0 });
    const index = readFileSync(`${root}INDEX.md`, 'utf8');
    assert.equal(index.split('\n').filter((l) => l.startsWith('| 20')).length, 2);
    assert.match(index, /\| failed \|/);
    assert.match(index, /\| held \|/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
