/**
 * `pnpm masks:pull` (OP-156): a saved ledge draft printed as room data, with what differs from the
 * room's ledges now. A stand-in fetch plays the park.
 *
 *   node --test tools/masks/pull.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_BASE, frontDiff, frontLine, frontsOf, ledgeDiff, ledgeLine, ledgesOf, main, roomFor, roomX } from './pull.mjs';

/** A strip of the tree's floor from x0 to x1, as its ledges' areas are. */
const strip = (x0, x1) => [
  { x: x0, y: 766 },
  { x: x1, y: 766 },
  { x: x1, y: 774 },
  { x: x0, y: 774 },
];
/** A room of the tree with two ledges and a front, standing in for l1 as it is on any day. */
const TREE = {
  id: 'l1',
  map: 2,
  size: { w: 6400, h: 900 },
  perches: [{ id: 'boulder', area: strip(680, 850), top: 110 }, { id: 'log', area: strip(1010, 1210), top: 85 }],
  fronts: [{ id: 'lamp-1', poly: [{ x: 926, y: 448 }, { x: 940, y: 448 }, { x: 944, y: 768 }, { x: 922, y: 768 }] }],
};
const rooms = (id) => (id === 'l1' ? TREE : roomFor(id));

/** A run of the script: its exit code, what it printed, and the addresses it asked. */
async function run(argv, { env = {}, answer = () => new Response('{}', { status: 404 }), roomOf = rooms } = {}) {
  let out = '';
  let err = '';
  const asked = [];
  const code = await main(argv, {
    env,
    stdout: { write: (s) => void (out += s) },
    stderr: { write: (s) => void (err += s) },
    fetchImpl: async (url) => {
      asked.push(url);
      return answer(url);
    },
    roomOf,
  });
  return { code, out, err, asked };
}

const DRAFT = {
  room: 'l1',
  ledges: [
    { id: 'boulder', x0: 680, x1: 850, top: 112 },
    { id: 'ledge-1', x0: 2370, x1: 2480, top: 100 },
    { id: 'ledge-2', x0: 3150, x1: 3300, top: 60 },
  ],
  walls: [{ id: 'wall-1', x: 640, y0: 520, y1: 770 }],
  hazards: [],
  fronts: [{ id: 'front-1', points: [{ x: 2000, y: 400 }, { x: 2060, y: 400 }, { x: 2030, y: 770 }] }],
  savedAt: Date.UTC(2026, 10, 1, 14, 2),
};

test('a room x is written as the room data writes it: against the screen the ledge starts on', () => {
  assert.equal(roomX(680), '680');
  assert.equal(roomX(2370), 'ROOM_W + 770');
  assert.equal(roomX(4860), '3 * ROOM_W + 60');
  assert.equal(roomX(3300, 3150), 'ROOM_W + 1700');
  assert.equal(ledgeLine({ id: 'crates-1', x0: 4880, x1: 5045, top: 95 }), "treeLedge('crates-1', 3 * ROOM_W + 80, 3 * ROOM_W + 245, 95),");
});

test('a front is written as the room’s fronts write it: each point against the screen its leftmost point is on', () => {
  const tri = (...xs) => xs.map((x, i) => ({ x, y: [318, 318, 778][i] }));
  assert.equal(frontLine({ id: 'lamp-1', points: tri(926, 940, 933) }), "{ id: 'lamp-1', poly: pts([926, 318], [940, 318], [933, 778]) },");
  assert.equal(frontLine({ id: 'banister', points: tri(2466, 2480, 2473) }, true), "{ id: 'banister', raised: true, poly: pts([ROOM_W + 866, 318], [ROOM_W + 880, 318], [ROOM_W + 873, 778]) },");
  assert.equal(frontLine({ id: 'perch-post', points: tri(4302, 4138, 4200) }), "{ id: 'perch-post', poly: pts([2 * ROOM_W + 1102, 318], [2 * ROOM_W + 938, 318], [2 * ROOM_W + 1000, 778]) },");
  // One across a join between screens: every point against the screen of its leftmost.
  assert.equal(frontLine({ id: 'front-3', points: tri(3190, 3215, 3205) }), "{ id: 'front-3', poly: pts([ROOM_W + 1590, 318], [ROOM_W + 1615, 318], [ROOM_W + 1605, 778]) },");
});

