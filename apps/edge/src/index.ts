/**
 * The Worker: serves the built client as static assets, mints guest passes, and upgrades
 * /ws/<room> to a WebSocket held by the park's Durable Object.
 */
import { GUEST_PASS_TTL_S, mintPass, randomVisitorId, signingSecret, verifyPass } from './pass';
import { ROOMS } from './rooms';
import type { Env } from './env';

export { RoomObject } from './RoomObject';
export { VoteLedger } from './VoteLedger';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
  'Cache-Control': 'no-store',
};

function votes(env: Env): DurableObjectStub {
  return env.VOTES.get(env.VOTES.idFromName('park'));
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

function objectFor(env: Env, roomId: string): DurableObjectStub {
  const name = env.ROOM_SHARDING === 'room' ? `room:${roomId}` : 'park';
  return env.ROOMS.get(env.ROOMS.idFromName(name));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/pass') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (env.GATE === 'ticket') return Response.json({ error: 'tickets required' }, { status: 403, headers: CORS });
      const exp = Math.floor(Date.now() / 1000) + GUEST_PASS_TTL_S;
      const pass = await mintPass(signingSecret(env), { id: randomVisitorId(), exp, adm: false });
      return Response.json({ pass, exp }, { headers: CORS });
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
      if (url.pathname === '/api/vote/me') {
        const r = await votes(env).fetch(`https://park/status?visitor=${encodeURIComponent(pass.id)}`);
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
        const r = await votes(env).fetch('https://park/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor: pass.id, realm }) });
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
      if (env.GATE === 'ticket' && !pass.adm) return new Response('not admitted', { status: 403 });
      const headers = new Headers(request.headers);
      headers.set('X-Room', roomId);
      headers.set('X-Visitor-Id', pass.id);
      // Local load tests set TRUST_FORWARDED_FOR so each bot can claim its own address; never in production.
      const forwarded = env.TRUST_FORWARDED_FOR === 'true' ? request.headers.get('X-Forwarded-For') : null;
      headers.set('X-Visitor-Ip', forwarded ?? request.headers.get('CF-Connecting-IP') ?? 'unknown');
      return objectFor(env, roomId).fetch(new Request(request, { headers }));
    }

    return env.ASSETS.fetch(request);
  },

  /** Month-end: decide the previous park month's Realm Vote. */
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await votes(env).fetch('https://park/close', { method: 'POST' });
  },
} satisfies ExportedHandler<Env>;
