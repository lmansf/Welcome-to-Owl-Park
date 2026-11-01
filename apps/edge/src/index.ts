/**
 * The Worker: serves the built client as static assets, mints guest passes and collector
 * tokens, answers the collection, shop, furniture gift, ticket and (with ACCOUNTS on) account API, keeps visitors' feedback for
 * the keepers' page, takes the store's webhooks, and upgrades /ws/<room> to a WebSocket held by the
 * park's Durable Object (where quests, NPC owls, leaf piles and the nests live).
 */
import { CLOSE, RIBBON_WORDS, hashForLog, isClimbRef, isTimeZone, isVariantId, parseFeedback, waitMinutes, type LineStatus, type Logger, type OwlAccount, type TravelState } from '@owl-park/shared';
import { SOURCES, type Source } from '@owl-park/shared';
import { accountRoute, accountsOn, emailKeys, keyed, mailSender, orderEmail, seal } from './accounts';
import { capacityPage } from './capacityPage';
import { deviceClass, type Visit } from './collectLog';
import { copiesIn, copyObjectName, pickCopy, roomObjectNames } from './copies';
import type { LineAnswer, OverflowState } from './Overflow';
import { countIn, countedOneMore, forgetOverflow, overflowNow } from './overflowState';
import { FEEDBACK_STATUSES, type FeedbackStatus } from './feedbackBox';
import { feedbackPage } from './feedbackPage';
import { CSP_REPORT_PATH, REPORT_BODY_MAX, finished, frontDoor, guardedPage, noteViolation, tooMany, violationOf } from './guard';
import { limitsOn, overLimit } from './limits';
import { walletVoter } from './Ledger';
import { loggerFor } from './logs';
import { openingOn, passLinkReady, storeCatalogue } from './opening';
import { openingPage } from './openingPage';
import { GUEST_PASS_TTL_S, KEEPER_TTL_S, isCollectorId, mintCollector, mintEntry, mintKeeper, mintPass, passRefusal, randomCollectorId, randomVisitorId, readCollector, signingSecret, verifyEntry, verifyPass, type PassPayload } from './pass';
import { admitted, gateMode, mayEnter } from './gate';
import { forgetGate, gateFrom, gateNow, type GateSet } from './gateSwitch';
import { gatePage } from './gatePage';
import { health } from './health';
import { isPage, uncachedPage } from './page';
import { ROOMS, isRoomId, roomCap } from './rooms';
import { GATED_ROOMS } from '@owl-park/shared/rooms';
import { NIGHTS } from '@owl-park/shared';
import { KINDS, passCartLink, webhookSigned, type TicketLine } from './shopify';
import { storeCheck, storeConfig, type TicketMirror } from './storeApi';
import { claimLink, mirrorTickets, orderIdOf, storeWebhook, type Desk, type HookDeps } from './storeHooks';
import { DEFAULT_LENGTH_MS, HOUR_MS, LIFETIME_MS, OPENING_NIGHT_MS, windowed, type TicketKind } from './tickets';
import type { Env } from './env';

export { RoomObject } from './RoomObject';
export { VoteLedger } from './VoteLedger';
export { Collections } from './Collections';
export { Overflow } from './Overflow';

