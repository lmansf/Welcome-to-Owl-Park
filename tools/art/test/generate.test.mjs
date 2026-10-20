// node --test "tools/art/**/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';

import * as G from '../generate.mjs';
import * as P from '../prompts.mjs';

const GEN = path.join(G.TOOLS_DIR, 'generate.mjs');
const ASSETS = G.loadAssets();
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'owl-art-test-'));
test.after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));
const tmp = (name) => path.join(tmpRoot, name);

/** The ART table from apps/park/src/game/art.ts, parsed from source so drift is caught. */
function parseArtTable() {
  const roomSrc = fs.readFileSync(path.join(G.REPO_ROOT, 'packages/shared/src/room.ts'), 'utf8');
  const consts = { ROOM_W: Number(/ROOM_W = (\d+)/.exec(roomSrc)[1]), ROOM_H: Number(/ROOM_H = (\d+)/.exec(roomSrc)[1]) };
  const src = fs.readFileSync(path.join(G.REPO_ROOT, 'apps/park/src/game/art.ts'), 'utf8');
  for (const m of src.matchAll(/export const (OWL_[WH]) = (\d+);/g)) consts[m[1]] = Number(m[2]);
  const start = src.indexOf('export const ART');
  const block = src.slice(start, src.indexOf('\n};', start));
  const re = /^\s*'?([a-z][a-z0-9-]*)'?:\s*\{\s*w:\s*(\w+),\s*h:\s*(\w+),\s*kind:\s*'(\w+)'/gm;
  const table = {};
  for (let m; (m = re.exec(block));) table[m[1]] = { w: consts[m[2]] ?? Number(m[2]), h: consts[m[3]] ?? Number(m[3]), kind: m[4] };
  // art.ts also registers the tiles of rooms bigger than one screen, from the room data, as room art of one screen.
  const roomsSrc = fs.readFileSync(path.join(G.REPO_ROOT, 'packages/shared/rooms/index.ts'), 'utf8');
  for (const list of roomsSrc.matchAll(/(?:backgrounds|foregrounds):\s*\[([^\]]*)\]/g)) {
    for (const m of list[1].matchAll(/key:\s*'([a-z][a-z0-9-]*)'/g)) table[m[1]] ??= { w: consts.ROOM_W, h: consts.ROOM_H, kind: 'room' };
  }
  return table;
}

const tinyPng = () => G.encodePng({ width: 2, height: 2, channels: 3, data: new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9]) });

function capture() {
  const chunks = [];
  const stream = new Writable({ write(c, _e, cb) { chunks.push(String(c)); cb(); } });
  return { stream, text: () => chunks.join('') };
}

// ---------------------------------------------------------------------------------------------
// PNG codec

test('encodePng writes a valid RGB PNG whose header and pixels parse back', () => {
  const width = 7; const height = 5;
  const data = new Uint8Array(width * height * 3).map((_, i) => (i * 37) % 256);
  const png = G.encodePng({ width, height, channels: 3, data });
  const info = G.parsePng(png);
  assert.equal(info.width, width);
  assert.equal(info.height, height);
  assert.equal(info.bitDepth, 8);
  assert.equal(info.colorType, 2);
  assert.deepEqual(info.chunks.map((c) => c.type), ['IHDR', 'IDAT', 'IEND']);
  // Decode: one filter byte (0) per scanline, then the pixels.
  const idatOffset = 8 + 12 + 13 + 8;
  const idatLen = png.readUInt32BE(8 + 12 + 13);
  const raw = inflateSync(png.subarray(idatOffset, idatOffset + idatLen));
  assert.equal(raw.length, (width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    assert.equal(raw[y * (width * 3 + 1)], 0);
    assert.deepEqual([...raw.subarray(y * (width * 3 + 1) + 1, (y + 1) * (width * 3 + 1))], [...data.subarray(y * width * 3, (y + 1) * width * 3)]);
  }
  assert.ok(G.encodePng({ width, height, channels: 3, data }).equals(png), 'encoding is deterministic');
  assert.ok(G.inspectImage(png).format === 'png');
});

test('encodePng writes RGBA (colour type 6) and rejects bad buffers; parsePng rejects bad CRCs', () => {
  const png = G.encodePng({ width: 3, height: 2, channels: 4, data: new Uint8Array(24).fill(200) });
  assert.equal(G.parsePng(png).colorType, 6);
  assert.throws(() => G.encodePng({ width: 3, height: 2, channels: 4, data: new Uint8Array(5) }), /size/);
  const broken = Buffer.from(png);
  broken[8 + 8 + 3] ^= 0xff; // flip a byte inside IHDR
  assert.throws(() => G.parsePng(broken), /CRC/);
  assert.throws(() => G.parsePng(Buffer.from('not a png')), /signature/);
});

test('parseJpegSize reads the start-of-frame marker', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]);
  assert.deepEqual(G.parseJpegSize(jpeg), { height: 300, width: 600 });
  assert.equal(G.inspectImage(jpeg).ext, 'jpg');
});

// ---------------------------------------------------------------------------------------------
// Mock provider

test('mock drawings are deterministic, differ by seed, have the requested size and a key-colour border', () => {
  const cases = [
    { kind: 'room', realm: 'hub', width: 160, height: 90 },
    { kind: 'anchor', realm: 'hub', width: 96, height: 96 },
    { kind: 'piece', realm: 'grove', width: 120, height: 140, keyColour: '#00FF00' },
    { kind: 'overlay', realm: 'market', width: 160, height: 90, keyColour: '#00FF00' },
    { kind: 'owl', realm: 'hub', width: 100, height: 120, keyColour: '#FF00FF', regions: { body: '#FF0000', belly: '#00FF00', accent: '#0000FF' } },
    { kind: 'owl-edit', realm: 'hub', width: 100, height: 120, keyColour: '#FF00FF', regions: { body: '#FF0000', belly: '#00FF00', accent: '#0000FF' } },
  ];
  for (const c of cases) {
    const a = G.drawMock({ ...c, seed: 7, key: 'k' }).toPng();
    const b = G.drawMock({ ...c, seed: 7, key: 'k' }).toPng();
    const other = G.drawMock({ ...c, seed: 8, key: 'k' }).toPng();
    assert.ok(a.equals(b), `${c.kind}: byte-identical across runs`);
    assert.ok(!a.equals(other), `${c.kind}: differs across seeds`);
    const info = G.parsePng(a);
    assert.equal(info.width, c.width);
    assert.equal(info.height, c.height);
    if (c.keyColour) {
      const r = G.drawMock({ ...c, seed: 7, key: 'k' });
      const key = G.hexToRgb(c.keyColour);
      const probes = c.kind === 'overlay'
        ? [[Math.floor(c.width / 2), 0], [0, Math.floor(c.height / 2)], [c.width - 1, Math.floor(c.height / 2)], [Math.floor(c.width / 2), Math.floor(c.height / 2)]]
        : [[0, 0], [c.width - 1, 0], [0, c.height - 1], [c.width - 1, c.height - 1], [Math.floor(c.width / 2), 0], [Math.floor(c.width / 2), c.height - 1]];
      for (const [x, y] of probes) assert.deepEqual(r.get(x, y), key, `${c.kind}: key colour at ${x},${y}`);
    }
  }
  // The owl master carries all three flat region fills.
  const owl = G.drawMock({ kind: 'owl', realm: 'hub', width: 100, height: 120, keyColour: '#FF00FF', regions: { body: '#FF0000', belly: '#00FF00', accent: '#0000FF' }, seed: 1, key: 'owl-master' });
  const seen = new Set();
  for (let y = 0; y < 120; y += 1) for (let x = 0; x < 100; x += 1) seen.add(owl.get(x, y).join(','));
  for (const c of ['255,0,0', '0,255,0', '0,0,255', '255,0,255']) assert.ok(seen.has(c), `owl master has ${c}`);
});

