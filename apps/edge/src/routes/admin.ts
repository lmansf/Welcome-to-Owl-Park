/** The keepers' routes (the admin key) and their pages under /admin/*. */
import { type Logger, NIGHTS, SOURCES, type Source, isClimbRef, isVariantId } from '@owl-park/shared';
import { GATED_ROOMS } from '@owl-park/shared/rooms';
import type { OverflowState } from '../Overflow';
import { copiesIn, roomObjectNames } from '../copies';
import type { Env } from '../env';
import { gateMode } from '../gate';
import { type GateSet, forgetGate, gateFrom } from '../gateSwitch';
import { passLinkReady, storeCatalogue } from '../opening';
import { forgetOverflow } from '../overflowState';
import { EXPORTED_OBJECTS, EXPORT_KINDS, type ExportKind, bucketOf, copierOf, exportPark, isDay, lastExport } from '../parkExport';
import { KEEPER_TTL_S, isCollectorId, mintKeeper, requireSecret } from '../pass';
import { ROOMS, roomCap } from '../rooms';
import { KINDS, type TicketLine } from '../shopify';
import { storeCheck } from '../storeApi';
import { claimLink } from '../storeHooks';
import { DEFAULT_LENGTH_MS, HOUR_MS, LIFETIME_MS, OPENING_NIGHT_MS, type TicketKind, windowed } from '../tickets';
import { CORS, isAdmin, json, readJson } from './http';
import { collections, deskOf, objectFor, overflow, overflowOf, readGate, readOverflow, votes } from './park';
import type { RouteCtx } from './router';

/**
 * The park's nightly restart (OP-181), on its cron or a keeper's word: the vote ledger keeps when it
 * was, so no pass from before it goes past the turnstiles while the gate takes tickets; then every
 * room object tells its owls and, a moment later, sends them all to the home screen. Each room
 * object logs its own line; this logs one for the park. Should the ledger not keep the time, the
 * rooms restart all the same (the pages drop their passes as they go home).
 */
export async function restartPark(env: Env, log: Logger, by: 'cron' | 'key'): Promise<{ restartAt: number | null; objects: number; missed: number; owls: number }> {
  let restartAt: number | null = null;
  try {
    const r = await votes(env).fetch('https://park/restart', { method: 'POST' });
    if (!r.ok) throw new Error(`the vote ledger answered ${r.status}`);
    const at = ((await r.json()) as { restartAt?: unknown }).restartAt;
    if (typeof at !== 'number') throw new Error('the vote ledger did not say when the park restarted');
    restartAt = at;
  } catch (e) {
    log.error('worker', 'write_failed', 'The nightly restart’s time was not kept: passes from before it still go past the turnstiles. The rooms restart all the same.', { by, error: e });
  }
  forgetGate();
  const copies = await overflowOf(env)
    .then((o) => o.copies)
    .catch((e: unknown) => {
      log.error('overflow', 'read_failed', 'The overflow object did not say which copies of rooms are open: only the rooms themselves restart.', { error: e });
      return {};
    });
  const names = roomObjectNames(env.ROOM_SHARDING, Object.keys(ROOMS), copies);
  const told = await Promise.all(
    names.map(async (name) => {
      try {
        const r = await env.ROOMS.get(env.ROOMS.idFromName(name)).fetch('https://park/restart', { method: 'POST' });
        if (!r.ok) throw new Error(`the room object answered ${r.status}`);
        const owls = ((await r.json()) as { owls?: unknown }).owls;
        return typeof owls === 'number' ? owls : 0;
      } catch (e) {
        log.error('worker', 'send_failed', 'A room object was not told of the nightly restart: its owls stay until they leave.', { object: name, by, error: e });
        return null;
      }
    }),
  );
  const missed = told.filter((n) => n === null).length;
  const owls = told.reduce<number>((a, n) => a + (n ?? 0), 0);
  const fields = { by, objects: names.length, missed, owls, ...(restartAt !== null ? { restart_at: new Date(restartAt).toISOString() } : {}) };
  if (missed) log.warn('worker', 'park_restart', 'The park restarted for the night, but not every room object was told.', fields);
  else log.info('worker', 'park_restart', 'The park restarted for the night: every room object sends its owls to the home screen.', fields);
  return { restartAt, objects: names.length, missed, owls };
}

