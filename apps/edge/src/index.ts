/**
 * The Worker: serves the built client as static assets, mints guest passes, and upgrades
 * /ws/<room> to a WebSocket held by the park's Durable Object.
 */
import { GUEST_PASS_TTL_S, mintPass, randomVisitorId, signingSecret, verifyPass } from './pass';
import { ROOMS } from './rooms';
import type { Env } from './env';

export { RoomObject } from './RoomObject';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

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
      if (!ROOMS[roomId]) return new Response('unknown room', { status: 404 });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      const pass = await verifyPass(signingSecret(env), url.searchParams.get('pass'));
      if (!pass) return new Response('bad pass', { status: 401 });
      if (env.GATE === 'ticket' && !pass.adm) return new Response('not admitted', { status: 403 });
      const headers = new Headers(request.headers);
      headers.set('X-Room', roomId);
      headers.set('X-Visitor-Id', pass.id);
      headers.set('X-Visitor-Ip', request.headers.get('CF-Connecting-IP') ?? 'unknown');
      return objectFor(env, roomId).fetch(new Request(request, { headers }));
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
