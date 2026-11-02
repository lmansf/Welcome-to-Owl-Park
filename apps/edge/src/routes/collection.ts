/** The collection, the shop, and the nests (the owl's own, and the day's furniture gift). */
import { isVariantId } from '@owl-park/shared';
import { admitted } from '../gate';
import { CORS, json, passFrom, readJson, visitOf } from './http';
import { collections, gateOf } from './park';
import type { RouteCtx } from './router';

export async function collection(c: RouteCtx): Promise<Response> {
  const { request, env, url, log } = c;
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
export async function nest(c: RouteCtx): Promise<Response> {
  const { request, env, log } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'GET') return json({ error: 'not found' }, 404);
  const pass = await passFrom(request, env, log);
  if (!pass) return json({ error: 'bad-pass' }, 401);
  if (!pass.cid) return json({ error: 'no-collector' }, 401);
  // Only the nest's id: whose it is never leaves the collections object.
  return json({ nestId: (await collections(env).myNest(pass.cid, null, visitOf(pass, request))).nest.nestId });
}

export async function nestGift(c: RouteCtx): Promise<Response> {
  const { request, env, log } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'not found' }, 404);
  const pass = await passFrom(request, env, log);
  if (!pass) return json({ error: 'bad-pass' }, 401);
  if (!pass.cid) return json({ error: 'no-collector' }, 401);
  return json(await collections(env).claimFurnitureGift(pass.cid, visitOf(pass, request)));
}