test('mock provider generate() honours the job size through the provider interface', async () => {
  const job = { key: 'guardian', kind: 'piece', realm: 'grove', size: '64x48', width: 64, height: 48, seed: 3, key_colour: '#00FF00', prompt: 'p', refs: [] };
  const cfg = G.resolveConfig({ out: tmp('mock-iface') }, {}, P.DEFAULTS);
  const req = G.PROVIDERS.mock.buildRequest(job, cfg, []);
  const res = await G.PROVIDERS.mock.generate(req, { job, cfg, refs: [], http: {} });
  assert.equal(res.format, 'png');
  assert.deepEqual([res.width, res.height], [64, 48]);
  assert.deepEqual([G.parsePng(res.bytes).width, G.parsePng(res.bytes).height], [64, 48]);
});

// ---------------------------------------------------------------------------------------------
// Job list integrity

test('config/assets.json mirrors the ART table in art.ts', () => {
  const art = parseArtTable();
  assert.ok(Object.keys(art).length >= 17, 'parsed the ART table');
  // Collectible item art and collection icons live outside the literal ART table (the game derives them from the catalogue).
  const nonItems = Object.keys(ASSETS.keys).filter((k) => ASSETS.keys[k].kind !== 'item' && ASSETS.keys[k].kind !== 'icon');
  assert.deepEqual(nonItems.sort(), Object.keys(art).sort());
  for (const [key, spec] of Object.entries(art)) {
    assert.equal(ASSETS.keys[key].w, spec.w, `${key} width`);
    assert.equal(ASSETS.keys[key].h, spec.h, `${key} height`);
    assert.equal(ASSETS.keys[key].kind, spec.kind, `${key} kind`);
  }
});

