/**
 * Bring a friend (OP-056, with REFERRALS not off): the Menu's card and a friend's code.
 *
 *   GET  /api/referral           this owl's code, its free Day Tickets waiting, and whether it may type a friend's code
 *   POST /api/referral/invite    {code}  a friend's code: taken, this owl is offered a free Day Ticket
 *
 * The free Day Ticket's checkout is /api/tickets/checkout with {referral: true} (routes/tickets.ts).
 */
import { hashForLog, isFriendCode } from '@owl-park/shared';
import { requireSecret } from '../pass';
import { addressHash, referralMode } from '../referrals';
import { CORS, clientIp, json, passFrom, readJson } from './http';
import { collections, deskOf } from './park';
import type { RouteCtx } from './router';

export async function referral(c: RouteCtx): Promise<Response> {
  const { request, env, url, log } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const mode = referralMode(env);
  if (mode === 'off') return json({ error: 'not found' }, 404);
  const pass = await passFrom(request, env, log);
  if (!pass) return json({ error: 'bad-pass' }, 401);
  if (!pass.cid) return json({ error: 'no-collector' }, 401);
  const cid = pass.cid;
  const owl = await deskOf(env)('/tickets/referral-owl', { device: cid });
  if (owl.status !== 200) return json({ error: 'try-later' }, 503);
  const hadTicket = owl.body['hadTicket'] === true;
  const rpc = collections(env);
  if (url.pathname === '/api/referral' && request.method === 'GET') {
    return json({ mode, free: !!env.REFERRAL_CODE?.trim(), ...(await rpc.referralView(cid, hadTicket)) });
  }
  if (url.pathname === '/api/referral/invite' && request.method === 'POST') {
    const body = await readJson(request);
    const code = typeof body?.['code'] === 'string' ? body['code'].trim().toUpperCase() : null;
    if (!isFriendCode(code)) return json({ ok: false, reason: 'unknown-code' }, 400);
    const r = await rpc.referralInvite(cid, code, hadTicket, await addressHash(requireSecret(env, url), clientIp(request, env)));
    if (!r.ok) {
      log.info('worker.accounts', 'referral_refused', 'A friend code typed in was not taken.', { collector_hash: hashForLog(cid), reason: r.reason });
      return json({ ok: false, reason: r.reason }, r.reason === 'too-many' ? 429 : 409);
    }
    log.info('worker.accounts', 'referral_invited', 'An owl new to the park typed a friend’s code: it is offered a free Day Ticket.', { collector_hash: hashForLog(cid) });
    return json({ ok: true, ...(await rpc.referralView(cid, hadTicket)) });
  }
  return json({ error: 'not found' }, 404);
}