// Which pages may read an answer is the front door's to say, as each answer leaves (guard.ts `finished`): the park's own only.
const CORS = {
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
function turnedAway(ctx: ExecutionContext, log: Logger, code: number, reason: string): Response {
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
        } catch (e) {
          // The page may have closed its end first; a socket still open that will not close is news.
          if (server.readyState === WebSocket.READY_STATE_OPEN) log.warn('room.queue', 'send_failed', 'A socket the line turned away could not be closed.', { code, error: e });
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
/** An account request is an email or a link's token: anything past this is refused unread. */
const ACCOUNT_BODY_MAX = 2_048;

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = (await request.json()) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Whether the request carries the keepers' key: logged either way with its route and, refused, why (never the key). */
function isAdmin(request: Request, env: Env, log: Logger): boolean {
  const key = env.ADMIN_KEY;
  const given = request.headers.get('X-Admin-Key') ?? '';
  const route = new URL(request.url).pathname;
  const reason = !key || key.length < 16 ? 'no-key-set' : !given ? 'no-key-given' : given !== key ? 'wrong-key' : null;
  if (reason) log.warn('worker.admin', 'admin_denied', 'A keepers’ route was asked without the keepers’ key.', { route, reason });
  else log.info('worker.admin', 'admin_ok', 'A keepers’ route was asked with the keepers’ key.', { route });
  return reason === null;
}

/** A request's pass token: the Authorization header (Bearer), or the query string. */
function tokenOf(request: Request): string | null {
  const auth = request.headers.get('Authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : new URL(request.url).searchParams.get('pass');
}

/** Each request's pass, checked once: the rate limits count by it before its route asks for it. */
const checked = new WeakMap<Request, PassPayload | null>();

async function passOf(request: Request, env: Env): Promise<PassPayload | null> {
  if (checked.has(request)) return checked.get(request) ?? null;
  const pass = await verifyPass(signingSecret(env), tokenOf(request));
  checked.set(request, pass);
  return pass;
}

/** The pass from the Authorization header (Bearer) or the query string; a refused one is logged with why. */
async function passFrom(request: Request, env: Env, log: Logger) {
  const url = new URL(request.url);
  const token = tokenOf(request);
  const secret = signingSecret(env);
  const pass = await passOf(request, env);
  if (pass) log.debug('worker.pass', 'pass_verified', 'A pass was taken.', { route: url.pathname, session_id: hashForLog(pass.id), adm: pass.adm });
  else log.info('worker.pass', 'pass_rejected', 'A pass was refused.', { route: url.pathname, reason: await passRefusal(secret, token) });
  return pass;
}

/** The client's address. Local load tests set TRUST_FORWARDED_FOR so each bot can claim its own; never in production. */
function clientIp(request: Request, env: Env): string {
  const forwarded = env.TRUST_FORWARDED_FOR === 'true' ? request.headers.get('X-Forwarded-For') : null;
  return forwarded ?? request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

/**
 * An owl restored on another screen (OP-139): every room object hears it, and sends the moved card to
 * the owl's sockets from any other device at once (with one object per room, a nest's object hears
 * nothing: its owl is sent the card at its next hello).
 */
async function tellMoved(env: Env, log: Logger, cid: string, dev: string): Promise<void> {
  const copies = await overflowOf(env)
    .then((o) => o.copies)
    .catch((e: unknown) => {
      log.error('overflow', 'read_failed', 'The overflow object did not say which copies of rooms are open: only the rooms themselves are told the owl moved.', { error: e });
      return {};
    });
  const body = JSON.stringify({ cid, dev });
  await Promise.all(
    roomObjectNames(env.ROOM_SHARDING, Object.keys(ROOMS), copies).map((name) =>
      env.ROOMS.get(env.ROOMS.idFromName(name))
        .fetch('https://park/moved', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        .catch((e: unknown) => log.error('worker.accounts', 'write_failed', 'A room object was not told an owl moved to another screen: its page there learns at its next hello.', { object: name, collector_hash: hashForLog(cid), error: e })),
    ),
  );
}

/**
 * A ticket's order email protects the owl that claimed its tickets (OP-139, with ACCOUNTS on): the store
 * says whose order it was, after the page has its answer. A ticket the park gave away has no order in
 * the store, and an owl whose email the store will not tell stays as it was.
 */
async function protectByOrder(env: Env, log: Logger, cid: string, order: string): Promise<void> {
  const keys = accountsOn(env) ? emailKeys(env) : null;
  const store = storeConfig(env);
  if (!keys || !store || order.startsWith('comp-')) return;
  const email = await orderEmail(store, order);
  if (!email) return;
  const k = await keys;
  await collections(env)
    .accountProtectByOrder(cid, await keyed(k, 'e', email), await seal(k, email))
    .catch((e: unknown) => log.error('worker.accounts', 'write_failed', 'An owl was not protected by its ticket order’s email: it stays as it was.', { collector_hash: hashForLog(cid), order_hash: hashForLog(order), error: e }));
}

/** The visit a call comes in, for the collection log (OP-107): its pass's id (one per page load) and the device's class. */
function visitOf(pass: PassPayload, request: Request): Visit {
  return { pass: pass.id, device: deviceClass(request.headers.get('User-Agent'), request.headers.get('Sec-CH-UA-Mobile')) };
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
function storeDeps(env: Env, origin: string): HookDeps | null {
  const store = storeConfig(env);
  return store ? { store, desk: deskOf(env), claimUrl: (secret) => claimLink(origin, secret), ...(env.OPENING_PASS_CODE ? { openingCode: env.OPENING_PASS_CODE } : {}) } : null;
}

/** Brings the store's copy of a ticket (or of an order's tickets) up to date after answering. */
function mirrorLater(ctx: ExecutionContext, env: Env, log: Logger, origin: string, which: { id: string } | { order: string }): void {
  const deps = storeDeps(env, origin);
  if (!deps) return;
  ctx.waitUntil(
    (async () => {
      const r = await deps.desk('/tickets/mirror', which);
      if (r.status === 200) await mirrorTickets(deps, r.body['tickets'] as TicketMirror[], 'order' in which);
    })().catch((e: unknown) =>
      log.error('worker.store', 'store_unreachable', 'The store’s copy of tickets was not brought up to date.', { ...('order' in which ? { order_hash: hashForLog(which.order) } : { ticket_hash: hashForLog(which.id) }), error: e }),
    ),
  );
}

/** One ticket line for tickets the park gives away or tests with (no store order); null when it does not add up. */
function compLine(body: Record<string, unknown>): TicketLine | null {
  const kind = body['kind'] as TicketKind;
  const quantity = body['quantity'] === undefined ? 1 : Number(body['quantity']);
  const hours = body['hours'] === undefined ? null : Number(body['hours']);
  if (!KINDS.includes(kind) || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) return null;
  if (hours !== null && !(hours > 0 && hours <= 24 * 366)) return null;
  // A pass that never runs out (OP-170): one annual pass, with no hours of its own.
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

const park = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // One logger per request (OP-134): the deployment's level, and the chaos run's id when the request names one.
    const log = loggerFor(env, request);

    // The front door (OP-140, OP-141): only https off this machine, and sockets and API calls only from the park's own pages.
    const door = frontDoor(request, url, env.PARK_ORIGINS, log);
    if (door) return door;
    // The rate limits (OP-142): by address, by owl, and tightly for the calls that move tickets or send mail.
    const socket = url.pathname.startsWith('/ws/');
    if ((socket || url.pathname.startsWith('/api/')) && url.pathname !== '/api/store/webhook' && limitsOn(env)) {
      const pass = await passOf(request, env);
      const over = overLimit({ ip: clientIp(request, env), visitor: pass ? (pass.cid ?? pass.id) : null, path: url.pathname }, Date.now());
      if (over) {
        if (over.first) log.warn('worker.guard', 'rate_limited', 'Calls came too fast: refused until the minute is out.', { route: url.pathname, limit: over.limit, retry_after_s: over.wait, ...(over.limit !== 'address' && pass?.cid ? { collector_hash: hashForLog(pass.cid) } : {}) });
        return tooMany(socket, over.wait);
      }
    }

    if (url.pathname === CSP_REPORT_PATH) {
      // What the page's policy blocked (OP-140), as the browser reports it: logged, a line per kind a while.
      if (request.method !== 'POST') return json({ error: 'not found' }, 404);
      if (Number(request.headers.get('Content-Length') ?? 0) > REPORT_BODY_MAX) return json({ error: 'too large' }, 413);
      const v = violationOf(await readJson(request));
      if (!v) return json({ error: 'bad request' }, 400);
      noteViolation(log, v, Date.now());
      return new Response(null, { status: 204 });
    }

    if (url.pathname === '/api/pass') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      const secret = signingSecret(env);
      // The collector token the browser keeps; a missing or forged one starts a new collection.
      const given = request.headers.get('X-Collector') ?? url.searchParams.get('collector');
      const known = await readCollector(secret, given);
      const cid = known?.cid ?? randomCollectorId();
      let collector = known && given ? given : null;
      // With accounts on (OP-139) the token names this screen's device: the first to ask holds the
      // owl, and a screen it has moved from is told so. Should the account be out of reach, the pass goes out as before.
      let dev = known?.dev ?? null;
      let account: OwlAccount | null = null;
      if (accountsOn(env)) {
        const stand = await collections(env)
          .accountStand(cid, dev)
          .catch((e: unknown) => {
            log.error('worker.accounts', 'read_failed', 'The collections object did not say which screen holds the owl: the pass goes out as before.', { collector_hash: hashForLog(cid), error: e });
            return null;
          });
        if (stand === 'moved') return json({ error: 'moved' }, 409);
        if (stand) {
          if (stand.dev !== dev) collector = null;
          dev = stand.dev;
          account = stand.account;
        }
      }
      collector ??= await mintCollector(secret, cid, dev);
      const iat = Math.floor(Date.now() / 1000);
      const exp = iat + GUEST_PASS_TTL_S;
      const payload: PassPayload = { id: randomVisitorId(), exp, iat, adm: false, cid };
      const tz = url.searchParams.get('tz');
      if (isTimeZone(tz)) payload.tz = tz;
      if (accountsOn(env) && dev) payload.dev = dev;
      const pass = await mintPass(secret, payload);
      log.info('worker.pass', 'pass_issued', 'A guest pass went out.', { session_id: hashForLog(payload.id), collector_hash: hashForLog(cid), new_collector: !known });
      // A guest pass opens the lobby; once the park takes tickets only an admitted pass goes further.
      return Response.json({ pass, exp, collector, gate: (await gateOf(env)).mode, adm: payload.adm, ...(account ? { account } : {}) }, { headers: CORS });
    }

    if (url.pathname === '/api/entry') {
      // The front gate as it is now, for this pass: the booth's words and the turnstiles ask before they act.
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      const pass = await passFrom(request, env, log);
      if (!pass) return json({ error: 'bad-pass' }, 401);
      return json({ gate: (await gateOf(env)).mode, admitted: pass.adm });
    }

    if (url.pathname === '/api/travel') {
      // The map's places (OP-130): where this pass's owl has walked, and whether it is through the front gate.
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      const pass = await passFrom(request, env, log);
      if (!pass) return json({ error: 'bad-pass' }, 401);
      if (!pass.cid) return json({ places: [], gate: false } satisfies TravelState);
      const cid = pass.cid;
      const state = await collections(env)
        .travelState(cid)
        .catch((e: unknown) => {
          log.error('collections.travel', 'read_failed', 'The collections object did not say where the owl has walked: the page is asked to try later.', { collector_hash: hashForLog(cid), error: e });
          return null;
        });
      return state ? json(state) : json({ error: 'try-later' }, 503);
    }

    // ---- Whether a key is the keepers' (the position overlay asks before it shows, OP-138) ----
    if (url.pathname === '/api/admin/ping') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (request.method !== 'GET' || !isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
      return json({ ok: true });
    }
    // ---- A keeper's token: this tab's owl walks the tree (map 2) while it is dark (OP-156) ----
    //
    // TODO-DOCS (OP-156): docs/PLAYBOOK.md (or DEPLOY.md's admin routes): to walk a closed realm, open
    // the park with ?keeper=1 and give the keepers' key once; the page swaps it here for a 12-hour token
    // kept in that tab only (never the key), and its hello carries the token past the closed arch.
    if (url.pathname === '/api/admin/keeper') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (request.method !== 'POST' || !isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
      return json({ token: await mintKeeper(signingSecret(env)), ttl: KEEPER_TTL_S });
    }
    // ---- Collectibles (the collector comes from the pass) ----
    if (url.pathname === '/api/admin/grant') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (request.method !== 'POST' || !isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
      const body = await readJson(request);
      const source = (body?.['source'] ?? 'granted') as Source;
      if (!body || !isCollectorId(body['cid']) || !isVariantId(body['variant']) || !SOURCES.includes(source)) return json({ error: 'bad request' }, 400);
      return json(await collections(env).grant(body['cid'], body['variant'], source));
    }
    // ---- The stained-glass climb: a run by the reference a visitor quotes (never a collector id) ----
    if (url.pathname === '/api/admin/climb') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (request.method !== 'GET' || !isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
      const ref = url.searchParams.get('ref');
      if (!isClimbRef(ref)) return json({ error: 'bad request' }, 400);
      const found = await collections(env).climbLookup(ref);
      return found ? json(found) : json({ error: 'not found' }, 404);
    }
    if (url.pathname === '/api/admin/collect-log') {
      // The collection log (OP-107): GET says whether it is set up and how many rows wait to be sent;
      // POST queues every collectible the collections hold now, once (the backfill).
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (!isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
      if (request.method === 'GET') return json(await collections(env).logState());
      if (request.method === 'POST') return json(await collections(env).backfillLog());
      return json({ error: 'not found' }, 404);
    }
    if (url.pathname === '/api/admin/store') {
      // The owner's check of the store setup: which of its secrets are set (never their values),
      // whether the app signs in, the scopes it still lacks, and whether it may read orders.
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (request.method !== 'GET' || !isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
      return json(await storeCheck(env));
    }
    if (url.pathname === '/api/admin/tickets') {
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

    // ---- Accounts without passwords (OP-139, with ACCOUNTS on): protect an owl by email, restore it by a link ----
    if (url.pathname.startsWith('/api/account/')) {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (!accountsOn(env) || request.method !== 'POST') return json({ error: 'not found' }, 404);
      if (Number(request.headers.get('Content-Length') ?? 0) > ACCOUNT_BODY_MAX) return json({ error: 'too large' }, 413);
      const body = await readJson(request);
      if (!body) return json({ error: 'bad request' }, 400);
      const r = await accountRoute(url.pathname.slice('/api/account/'.length), body, {
        rpc: collections(env),
        secret: signingSecret(env),
        keys: emailKeys(env),
        mail: mailSender(env),
        origin: url.origin,
        pass: await passFrom(request, env, log),
        collector: request.headers.get('X-Collector'),
        ip: clientIp(request, env),
        moved: (cid, dev) => tellMoved(env, log, cid, dev),
        now: Date.now(),
      });
      return r ? json(r.body, r.status) : json({ error: 'not found' }, 404);
    }

    // ---- Feedback: visitors send it with their pass; the keepers read it with the admin key ----
    if (url.pathname === '/api/feedback') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (request.method !== 'POST') return json({ error: 'not found' }, 404);
      const pass = await passFrom(request, env, log);
      if (!pass) return json({ error: 'bad-pass' }, 401);
      if (!pass.cid) return json({ error: 'no-collector' }, 401);
      // A few lines of words: refuse anything far larger before reading it.
      if (Number(request.headers.get('Content-Length') ?? 0) > FEEDBACK_BODY_MAX) return json({ error: 'too large' }, 413);
      const draft = parseFeedback(await readJson(request));
      if (!draft) return json({ error: 'bad request' }, 400);
      const ua = request.headers.get('User-Agent')?.slice(0, 300) || null;
      const r = await collections(env).addFeedback(pass.cid, draft, ua, visitOf(pass, request));
      return json(r, r.ok ? 200 : 429);
    }
    if (url.pathname === '/api/admin/feedback') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (!isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
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
    if (url.pathname === '/admin/opening') return openingPage();

    // ---- The opening switch (OP-067): the front gate open to everyone, or taking tickets, with no deploy ----
    if (url.pathname === '/api/admin/gate') {
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
        log.info('worker.admin', 'gate_switched', 'The opening switch was changed.', { gate: gateFrom(set, env.GATE).mode, by: set ? 'switch' : 'deployed' });
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
      const pass = await passFrom(request, env, log);
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
      return json({ ...st, sharding: env.ROOM_SHARDING === 'room' ? 'room' : 'single', rooms: await roomsNow(env, st.copies), gated: GATED_ROOMS, nights: Object.keys(NIGHTS) });
    }
    if (url.pathname === '/admin/capacity') return capacityPage(RIBBON_WORDS);

    // ---- The store's webhooks (C35): checked against the store's signature before anything is read ----
    if (url.pathname === '/api/store/webhook') {
      if (request.method !== 'POST') return json({ error: 'not found' }, 404);
      const topic = request.headers.get('X-Shopify-Topic') ?? '';
      const rejected = (reason: string, status: number, error: string) => {
        log.warn('worker.store', 'webhook_rejected', 'A store webhook was turned away.', { topic, reason });
        return json({ error }, status);
      };
      const raw = await request.arrayBuffer();
      const signed = await webhookSigned([env.SHOPIFY_WEBHOOK_SECRET, env.SHOPIFY_CLIENT_SECRET], raw, request.headers.get('X-Shopify-Hmac-Sha256'));
      if (!signed) return rejected('signature', 401, 'bad signature');
      const deps = storeDeps(env, url.origin);
      if (!deps) return rejected('not-set-up', 503, 'store not set up');
      const shop = request.headers.get('X-Shopify-Shop-Domain');
      if (shop && shop !== deps.store.shop) return rejected('other-store', 401, 'not this store');
      let payload: unknown;
      try {
        payload = JSON.parse(new TextDecoder().decode(raw));
      } catch {
        return rejected('bad-body', 400, 'bad request');
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return rejected('bad-body', 400, 'bad request');
      const order = orderIdOf(payload as Record<string, unknown>, topic);
      const about = { topic, ...(order ? { order_hash: hashForLog(order) } : {}) };
      const t0 = Date.now();
      try {
        const r = await storeWebhook(topic, payload as Record<string, unknown>, { ...deps, log });
        log.info('worker.store', 'webhook_received', 'A store webhook was taken.', { ...about, status: r.status, duration_ms: Date.now() - t0 });
        if (r.repeat) log.info('worker.store', 'webhook_duplicate', 'A store webhook came again for work an earlier delivery already did.', about);
        if (r.recorded) log.info('worker.store', 'order_recorded', 'A paid order’s tickets were made.', { ...about, tickets: r.recorded.tickets, held: r.recorded.held });
        if (r.mirror) mirrorLater(ctx, env, log, url.origin, { order: r.mirror });
        return json(r.body, r.status);
      } catch (e) {
        log.error('worker.store', 'webhook_failed', 'A store webhook failed: the store sends it again later, and every step is safe to repeat.', { ...about, duration_ms: Date.now() - t0, error: e });
        return json({ error: 'try again' }, 500);
      }
    }

    // ---- Tickets (C35): the wallet on this device, the emailed and shared links, and the gate ----
    if (url.pathname === '/api/tickets' || url.pathname.startsWith('/api/tickets/')) {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      const pass = await passFrom(request, env, log);
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
      if (url.pathname === '/api/tickets/claim' || url.pathname === '/api/tickets/take') {
        const { status, body: answer } = await desk(url.pathname.slice(4), { secret: body['secret'], device });
        // The claimed order stays with the Worker: its email protects this owl (OP-139). How many tickets moved is the log's.
        const { order, moved, claimed, ...rest } = answer;
        if (status === 200) {
          const share = url.pathname === '/api/tickets/take';
          log.info('worker.tickets', 'claim_moved', share ? 'A share link moved a ticket onto this device.' : 'A claim link moved its order’s tickets onto this device.', {
            via: share ? 'share' : 'claim',
            collector_hash: hashForLog(device),
            device_class: deviceClass(request.headers.get('User-Agent'), request.headers.get('Sec-CH-UA-Mobile')),
            ...(typeof order === 'string' ? { order_hash: hashForLog(order) } : {}),
            ...(share ? { tickets: 1 } : { tickets: claimed, from_other_device: moved }),
          });
        }
        if (status === 200 && typeof order === 'string') ctx.waitUntil(protectByOrder(env, log, device, order));
        return json(rest, status);
      }
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
        if (r.body['started'] === true) mirrorLater(ctx, env, log, url.origin, { id: tid });
        return json({ ...r.body, pass: admittedPass, exp, gate: (await gateOf(env)).mode, adm: true });
      }
      return json({ error: 'not found' }, 404);
    }

    if (url.pathname === '/api/collection' || url.pathname === '/api/shop' || url.pathname === '/api/shop/buy' || url.pathname === '/api/shop/gift') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      const pass = await passFrom(request, env, log);
      if (!pass) return json({ error: 'bad-pass' }, 401);
      if (!pass.cid) return json({ error: 'no-collector' }, 401);
      // The collection shows anywhere; the shop is inside the park, past the turnstiles.
      if (url.pathname !== '/api/collection' && !admitted(await gateOf(env), pass)) return json({ error: 'tickets-required' }, 403);
      const stub = collections(env);
      const visit = visitOf(pass, request);
      if (url.pathname === '/api/collection' && request.method === 'GET') return json(await stub.inventory(pass.cid, pass.tz, visit));
      if (url.pathname === '/api/shop' && request.method === 'GET') return json(await stub.shop(pass.cid));
      if (url.pathname === '/api/shop/buy' && request.method === 'POST') {
        const body = await readJson(request);
        if (!body || !isVariantId(body['variant'])) return json({ error: 'bad request' }, 400);
        return json(await stub.buy(pass.cid, body['variant'], visit));
      }
      if (url.pathname === '/api/shop/gift' && request.method === 'POST') return json(await stub.claimGift(pass.cid, visit));
      return json({ error: 'not found' }, 404);
    }

    // ---- Nests: the owl's own (for travel home, made on first sight as on the street) and the day's
    // furniture gift. The nests are outside the turnstiles, so neither needs a ticket. ----
    if (url.pathname === '/api/nest') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (request.method !== 'GET') return json({ error: 'not found' }, 404);
      const pass = await passFrom(request, env, log);
      if (!pass) return json({ error: 'bad-pass' }, 401);
      if (!pass.cid) return json({ error: 'no-collector' }, 401);
      // Only the nest's id: whose it is never leaves the collections object.
      return json({ nestId: (await collections(env).myNest(pass.cid, null, visitOf(pass, request))).nest.nestId });
    }
    if (url.pathname === '/api/nest/gift') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (request.method !== 'POST') return json({ error: 'not found' }, 404);
      const pass = await passFrom(request, env, log);
      if (!pass) return json({ error: 'bad-pass' }, 401);
      if (!pass.cid) return json({ error: 'no-collector' }, 401);
      return json(await collections(env).claimFurnitureGift(pass.cid, visitOf(pass, request)));
    }

    // ---- Realm Vote ----
    if (url.pathname.startsWith('/api/vote')) {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (url.pathname === '/api/vote/tally') {
        if (env.VOTE_TALLY_PUBLIC !== 'true' && !isAdmin(request, env, log)) return Response.json({ error: 'private' }, { status: 403, headers: CORS });
        const r = await votes(env).fetch(`https://park/tally${url.search}`);
        return new Response(r.body, { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      if (url.pathname === '/api/vote/close') {
        if (request.method !== 'POST' || !isAdmin(request, env, log)) return Response.json({ error: 'forbidden' }, { status: 403, headers: CORS });
        const r = await votes(env).fetch(`https://park/close${url.search}`, { method: 'POST' });
        return new Response(r.body, { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const pass = await passFrom(request, env, log);
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
        if (pass.tid && r.ok) mirrorLater(ctx, env, log, url.origin, { id: pass.tid });
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
      const fields = { ok: h.ok, parts: h.parts, duration_ms: h.ms };
      if (h.ok) log.info('worker.health', 'health_check', 'The park answered its health check.', fields);
      else log.error('worker.health', 'health_check', 'A part of the park did not answer its health check in time.', fields);
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
      const given = url.searchParams.get('pass');
      const pass = await verifyPass(secret, given);
      if (!pass) {
        log.info('room.join', 'room_join_refused', 'A room socket was refused: its pass was not taken.', { room: roomId, reason: 'pass', pass: await passRefusal(secret, given) });
        return new Response('bad pass', { status: 401 });
      }
      const seen = { room: roomId, session_id: hashForLog(pass.id), ...(pass.cid ? { collector_hash: hashForLog(pass.cid) } : {}) };
      if (!mayEnter(await gateOf(env), pass, roomId)) {
        log.info('room.join', 'room_join_refused', 'A room socket was refused: the pass is not admitted past the front gate.', { ...seen, reason: 'gate' });
        return new Response('not admitted', { status: 403 });
      }
      // The line (OP-075): while the park has one, only an owl that was inside lately, or came
      // through it, opens a room; a newcomer is sent to wait on the home screen.
      const busy = await overflowOf(env);
      const who = whoOf(pass);
      if (busy.active && !(await verifyEntry(secret, url.searchParams.get('entry'), who))) {
        log.info('room.join', 'room_join_refused', 'A room socket was sent to wait in the line.', { ...seen, reason: 'queue' });
        return turnedAway(ctx, log, CLOSE.QUEUED, 'line');
      }
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
      // Only the pass says whose collection (and nest) this is, and on which device: whatever the page sent under these names goes.
      headers.delete('X-Collector-Id');
      headers.delete('X-Collector-Tz');
      headers.delete('X-Collector-Dev');
      if (pass.cid) headers.set('X-Collector-Id', pass.cid);
      if (pass.tz) headers.set('X-Collector-Tz', pass.tz);
      if (pass.dev) headers.set('X-Collector-Dev', pass.dev);
      headers.set('X-Visitor-Ip', clientIp(request, env));
      return objectFor(env, roomId, copy).fetch(new Request(request, { headers }));
    }

    const asset = await env.ASSETS.fetch(request);
    // The page with its policy (OP-140): only its own scripts, and only its own host to talk to.
    return isPage(url.pathname) ? guardedPage(uncachedPage(asset), url) : asset;
  },

  /** Month-end: decide the previous park month's Realm Vote. */
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await votes(env).fetch('https://park/close', { method: 'POST' });
  },
} satisfies ExportedHandler<Env>;

/**
 * The Worker as the platform calls it: every answer leaves with nosniff, HSTS and the park's CORS
 * (OP-140, OP-144); an error no route handled is logged as one line (OP-134), then thrown on as
 * before, so what the visitor gets does not change.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return finished(request, new URL(request.url), await park.fetch(request, env, ctx), env.PARK_ORIGINS);
    } catch (e) {
      loggerFor(env, request).error('worker', 'unhandled_error', 'A request failed with an error no route handled.', { route: new URL(request.url).pathname, error: e });
      throw e;
    }
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    try {
      await park.scheduled(controller, env);
    } catch (e) {
      loggerFor(env).error('worker', 'unhandled_error', 'The month-end close of the Realm Vote failed.', { job: 'vote-close', error: e });
      throw e;
    }
  },
} satisfies ExportedHandler<Env>;