test('what it prints reads back as the same ledges and fronts: l1 as the tree has it, line by line', () => {
  const l1 = roomFor('l1');
  const read = (line, names, ...fns) => new Function(...names, `return ${line.replace(/,$/, '')};`)(...fns);
  const pts = (...p) => p.map(([x, y]) => ({ x, y }));
  const treeLedge = (id, x0, x1, top) => ({ id, x0, x1, top });
  assert.ok(frontsOf(l1).length > 0 && l1.fronts.some((f) => f.raised));
  // Each front as the room has it, a raised one (the stair's banister) still raised.
  for (const own of l1.fronts) {
    const [f] = frontsOf({ fronts: [own] });
    assert.deepEqual(read(frontLine(f, !!own.raised), ['pts', 'ROOM_W'], pts, 1600), own);
  }
  for (const l of ledgesOf(l1)) assert.deepEqual(read(ledgeLine(l), ['treeLedge', 'ROOM_W'], treeLedge, 1600), l);
});

test('what differs is told by id: added, removed, changed (each number), and how many are the same', () => {
  const now = [
    { id: 'a', x0: 0, x1: 100, top: 50 },
    { id: 'b', x0: 200, x1: 300, top: 60 },
    { id: 'c', x0: 400, x1: 500, top: 70 },
  ];
  const drafted = [
    { id: 'a', x0: 0, x1: 100, top: 50 },
    { id: 'c', x0: 410, x1: 500, top: 72 },
    { id: 'ledge-1', x0: 600, x1: 700, top: 80 },
  ];
  assert.deepEqual(ledgeDiff(now, drafted), { added: ['ledge-1'], removed: ['b'], changed: ['c (x0 400 -> 410, top 70 -> 72)'], same: 1 });
  // Fronts the same way: a front is changed when a point moved, or it has more or fewer.
  const p = (...xy) => xy.map(([x, y]) => ({ x, y }));
  const before = [
    { id: 'lamp', points: p([0, 0], [10, 0], [5, 50]) },
    { id: 'post', points: p([100, 0], [110, 0], [105, 50]) },
    { id: 'rail', points: p([200, 0], [210, 0], [205, 50]) },
    { id: 'gone', points: p([300, 0], [310, 0], [305, 50]) },
  ];
  const after = [
    { id: 'lamp', points: p([0, 0], [10, 0], [5, 50]) },
    { id: 'post', points: p([100, 0], [112, 0], [105, 52]) },
    { id: 'rail', points: p([200, 0], [210, 0], [210, 50], [205, 50]) },
    { id: 'front-1', points: p([400, 0], [410, 0], [405, 50]) },
  ];
  assert.deepEqual(frontDiff(before, after), { added: ['front-1'], removed: ['gone'], changed: ['post (2 of 3 points moved)', 'rail (3 -> 4 points)'], same: 1 });
});

