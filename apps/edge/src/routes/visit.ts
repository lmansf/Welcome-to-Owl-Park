/** A visit's first calls: the guest pass, the front gate's word on it, the map's places, and the page's policy reports (OP-140). */
import { type OwlAccount, type TravelState, entryMap, hashForLog, isTimeZone, treeShare } from '@owl-park/shared';
import { TREE_ARRIVAL } from '@owl-park/shared/rooms';
import { accountsOn } from '../accounts';
import { beforeRestart, mayEnter, spectatorsOn } from '../gate';
import { REPORT_BODY_MAX, noteViolation, violationOf } from '../guard';
import { GUEST_PASS_TTL_S, type PassPayload, mintCollector, mintPass, randomCollectorId, randomVisitorId, readCollector, signingSecret } from '../pass';
import { CORS, json, passFrom, readJson } from './http';
import { collections, gateOf, overflowOf } from './park';
import type { RouteCtx } from './router';

export async function cspReport(c: RouteCtx): Promise<Response> {
  const { request, log } = c;
  // What the page's policy blocked (OP-140), as the browser reports it: logged, a line per kind a while.
  if (request.method !== 'POST') return json({ error: 'not found' }, 404);
  if (Number(request.headers.get('Content-Length') ?? 0) > REPORT_BODY_MAX) return json({ error: 'too large' }, 413);
  const v = violationOf(await readJson(request));
  if (!v) return json({ error: 'bad request' }, 400);
  noteViolation(log, v, Date.now());
  return new Response(null, { status: 204 });
}

export async function guestPass(c: RouteCtx): Promise<Response> {
  const { request, env, url, log } = c;
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
  const gate = await gateOf(env);
  // The entries setting (OP-156): an owl the keepers send into the tree starts there, if the front
  // gate would let it into the tree's arrival at all. The arrival is the tree's street, outside its own
  // front gate (a free room), so a guest pass goes in and buys a Day Ticket at that gate.
  const map = entryMap(cid, treeShare((await overflowOf(env)).realms)) === 2 && mayEnter(gate, payload, TREE_ARRIVAL.room) ? 2 : 1;
  return Response.json({ pass, exp, collector, gate: gate.mode, adm: payload.adm, ...(map === 2 ? { map } : {}), ...(account ? { account } : {}) }, { headers: CORS });
}

export async function entry(c: RouteCtx): Promise<Response> {
  const { request, env, log } = c;
  // The front gate as it is now, for this pass: the turnstiles ask before they act (and before they sell a Day Ticket, OP-180).
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const pass = await passFrom(request, env, log);
  if (!pass) return json({ error: 'bad-pass' }, 401);
  // A pass from before the park's nightly restart goes through the turnstiles again (OP-181).
  const gate = await gateOf(env);
  // `spectators` (OP-191), only while SPECTATORS is on: an owl without a ticket that works walks on past the turnstiles as a spectator.
  return json({ gate: gate.mode, admitted: pass.adm && !beforeRestart(gate, pass), ...(spectatorsOn(env) ? { spectators: true } : {}) });
}

export async function travel(c: RouteCtx): Promise<Response> {
  const { request, env, log } = c;
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
