/**
 * The Worker: serves the built client as static assets, mints guest passes and collector
 * tokens, answers the collection, shop, furniture gift and ticket API, keeps visitors' feedback for
 * the keepers' page, takes the store's webhooks, and upgrades /ws/<room> to a WebSocket held by the
 * park's Durable Object (where quests, NPC owls, leaf piles and the nests live).
 */
import { CLOSE, RIBBON_WORDS, isTimeZone, isVariantId, parseFeedback, waitMinutes, type LineStatus } from '@owl-park/shared';
import { SOURCES, type Source } from '@owl-park/shared';
import { capacityPage } from './capacityPage';
import { copiesIn, copyObjectName, pickCopy } from './copies';
import type { LineAnswer, OverflowState } from './Overflow';
import { countIn, countedOneMore, forgetOverflow, overflowNow } from './overflowState';
import { FEEDBACK_STATUSES, type FeedbackStatus } from './feedbackBox';
import { feedbackPage } from './feedbackPage';
import { walletVoter } from './Ledger';
import { openingOn, passLinkReady, storeCatalogue } from './opening';
import { openingPage } from './openingPage';
import { GUEST_PASS_TTL_S, isCollectorId, mintCollector, mintEntry, mintPass, randomCollectorId, randomVisitorId, signingSecret, verifyCollector, verifyEntry, verifyPass, type PassPayload } from './pass';
import { admitted, gateMode, mayEnter } from './gate';
import { forgetGate, gateFrom, gateNow, type GateSet } from './gateSwitch';
import { gatePage } from './gatePage';
import { health } from './health';
import { isPage, uncachedPage } from './page';
import { ROOMS, isRoomId, roomCap } from './rooms';
import { KINDS, passCartLink, webhookSigned, type TicketLine } from './shopify';
import { storeCheck, storeConfig, type TicketMirror } from './storeApi';
import { claimLink, mirrorTickets, refundHeld, releaseDue, releaseHeld, storeWebhook, type Desk, type HookDeps } from './storeHooks';
import { fraudConfig } from './fraudLink';
import { holdsPage } from './holdsPage';
import { DEFAULT_LENGTH_MS, HOUR_MS, OPENING_NIGHT_MS, windowed, type TicketKind } from './tickets';
import type { Env } from './env';

export { RoomObject } from './RoomObject';
export { VoteLedger } from './VoteLedger';
export { Collections } from './Collections';
export { Overflow } from './Overflow';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key, X-Collector',
  'Cache-Control': 'no-store',
};

function votes(env: Env): DurableObjectStub {
  return env.VOTES.get(env.VOTES.idFromName('park'));
}

function collections(env: Env) {
  return env.COLLECTIONS.getByName('park');
}

/** The overflow object (OP-075): the line, the busy ribbon and copies of rooms. */
function overflow(env: Env): DurableObjectStub {
  return env.OVERFLOW.get(env.OVERFLOW.idFromName('park'));
}

async function readOverflow(env: Env): Promise<OverflowState> {
  const r = await overflow(env).fetch('https://park/state');
  if (!r.ok) throw new Error(`the overflow object answered ${r.status}`);
  return (await r.json()) as OverflowState;
}

/** The busy-night settings as the Worker serves them: read at most every few seconds. */
const overflowOf = (env: Env) => overflowNow(() => readOverflow(env));

/** Who an entry or a place in the line belongs to: the browser's collector, or the pass's visitor. */
const whoOf = (pass: PassPayload) => pass.cid ?? pass.id;

/** How long a turned-away socket waits for the page's hello before it is closed anyway. */
const TURN_AWAY_WAIT_MS = 5_000;

/**
 * A socket the line turns away (OP-075): opened, then closed with the line's code, so the page learns
 * why (a refused handshake says nothing). It is closed once the page has spoken (its hello), when the
 * page surely holds its end: closed before that, the connection is lost instead of closed, and the
 * runtime reports an uncaught error for every owl turned away.
 */