test('prints a saved draft as treeLedge lines, the rest as JSON, and the difference from the tree as it is', async () => {
  const r = await run(['l1', '--base', 'https://park.example/'], { answer: () => Response.json(DRAFT) });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.asked, ['https://park.example/api/masks/l1']);
  assert.match(r.out, /^\/\/ l1: the ledge draft saved 2026-11-01 14:02 UTC, from https:\/\/park\.example$/m);
  assert.match(r.out, /^treeLedge\('boulder', 680, 850, 112\),$/m);
  assert.match(r.out, /^treeLedge\('ledge-1', ROOM_W \+ 770, ROOM_W \+ 880, 100\),$/m);
  assert.match(r.out, /^treeLedge\('ledge-2', ROOM_W \+ 1550, ROOM_W \+ 1700, 60\),$/m);
  // Fronts as lines for the room's fronts, the rest as JSON.
  assert.match(r.out, /^\/\/ Fronts \(1\), for the room's fronts there \(drawn over the owls\):\n\{ id: 'front-1', poly: pts\(\[ROOM_W \+ 400, 400\], \[ROOM_W \+ 460, 400\], \[ROOM_W \+ 430, 770\]\) \},$/m);
  assert.ok(r.out.includes(`// Walls (1):\n${JSON.stringify(DRAFT.walls, null, 2)}`));
  assert.ok(r.out.includes('// Hazards (0):\n[]'));
  // Against the room's two ledges: the draft adds two, moves the boulder up and leaves out the log.
  assert.match(r.out, /^\/\/ Against l1's ledges now: 2 added: ledge-1, ledge-2; 1 removed: log; 1 changed: boulder \(top 110 -> 112\); 0 the same\.$/m);
  // And against its one front: the draft has a new one and not the lamp.
  assert.match(r.out, /^\/\/ Against l1's fronts now: 1 added: front-1; 1 removed: lamp-1; 0 changed; 0 the same\.$/m);
});

test('reads the tree as it is: a draft of l1’s own ledges and fronts is all the same', async () => {
  const own = ledgesOf(roomFor('l1'));
  const ownFronts = frontsOf(roomFor('l1'));
  assert.ok(own.length > 0 && ownFronts.length > 0);
  const r = await run(['l1'], { roomOf: roomFor, answer: () => Response.json({ ...DRAFT, ledges: own, fronts: ownFronts }) });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, new RegExp(`^// Against l1's ledges now: 0 added; 0 removed; 0 changed; ${own.length} the same\\.$`, 'm'));
  assert.match(r.out, new RegExp(`^// Against l1's fronts now: 0 added; 0 removed; 0 changed; ${ownFronts.length} the same\\.$`, 'm'));
});

test('takes its park from --base, else PARK_BASE, else this machine', async () => {
  const answer = () => Response.json(DRAFT);
  assert.deepEqual((await run(['l1'], { answer })).asked, [`${DEFAULT_BASE}/api/masks/l1`]);
  assert.deepEqual((await run(['l1'], { answer, env: { PARK_BASE: 'http://localhost:9999' } })).asked, ['http://localhost:9999/api/masks/l1']);
  assert.deepEqual((await run(['--', 'l1', '--base', 'http://127.0.0.1:8787'], { answer, env: { PARK_BASE: 'http://localhost:9999' } })).asked, ['http://127.0.0.1:8787/api/masks/l1']);
});

test('says why, and prints nothing, for no draft, no park, a room not of the tree, or an answer that is no draft', async () => {
  const none = await run(['l1']);
  assert.equal(none.code, 1);
  assert.equal(none.out, '');
  assert.match(none.err, /No draft is saved for l1/);
  const down = await run(['l1'], {
    answer: () => {
      throw new TypeError('fetch failed');
    },
  });
  assert.equal(down.code, 1);
  assert.match(down.err, /did not answer \(fetch failed\)/);
  for (const argv of [[], ['hub'], ['../etc'], ['l1', 'l2'], ['l1', '--colour']]) {
    const r = await run(argv);
    assert.equal(r.code, 2, argv.join(' '));
    assert.deepEqual(r.asked, []);
  }
  for (const body of [{ ...DRAFT, room: 'hub' }, { ...DRAFT, ledges: [{ id: 'x', x0: 9, x1: 1, top: 5 }] }, { ...DRAFT, savedAt: 'today' }, '<!doctype html>']) {
    const r = await run(['l1'], { answer: () => new Response(typeof body === 'string' ? body : JSON.stringify(body)) });
    assert.equal(r.code, 1, JSON.stringify(body));
    assert.equal(r.out, '');
    assert.match(r.err, /is not a draft that fits the room/);
  }
  assert.equal((await run(['l1'], { answer: () => new Response('', { status: 503 }) })).code, 1);
  assert.equal((await run(['--help'])).code, 0);
});
