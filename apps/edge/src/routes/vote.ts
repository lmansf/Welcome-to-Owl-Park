/** The Realm Vote. */
import { HALL_ROOM } from '@owl-park/shared/rooms';
import { walletVoter } from '../Ledger';
import { roomObjectNames } from '../copies';
import { beforeRestart } from '../gate';
import type { Env } from '../env';
import type { Logger } from '@owl-park/shared';
import { CORS, isAdmin, passFrom } from './http';
import { gateOf, mirrorLater, overflowOf, votes } from './park';
import type { RouteCtx } from './router';

/** How long a browser or the edge may keep the vote desk's percentages before asking again. */
export const SHARES_CACHE = 'public, max-age=15';

/**
 * Tell every open copy of the Great Hollow the month's new vote shares, so the vote desk there moves
 * the moment someone votes (OP-288). Percentages only: the hall never hears a count (Logan's call).
 */
export async function tellHallShares(env: Env, log: Logger): Promise<void> {
  try {
    const r = await votes(env).fetch('https://park/shares');
    if (!r.ok) throw new Error(`shares ${r.status}`);
    const body = await r.text();
    const copies = await overflowOf(env)
      .then((o) => o.copies)
      .catch(() => ({}));
    await Promise.all(
      roomObjectNames(env.ROOM_SHARDING, [HALL_ROOM.id], copies).map((name) =>
        env.ROOMS.get(env.ROOMS.idFromName(name)).fetch('https://park/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
      ),
    );
  } catch (e) {
    log.error('worker', 'write_failed', 'The Great Hollow was not told the new vote shares: its desk catches up at the next vote or page load.', { error: e });
  }
}

// ---- Realm Vote ----
export async function vote(c: RouteCtx): Promise<Response> {
  const { request, env, ctx, url, log } = c;
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
  if (url.pathname === '/api/vote/shares') {
    // The vote desk's first read: each realm's share of this month's votes in whole percents, never a count.
    const r = await votes(env).fetch('https://park/shares');
    return new Response(r.body, { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': SHARES_CACHE } });
  }
  const pass = await passFrom(request, env, log);
  if (!pass) return Response.json({ error: 'bad-pass' }, { status: 401, headers: CORS });
  // Only ticket-holders vote: a guest pass is refused until the ticket gate admits the visitor
  // (since the park's last nightly restart, while the gate takes tickets: OP-181).
  if (!pass.adm || beforeRestart(await gateOf(env), pass)) return Response.json({ error: 'tickets-required' }, { status: 403, headers: CORS });
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
    if (r.ok) ctx.waitUntil(tellHallShares(env, log));
    return new Response(r.body, { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  return Response.json({ error: 'not found' }, { status: 404, headers: CORS });
}