test('collectible item keys: named item-*, one of the four slot sizes, a backdrop, a 2x copy and a job each', () => {
  const SIZES = new Set(['140x100', '120x60', '130x80', '90x90']); // head, face, neck, pet (owl canvas units)
  const items = Object.entries(ASSETS.keys).filter(([, v]) => v.kind === 'item');
  assert.ok(items.length >= 82, `${items.length} item keys`);
  const jobs = new Map(G.validateJobs(P.JOBS, { assets: ASSETS, helperKeys: P.HELPER_KEYS, blocks: P.BLOCKS }).map((j) => [j.key, j]));
  for (const [key, v] of items) {
    assert.match(key, /^item-[a-z][a-z0-9-]*$/);
    assert.ok(SIZES.has(`${v.w}x${v.h}`), `${key}: ${v.w}x${v.h} is not a slot size`);
    assert.match(v.key_colour, /^#(00FF00|FF00FF)$/, `${key}: green or magenta backdrop`);
    assert.equal(v.with_2x, true, `${key}: items ship 1x and 2x`);
    const job = jobs.get(key);
    assert.ok(job, `${key} has a generation job`);
    assert.equal(job.kind, 'piece');
    assert.equal(job.key_colour, v.key_colour, `${key}: job and table agree on the backdrop`);
    assert.equal(job.size, `${2 * v.w}x${2 * v.h}`, `${key}: generated at twice the logical size`);
    assert.ok(job.prompt.includes(v.key_colour), `${key}: the prompt names its backdrop`);
  }
});

test('the item keys in assets.json are exactly the catalogue wearables and pets, at their slot sizes', () => {
  // Parsed from the shared catalogue source, like the ART table above, so a new item cannot ship without art jobs.
  const src = fs.readFileSync(path.join(G.REPO_ROOT, 'packages/shared/src/collectibles.ts'), 'utf8');
  const tuples = (from, to) => [...src.slice(from, to).matchAll(/\['([a-z][a-z0-9-]*)', (?:'[^']*'|"[^"]*"), [A-Z]\]/g)].map((m) => m[1]);
  const at = (needle) => { const i = src.indexOf(needle); assert.ok(i >= 0, `catalogue has ${needle}`); return i; };
  const head = at("wear('head'"), face = at("wear('face'"), neck = at("wear('neck'"), petEnd = at("kind: 'pet'");
  const neckEnd = src.indexOf(']),', neck);
  const SIZE = { head: [140, 100], face: [120, 60], neck: [130, 80], pet: [90, 90] };
  const want = {};
  for (const id of tuples(head, face)) want[`item-${id}`] = SIZE.head;
  for (const id of tuples(face, neck)) want[`item-${id}`] = SIZE.face;
  for (const id of tuples(neck, neckEnd)) want[`item-${id}`] = SIZE.neck;
  for (const id of tuples(neckEnd, petEnd)) want[`item-${id}`] = SIZE.pet;
  assert.equal(Object.keys(want).length, 82, 'parsed 58 wearables and 24 pets');
  const have = Object.fromEntries(Object.entries(ASSETS.keys).filter(([, v]) => v.kind === 'item').map(([k, v]) => [k, [v.w, v.h]]));
  assert.deepEqual(have, want);
});

test('collection icons: one per catalogue effect and emote, 64x64 on green, 1x and 2x, with a job each', () => {
  const src = fs.readFileSync(path.join(G.REPO_ROOT, 'packages/shared/src/collectibles.ts'), 'utf8');
  // Each kind's tuples sit in a `...([...] as Array<...>).map(... kind: '<kind>' ...)` block.
  const ids = (kind) => {
    const at = src.indexOf(`kind: '${kind}'`);
    assert.ok(at >= 0, `catalogue has ${kind}`);
    return [...src.slice(src.lastIndexOf('...(', at), at).matchAll(/\['([a-z][a-z0-9-]*)', (?:'[^']*'|"[^"]*"), [A-Z]\]/g)].map((m) => m[1]);
  };
  const fx = ids('fx'), emote = ids('emote');
  assert.equal(fx.length, 24, 'parsed 24 effects');
  assert.equal(emote.length, 24, 'parsed 24 emotes');
  const want = [...fx, ...emote].map((id) => `icon-${id}`).sort();
  const icons = Object.entries(ASSETS.keys).filter(([, v]) => v.kind === 'icon');
  assert.deepEqual(icons.map(([k]) => k).sort(), want);
  const jobs = new Map(G.validateJobs(P.JOBS, { assets: ASSETS, helperKeys: P.HELPER_KEYS, blocks: P.BLOCKS }).map((j) => [j.key, j]));
  for (const [key, v] of icons) {
    assert.deepEqual([v.w, v.h, v.key_colour, v.with_2x], [64, 64, '#00FF00', true], key);
    assert.equal(jobs.get(key)?.size, '128x128', `${key}: generated at twice the logical size`);
    assert.ok(jobs.get(key).prompt.includes('white'), `${key}: painted white so the game can tint it`);
  }
});

test('every generated asset key in art.ts has a job (directly or derived) and the committed list validates', () => {
  const jobs = G.validateJobs(P.JOBS, { assets: ASSETS, helperKeys: P.HELPER_KEYS, blocks: P.BLOCKS });
  const covered = new Set();
  for (const j of jobs) { covered.add(j.key); for (const d of j.derives ?? []) covered.add(d); }
  for (const [key, spec] of Object.entries(parseArtTable())) {
    if (spec.kind === 'sign') { assert.ok(!covered.has(key), `${key}: signs are not regenerated`); continue; }
    assert.ok(covered.has(key), `${key} has a generation job`);
  }
  for (const j of jobs) {
    assert.match(j.key, G.KEY_RE);
    assert.equal(j.prompt, P.PROMPTS[j.key], `${j.key}: prompt is the approved default`);
    assert.ok(!j.prompt.includes('{'), `${j.key}: no unresolved placeholders`);
    if (j.key_colour) assert.ok(j.prompt.includes(j.key_colour), `${j.key}: the prompt names the job's key colour ${j.key_colour}`);
    if (j.kind === 'room' || j.kind === 'overlay') assert.equal(j.size, '3200x1800', `${j.key}: rooms generate at 2x`);
    for (const r of j.refs) assert.ok(/^(refs\/|@guide:|@raw:|@final:|https:\/\/)/.test(r.ref));
  }
  const byKey = Object.fromEntries(jobs.map((j) => [j.key, j]));
  assert.deepEqual(byKey['owl-master'].derives, P.OWL_LAYER_KEYS);
  assert.deepEqual(byKey['owl-barn-master'].derives, ['owl-barn-body', 'owl-barn-belly', 'owl-barn-accent', 'owl-barn-face', 'owl-barn-blink']);
  assert.equal(byKey['owl-blink-src'].optional, true);
  assert.equal(byKey['owl-blink-src'].refs[0].optional, false);
  for (const realm of ['hub', 'grove', 'market']) assert.ok(P.STYLE[realm].startsWith('STYLE (use verbatim in every'));
});

test('validateJobs rejects invalid or non-public keys, bad sizes and missing key colours', () => {
  const base = { kind: 'room', realm: 'hub', size: '32x18', seed: 1, prompt: 'x' };
  const opts = { assets: ASSETS, helperKeys: P.HELPER_KEYS, blocks: {} };
  assert.throws(() => G.validateJobs([{ ...base, key: 'Hub' }], opts), /invalid job key/);
  assert.throws(() => G.validateJobs([{ ...base, key: 'secret-realm' }], opts), /not a public asset key/);
  assert.throws(() => G.validateJobs([{ ...base, key: 'hub', size: '3200' }], opts), /WxH/);
  assert.throws(() => G.validateJobs([{ ...base, key: 'hub' }, { ...base, key: 'hub' }], opts), /duplicate/);
  assert.throws(() => G.validateJobs([{ ...base, key: 'guardian', kind: 'piece' }], opts), /key_colour/);
  assert.throws(() => G.validateJobs([{ ...base, key: 'hub', prompt: ['@nope'] }], opts), /unknown prompt block/);
  const ok = G.validateJobs([{ ...base, key: 'guardian', kind: 'piece', key_colour: '#00FF00', prompt: ['@a', 'on {key_colour}'] }], { ...opts, blocks: { a: 'A' } });
  assert.equal(ok[0].prompt, 'A on #00FF00');
});

test('selectJobs supports lists and globs and rejects unmatched patterns', () => {
  const jobs = G.validateJobs(P.JOBS, { assets: ASSETS, helperKeys: P.HELPER_KEYS, blocks: P.BLOCKS });
  assert.deepEqual(G.selectJobs(jobs, 'hub,owl-*').map((j) => j.key), ['hub', 'owl-master', 'owl-blink-src', ...P.SPECIES_MASTER_KEYS]);
  assert.deepEqual(G.selectJobs(jobs, 'owl-*-master').map((j) => j.key), P.SPECIES_MASTER_KEYS);
  assert.deepEqual(G.selectJobs(jobs, '*-fg').map((j) => j.key), ['hub-fg', 'grove-fg', 'market-fg']);
  assert.throws(() => G.selectJobs(jobs, 'nothing'), /matches no job/);
  assert.deepEqual(G.variantSeeds({ seed: 10, variants: 3 }), [10, 11, 12]);
  assert.deepEqual(G.variantSeeds({ seed: 10, variants: 3 }, { variants: 2, seed: 50 }), [50, 51]);
});

// ---------------------------------------------------------------------------------------------
// Cache key

test('cacheKey is stable across key order and ref paths, and changes with prompt, seed, size, provider and model', () => {
  const body = { prompt: 'p', seed: 1, size: '10x10', image: ['sha256:abc'] };
  const a = G.cacheKey({ provider: 'ark', model: 'm', body });
  const b = G.cacheKey({ provider: 'ark', model: 'm', body: { image: ['sha256:abc'], size: '10x10', seed: 1, prompt: 'p', Authorization: 'Bearer x' } });
  assert.equal(a.hash, b.hash);
  assert.equal(a.hash16.length, 16);
  assert.notEqual(a.hash, G.cacheKey({ provider: 'ark', model: 'm', body: { ...body, prompt: 'q' } }).hash);
  assert.notEqual(a.hash, G.cacheKey({ provider: 'ark', model: 'm', body: { ...body, seed: 2 } }).hash);
  assert.notEqual(a.hash, G.cacheKey({ provider: 'ark', model: 'm', body: { ...body, size: '10x11' } }).hash);
  assert.notEqual(a.hash, G.cacheKey({ provider: 'fal', model: 'm', body }).hash);
  assert.notEqual(a.hash, G.cacheKey({ provider: 'ark', model: 'm2', body }).hash);

  // Two refs with the same bytes at different paths produce the same token, hence the same hash.
  const toolsDir = tmp('tools-a');
  fs.mkdirSync(path.join(toolsDir, 'refs'), { recursive: true });
  fs.writeFileSync(path.join(toolsDir, 'refs', 'one.png'), tinyPng());
  fs.writeFileSync(path.join(toolsDir, 'refs', 'two.png'), tinyPng());
  const ctx = { workDir: tmp('w-a'), toolsDir, requireRefs: false };
  const job = (ref) => ({ key: 'hub', refs: [{ ref, optional: false }] });
  const r1 = G.resolveRefs(job('refs/one.png'), ctx);
  const r2 = G.resolveRefs(job('refs/two.png'), ctx);
  assert.equal(r1[0].token, r2[0].token);
  assert.match(r1[0].token, /^sha256:[0-9a-f]{64}$/);
  const cfg = G.resolveConfig({}, { ARK_API_KEY: 'k' }, P.DEFAULTS);
  const j = { key: 'hub', kind: 'room', realm: 'hub', size: '2x2', width: 2, height: 2, seed: 1, prompt: 'p', refs: [] };
  const h1 = G.cacheKey({ provider: 'ark', model: 'm', body: G.PROVIDERS.ark.buildRequest(j, cfg, r1).body });
  const h2 = G.cacheKey({ provider: 'ark', model: 'm', body: G.PROVIDERS.ark.buildRequest(j, cfg, r2).body });
  assert.equal(h1.hash, h2.hash);
  // Missing optional refs are reported, missing required refs throw.
  const miss = G.resolveRefs({ key: 'hub', refs: [{ ref: 'refs/none.png', optional: true }] }, ctx);
  assert.equal(miss[0].status, 'missing');
  assert.throws(() => G.resolveRefs({ key: 'hub', refs: [{ ref: 'refs/none.png', optional: false }] }, ctx), G.RefError);
  assert.throws(() => G.resolveRefs({ key: 'hub', refs: [{ ref: 'refs/none.png', optional: true }] }, { ...ctx, requireRefs: true }), G.RefError);
});

test('@final refs find a room published as WebP and travel as image/webp', () => {
  const publicArtDir = tmp('public-art');
  fs.mkdirSync(publicArtDir, { recursive: true });
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBP')]);
  fs.writeFileSync(path.join(publicArtDir, 'market.webp'), webp);
  const ctx = { workDir: tmp('w-webp'), toolsDir: tmp('t-webp'), publicArtDir, requireRefs: false };
  const [r] = G.resolveRefs({ key: 'robot-owl', refs: [{ ref: '@final:market', optional: true }] }, ctx);
  assert.equal(r.status, 'ok');
  assert.equal(r.mime, 'image/webp');
  // A PNG publish wins when both exist (pieces and overlays publish as PNG).
  fs.writeFileSync(path.join(publicArtDir, 'market.png'), tinyPng());
  assert.equal(G.resolveRefs({ key: 'robot-owl', refs: [{ ref: '@final:market', optional: true }] }, ctx)[0].mime, 'image/png');
});

test('a second run with the same jobs is fully cached and makes no provider calls', async () => {
  const out = tmp('cache-run');
  const args = ['--provider', 'mock', '--only', 'guardian', '--variants', '2', '--out', out, '--now', '2026-10-18T09:00:00Z'];
  const first = capture(); const firstErr = capture();
  assert.equal(await G.main(args, { env: {}, stdout: first.stream, stderr: firstErr.stream }), 0);
  assert.equal((first.text().match(/^ok /gm) ?? []).length, 2);
  const files = fs.readdirSync(path.join(out, 'raw', 'guardian')).sort();
  assert.equal(files.filter((f) => f.endsWith('.png')).length, 2);
  const calls = [];
  const original = G.PROVIDERS.mock.generate;
  G.PROVIDERS.mock.generate = async (...a) => { calls.push(a); return original(...a); };
  try {
    const second = capture(); const secondErr = capture();
    assert.equal(await G.main(args, { env: {}, stdout: second.stream, stderr: secondErr.stream }), 0);
    assert.equal((second.text().match(/^cached /gm) ?? []).length, 2);
    assert.equal(calls.length, 0);
  } finally { G.PROVIDERS.mock.generate = original; }
  assert.deepEqual(fs.readdirSync(path.join(out, 'raw', 'guardian')).sort(), files);
  const log = fs.readFileSync(path.join(out, 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(log.map((l) => l.status), ['ok', 'ok', 'cached', 'cached']);
  for (const l of log) assert.deepEqual(Object.keys(l), G.LOG_FIELDS);
  const sidecar = JSON.parse(fs.readFileSync(path.join(out, 'raw', 'guardian', files.find((f) => f.endsWith('.json'))), 'utf8'));
  assert.equal(sidecar.schema, 1);
  assert.equal(sidecar.generated_at, '2026-10-18T09:00:00Z');
  assert.equal(sidecar.now_source, 'flag');
  assert.equal(sidecar.key_colour, '#00FF00');
  assert.ok(!('prompt' in sidecar));
  assert.match(sidecar.prompt_sha256, /^[0-9a-f]{64}$/);
});

// ---------------------------------------------------------------------------------------------
// Providers

test('ark buildRequest follows the env configuration and redacts the key', () => {
  const env = { ARK_API_KEY: 'sekret', ARK_BASE_URL: 'https://ark.cn-beijing.volces.com/', ARK_IMAGES_PATH: '/api/v3/images/generations', SEEDREAM_MODEL: 'doubao-seedream-4-0-250828', ARK_SIZE_MODE: 'preset', ARK_IMAGE_FIELD: 'images', ARK_EXTRA_JSON: '{"output_format":"png"}', ARK_RESPONSE_FORMAT: 'b64_json' };
  const cfg = G.resolveConfig({}, env, P.DEFAULTS);
  const job = { key: 'hub', kind: 'room', realm: 'hub', size: '3200x1800', width: 3200, height: 1800, seed: 5, prompt: 'p', refs: [], providers: { ark: { guidance_scale: 3 } } };
  const refs = [{ status: 'ok', token: 'sha256:aa', bytes: tinyPng(), mime: 'image/png', ref: 'refs/x.png' }];
  const req = G.PROVIDERS.ark.buildRequest(job, cfg, refs);
  assert.equal(req.url, 'https://ark.cn-beijing.volces.com/api/v3/images/generations');
  assert.equal(req.headers.Authorization, 'Bearer sekret');
  assert.deepEqual(G.redactHeaders(req.headers), { Authorization: '***', 'Content-Type': 'application/json' });
  assert.equal(req.model, 'doubao-seedream-4-0-250828');
  assert.deepEqual(req.body, { model: 'doubao-seedream-4-0-250828', prompt: 'p', size: '4K', seed: 5, response_format: 'b64_json', watermark: false, sequential_image_generation: 'disabled', images: ['sha256:aa'], guidance_scale: 3, output_format: 'png' });
  const plain = G.resolveConfig({}, { ARK_API_KEY: 'k' }, P.DEFAULTS);
  const req2 = G.PROVIDERS.ark.buildRequest(job, plain, []);
  assert.equal(req2.url, 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations');
  assert.equal(req2.body.size, '3200x1800');
  assert.equal(req2.body.model, 'dola-seedream-5-0-pro-260628');
  assert.ok(!('image' in req2.body));
  const sent = G.materialise(req.body, refs, 'data');
  assert.match(sent.images[0], /^data:image\/png;base64,/);
  assert.throws(() => G.materialise(req.body, refs, 'url'), /REF_MODE=url/);
});

test('ark generate handles b64_json and url responses through a stubbed fetch', async () => {
  const png = tinyPng();
  const cfg = G.resolveConfig({}, { ARK_API_KEY: 'k' }, P.DEFAULTS);
  const job = { key: 'hub', kind: 'room', realm: 'hub', size: '2x2', width: 2, height: 2, seed: 1, prompt: 'p', refs: [] };
  const req = G.PROVIDERS.ark.buildRequest(job, cfg, []);
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, method: init.method, auth: init.headers?.Authorization });
    if (url.startsWith('https://img/')) return new Response(png, { status: 200 });
    const body = JSON.parse(init.body);
    assert.equal(body.prompt, 'p');
    const data = seen.length === 1 ? [{ b64_json: png.toString('base64'), size: '2x2' }] : [{ url: 'https://img/1.png', size: '2x2' }];
    return new Response(JSON.stringify({ data, usage: { generated_images: 1 }, request_id: 'r1' }), { status: 200 });
  };
  const http = { fetchImpl, retries: 0, timeoutMs: 1000, sleep: async () => {} };
  const a = await G.PROVIDERS.ark.generate(req, { job, cfg, refs: [], http });
  assert.ok(a.bytes.equals(png));
  assert.equal(a.sourceUrl, null);
  assert.deepEqual(a.providerMeta, { size: '2x2', usage: { generated_images: 1 }, request_id: 'r1' });
  const b = await G.PROVIDERS.ark.generate(req, { job, cfg, refs: [], http });
  assert.equal(b.sourceUrl, 'https://img/1.png');
  assert.equal(b.width, 2);
  assert.equal(seen[0].auth, 'Bearer k');
});

test('fal buildRequest picks the edit endpoint when refs exist; generate polls the queue and stops on FAILED', async () => {
  const png = tinyPng();
  const cfg = G.resolveConfig({}, { FAL_KEY: 'fk', FAL_POLL_MS: '1', FAL_EXTRA_JSON: '{"output_format":"png"}' }, P.DEFAULTS);
  const job = { key: 'guardian', kind: 'piece', realm: 'grove', size: '2x2', width: 2, height: 2, seed: 9, prompt: 'p', refs: [], key_colour: '#00FF00' };
  const refs = [{ status: 'ok', token: 'sha256:bb', bytes: png, mime: 'image/png', ref: 'refs/x.png' }];
  const edit = G.PROVIDERS.fal.buildRequest(job, cfg, refs);
  assert.equal(edit.url, 'https://queue.fal.run/bytedance/seedream/v5/pro/edit');
  assert.deepEqual(edit.body, { prompt: 'p', image_size: { width: 2, height: 2 }, num_images: 1, seed: 9, enable_safety_checker: true, image_urls: ['sha256:bb'], output_format: 'png' });
  assert.equal(edit.model, 'bytedance/seedream/v5/pro/edit');
  const text = G.PROVIDERS.fal.buildRequest(job, cfg, []);
  assert.equal(text.url, 'https://queue.fal.run/bytedance/seedream/v5/pro/text-to-image');
  assert.equal(text.headers.Authorization, 'Key fk');

  const calls = [];
  let polls = 0;
  const fetchImpl = async (url, init) => {
    calls.push(`${init.method} ${url}`);
    if (url === text.url) return new Response(JSON.stringify({ request_id: 'q1', status_url: 'https://q/status', response_url: 'https://q/result' }), { status: 200 });
    if (url === 'https://q/status') { polls += 1; return new Response(JSON.stringify({ status: polls < 3 ? (polls === 1 ? 'IN_QUEUE' : 'IN_PROGRESS') : 'COMPLETED' }), { status: 202 }); }
    if (url === 'https://q/result') return new Response(JSON.stringify({ images: [{ url: 'https://q/img.png', width: 2, height: 2, content_type: 'image/png' }], seed: 9 }), { status: 200 });
    if (url === 'https://q/img.png') return new Response(png, { status: 200 });
    throw new Error(`unexpected ${url}`);
  };
  const sleeps = [];
  const http = { fetchImpl, retries: 0, timeoutMs: 1000, sleep: async (ms) => { sleeps.push(ms); } };
  const res = await G.PROVIDERS.fal.generate(text, { job, cfg, refs: [], http });
  assert.ok(res.bytes.equals(png));
  assert.equal(res.seedReturned, 9);
  assert.equal(res.sourceUrl, 'https://q/img.png');
  assert.deepEqual(res.providerMeta, { request_id: 'q1', size: '2x2', content_type: 'image/png' });
  assert.equal(polls, 3);
  assert.deepEqual(sleeps, [1, 1]);

  const failCalls = [];
  const failing = async (url, init) => {
    failCalls.push(url);
    if (url === text.url) return new Response(JSON.stringify({ request_id: 'q2', status_url: 'https://q/status2', response_url: 'https://q/result2' }), { status: 200 });
    return new Response(JSON.stringify({ status: 'FAILED', error: 'nope' }), { status: 200 });
  };
  await assert.rejects(G.PROVIDERS.fal.generate(text, { job, cfg, refs: [], http: { ...http, fetchImpl: failing } }), /FAILED/);
  assert.equal(failCalls.length, 2, 'no retry after FAILED');
});

test('fetchRetry retries 429 and 5xx with backoff, honours Retry-After, and fails 4xx at once', async () => {
  const mk = (responses) => {
    let i = 0;
    const sleeps = [];
    const fetchImpl = async () => { const r = responses[i]; i += 1; if (r instanceof Error) throw r; return r(); };
    return { fetchImpl, sleeps, sleep: async (ms) => { sleeps.push(ms); }, calls: () => i, random: () => 0.5 };
  };
  const ok = () => new Response('fine', { status: 200 });
  let s = mk([() => new Response('slow down', { status: 429, headers: { 'retry-after': '3' } }), () => new Response('boom', { status: 503 }), ok]);
  const res = await G.fetchRetry('https://x', { method: 'GET' }, { retries: 5, fetchImpl: s.fetchImpl, sleep: s.sleep, random: s.random });
  assert.equal(await res.text(), 'fine');
  assert.equal(s.calls(), 3);
  assert.deepEqual(s.sleeps, [3000, 2000]);
  s = mk([() => new Response('bad request body', { status: 400 }), ok]);
  await assert.rejects(G.fetchRetry('https://x', {}, { retries: 5, fetchImpl: s.fetchImpl, sleep: s.sleep }), (e) => e instanceof G.HttpError && e.status === 400 && /bad request body/.test(e.message));
  assert.equal(s.calls(), 1);
  s = mk([new Error('ECONNRESET'), new Error('ECONNRESET'), ok]);
  await assert.rejects(G.fetchRetry('https://x', {}, { retries: 1, fetchImpl: s.fetchImpl, sleep: s.sleep, random: s.random }), /network error after 2 attempts/);
  s = mk([() => new Response('x'.repeat(2000), { status: 500 })]);
  await assert.rejects(G.fetchRetry('https://x', {}, { retries: 0, fetchImpl: s.fetchImpl, sleep: s.sleep }), (e) => e.message.length < 600);
});

// ---------------------------------------------------------------------------------------------
// CLI

test('--dry-run prints redacted requests, makes no calls and writes nothing', () => {
  const out = tmp('dry');
  const r = spawnSync(process.execPath, [GEN, '--provider', 'ark', '--only', 'hub', '--variants', '2', '--dry-run', '--out', out], { encoding: 'utf8', env: { ...process.env, ARK_API_KEY: 'super-secret-key', ART_HTTP_RETRIES: '0', ART_MODEL: 'seedream-v4' } });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.stdout.includes('super-secret-key') && !r.stderr.includes('super-secret-key'));
  assert.ok(r.stdout.includes('"Authorization": "***"'));
  assert.equal((r.stdout.match(/cache miss/g) ?? []).length, 2);
  assert.ok(r.stdout.includes('"seed": 1101') && r.stdout.includes('"seed": 1102'));
  assert.ok(r.stdout.includes('estimated cost $0.06'));
  assert.ok(r.stdout.includes('ARK_API_KEY: set'));
  assert.ok(!fs.existsSync(out));
});

test('--max-spend refuses an expensive run before any call; --only, --variants and --seed shape the plan', () => {
  const r = spawnSync(process.execPath, [GEN, '--provider', 'fal', '--only', 'hub,market', '--max-spend', '0.1', '--out', tmp('spend')], { encoding: 'utf8', env: { ...process.env, FAL_KEY: 'k', ART_HTTP_RETRIES: '0' } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /refusing to start/);
  assert.ok(!fs.existsSync(tmp('spend')));
  const c = spawnSync(process.execPath, [GEN, 'cost', '--provider', 'ark', '--only', 'owl-*', '--variants', '3', '--seed', '42', '--out', tmp('cost')], { encoding: 'utf8', env: { ...process.env, ARK_API_KEY: 'k', ART_MODEL: 'seedream-v4' } });
  assert.equal(c.status, 0, c.stderr);
  assert.match(c.stdout, /owl-master\t3 variant\(s\)\t3 uncached\t\$0\.09/);
  assert.match(c.stderr, /skipping optional job owl-blink-src/);
});

test('mock run writes sidecars for each variant seed, select writes SELECTED, --now is recorded', () => {
  const out = tmp('run');
  const env = { ...process.env, ART_NOW: '2026-10-18T10:00:00Z' };
  const r = spawnSync(process.execPath, [GEN, 'run', '--only', 'owl-master', '--variants', '2', '--seed', '5', '--out', out], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  const dir = path.join(out, 'raw', 'owl-master');
  const sidecars = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.deepEqual(sidecars.map((s) => s.seed).sort(), [5, 6]);
  for (const s of sidecars) {
    assert.equal(s.generated_at, '2026-10-18T10:00:00Z');
    assert.equal(s.now_source, 'env');
    assert.equal(s.kind, 'owl');
    assert.deepEqual(s.regions, { body: '#FF0000', belly: '#00FF00', accent: '#0000FF' });
    assert.deepEqual(s.derives, P.OWL_LAYER_KEYS);
    const png = fs.readFileSync(path.join(dir, `${s.hash16}.png`));
    assert.deepEqual([G.parsePng(png).width, G.parsePng(png).height], [1040, 1248]);
  }
  const l = spawnSync(process.execPath, [GEN, 'list', 'owl-master', '--out', out], { encoding: 'utf8' });
  assert.equal(l.status, 0);
  assert.equal((l.stdout.match(/\tok\t/g) ?? []).length, 2);
  const s = spawnSync(process.execPath, [GEN, 'select', 'owl-master', 'latest', '--out', out], { encoding: 'utf8' });
  assert.equal(s.status, 0, s.stderr);
  const selected = fs.readFileSync(path.join(dir, 'SELECTED'), 'utf8').trim();
  assert.ok(sidecars.some((x) => x.hash16 === selected));
  // With a SELECTED owl master the optional blink edit job now runs with it as its reference.
  const b = spawnSync(process.execPath, [GEN, '--only', 'owl-blink-src', '--out', out], { encoding: 'utf8', env });
  assert.equal(b.status, 0, b.stderr);
  const blink = fs.readdirSync(path.join(out, 'raw', 'owl-blink-src')).filter((f) => f.endsWith('.json'));
  assert.equal(blink.length, 1);
  const bs = JSON.parse(fs.readFileSync(path.join(out, 'raw', 'owl-blink-src', blink[0]), 'utf8'));
  assert.equal(bs.refs[0].ref, '@raw:owl-master');
  assert.match(bs.refs[0].sha256, /^[0-9a-f]{64}$/);
});

test('geometry exports the live room data with the assets table', () => {
  const r = spawnSync(process.execPath, [GEN, 'geometry', '--stdout'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const g = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(g.rooms).sort(), ['grove', 'hub', 'market']);
  assert.deepEqual(g.rooms.hub.size, { w: 1600, h: 900 });
  assert.deepEqual(g.rooms.hub.anchors['tree-base'], { x: 800, y: 628 });
  assert.ok(g.rooms.hub.doors.some((d) => d.id === 'to-grove'));
  assert.ok(g.rooms.hub.walkable[0].length > 3);
  assert.equal(g.closedSigns.length, 4);
  assert.deepEqual(g.assets.keys.guardian, ASSETS.keys.guardian);
});

// ---------------------------------------------------------------------------------------------
// Forbidden words and the log writer

test('forbidden-word check is a no-op without a list and detects substring and whole-word entries', () => {
  assert.equal(G.loadForbidden({}, tmp('no-tools')), null);
  const list = G.loadForbidden({ OWL_PARK_FORBIDDEN: 'Zebra, =owl ,, ' }, tmp('no-tools'));
  assert.deepEqual(list.sources, ['OWL_PARK_FORBIDDEN']);
  assert.deepEqual(G.findForbidden('A ZEBRA crossing', list), ['zebra']);
  assert.deepEqual(G.findForbidden('an owl here', list), ['owl']);
  assert.deepEqual(G.findForbidden('owls and zebras', list), ['zebra']);
  assert.deepEqual(G.findForbidden('nothing', list), []);
  const file = tmp('words.txt');
  fs.writeFileSync(file, '# private\nMoonlight\n\n');
  const fromFile = G.loadForbidden({ ART_FORBIDDEN_WORDS_FILE: file }, tmp('no-tools'));
  assert.deepEqual(fromFile.entries, [{ word: 'moonlight', whole: false }]);
  assert.throws(() => G.validateJobs(P.JOBS, { assets: ASSETS, helperKeys: P.HELPER_KEYS, blocks: P.BLOCKS, forbidden: fromFile }), /forbidden words in the job list: moonlight/);
  const localDir = tmp('tools-local');
  fs.mkdirSync(path.join(localDir, '.local'), { recursive: true });
  fs.writeFileSync(path.join(localDir, '.local', 'forbidden-words.txt'), 'quux\n');
  assert.deepEqual(G.loadForbidden({}, localDir).sources, ['tools/art/.local/forbidden-words.txt']);
});

test('numeric environment settings are validated like the flags and named in the error', () => {
  for (const name of ['ART_CONCURRENCY', 'ART_HTTP_RETRIES', 'ART_HTTP_TIMEOUT_MS', 'FAL_POLL_MS', 'FAL_TIMEOUT_MS']) {
    for (const bad of ['abc', '-1', '1.5', '5x']) assert.throws(() => G.resolveConfig({}, { [name]: bad }, P.DEFAULTS), new RegExp(`${name} must be a non-negative integer`), `${name}=${bad}`);
  }
  for (const bad of ['abc', '-1', 'NaN', 'Infinity']) assert.throws(() => G.resolveConfig({}, { ART_MAX_SPEND: bad }, P.DEFAULTS), /ART_MAX_SPEND must be a non-negative number/);
  const cfg = G.resolveConfig({}, { ART_CONCURRENCY: ' 3 ', ART_MAX_SPEND: '0.5', ART_HTTP_RETRIES: '0', FAL_POLL_MS: '10' }, P.DEFAULTS);
  assert.deepEqual([cfg.concurrency, cfg.maxSpend, cfg.retries, cfg.fal.pollMs], [3, 0.5, 0, 10]);
  assert.equal(G.resolveConfig({}, { ART_CONCURRENCY: '' }, P.DEFAULTS).concurrency, 2, 'empty means default');
  assert.equal(G.envInt(undefined, 7, 'X'), 7);
  assert.equal(G.envNum('2', 7, 'X'), 2);
  // On the command line it is a usage error (exit 2) before any work is planned or written.
  const out = tmp('nan-env');
  const r = spawnSync(process.execPath, [GEN, '--only', 'guardian', '--out', out], { encoding: 'utf8', env: { ...process.env, ART_CONCURRENCY: 'abc' } });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /ART_CONCURRENCY must be a non-negative integer, got "abc"/);
  assert.ok(!fs.existsSync(out));
});

test('fetchRetry bounds retries even for a NaN count and fails at once on programming errors', async () => {
  let calls = 0;
  const always503 = async () => { calls += 1; return new Response('down', { status: 503 }); };
  await assert.rejects(G.fetchRetry('https://x', {}, { retries: NaN, timeoutMs: NaN, fetchImpl: always503, sleep: async () => {} }), (e) => e instanceof G.HttpError && e.status === 503);
  assert.equal(calls, 1, 'a NaN retry count means no retries, not endless ones');
  calls = 0;
  const badUrl = async () => { calls += 1; throw new TypeError('Failed to parse URL from nope'); };
  await assert.rejects(G.fetchRetry('nope', {}, { retries: 5, fetchImpl: badUrl, sleep: async () => {} }), /parse URL/);
  assert.equal(calls, 1);
  const range = async () => { calls += 1; const e = new RangeError('out of range'); e.code = 'ERR_OUT_OF_RANGE'; throw e; };
  await assert.rejects(G.fetchRetry('https://x', {}, { retries: 5, fetchImpl: range, sleep: async () => {} }), /out of range/);
  assert.equal(calls, 2);
});

test('a presigned provider URL reaches the sidecar and the log without its query string', async () => {
  const out = tmp('presigned');
  const png = tinyPng();
  const presigned = 'https://img.example/seedream/abc.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKIDEXAMPLE%2F20261018%2Fap%2Ftos%2Frequest&X-Tos-Signature=deadbeef';
  const fetchImpl = async (url) => (url.startsWith('https://img.example/') ? new Response(png, { status: 200 }) : new Response(JSON.stringify({ data: [{ url: presigned }] }), { status: 200 }));
  const o = capture(); const e = capture();
  const code = await G.main(['--provider', 'ark', '--only', 'guardian', '--variants', '1', '--out', out, '--now', '2026-10-18T09:00:00Z'], { env: { ARK_API_KEY: 'k', ART_HTTP_RETRIES: '0' }, stdout: o.stream, stderr: e.stream, fetchImpl, sleep: async () => {} });
  assert.equal(code, 0, e.text());
  const dir = path.join(out, 'raw', 'guardian');
  const sc = JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith('.json'))), 'utf8'));
  assert.equal(sc.source_url, 'https://img.example/seedream/abc.jpeg');
  assert.ok(!JSON.stringify(sc).includes('deadbeef'));
  const log = fs.readFileSync(path.join(out, 'log.jsonl'), 'utf8');
  assert.ok(!log.includes('X-Tos') && !log.includes('deadbeef') && !log.includes('?'), log);
  assert.equal(G.publicUrl('https://u:p@h/x.png?sig=1#f'), 'https://h/x.png');
  assert.equal(G.publicUrl('not a url'), null);
  assert.equal(G.publicUrl(null), null);
});

test('sanitiseLogEntry scrubs only the free-text fields, so a short login cannot corrupt a key', () => {
  const entry = { ts: 't', key: 'robot-owl', provider: 'mock', model: 'owl-model', prompt_sha256: 'h', seed: 1, size: '1x1', hash16: 'x', status: 'failed', error: 'owl exploded on owlhost', human_edits: ['by owl'] };
  const line = G.sanitiseLogEntry(entry, { markers: ['owl', 'owlhost'], repoRoot: G.REPO_ROOT });
  assert.equal(line.key, 'robot-owl');
  assert.equal(line.model, 'owl-model');
  assert.equal(line.error, '[redacted] exploded on [redacted]');
  assert.deepEqual(line.human_edits, ['by [redacted]']);
  assert.throws(() => G.sanitiseLogEntry({ ...entry, key: '/abs' }, { markers: [], repoRoot: '/nope' }), /absolute path/);
  for (const m of G.personalMarkers()) assert.ok(m.length >= 4);
});

test('geometry fails with one readable line when type stripping is off', () => {
  const r = spawnSync(process.execPath, ['--no-experimental-strip-types', GEN, 'geometry', '--stdout'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /geometry needs Node 22\.18/);
  assert.ok(!r.stderr.includes('ERR_UNKNOWN_FILE_EXTENSION'));
});

test('the mock overlay keeps the lower half of the frame empty, as the hub overlay rule needs', () => {
  const r = G.drawMock({ kind: 'overlay', realm: 'hub', width: 320, height: 180, seed: 1, key: 'hub-fg', keyColour: '#00FF00' });
  const key = G.hexToRgb('#00FF00');
  for (let y = 90; y < 180; y += 2) for (let x = 0; x < 320; x += 2) assert.deepEqual(r.get(x, y), key, `empty at ${x},${y}`);
  let props = 0;
  for (let y = 0; y < 90; y += 1) for (let x = 0; x < 320; x += 1) if (r.get(x, y).join() !== key.join()) props += 1;
  assert.ok(props > 50, 'there are props in the upper half');
});

test('the brief and the hub prompts promise only what the pipeline does', () => {
  assert.ok(!/runners-up|Variant B|root station|root-station|crown landing|crown-landing|two stages|markers move/i.test(P.BRIEF));
  assert.match(P.PROMPTS.hub, /fallen leaf/, 'the scale-cue leaf lives in the hub background');
  assert.match(P.PROMPTS['hub-fg'], /lower half of the frame[^.]*empty/);
  assert.ok(!/root hump|bottom left corner a low/.test(P.PROMPTS['hub-fg']));
  assert.match(P.PROMPTS.hub, /sign will stand in front/);
});

test('log lines are allowlisted, scrubbed of personal markers, free of absolute paths and blocked on forbidden words', async () => {
  const entry = { ts: 't', key: 'hub', provider: 'mock', model: 'm', prompt_sha256: 'h', seed: 1, size: '1x1', hash16: 'x', status: 'failed', error: `ENOENT ${path.join(G.REPO_ROOT, 'work/art/raw')} on hostbox by someuser`, prompt: 'never', extra: 1 };
  const line = G.sanitiseLogEntry(entry, { markers: ['hostbox', 'someuser'], repoRoot: G.REPO_ROOT });
  assert.deepEqual(Object.keys(line), G.LOG_FIELDS);
  assert.equal(line.error, 'ENOENT ./work/art/raw on [redacted] by [redacted]');
  assert.ok(!('prompt' in line) && !('extra' in line));
  assert.throws(() => G.sanitiseLogEntry({ ...entry, error: '/abs/path' }, { markers: [], repoRoot: '/nope' }), /absolute path/);
  const list = G.loadForbidden({ OWL_PARK_FORBIDDEN: 'hostbox' }, tmp('no-tools'));
  const file = tmp('blocked.jsonl');
  await assert.rejects(G.appendLog(file, entry, { forbidden: list, markers: [], repoRoot: G.REPO_ROOT }), /forbidden words/);
  assert.ok(!fs.existsSync(file), 'nothing written when a forbidden word matches');
});

// ---------------------------------------------------------------------------------------------
// Model families: size limits, prices, inline results

test('fitSize keeps every job inside each model family\'s limits and keeps its aspect ratio', () => {
  const inside = (w, h, m) => (!m.minPixels || w * h >= m.minPixels) && (!m.maxPixels || w * h <= m.maxPixels)
    && (!m.minSide || Math.min(w, h) >= m.minSide) && (!m.maxSide || Math.max(w, h) <= m.maxSide);
  for (const [id, m] of Object.entries(G.MODELS)) {
    for (const job of P.JOBS) {
      const { width, height } = G.parseSize(job.size);
      const f = G.fitSize(width, height, m);
      assert.ok(inside(f.width, f.height, m), `${id} ${job.key}: ${f.width}x${f.height} outside the limits`);
      assert.ok(Math.abs(f.width / f.height - width / height) / (width / height) < 0.01, `${id} ${job.key}: aspect drifted`);
      if (!f.scaled) assert.deepEqual([f.width, f.height], [width, height]);
      else assert.equal(f.width % 8 + f.height % 8, 0);
    }
  }
  // The cases that motivated the profiles: 5.0 Pro caps rooms near 2K, 4.5 refuses small images.
  assert.deepEqual(G.fitSize(3200, 1800, G.MODELS['seedream-v5-pro']), { width: 2728, height: 1536, scaled: true });
  assert.deepEqual(G.fitSize(1040, 1248, G.MODELS['seedream-v5-pro']), { width: 1040, height: 1248, scaled: false });
  const owl45 = G.fitSize(1040, 1248, G.MODELS['seedream-v4.5']);
  assert.ok(owl45.scaled && owl45.width * owl45.height >= 2560 * 1440);
  assert.deepEqual(G.fitSize(3200, 1800, G.MODELS['seedream-v4.5']), { width: 3200, height: 1800, scaled: false });
});

test('config picks the model family from --model, ART_MODEL or the default, and refuses unknown ones', () => {
  assert.equal(G.resolveConfig({}, {}, P.DEFAULTS).model, 'seedream-v5-pro');
  const v45 = G.resolveConfig({}, { ART_MODEL: 'seedream-v4.5' }, P.DEFAULTS);
  assert.equal(v45.fal.endpoint, 'https://queue.fal.run/fal-ai/bytedance/seedream/v4.5/text-to-image');
  assert.equal(v45.fal.editEndpoint, 'https://queue.fal.run/fal-ai/bytedance/seedream/v4.5/edit');
  assert.equal(v45.ark.model, 'seedream-4-5-251128');
  assert.equal(G.resolveConfig({ model: 'seedream-v4' }, { ART_MODEL: 'seedream-v4.5' }, P.DEFAULTS).model, 'seedream-v4');
  assert.equal(G.resolveConfig({}, { FAL_ENDPOINT: 'https://example/x' }, P.DEFAULTS).fal.endpoint, 'https://example/x');
  assert.equal(G.resolveConfig({}, { SEEDREAM_MODEL: 'custom-id' }, P.DEFAULTS).ark.model, 'custom-id');
  assert.throws(() => G.resolveConfig({ model: 'seedream-v9' }, {}, P.DEFAULTS), /unknown model/);
});

test('prices follow the model family, its size tiers and extra references; ART_PRICE_USD overrides', () => {
  const v5 = G.resolveConfig({}, {}, P.DEFAULTS);
  assert.equal(G.priceFor(v5, 'mock', 2728, 1536), 0);
  assert.equal(G.priceFor(v5, 'fal', 1040, 1248), 0.0675);
  assert.equal(G.priceFor(v5, 'fal', 2728, 1536), 0.135);
  assert.equal(G.priceFor(v5, 'fal', 2728, 1536, 3), 0.135 + 2 * 0.0045);
  assert.equal(G.priceFor(v5, 'ark', 2728, 1536, 3), 0.045);
  const v4 = G.resolveConfig({}, { ART_MODEL: 'seedream-v4' }, P.DEFAULTS);
  assert.equal(G.priceFor(v4, 'fal', 3200, 1800), 0.03);
  assert.equal(G.priceFor(G.resolveConfig({}, { ART_PRICE_USD: '0.5' }, P.DEFAULTS), 'fal', 10, 10), 0.5);
  assert.throws(() => G.resolveConfig({}, { ART_PRICE_USD: 'cheap' }, P.DEFAULTS), /ART_PRICE_USD/);
});

test('planned tasks are generated at the fitted size and keep the requested size for the record', () => {
  const cfg = G.resolveConfig({ out: tmp('plan-fit'), provider: 'fal' }, { FAL_KEY: 'k' }, P.DEFAULTS);
  const jobs = G.validateJobs(P.JOBS, { assets: ASSETS, helperKeys: P.HELPER_KEYS ?? [], blocks: P.BLOCKS ?? {} });
  const { tasks } = G.planTasks(jobs.filter((j) => j.key === 'hub'), cfg, { variants: 1 });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].job.size, '2728x1536');
  assert.equal(tasks[0].job.requested_size, '3200x1800');
  assert.deepEqual(tasks[0].req.body.image_size, { width: 2728, height: 1536 });
  assert.equal(tasks[0].priceUsd, 0.135);
});

test('fal sync mode asks for an inline image and an inline result is decoded without a download', async () => {
  const png = tinyPng();
  const cfg = G.resolveConfig({}, { FAL_KEY: 'fk', FAL_POLL_MS: '1', FAL_SYNC_MODE: '1' }, P.DEFAULTS);
  const job = { key: 'hub', kind: 'room', realm: 'hub', size: '2x2', width: 2, height: 2, seed: 3, prompt: 'p', refs: [] };
  const req = G.PROVIDERS.fal.buildRequest(job, cfg, []);
  assert.equal(req.body.sync_mode, true);
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url === req.url) return new Response(JSON.stringify({ request_id: 'q', status_url: 'https://q/s', response_url: 'https://q/r' }), { status: 200 });
    if (url === 'https://q/s') return new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 });
    if (url === 'https://q/r') return new Response(JSON.stringify({ images: [{ url: `data:image/png;base64,${png.toString('base64')}`, width: 2, height: 2 }] }), { status: 200 });
    throw new Error(`unexpected ${url}`);
  };
  const res = await G.PROVIDERS.fal.generate(req, { job, cfg, refs: [], http: { fetchImpl, retries: 0, timeoutMs: 1000, sleep: async () => {} } });
  assert.ok(res.bytes.equals(png));
  assert.equal(res.sourceUrl, null, 'an inline image has no source URL to record');
  assert.equal(urls.length, 3, 'no CDN download');
  assert.equal(G.decodeDataUrl('https://x/y.png'), null);
  assert.throws(() => G.decodeDataUrl('data:image/png,notbase64'), /base64/);
});

test('the models command lists every family and marks the selected one', () => {
  const r = spawnSync(process.execPath, [GEN, 'models', '--model', 'seedream-v4.5'], { encoding: 'utf8', env: { ...process.env } });
  assert.equal(r.status, 0, r.stderr);
  for (const id of Object.keys(G.MODELS)) assert.ok(r.stdout.includes(id), id);
  assert.match(r.stdout, /seedream-v4\.5 \*/);
});