/** One ticket line for tickets the park gives away or tests with (no store order); null when it does not add up. */
export function compLine(body: Record<string, unknown>): TicketLine | null {
  const kind = body['kind'] as TicketKind;
  const quantity = body['quantity'] === undefined ? 1 : Number(body['quantity']);
  const hours = body['hours'] === undefined ? null : Number(body['hours']);
  if (!KINDS.includes(kind) || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) return null;
  if (hours !== null && !(hours > 0 && hours <= 24 * 366)) return null;
  // A pass that never runs out (OP-171): one annual pass, with no hours of its own.
  const forever = body['lifetime'] === undefined ? false : body['lifetime'];
  if (forever !== false && (forever !== true || kind !== 'annual' || hours !== null || quantity !== 1)) return null;
  if (forever) return { line: '1', quantity, kind, lengthMs: LIFETIME_MS, validFrom: null, validUntil: null };
  const from = typeof body['from'] === 'string' ? Date.parse(body['from']) : NaN;
  // Opening night lasts its 24 hours unless an end is given.
  const until = typeof body['until'] === 'string' ? Date.parse(body['until']) : kind === 'opening-night' ? from + OPENING_NIGHT_MS : NaN;
  if (windowed(kind) && !(until > from)) return null;
  const lengthMs = hours !== null ? Math.round(hours * HOUR_MS) : DEFAULT_LENGTH_MS[kind];
  if (!windowed(kind) && lengthMs === null) return null;
  return { line: '1', quantity, kind, lengthMs, validFrom: windowed(kind) ? from : null, validUntil: windowed(kind) ? until : null };
}

/** A room's owls copy by copy, for the keepers' capacity page. */
export async function roomsNow(env: Env, copies: OverflowState['copies']) {
  const single = env.ROOM_SHARDING !== 'room' ? ((await (await objectFor(env, 'hub').fetch('https://park/counts')).json()) as Record<string, number>) : null;
  return Promise.all(
    Object.keys(ROOMS).map(async (room) => {
      const { open, draining } = copiesIn(copies, room);
      const list: Array<{ n: number; state: 'room' | 'open' | 'draining' }> = [{ n: 1, state: 'room' }, ...open.map((n) => ({ n, state: 'open' as const })), ...draining.map((n) => ({ n, state: 'draining' as const }))];
      const withCounts = await Promise.all(
        list.map(async (c) => {
          if (single) return { ...c, count: single[room] ?? 0 };
          const r = await objectFor(env, room, c.n).fetch('https://park/counts');
          return { ...c, count: ((await r.json()) as Record<string, number>)[room] ?? 0 };
        }),
      );
      return { room, cap: roomCap(env, room), copies: withCounts };
    }),
  );
}

// ---- Whether a key is the keepers' (the position overlay asks before it shows, OP-138) ----
export async function adminPing(c: RouteCtx): Promise<Response> {
  const { request, env, log } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'GET' || !isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
  return json({ ok: true });
}

// ---- A keeper's token: this tab's owl walks the tree (map 2) while it is dark (OP-156) ----
export async function adminKeeper(c: RouteCtx): Promise<Response> {
  const { request, env, url, log } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST' || !isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
  return json({ token: await mintKeeper(requireSecret(env, url)), ttl: KEEPER_TTL_S });
}

// ---- Collectibles (the collector comes from the pass) ----
export async function adminGrant(c: RouteCtx): Promise<Response> {
  const { request, env, log } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST' || !isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
  const body = await readJson(request);
  const source = (body?.['source'] ?? 'granted') as Source;
  if (!body || !isCollectorId(body['cid']) || !isVariantId(body['variant']) || !SOURCES.includes(source)) return json({ error: 'bad request' }, 400);
  return json(await collections(env).grant(body['cid'], body['variant'], source));
}

// ---- The stained-glass climb: a run by the reference a visitor quotes (never a collector id) ----
export async function adminClimb(c: RouteCtx): Promise<Response> {
  const { request, env, url, log } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'GET' || !isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
  const ref = url.searchParams.get('ref');
  if (!isClimbRef(ref)) return json({ error: 'bad request' }, 400);
  const found = await collections(env).climbLookup(ref);
  return found ? json(found) : json({ error: 'not found' }, 404);
}