function turnedAway(ctx: ExecutionContext, code: number, reason: string): Response {
  const pair = new WebSocketPair();
  const [client, server] = [pair[0], pair[1]];
  server.accept();
  ctx.waitUntil(
    new Promise<void>((done) => {
      const timer = setTimeout(close, TURN_AWAY_WAIT_MS);
      function close() {
        clearTimeout(timer);
        try {
          server.close(code, reason);
        } catch {
          /* closed already */
        }
        done();
      }
      server.addEventListener('message', close);
      server.addEventListener('close', close);
      server.addEventListener('error', close);
    }),
  );
  return new Response(null, { status: 101, webSocket: client });
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

/** A feedback request body is a few lines of words: anything past this is refused unread. */
const FEEDBACK_BODY_MAX = 16_384;

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = (await request.json()) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isAdmin(request: Request, env: Env): boolean {
  const key = env.ADMIN_KEY;
  const given = request.headers.get('X-Admin-Key') ?? '';
  return !!key && key.length >= 16 && given === key;
}

/** The pass from the Authorization header (Bearer) or the query string. */
async function passFrom(request: Request, env: Env) {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : new URL(request.url).searchParams.get('pass');
  return verifyPass(signingSecret(env), token);
}

/** The opening switch as the vote ledger keeps it (OP-067). */
async function readGate(env: Env): Promise<GateSet> {
  const r = await votes(env).fetch('https://park/gate');
  if (!r.ok) throw new Error(`the vote ledger answered ${r.status}`);
  return ((await r.json()) as { gate: GateSet }).gate;
}

/** The front gate now: the opening switch, or GATE where the switch was never set. */
const gateOf = (env: Env) => gateNow(() => readGate(env), env.GATE);

/** The ticket book's internal routes in the vote ledger's object (`ticketDesk.ts`). */
function deskOf(env: Env): Desk {
  const stub = votes(env);
  return async (path, body) => {
    const r = await stub.fetch(`https://park${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  };
}

/** What the store webhooks need, once the store is set up; null until then. */
function storeDeps(env: Env, origin: string, ctx?: ExecutionContext): HookDeps | null {
  const store = storeConfig(env);
  const fraud = fraudConfig(env);
  return store
    ? {
        store,
        desk: deskOf(env),
        claimUrl: (secret) => claimLink(origin, secret),
        origin,
        ...(env.OPENING_PASS_CODE ? { openingCode: env.OPENING_PASS_CODE } : {}),
        ...(fraud ? { fraud } : {}),
        ...(ctx ? { later: (work: Promise<unknown>) => ctx.waitUntil(work) } : {}),
      }
    : null;
}

/** Brings the store's copy of a ticket (or of an order's tickets) up to date after answering. */
function mirrorLater(ctx: ExecutionContext, env: Env, origin: string, which: { id: string } | { order: string }): void {
  const deps = storeDeps(env, origin);
  if (!deps) return;
  ctx.waitUntil(
    (async () => {
      const r = await deps.desk('/tickets/mirror', which);
      if (r.status === 200) await mirrorTickets(deps, r.body['tickets'] as TicketMirror[], 'order' in which);
    })().catch((e: unknown) => console.error('[owl-park] store copy of tickets failed:', e instanceof Error ? e.message : e)),
  );
}

/** One ticket line for tickets the park gives away or tests with (no store order); null when it does not add up. */
function compLine(body: Record<string, unknown>): TicketLine | null {
  const kind = body['kind'] as TicketKind;
  const quantity = body['quantity'] === undefined ? 1 : Number(body['quantity']);
  const hours = body['hours'] === undefined ? null : Number(body['hours']);
  if (!KINDS.includes(kind) || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) return null;
  if (hours !== null && !(hours > 0 && hours <= 24 * 366)) return null;
  const from = typeof body['from'] === 'string' ? Date.parse(body['from']) : NaN;
  // Opening night lasts its 24 hours unless an end is given.
  const until = typeof body['until'] === 'string' ? Date.parse(body['until']) : kind === 'opening-night' ? from + OPENING_NIGHT_MS : NaN;
  if (windowed(kind) && !(until > from)) return null;
  const lengthMs = hours !== null ? Math.round(hours * HOUR_MS) : DEFAULT_LENGTH_MS[kind];
  if (!windowed(kind) && lengthMs === null) return null;
  return { line: '1', quantity, kind, lengthMs, validFrom: windowed(kind) ? from : null, validUntil: windowed(kind) ? until : null };
}

/** The hourly cron in wrangler.jsonc (the other one closes the Realm Vote's month). */
const HOURLY_CRON = '17 * * * *';

/** The room object for a room (or one of its copies, OP-075): one object for the park, or one per room and copy. */
function objectName(env: Env, roomId: string, copy = 1): string {
  return env.ROOM_SHARDING === 'room' ? copyObjectName(roomId, copy) : 'park';
}

function objectFor(env: Env, roomId: string, copy = 1): DurableObjectStub {
  return env.ROOMS.get(env.ROOMS.idFromName(objectName(env, roomId, copy)));
}

/** Owls in one room object now (kept a moment): what routing to a room's copies weighs. */
function countOf(env: Env, roomId: string, copy: number): Promise<number> {
  const name = objectName(env, roomId, copy);
  return countIn(name, async () => (await (await env.ROOMS.get(env.ROOMS.idFromName(name)).fetch('https://park/counts')).json()) as Record<string, number>);
}

/**
 * The copy of a room a socket goes to (OP-075): with one object per room and copies open, the one
 * it was in while that copy still has a place (`sticky`), or the copy with the most free places.
 */
async function copyFor(env: Env, roomId: string, copies: OverflowState['copies'], sticky: number | null): Promise<number> {
  if (env.ROOM_SHARDING !== 'room' || !Object.hasOwn(ROOMS, roomId)) return 1;
  const { open, draining } = copiesIn(copies, roomId);
  if (!open.length && !draining.length) return 1;
  const asked = [1, ...open, ...(sticky !== null && draining.includes(sticky) ? [sticky] : [])];
  const counts: Record<number, number> = {};
  await Promise.all(asked.map(async (n) => (counts[n] = await countOf(env, roomId, n))));
  return pickCopy(open, draining, counts, roomCap(env, roomId), sticky);
}

/** A room's owls copy by copy, for the keepers' capacity page. */
async function roomsNow(env: Env, copies: OverflowState['copies']) {
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/pass') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      const secret = signingSecret(env);
      // The collector token the browser keeps; a missing or forged one starts a new collection.
      const given = request.headers.get('X-Collector') ?? url.searchParams.get('collector');
      const known = await verifyCollector(secret, given);
      const cid = known ?? randomCollectorId();
      const collector = known && given ? given : await mintCollector(secret, cid);
      const iat = Math.floor(Date.now() / 1000);
      const exp = iat + GUEST_PASS_TTL_S;
      const payload: PassPayload = { id: randomVisitorId(), exp, iat, adm: false, cid };
      const tz = url.searchParams.get('tz');
      if (isTimeZone(tz)) payload.tz = tz;
      const pass = await mintPass(secret, payload);
      // A guest pass opens the lobby; once the park takes tickets only an admitted pass goes further.
      return Response.json({ pass, exp, collector, gate: (await gateOf(env)).mode, adm: payload.adm }, { headers: CORS });
    }

    if (url.pathname === '/api/entry') {
      // The front gate as it is now, for this pass: the booth's words and the turnstiles ask before they act.
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      const pass = await passFrom(request, env);
      if (!pass) return json({ error: 'bad-pass' }, 401);
      return json({ gate: (await gateOf(env)).mode, admitted: pass.adm });
    }

    // ---- Collectibles (the collector comes from the pass) ----
    if (url.pathname === '/api/admin/grant') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (request.method !== 'POST' || !isAdmin(request, env)) return json({ error: 'forbidden' }, 403);
      const body = await readJson(request);
      const source = (body?.['source'] ?? 'granted') as Source;
      if (!body || !isCollectorId(body['cid']) || !isVariantId(body['variant']) || !SOURCES.includes(source)) return json({ error: 'bad request' }, 400);
      return json(await collections(env).grant(body['cid'], body['variant'], source));
    }
    if (url.pathname === '/api/admin/store') {
      // The owner's check of the store setup: which of its secrets are set (never their values),
      // whether the app signs in, the scopes it still lacks, and whether it may read orders.
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (request.method !== 'GET' || !isAdmin(request, env)) return json({ error: 'forbidden' }, 403);
      return json(await storeCheck(env));
    }
    if (url.pathname === '/api/admin/tickets') {
      // Tickets the park gives away or tests with: no store order behind them, so nothing is copied to the store.
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (request.method !== 'POST' || !isAdmin(request, env)) return json({ error: 'forbidden' }, 403);
      const line = compLine((await readJson(request)) ?? {});
      if (!line) return json({ error: 'bad request' }, 400);
      const order = `comp-${crypto.randomUUID().slice(0, 13)}`;
      const r = await deskOf(env)('/tickets/issue', { order, lines: [line], held: false });
      if (r.status !== 200) return json(r.body, r.status);
      return json({ order, tickets: r.body['tickets'], link: claimLink(url.origin, r.body['claim'] as string) });
    }

    // ---- Feedback: visitors send it with their pass; the keepers read it with the admin key ----
    if (url.pathname === '/api/feedback') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (request.method !== 'POST') return json({ error: 'not found' }, 404);
      const pass = await passFrom(request, env);
      if (!pass) return json({ error: 'bad-pass' }, 401);
      if (!pass.cid) return json({ error: 'no-collector' }, 401);
      // A few lines of words: refuse anything far larger before reading it.
      if (Number(request.headers.get('Content-Length') ?? 0) > FEEDBACK_BODY_MAX) return json({ error: 'too large' }, 413);
      const draft = parseFeedback(await readJson(request));
      if (!draft) return json({ error: 'bad request' }, 400);
      const ua = request.headers.get('User-Agent')?.slice(0, 300) || null;
      const r = await collections(env).addFeedback(pass.cid, draft, ua);
      return json(r, r.ok ? 200 : 429);
    }
    if (url.pathname === '/api/admin/feedback') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (!isAdmin(request, env)) return json({ error: 'forbidden' }, 403);
      const isStatus = (v: unknown): v is FeedbackStatus => typeof v === 'string' && (FEEDBACK_STATUSES as readonly string[]).includes(v);
      if (request.method === 'GET') {
        const status = url.searchParams.get('status') ?? 'open';
        const limit = Number(url.searchParams.get('limit') ?? 100);
        if (status !== 'all' && !isStatus(status)) return json({ error: 'bad request' }, 400);
        return json({ feedback: await collections(env).feedback(status, Number.isFinite(limit) ? limit : 100) });
      }
      if (request.method === 'POST') {
        const body = await readJson(request);
        const id = body?.['id'];
        const status = body?.['status'];
        if (typeof id !== 'number' || !Number.isInteger(id) || !isStatus(status)) return json({ error: 'bad request' }, 400);
        return (await collections(env).setFeedbackStatus(id, status)) ? json({ ok: true }) : json({ error: 'not found' }, 404);
      }
      return json({ error: 'not found' }, 404);
    }
    if (url.pathname === '/admin/feedback') return feedbackPage();

    // ---- Opening night's count for the keepers (C42): order numbers and ticket IDs only ----
    if (url.pathname === '/api/admin/opening') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (request.method !== 'GET' || !isAdmin(request, env)) return json({ error: 'forbidden' }, 403);
      if (url.searchParams.has('csv')) {
        const r = await deskOf(env)('/tickets/opening?csv');
        if (r.status !== 200) return json(r.body, r.status);
        return new Response(r.body['csv'] as string, { headers: { ...CORS, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="owl-park-opening-night.csv"' } });
      }
      const [r, catalogue] = await Promise.all([deskOf(env)('/tickets/opening'), storeCatalogue(env)]);
      if (r.status !== 200) return json(r.body, r.status);
      return json({ counts: r.body['counts'], window: catalogue?.opening ?? null, link: passLinkReady(env, catalogue) });
    }
    if (url.pathname === '/admin/opening') return openingPage();

    // ---- The fraud link (C45): orders held for review, released or refunded by the owner ----
    if (url.pathname === '/api/admin/holds') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (!isAdmin(request, env)) return json({ error: 'forbidden' }, 403);
      if (request.method === 'GET') {
        const r = await deskOf(env)(`/tickets/checks?limit=${Number(url.searchParams.get('limit') ?? 50) || 50}`);
        return json({ ...r.body, on: fraudConfig(env) !== null }, r.status);
      }
      if (request.method !== 'POST') return json({ error: 'not found' }, 404);
      const body = await readJson(request);
      const order = body?.['order'];
      const action = body?.['action'];
      if (typeof order !== 'string' || !/^\d{1,20}$/.test(order) || (action !== 'release' && action !== 'refund')) return json({ error: 'bad request' }, 400);
      const deps = storeDeps(env, url.origin, ctx);
      if (!deps) return json({ error: 'store not set up' }, 503);
      try {
        const r = action === 'release' ? await releaseHeld(deps, order, 'released') : await refundHeld(deps, order);
        if (r.mirror) mirrorLater(ctx, env, url.origin, { order: r.mirror });
        return json(r.body, r.status);
      } catch (e) {
        console.error('[owl-park] the owner could not', action, 'order', order, e instanceof Error ? e.message : e);
        return json({ error: 'the store did not answer; try again' }, 502);
      }
    }
    if (url.pathname === '/admin/holds') return holdsPage();

    // ---- The opening switch (OP-067): the front gate open to everyone, or taking tickets, with no deploy ----
    if (url.pathname === '/api/admin/gate') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (!isAdmin(request, env)) return json({ error: 'forbidden' }, 403);
      const deployed = gateMode(env.GATE);
      if (request.method === 'POST') {
        const mode = (await readJson(request))?.['mode'];
        if (mode !== 'open' && mode !== 'ticket' && mode !== 'deployed') return json({ error: 'bad request' }, 400);
        const r = await votes(env).fetch('https://park/gate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: mode === 'deployed' ? null : mode }) });
        if (!r.ok) return json({ error: 'the switch did not take' }, 502);
        forgetGate();
        const set = ((await r.json()) as { gate: GateSet }).gate;
        console.log(`[owl-park] the opening switch: the gate is now ${gateFrom(set, env.GATE).mode} (${set ? 'set by the switch' : 'as deployed'})`);
        return json({ ...gateFrom(set, env.GATE), set, deployed });
      }
      if (request.method !== 'GET') return json({ error: 'not found' }, 404);
      const set = await readGate(env);
      return json({ ...gateFrom(set, env.GATE), set, deployed });
    }
    if (url.pathname === '/admin/gate') return gatePage();

    // ---- Busy nights (OP-075): the line, the busy ribbon and copies of rooms, with no deploy ----
    if (url.pathname === '/api/line') {
      // A visitor's place in the line: POST takes one (or goes straight in), GET ?n= asks where it stands.
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      const pass = await passFrom(request, env);
      if (!pass) return json({ error: 'bad-pass' }, 401);
      const secret = signingSecret(env);
      const who = whoOf(pass);
      const st = await overflowOf(env);
      const go = async () => json({ state: 'go', entry: await mintEntry(secret, who) } satisfies LineStatus);
      const answer = async (r: Response) => {
        if (!r.ok) return go(); // the line could not be asked: nobody is kept out for that
        const a = (await r.json()) as LineAnswer;
        if (a.state === 'go') return go();
        if (a.state === 'called') return json({ ...a, entry: await mintEntry(secret, who) } satisfies LineStatus);
        return json(a satisfies LineStatus);
      };
      const ask = (path: string, body: Record<string, unknown>) => overflow(env).fetch(`https://park${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, who }) });
      if (!st.active) return go();
      if (request.method === 'POST') {
        // In the park lately (this browser holds an entry): straight back in, no line.
        if (await verifyEntry(secret, (await readJson(request))?.['entry'], who)) return go();
        return answer(await ask('/line/join', {}));
      }
      if (request.method !== 'GET') return json({ error: 'not found' }, 404);
      const n = Number(url.searchParams.get('n'));
      if (!Number.isInteger(n) || n < 1) return json({ error: 'bad request' }, 400);
      // Still waiting when the line was last read: its place is how far its number stands above the
      // line's front, so the many polls of a long line are answered here without asking the line.
      // A number called since, or taken since (above every number waiting then), is asked about.
      const place = n - st.front;
      if (place >= 1 && place <= st.waiting) return json({ state: 'waiting', n, place, waitMin: waitMinutes(place, st.rate) } satisfies LineStatus);
      return answer(await ask('/line/status', { n }));
    }
    if (url.pathname === '/api/notice') {
      // The busy ribbon's words now (null while it is off), for the home screen.
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      return json({ words: (await overflowOf(env)).notice });
    }
    if (url.pathname === '/api/admin/capacity') {
      // The keepers' busy-night controls: read them (with every room's owls, copy by copy), or change one.
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (!isAdmin(request, env)) return json({ error: 'forbidden' }, 403);
      let st: OverflowState;
      if (request.method === 'POST') {
        const body = await readJson(request);
        if (!body) return json({ error: 'bad request' }, 400);
        const r = await overflow(env).fetch('https://park/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!r.ok) return json(await r.json().catch(() => ({ error: 'the change did not take' })), r.status);
        forgetOverflow();
        st = (await r.json()) as OverflowState;
        console.log(`[owl-park] capacity: line ${st.line.mode} at ${st.line.threshold}, ribbon ${st.ribbon.on ? 'on' : 'off'}, copies ${JSON.stringify(st.copies)}`);
      } else if (request.method === 'GET') {
        st = await readOverflow(env);
      } else return json({ error: 'not found' }, 404);
      return json({ ...st, sharding: env.ROOM_SHARDING === 'room' ? 'room' : 'single', rooms: await roomsNow(env, st.copies) });
    }
    if (url.pathname === '/admin/capacity') return capacityPage(RIBBON_WORDS);

    // ---- The store's webhooks (C35): checked against the store's signature before anything is read ----
    if (url.pathname === '/api/store/webhook') {
      if (request.method !== 'POST') return json({ error: 'not found' }, 404);
      const raw = await request.arrayBuffer();
      const signed = await webhookSigned([env.SHOPIFY_WEBHOOK_SECRET, env.SHOPIFY_CLIENT_SECRET], raw, request.headers.get('X-Shopify-Hmac-Sha256'));
      if (!signed) return json({ error: 'bad signature' }, 401);
      const deps = storeDeps(env, url.origin, ctx);
      if (!deps) return json({ error: 'store not set up' }, 503);
      const shop = request.headers.get('X-Shopify-Shop-Domain');
      if (shop && shop !== deps.store.shop) return json({ error: 'not this store' }, 401);
      let payload: unknown;
      try {
        payload = JSON.parse(new TextDecoder().decode(raw));
      } catch {
        return json({ error: 'bad request' }, 400);
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json({ error: 'bad request' }, 400);
      const topic = request.headers.get('X-Shopify-Topic') ?? '';
      try {
        const r = await storeWebhook(topic, payload as Record<string, unknown>, deps);
        if (r.mirror) mirrorLater(ctx, env, url.origin, { order: r.mirror });
        return json(r.body, r.status);
      } catch (e) {
        // The store sends the webhook again later; every step is safe to repeat.
        console.error('[owl-park] store webhook failed:', topic, e instanceof Error ? e.message : e);
        return json({ error: 'try again' }, 500);
      }
    }

    // ---- Tickets (C35): the wallet on this device, the emailed and shared links, and the gate ----
    if (url.pathname === '/api/tickets' || url.pathname.startsWith('/api/tickets/')) {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      const pass = await passFrom(request, env);
      if (!pass) return json({ error: 'bad-pass' }, 401);
      if (!pass.cid) return json({ error: 'no-collector' }, 401);
      // A ticket lives on one device: the collector this browser keeps.
      const device = pass.cid;
      const desk = deskOf(env);
      const reply = (r: { status: number; body: Record<string, unknown> }) => json(r.body, r.status);
      if (url.pathname === '/api/tickets' && request.method === 'GET') {
        const [r, catalogue] = await Promise.all([desk(`/tickets/wallet?device=${encodeURIComponent(device)}`), storeCatalogue(env)]);
        if (r.status !== 200) return reply(r);
        // Opening night (C42): the booth says passes are half price, and a scanned Opening Night
        // Ticket offers its pass only when the park can make the link.
        const ready = passLinkReady(env, catalogue);
        const tickets = (r.body['tickets'] as Array<Record<string, unknown>>).map((t) => (t['freePass'] === 'ready' && !(ready.code && ready.pass) ? { ...t, freePass: undefined } : t));
        return json({ tickets, openingNight: openingOn(catalogue, Date.now()) });
      }
      const body = request.method === 'POST' ? await readJson(request) : null;
      if (!body) return json({ error: 'bad request' }, 400);
      if (url.pathname === '/api/tickets/claim' || url.pathname === '/api/tickets/take') return reply(await desk(url.pathname.slice(4), { secret: body['secret'], device }));
      if (url.pathname === '/api/tickets/share') return reply(await desk('/tickets/share', { id: body['id'], device }));
      if (url.pathname === '/api/tickets/pass') {
        // Opening night's pass (C42, half price): the cart link, for an Opening Night Ticket on this device that went through the gate tonight.
        const r = await desk('/tickets/pass-offer', { id: body['id'], device });
        if (r.status !== 200) return reply(r);
        if (r.body['ok'] !== true) return json(r.body, 409);
        const store = storeConfig(env);
        const code = env.OPENING_PASS_CODE?.trim();
        const variant = (await storeCatalogue(env))?.passVariant;
        if (!store || !code || !variant) return json({ ok: false, reason: 'not-set-up' }, 503);
        return json({ ok: true, url: passCartLink(store.shop, variant, code, body['id'] as string) });
      }
      if (url.pathname === '/api/tickets/scan') {
        const r = await desk('/tickets/scan', body['id'] === undefined ? { device } : { device, id: body['id'] });
        if (r.status !== 200 || r.body['ok'] !== true) return reply(r);
        // Through the gate: the same owl, now admitted by this ticket, until the ticket runs out.
        const tid = r.body['id'] as string;
        const nowS = Math.floor(Date.now() / 1000);
        const until = r.body['validUntil'];
        const exp = Math.min(nowS + GUEST_PASS_TTL_S, typeof until === 'number' ? Math.floor(until / 1000) : Infinity);
        const admittedPass = await mintPass(signingSecret(env), { ...pass, exp, adm: true, tid });
        if (r.body['started'] === true) mirrorLater(ctx, env, url.origin, { id: tid });
        return json({ ...r.body, pass: admittedPass, exp, gate: (await gateOf(env)).mode, adm: true });
      }
      return json({ error: 'not found' }, 404);
    }

    if (url.pathname === '/api/collection' || url.pathname === '/api/shop' || url.pathname === '/api/shop/buy' || url.pathname === '/api/shop/gift') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      const pass = await passFrom(request, env);
      if (!pass) return json({ error: 'bad-pass' }, 401);
      if (!pass.cid) return json({ error: 'no-collector' }, 401);
      // The collection shows anywhere; the shop is inside the park, past the turnstiles.
      if (url.pathname !== '/api/collection' && !admitted(await gateOf(env), pass)) return json({ error: 'tickets-required' }, 403);
      const stub = collections(env);
      if (url.pathname === '/api/collection' && request.method === 'GET') return json(await stub.inventory(pass.cid, pass.tz));
      if (url.pathname === '/api/shop' && request.method === 'GET') return json(await stub.shop(pass.cid));
      if (url.pathname === '/api/shop/buy' && request.method === 'POST') {
        const body = await readJson(request);
        if (!body || !isVariantId(body['variant'])) return json({ error: 'bad request' }, 400);
        return json(await stub.buy(pass.cid, body['variant']));
      }
      if (url.pathname === '/api/shop/gift' && request.method === 'POST') return json(await stub.claimGift(pass.cid));
      return json({ error: 'not found' }, 404);
    }

    // ---- Nests: the owl's own (for "Go home", made on first sight as on the street) and the day's
    // furniture gift. The nests are outside the turnstiles, so neither needs a ticket. ----
    if (url.pathname === '/api/nest') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (request.method !== 'GET') return json({ error: 'not found' }, 404);
      const pass = await passFrom(request, env);
      if (!pass) return json({ error: 'bad-pass' }, 401);
      if (!pass.cid) return json({ error: 'no-collector' }, 401);
      // Only the nest's id: whose it is never leaves the collections object.
      return json({ nestId: (await collections(env).myNest(pass.cid, null)).nest.nestId });
    }
    if (url.pathname === '/api/nest/gift') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (request.method !== 'POST') return json({ error: 'not found' }, 404);
      const pass = await passFrom(request, env);
      if (!pass) return json({ error: 'bad-pass' }, 401);
      if (!pass.cid) return json({ error: 'no-collector' }, 401);
      return json(await collections(env).claimFurnitureGift(pass.cid));
    }

    // ---- Realm Vote ----
    if (url.pathname.startsWith('/api/vote')) {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (url.pathname === '/api/vote/tally') {
        if (env.VOTE_TALLY_PUBLIC !== 'true' && !isAdmin(request, env)) return Response.json({ error: 'private' }, { status: 403, headers: CORS });
        const r = await votes(env).fetch(`https://park/tally${url.search}`);
        return new Response(r.body, { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      if (url.pathname === '/api/vote/close') {
        if (request.method !== 'POST' || !isAdmin(request, env)) return Response.json({ error: 'forbidden' }, { status: 403, headers: CORS });
        const r = await votes(env).fetch(`https://park/close${url.search}`, { method: 'POST' });
        return new Response(r.body, { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const pass = await passFrom(request, env);
      if (!pass) return Response.json({ error: 'bad-pass' }, { status: 401, headers: CORS });
      // Only ticket-holders vote: a guest pass is refused until the ticket gate admits the visitor.
      if (!pass.adm) return Response.json({ error: 'tickets-required' }, { status: 403, headers: CORS });
      if (!pass.cid) return Response.json({ error: 'no-collector' }, { status: 401, headers: CORS });
      // One vote per wallet per park day, however many tickets or passes it holds (C42); the vote
      // keeps the ticket that let the owl in, which votes once a day too.
      const voter = walletVoter(pass.cid);
      const ticket = pass.tid ?? null;
      if (url.pathname === '/api/vote/me') {
        const r = await votes(env).fetch(`https://park/status?visitor=${encodeURIComponent(voter)}${ticket ? `&ticket=${encodeURIComponent(ticket)}` : ''}`);
        return new Response(r.body, { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      if (url.pathname === '/api/vote' && request.method === 'POST') {
        let realm = '';
        try {
          realm = String(((await request.json()) as { realm?: unknown }).realm ?? '');
        } catch {
          return Response.json({ error: 'bad request' }, { status: 400, headers: CORS });
        }
        if (!/^[a-z][a-z0-9-]{0,23}$/.test(realm)) return Response.json({ error: 'bad request' }, { status: 400, headers: CORS });
        const r = await votes(env).fetch('https://park/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor: voter, realm, ticket }) });
        if (pass.tid && r.ok) mirrorLater(ctx, env, url.origin, { id: pass.tid });
        return new Response(r.body, { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      return Response.json({ error: 'not found' }, { status: 404, headers: CORS });
    }

    if (url.pathname === '/api/health') {
      // The park's health (OP-068): the rooms, the ticket book and the collections each answer in time.
      const h = await health({
        rooms: async () => {
          const r = await objectFor(env, 'hub').fetch('https://park/counts');
          if (!r.ok) throw new Error(`the rooms answered ${r.status}`);
        },
        tickets: () => readGate(env),
        collections: () => collections(env).ping(),
      });
      return json(h, h.ok ? 200 : 503);
    }

    if (url.pathname === '/api/counts') {
      if (env.ROOM_SHARDING === 'room') {
        // Each room with its copies added in (OP-075).
        const { copies } = await overflowOf(env);
        const out: Record<string, number> = {};
        await Promise.all(
          Object.keys(ROOMS).map(async (id) => {
            const { open, draining } = copiesIn(copies, id);
            const each = await Promise.all(
              [1, ...open, ...draining].map(async (n) => {
                const r = await objectFor(env, id, n).fetch('https://park/counts');
                return ((await r.json()) as Record<string, number>)[id] ?? 0;
              }),
            );
            out[id] = each.reduce((a, b) => a + b, 0);
          }),
        );
        return Response.json(out, { headers: CORS });
      }
      const r = await objectFor(env, 'hub').fetch('https://park/counts');
      return new Response(r.body, { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (url.pathname.startsWith('/ws/')) {
      const roomId = url.pathname.slice(4);
      // One of the park's rooms, or a nest (`nest-<id>`): whether that nest is there, and open, is the room object's to say.
      if (!isRoomId(roomId)) return new Response('unknown room', { status: 404 });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      const secret = signingSecret(env);
      const pass = await verifyPass(secret, url.searchParams.get('pass'));
      if (!pass) return new Response('bad pass', { status: 401 });
      if (!mayEnter(await gateOf(env), pass, roomId)) return new Response('not admitted', { status: 403 });
      // The line (OP-075): while the park has one, only an owl that was inside lately, or came
      // through it, opens a room; a newcomer is sent to wait on the home screen.
      const busy = await overflowOf(env);
      const who = whoOf(pass);
      if (busy.active && !(await verifyEntry(secret, url.searchParams.get('entry'), who))) return turnedAway(ctx, CLOSE.QUEUED, 'line');
      // Copies of the room (OP-075): to the one it was in, or the one with the most free places.
      const askedCopy = Number(url.searchParams.get('copy'));
      const copy = await copyFor(env, roomId, busy.copies, Number.isInteger(askedCopy) && askedCopy > 0 ? askedCopy : null);
      if (copy > 1 || busy.copies[roomId]) countedOneMore(objectName(env, roomId, copy));
      const headers = new Headers(request.headers);
      headers.set('X-Room', roomId);
      headers.set('X-Room-Copy', String(copy));
      // A fresh entry with every room, so an owl inside goes on from room to room while there is a line.
      headers.set('X-Entry', await mintEntry(secret, who));
      headers.set('X-Visitor-Id', pass.id);
      // Only the pass says whose collection (and nest) this is: whatever the page sent under these names goes.
      headers.delete('X-Collector-Id');
      headers.delete('X-Collector-Tz');
      if (pass.cid) headers.set('X-Collector-Id', pass.cid);
      if (pass.tz) headers.set('X-Collector-Tz', pass.tz);
      // Local load tests set TRUST_FORWARDED_FOR so each bot can claim its own address; never in production.
      const forwarded = env.TRUST_FORWARDED_FOR === 'true' ? request.headers.get('X-Forwarded-For') : null;
      headers.set('X-Visitor-Ip', forwarded ?? request.headers.get('CF-Connecting-IP') ?? 'unknown');
      return objectFor(env, roomId, copy).fetch(new Request(request, { headers }));
    }

    const asset = await env.ASSETS.fetch(request);
    return isPage(url.pathname) ? uncachedPage(asset) : asset;
  },

  /** Month-end: decide the previous park month's Realm Vote. */
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    // Every hour: held orders past their 24 hours with no action are released (C45, fail open), the
    // fraud link on or not: one held before its secrets came off still gets its tickets.
    if (controller.cron === HOURLY_CRON) {
      const deps = storeDeps(env, '');
      if (deps) await releaseDue(deps);
      return;
    }
    await votes(env).fetch('https://park/close', { method: 'POST' });
  },
} satisfies ExportedHandler<Env>;
