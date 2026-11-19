/** The collection, the shop, and the nests (the owl's own, and the day's furniture gift). */
import { EGG_CODE_TRIES, LOCAL_EGG_CODE_PUBLIC_KEY, hashForLog, isVariantId, verifyEggCode, type EggRedeemReply } from '@owl-park/shared';
import { admitted } from '../gate';
import { Counter, limitsOn } from '../limits';
import { CORS, clientIp, json, passFrom, readJson, visitOf } from './http';
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

// ---- Egg codes (OP-260): a code from the portfolio site's SQL console, for the painted egg. Outside the
// turnstiles too, since a free guest redeems like anyone (the owner's rule, Nov 18). ----

/** Tries an hour per owl and per address (EGG_CODE_TRIES), counted in this copy of the Worker's memory like every other limit here. */
let triesByOwl = new Counter(EGG_CODE_TRIES);
let triesByAddress = new Counter(EGG_CODE_TRIES);

/** For tests: every count forgotten. */
export function forgetEggCodeTries(): void {
  triesByOwl = new Counter(EGG_CODE_TRIES);
  triesByAddress = new Counter(EGG_CODE_TRIES);
}

/** The key codes are checked with: the portfolio site's, never the offline park's test key (whose private half is in the tests). */
export function eggCodeKey(env: { EGG_CODE_KEY?: string }): string | null {
  const key = env.EGG_CODE_KEY?.trim();
  return key && key !== LOCAL_EGG_CODE_PUBLIC_KEY ? key : null;
}

export async function redeem(c: RouteCtx): Promise<Response> {
  const { request, env, log } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'not found' }, 404);
  const pass = await passFrom(request, env, log);
  if (!pass) return json({ error: 'bad-pass' }, 401);
  if (!pass.cid) return json({ error: 'no-collector' }, 401);
  const key = eggCodeKey(env);
  if (!key) return json({ ok: false, reason: 'closed' } satisfies EggRedeemReply, 503);
  // Every try counts, a good one too, per owl and per address: a script can't guess its way through.
  if (limitsOn(env)) {
    const now = Date.now();
    const over = triesByOwl.take(pass.cid, now) ?? triesByAddress.take(clientIp(request, env), now);
    if (over) {
      if (over.first)
        log.warn('worker.guard', 'rate_limited', 'Egg codes were tried too often: refused until the hour is out.', {
          route: '/api/redeem',
          limit: 'egg-code',
          retry_after_s: over.wait,
          collector_hash: hashForLog(pass.cid),
        });
      return json({ ok: false, reason: 'full' } satisfies EggRedeemReply, 429);
    }
  }
  const body = await readJson(request);
  // The code itself is never logged or kept: only its id, once it checks out.
  const id = await verifyEggCode(body?.['code'], key);
  if (!id) return json({ ok: false, reason: 'bad' } satisfies EggRedeemReply);
  return json((await collections(env).redeemEgg(pass.cid, id, visitOf(pass, request))) satisfies EggRedeemReply);
}
