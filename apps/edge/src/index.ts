/**
 * The Worker: serves the built client as static assets, mints guest passes and collector
 * tokens, answers the collection, shop and ticket API, keeps visitors' feedback for the keepers'
 * page, takes the store's webhooks, and upgrades /ws/<room> to a WebSocket held by the park's
 * Durable Object (where quests, NPC owls and leaf piles live).
 */
import { isTimeZone, isVariantId, parseFeedback } from '@owl-park/shared';
import { SOURCES, type Source } from '@owl-park/shared';
import { FEEDBACK_STATUSES, type FeedbackStatus } from './feedbackBox';
import { feedbackPage } from './feedbackPage';
import { GUEST_PASS_TTL_S, isCollectorId, mintCollector, mintPass, randomCollectorId, randomVisitorId, signingSecret, verifyCollector, verifyPass, type PassPayload } from './pass';
import { admitted, gateMode, mayEnter } from './gate';
import { isPage, uncachedPage } from './page';
import { ROOMS } from './rooms';
import { verifyWebhook, type TicketLine } from './shopify';
import { storeConfig, type TicketMirror } from './storeApi';
import { claimLink, mirrorTickets, storeWebhook, type Desk, type HookDeps } from './storeHooks';
import { DEFAULT_LENGTH_MS, HOUR_MS, type TicketKind } from './tickets';
import type { Env } from './env';

export { RoomObject } from './RoomObject';
export { VoteLedger } from './VoteLedger';
export { Collections } from './Collections';

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
  return store ? { store, desk: deskOf(env), claimUrl: (secret) => claimLink(origin, secret) } : null;
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

const KINDS: readonly TicketKind[] = ['day', 'night', 'annual', 'event'];

/** One ticket line for tickets the park gives away or tests with (no store order); null when it does not add up. */
function compLine(body: Record<string, unknown>): TicketLine | null {
  const kind = body['kind'] as TicketKind;
  const quantity = body['quantity'] === undefined ? 1 : Number(body['quantity']);
  const hours = body['hours'] === undefined ? null : Number(body['hours']);
  if (!KINDS.includes(kind) || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) return null;
  if (hours !== null && !(hours > 0 && hours <= 24 * 366)) return null;
  const from = typeof body['from'] === 'string' ? Date.parse(body['from']) : NaN;
  const until = typeof body['until'] === 'string' ? Date.parse(body['until']) : NaN;
  if (kind === 'event' && !(until > from)) return null;
  const lengthMs = hours !== null ? Math.round(hours * HOUR_MS) : DEFAULT_LENGTH_MS[kind];
  if (kind !== 'event' && lengthMs === null) return null;
  return { line: '1', quantity, kind, lengthMs, validFrom: kind === 'event' ? from : null, validUntil: kind === 'event' ? until : null };
}

