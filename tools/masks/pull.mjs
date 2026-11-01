#!/usr/bin/env node
/**
 * The ledge painter's draft as room data (OP-156): fetches a tree room's saved draft from the park
 * (GET /api/masks/<room>, which anyone may read) and prints its ledges as treeLedge(...) lines to
 * paste into the room's perches in packages/shared/rooms/index.ts and its fronts as lines to paste
 * into the room's fronts there (OP-173: shapes drawn over the owls), its walls and hazards as JSON
 * (the game has no place for those yet), and what differs from the room's ledges and fronts as the
 * tree has them now. It prints and writes nothing: a ledge or a front becomes the park's in a pull
 * request.
 *
 *   pnpm masks:pull <room> [--base <url>]
 *
 * The park is --base, else PARK_BASE, else a park on this machine (http://localhost:8787, `pnpm
 * dev:edge`). The draft is checked as the park checks it (checkMasks), so what is printed fits.
 * Node strips the shared package's types (22.18 and later); the chaos harness's module hook finds its
 * imports without an extension.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

register(new URL('../chaos/lib/ts-hooks.mjs', import.meta.url));
const SHARED = new URL('../../packages/shared/', import.meta.url);
export const { roomFor } = await import(new URL('rooms/index.ts', SHARED).href);
export const { checkMasks, frontsOf, isPaintable, ledgesOf } = await import(new URL('src/masks.ts', SHARED).href);
const { ROOM_W } = await import(new URL('src/room.ts', SHARED).href);

export const DEFAULT_BASE = 'http://localhost:8787';
const ROOM_ID = /^[a-z0-9-]{1,32}$/;

const USAGE = `usage: pnpm masks:pull <room> [--base <url>]

Prints the ledge draft a keeper saved for a room of the tree as room data. The park is --base,
else PARK_BASE, else ${DEFAULT_BASE}. Writes no file.`;

/** A room x as the room data writes it: its screen's offset (`2 * ROOM_W + `) and the rest, against the screen of `from`. */
export function roomX(x, from = x) {
  const screen = Math.max(0, Math.floor(from / ROOM_W));
  const rest = x - screen * ROOM_W;
  return screen === 0 ? `${rest}` : `${screen === 1 ? '' : `${screen} * `}ROOM_W + ${rest}`;
}

/** A ledge as a line of the room's perches, both ends against the screen it starts on. */
export function ledgeLine(l) {
  return `treeLedge('${l.id}', ${roomX(l.x0)}, ${roomX(l.x1, l.x0)}, ${l.top}),`;
}

/**
 * A front as a line of the room's fronts: each point [x, y], x against the screen its leftmost point is
 * on; `raised` (the room's own flag for a front of that id, which a draft cannot carry) kept.
 */
export function frontLine(f, raised = false) {
  const from = Math.min(...f.points.map((p) => p.x));
  return `{ id: '${f.id}',${raised ? ' raised: true,' : ''} poly: pts(${f.points.map((p) => `[${roomX(p.x, from)}, ${p.y}]`).join(', ')}) },`;
}

/** What differs between the room's ledges now and the draft's, by id. */
export function ledgeDiff(now, drafted) {
  const was = new Map(now.map((l) => [l.id, l]));
  const is = new Map(drafted.map((l) => [l.id, l]));
  const added = drafted.filter((l) => !was.has(l.id)).map((l) => l.id);
  const removed = now.filter((l) => !is.has(l.id)).map((l) => l.id);
  const changed = [];
  let same = 0;
  for (const l of drafted) {
    const o = was.get(l.id);
    if (!o) continue;
    const moves = ['x0', 'x1', 'top'].filter((k) => o[k] !== l[k]).map((k) => `${k} ${o[k]} -> ${l[k]}`);
    if (moves.length) changed.push(`${l.id} (${moves.join(', ')})`);
    else same += 1;
  }
  return { added, removed, changed, same };
}

