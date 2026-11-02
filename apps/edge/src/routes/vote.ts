/** The Realm Vote. */
import { walletVoter } from '../Ledger';
import { beforeRestart } from '../gate';
import { CORS, isAdmin, passFrom } from './http';
import { gateOf, mirrorLater, votes } from './park';
import type { RouteCtx } from './router';

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
    return new Response(r.body, { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  return Response.json({ error: 'not found' }, { status: 404, headers: CORS });
}