function objectFor(env: Env, roomId: string): DurableObjectStub {
  const name = env.ROOM_SHARDING === 'room' ? `room:${roomId}` : 'park';
  return env.ROOMS.get(env.ROOMS.idFromName(name));
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
      const exp = Math.floor(Date.now() / 1000) + GUEST_PASS_TTL_S;
      const payload: PassPayload = { id: randomVisitorId(), exp, adm: false, cid };
      const tz = url.searchParams.get('tz');
      if (isTimeZone(tz)) payload.tz = tz;
      const pass = await mintPass(secret, payload);
      // A guest pass opens the lobby; once the park takes tickets only an admitted pass goes further.
      return Response.json({ pass, exp, collector, gate: gateMode(env.GATE), adm: payload.adm }, { headers: CORS });
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

    // ---- The store's webhooks (C35): checked against the store's signature before anything is read ----
    if (url.pathname === '/api/store/webhook') {
      if (request.method !== 'POST') return json({ error: 'not found' }, 404);
      const raw = await request.arrayBuffer();
      if (!(await verifyWebhook(env.SHOPIFY_WEBHOOK_SECRET, raw, request.headers.get('X-Shopify-Hmac-Sha256')))) return json({ error: 'bad signature' }, 401);
      const deps = storeDeps(env, url.origin);
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
      if (url.pathname === '/api/tickets' && request.method === 'GET') return reply(await desk(`/tickets/wallet?device=${encodeURIComponent(device)}`));
      const body = request.method === 'POST' ? await readJson(request) : null;
      if (!body) return json({ error: 'bad request' }, 400);
      if (url.pathname === '/api/tickets/claim' || url.pathname === '/api/tickets/take') return reply(await desk(url.pathname.slice(4), { secret: body['secret'], device }));
      if (url.pathname === '/api/tickets/share') return reply(await desk('/tickets/share', { id: body['id'], device }));
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
        return json({ ...r.body, pass: admittedPass, exp, gate: gateMode(env.GATE), adm: true });
      }
      return json({ error: 'not found' }, 404);
    }

    if (url.pathname === '/api/collection' || url.pathname === '/api/shop' || url.pathname === '/api/shop/buy' || url.pathname === '/api/shop/gift') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      const pass = await passFrom(request, env);
      if (!pass) return json({ error: 'bad-pass' }, 401);
      if (!pass.cid) return json({ error: 'no-collector' }, 401);
      // The collection shows anywhere; the shop is inside the park, past the turnstiles.
      if (url.pathname !== '/api/collection' && !admitted(gateMode(env.GATE), pass)) return json({ error: 'tickets-required' }, 403);
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
      // Every ticket and pass has its own vote each park day (C35): the voter is the ticket.
      const voter = pass.tid ?? pass.id;
      if (url.pathname === '/api/vote/me') {
        const r = await votes(env).fetch(`https://park/status?visitor=${encodeURIComponent(voter)}`);
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
        const r = await votes(env).fetch('https://park/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor: voter, realm }) });
        if (pass.tid && r.ok) mirrorLater(ctx, env, url.origin, { id: pass.tid });
        return new Response(r.body, { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      return Response.json({ error: 'not found' }, { status: 404, headers: CORS });
    }

    if (url.pathname === '/api/counts') {
      if (env.ROOM_SHARDING === 'room') {
        const out: Record<string, number> = {};
        await Promise.all(
          Object.keys(ROOMS).map(async (id) => {
            const r = await objectFor(env, id).fetch('https://park/counts');
            const c = (await r.json()) as Record<string, number>;
            out[id] = c[id] ?? 0;
          }),
        );
        return Response.json(out, { headers: CORS });
      }
      const r = await objectFor(env, 'hub').fetch('https://park/counts');
      return new Response(r.body, { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (url.pathname.startsWith('/ws/')) {
      const roomId = url.pathname.slice(4);
      if (!Object.hasOwn(ROOMS, roomId)) return new Response('unknown room', { status: 404 });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      const pass = await verifyPass(signingSecret(env), url.searchParams.get('pass'));
      if (!pass) return new Response('bad pass', { status: 401 });
      if (!mayEnter(gateMode(env.GATE), pass, roomId)) return new Response('not admitted', { status: 403 });
      const headers = new Headers(request.headers);
      headers.set('X-Room', roomId);
      headers.set('X-Visitor-Id', pass.id);
      if (pass.cid) headers.set('X-Collector-Id', pass.cid);
      if (pass.tz) headers.set('X-Collector-Tz', pass.tz);
      // Local load tests set TRUST_FORWARDED_FOR so each bot can claim its own address; never in production.
      const forwarded = env.TRUST_FORWARDED_FOR === 'true' ? request.headers.get('X-Forwarded-For') : null;
      headers.set('X-Visitor-Ip', forwarded ?? request.headers.get('CF-Connecting-IP') ?? 'unknown');
      return objectFor(env, roomId).fetch(new Request(request, { headers }));
    }

    const asset = await env.ASSETS.fetch(request);
    return isPage(url.pathname) ? uncachedPage(asset) : asset;
  },

  /** Month-end: decide the previous park month's Realm Vote. */
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await votes(env).fetch('https://park/close', { method: 'POST' });
  },
} satisfies ExportedHandler<Env>;