export async function adminCollectLog(c: RouteCtx): Promise<Response> {
  const { request, env, log } = c;
  // The collection log (OP-107): GET says whether it is set up and how many rows wait to be sent;
  // POST queues every collectible the collections hold now, once (the backfill).
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (!isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
  if (request.method === 'GET') return json(await collections(env).logState());
  if (request.method === 'POST') return json(await collections(env).backfillLog());
  return json({ error: 'not found' }, 404);
}

export async function adminStore(c: RouteCtx): Promise<Response> {
  const { request, env, log } = c;
  // The owner's check of the store setup: which of its secrets are set (never their values),
  // whether the app signs in, the scopes it still lacks, and whether it may read orders.
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'GET' || !isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
  return json(await storeCheck(env));
}

export async function adminTickets(c: RouteCtx): Promise<Response> {
  const { request, env, url, log } = c;
  // Tickets the park gives away or tests with: no store order behind them, so nothing is copied to the store.
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST' || !isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
  const line = compLine((await readJson(request)) ?? {});
  if (!line) return json({ error: 'bad request' }, 400);
  const order = `comp-${crypto.randomUUID().slice(0, 13)}`;
  const r = await deskOf(env)('/tickets/issue', { order, lines: [line], held: false });
  if (r.status !== 200) return json(r.body, r.status);
  return json({ order, tickets: r.body['tickets'], link: claimLink(url.origin, r.body['claim'] as string) });
}

// ---- Opening night's count for the keepers (C42): order numbers and ticket IDs only ----
export async function adminOpening(c: RouteCtx): Promise<Response> {
  const { request, env, url, log } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'GET' || !isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
  if (url.searchParams.has('csv')) {
    const r = await deskOf(env)('/tickets/opening?csv');
    if (r.status !== 200) return json(r.body, r.status);
    return new Response(r.body['csv'] as string, { headers: { ...CORS, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="owl-park-opening-night.csv"' } });
  }
  const [r, catalogue] = await Promise.all([deskOf(env)('/tickets/opening'), storeCatalogue(env)]);
  if (r.status !== 200) return json(r.body, r.status);
  return json({ counts: r.body['counts'], window: catalogue?.opening ?? null, link: passLinkReady(env, catalogue) });
}

// ---- The opening switch (OP-067): the front gate open to everyone, or taking tickets, with no deploy ----
export async function adminGate(c: RouteCtx): Promise<Response> {
  const { request, env, log } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (!isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
  const deployed = gateMode(env.GATE);
  if (request.method === 'POST') {
    const mode = (await readJson(request))?.['mode'];
    if (mode !== 'open' && mode !== 'ticket' && mode !== 'deployed') return json({ error: 'bad request' }, 400);
    const r = await votes(env).fetch('https://park/gate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: mode === 'deployed' ? null : mode }) });
    if (!r.ok) {
      log.error('worker.admin', 'write_failed', 'The opening switch did not take: the vote ledger refused it.', { status: r.status });
      return json({ error: 'the switch did not take' }, 502);
    }
    forgetGate();
    const set = ((await r.json()) as { gate: GateSet }).gate;
    const { mode: switched, closedAt } = gateFrom(set, env.GATE);
    log.info('worker.admin', 'gate_switched', 'The opening switch was changed.', { gate: switched, by: set ? 'switch' : 'deployed' });
    return json({ mode: switched, closedAt, set, deployed });
  }
  if (request.method !== 'GET') return json({ error: 'not found' }, 404);
  const { set } = await readGate(env);
  const { mode, closedAt } = gateFrom(set, env.GATE);
  return json({ mode, closedAt, set, deployed });
}

// ---- The nightly restart (OP-181) by hand, to try it on staging: the same as its cron ----
export async function adminRestart(c: RouteCtx): Promise<Response> {
  const { request, env, log } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST' || !isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
  return json(await restartPark(env, log, 'key'));
}

// ---- The weekly export (OP-185): the last one, one now, and a file loaded back into a fresh object ----
export async function adminExport(c: RouteCtx): Promise<Response> {
  const { request, env, log } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (!isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
  const bucket = bucketOf(env);
  if (request.method === 'POST') {
    const done = await exportPark(env, log, 'key');
    return done ? json(done) : json({ error: 'no bucket' }, 503);
  }
  if (request.method !== 'GET') return json({ error: 'not found' }, 404);
  if (!bucket) {
    log.warn('worker.admin', 'park_export_skipped', 'The last export was asked for, but the Worker has no PARK_EXPORTS bucket bound.', { by: 'key', reason: 'no-bucket' });
    return json({ error: 'no bucket' }, 503);
  }
  return json(await lastExport(bucket));
}

/** A restore's refusal as the keepers' route answers it. */
const RESTORE_STATUS = { 'no-bucket': 503, 'no-file': 404, 'bad-file': 422, 'not-empty': 409 } as const;

export async function adminRestore(c: RouteCtx): Promise<Response> {
  const { request, env, log } = c;
  // {kind, date, force?}: that day's file for the object of that kind, loaded back into it. Refused
  // while the object holds records, unless force is true: then what it holds is replaced by the file.
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST' || !isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
  const body = await readJson(request);
  const kind = body?.['kind'] as ExportKind;
  const date = body?.['date'];
  const force = body?.['force'] ?? false;
  if (!EXPORT_KINDS.includes(kind) || !isDay(date) || typeof force !== 'boolean') return json({ error: 'bad request', kinds: EXPORT_KINDS }, 400);
  const name = EXPORTED_OBJECTS.find((o) => o.kind === kind)!.name;
  const r = await copierOf(env, kind, name).restoreCopy({ kind, name, date }, force);
  if (!r.ok) {
    log.warn('worker.admin', 'park_restore_refused', 'A restore was refused: the object is as it was.', { object: `${kind}:${name}`, date, force, reason: r.reason, ...(r.rows !== undefined ? { rows: r.rows } : {}) });
    return json(r, RESTORE_STATUS[r.reason]);
  }
  // The Worker's own copies of what the object keeps: read afresh.
  if (kind === 'overflow') forgetOverflow();
  if (kind === 'votes') forgetGate();
  log.info('worker.admin', 'park_restore', 'An export was loaded back into its object.', { object: `${kind}:${name}`, date, force, tables: r.tables, rows: r.rows, skipped: r.skipped.length });
  return json(r);
}

export async function adminCapacity(c: RouteCtx): Promise<Response> {
  const { request, env, log } = c;
  // The keepers' busy-night controls: read them (with every room's owls, copy by copy), or change one.
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (!isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
  let st: OverflowState;
  if (request.method === 'POST') {
    const body = await readJson(request);
    if (!body) return json({ error: 'bad request' }, 400);
    const r = await overflow(env).fetch('https://park/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) {
      log.warn('worker.admin', 'write_failed', 'A change to the busy-night settings did not take.', { status: r.status });
      return json(await r.json().catch(() => ({ error: 'the change did not take' })), r.status);
    }
    forgetOverflow();
    st = (await r.json()) as OverflowState;
    log.info('worker.admin', 'capacity_set', 'The busy-night settings were changed.', { line: st.line.mode, threshold: st.line.threshold, ribbon: st.ribbon.on, copies: st.copies, realms: st.realms.open });
  } else if (request.method === 'GET') {
    st = await readOverflow(env);
  } else return json({ error: 'not found' }, 404);
  // The realms switch's choices (the stained-glass climb): the gated rooms and the nights the keepers may name.
  const [rooms, clientErrors] = await Promise.all([
    roomsNow(env, st.copies),
    overflow(env).fetch('https://park/client-error').then(async (r) => {
      if (!r.ok) throw new Error(`counter returned ${r.status}`);
      return ((await r.json()) as { count: number }).count;
    }).catch((e: unknown) => {
      log.warn('worker.admin', 'read_failed', 'The browser error counter did not answer.', { error: e });
      return null;
    }),
  ]);
  return json({ ...st, sharding: env.ROOM_SHARDING === 'room' ? 'room' : 'single', rooms, gated: GATED_ROOMS, nights: Object.keys(NIGHTS), clientErrors24h: clientErrors });
}