/** What differs between the room's fronts now and the draft's, by id: a front is changed when it has more or fewer points, or any of them moved. */
export function frontDiff(now, drafted) {
  const was = new Map(now.map((f) => [f.id, f]));
  const is = new Set(drafted.map((f) => f.id));
  const added = drafted.filter((f) => !was.has(f.id)).map((f) => f.id);
  const removed = now.filter((f) => !is.has(f.id)).map((f) => f.id);
  const changed = [];
  let same = 0;
  for (const f of drafted) {
    const o = was.get(f.id);
    if (!o) continue;
    const moved = f.points.filter((p, i) => p.x !== o.points[i]?.x || p.y !== o.points[i]?.y).length;
    if (o.points.length !== f.points.length) changed.push(`${f.id} (${o.points.length} -> ${f.points.length} points)`);
    else if (moved) changed.push(`${f.id} (${moved} of ${f.points.length} points moved)`);
    else same += 1;
  }
  return { added, removed, changed, same };
}

/** The summary line of a diff. */
export function diffWords(d) {
  const list = (ids) => (ids.length ? `: ${ids.join(', ')}` : '');
  return [`${d.added.length} added${list(d.added)}`, `${d.removed.length} removed${list(d.removed)}`, `${d.changed.length} changed${list(d.changed)}`, `${d.same} the same`].join('; ');
}

/** The printout for a saved draft of `room` (its RoomDef) read from `base`. */
export function printout(room, saved, base) {
  const when = new Date(saved.savedAt).toISOString().replace('T', ' ').slice(0, 16);
  const json = (v) => JSON.stringify(v, null, 2);
  const raised = new Set((room.fronts ?? []).filter((f) => f.raised).map((f) => f.id));
  return [
    `// ${room.id}: the ledge draft saved ${when} UTC, from ${base}`,
    `// Ledges (${saved.ledges.length}), for the room's perches in packages/shared/rooms/index.ts:`,
    ...saved.ledges.map(ledgeLine),
    '',
    `// Fronts (${saved.fronts.length}), for the room's fronts there (drawn over the owls):`,
    ...saved.fronts.map((f) => frontLine(f, raised.has(f.id))),
    '',
    `// Walls (${saved.walls.length}):`,
    json(saved.walls),
    `// Hazards (${saved.hazards.length}):`,
    json(saved.hazards),
    '',
    `// Against ${room.id}'s ledges now: ${diffWords(ledgeDiff(ledgesOf(room), saved.ledges))}.`,
    `// Against ${room.id}'s fronts now: ${diffWords(frontDiff(frontsOf(room), saved.fronts))}.`,
  ].join('\n');
}

export async function main(argv = process.argv.slice(2), { env = process.env, stdout = process.stdout, stderr = process.stderr, fetchImpl = globalThis.fetch, roomOf = roomFor } = {}) {
  const out = (s) => stdout.write(`${s}\n`);
  const err = (s) => stderr.write(`${s}\n`);
  let parsed;
  try {
    // `pnpm run script -- --flag` forwards the `--` itself.
    parsed = parseArgs({ args: argv[0] === '--' ? argv.slice(1) : argv, allowPositionals: true, options: { base: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
  } catch (e) {
    err(e.message);
    err(USAGE);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    out(USAGE);
    return 0;
  }
  const id = positionals[0];
  if (positionals.length !== 1 || !ROOM_ID.test(id)) {
    err(USAGE);
    return 2;
  }
  const room = roomOf(id);
  if (!isPaintable(room)) {
    err(`${id} is not a room of the tree: the painter keeps drafts for the tree's rooms only.`);
    return 2;
  }
  const base = (values.base ?? env.PARK_BASE ?? DEFAULT_BASE).replace(/\/+$/, '');
  let res;
  try {
    res = await fetchImpl(`${base}/api/masks/${id}`, { headers: { Accept: 'application/json' } });
  } catch (e) {
    err(`The park at ${base} did not answer (${e?.message ?? e}).`);
    return 1;
  }
  if (res.status === 404) {
    err(`No draft is saved for ${id} at ${base}.`);
    return 1;
  }
  if (!res.ok) {
    err(`The park at ${base} answered ${res.status}.`);
    return 1;
  }
  const body = await res.json().catch(() => null);
  const checked = body && typeof body === 'object' ? checkMasks({ ledges: body.ledges, walls: body.walls, hazards: body.hazards, fronts: body.fronts }, room.size) : { ok: false, reason: 'body' };
  if (!checked.ok || body.room !== id || typeof body.savedAt !== 'number') {
    err(`What the park at ${base} gave for ${id} is not a draft that fits the room${checked.ok ? '' : ` (${checked.reason}${checked.list ? ` in ${checked.list}` : ''})`}.`);
    return 1;
  }
  out(printout(room, { ...checked.draft, savedAt: body.savedAt }, base));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
